#!/usr/bin/env node
// scripts/run-tests.mjs [files...]
//
// The sealed test runner (C5). Every test file runs inside a fresh, empty, disposable home -
// never the real machine's - so a test that touches HOME, AGENTS_HOME or the machine's git
// identity can no longer reach it by accident. See scripts/test-home.mjs for the home itself,
// and docs/sealed-baseline.json for the ratchet: files that still fail under the seal at the
// release this runner was introduced (out of scope for this territory to fix); from the next
// release on this run IS the suite and that list must be empty. Full rationale: docs/sealed-tests.md
//
// Usage: `node scripts/run-tests.mjs` (walks the repo for every *.test.mjs, node_modules/.claude/.git
// excluded) or `node scripts/run-tests.mjs <file> [file...]` (an explicit list, relative or absolute).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { makeTempHome } from "./test-home.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const NODE = process.execPath;
const TEST_HOME_MODULE = path.join(HERE, "test-home.mjs");

const EXCLUDED_DIRS = new Set(["node_modules", ".claude", ".git"]);

// ---------------------------------------------------------------------------
// Stale sealed-home sweep (lane 24, sealed-home-leak): the leak-fix registry in test-home.mjs only
// catches THIS process's own homes - a host that lost power, had a runner `kill -9`'d, or ran an
// older build before that fix still accumulates `sealed-home-*` directories under the temp dir
// forever. This sweep runs once, at the very start of a CLI invocation (never from `runSealed`
// itself, which programmatic callers like tests also use - see the tests for why touching the real
// temp dir/home there would be wrong), and removes only what it can prove is safe to remove: a
// directory directly under the temp dir whose name starts with the exact `sealed-home-` prefix
// (never a fuzzy/substring match) and whose mtime is older than 6 hours (younger than that, another
// suite on this host may still own it). `tmpDir`/`homeDir`/`now` are all injectable so a test never
// has to touch the real `/tmp` or the real `~/.agents` to exercise this.
// ---------------------------------------------------------------------------
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const SEALED_HOME_PREFIX = "sealed-home-";

/** Mirrors the fail-open `present()` shape used elsewhere for a kill-switch file: a stat that
 * succeeds, or fails with anything other than "doesn't exist", counts as present. */
function pathPresent(p) {
  try {
    fs.statSync(p);
    return true;
  } catch (e) {
    return Boolean(e) && e.code !== "ENOENT" && e.code !== "ENOTDIR";
  }
}

/** Kill switch (fails open, per-lane and shared): `<homeDir>/.agents/ws-off-sweep` or the shared
 * `<homeDir>/.agents/ws-off` skips the sweep entirely. */
function sweepDisabled(homeDir) {
  const base = path.join(homeDir, ".agents");
  return pathPresent(path.join(base, "ws-off-sweep")) || pathPresent(path.join(base, "ws-off"));
}

export function sweepStaleHomes({ tmpDir = os.tmpdir(), homeDir = os.homedir(), now = Date.now } = {}) {
  if (sweepDisabled(homeDir)) return { swept: 0, skipped: true };
  let swept = 0;
  try {
    const cutoff = now() - SIX_HOURS_MS;
    for (const entry of fs.readdirSync(tmpDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(SEALED_HOME_PREFIX)) continue;
      const full = path.join(tmpDir, entry.name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue; // vanished between readdir and stat - not this run's problem
      }
      if (stat.mtimeMs >= cutoff) continue; // younger than 6h - another suite may still own it
      fs.rmSync(full, { recursive: true, force: true });
      swept++;
    }
  } catch (e) {
    // Fail open: a sweep error never blocks the suite, it's just reported.
    console.error(`run-tests: sweep error: ${e.message} - continuing without a full sweep`);
    return { swept, skipped: false, error: e.message };
  }
  console.log(`swept ${swept} stale sealed homes`);
  return { swept, skipped: false };
}

// Exported (round 2, N2 review MAJOR 1) so `skills/multi/scripts/hooks.test.mjs`'s N2 test can
// scan the SAME set of files this runner actually runs, instead of a hand-maintained root list
// that can go stale (a mistyped or renamed root silently scans nothing and still passes) or miss
// a directory nobody remembered to add.
export function walkTestFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walkTestFiles(path.join(dir, entry.name), out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.mjs")) out.push(path.join(dir, entry.name));
  }
  return out;
}

/** ESM `-e` source for the canary (RT-18): imports the SAME `checkSeal` a test would use, run
 * INSIDE the sealed child so it observes exactly what a test file would observe, never what this
 * (unsealed) parent process computes. One source of truth for the check - see `checkSeal` in
 * `scripts/test-home.mjs`. */
function canarySource(testHomeModuleUrl) {
  return (
    `import { checkSeal } from ${JSON.stringify(testHomeModuleUrl)};\n` +
    `const r = checkSeal();\n` +
    `if (!r.ok) { console.error("run-tests canary: " + r.message); process.exit(1); }\n` +
    `process.exit(0);\n`
  );
}

export function runSealed({ files, cwd = REPO_ROOT } = {}) {
  const { home, env, cleanup, keep } = makeTempHome({ gitIdentity: true });
  // Round 2 (N2 review MAJOR 2): a caller may itself be running inside `node --test` (this
  // runner is importable, not just a CLI - see test-home.test.mjs's wiring test). Node's own
  // test runner marks that process, `childEnv()` spreads `process.env`, and without this strip
  // the sealed grandchild `node --test` spawn below would silently SKIP the whole suite as a
  // "recursive" run and still exit 0 - a sealed run that reports nothing and reports it as a
  // pass. Proved on a scratch copy: a deliberately-failing probe returned exit 0 with the leak,
  // exit 1 once these two are stripped. Same fix `scripts/prefix-test.mjs:117` already applies
  // at its own `node --test` spawn site, for the same reason.
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_WORKER_ID;
  // <sealed> on its own first line, always - even if the canary or the suite then fails.
  console.log(home);

  let code = 1;
  try {
    const canary = spawnSync(
      NODE,
      ["--input-type=module", "-e", canarySource(pathToFileURL(TEST_HOME_MODULE).href)],
      { cwd, env, stdio: "inherit" },
    );
    if (canary.error) {
      console.error(`run-tests: canary failed to start: ${canary.error.message}`);
      return code;
    }
    if (canary.status !== 0) {
      console.error("run-tests: canary failed - the seal is not holding, refusing to run the suite");
      code = canary.status ?? 1;
      return code;
    }

    const targets = files && files.length > 0 ? files.map((f) => path.resolve(cwd, f)) : walkTestFiles(cwd);
    if (targets.length === 0) {
      console.error("run-tests: no *.test.mjs files found");
      return code;
    }

    const result = spawnSync(NODE, ["--test", ...targets], { cwd, env, stdio: "inherit" });
    if (result.error) {
      console.error(`run-tests: suite failed to start: ${result.error.message}`);
      return code;
    }
    code = result.status ?? 1;
    return code;
  } finally {
    // Only clean up a home that finished clean (RT-18/F6): a non-zero exit means something
    // needs inspecting, and the path printed on line 1 above is the only way back to it.
    if (code === 0) {
      cleanup();
    } else {
      // Lane 24 (sealed-home-leak): unregister from the exit/signal leak-fix registry FIRST - it
      // holds every still-registered home, and without this the process's own `exit` handler would
      // remove the very home this branch is deliberately leaving for inspection, the moment this
      // CLI run calls `process.exit` below. Keep-on-failure is otherwise unchanged (RT-18/F6).
      keep();
      console.error(`run-tests: leaving the sealed home for inspection: ${home}`);
    }
  }
}

/** `--no-sweep` is the only supported flag (for the sweep's own tests - see run-tests.test.mjs);
 * anything else starting with `-` is still rejected exactly as before. */
function parseArgv(argv) {
  let noSweep = false;
  const files = [];
  for (const a of argv) {
    if (a === "--no-sweep") {
      noSweep = true;
      continue;
    }
    if (a.startsWith("-")) return { error: true };
    files.push(a);
  }
  return { error: false, noSweep, files };
}

/** Exported (not just the CLI's own `if` block below) so a test can drive it in-process with a
 * stub `sweep`, instead of either touching the real temp dir/home or spawning a child process for
 * every case - see run-tests.test.mjs. Returns an exit code rather than calling `process.exit`
 * itself, for the same reason. */
export function main(argv = process.argv.slice(2), { sweep = sweepStaleHomes } = {}) {
  const parsed = parseArgv(argv);
  if (parsed.error) {
    console.error("run-tests: flags are not supported");
    return 2;
  }
  if (!parsed.noSweep) sweep();
  // Resolved against the REAL invocation directory here, not inside runSealed (whose own
  // `cwd` default is REPO_ROOT, correct for a programmatic/test caller but wrong for argv).
  const files = parsed.files.map((f) => path.resolve(process.cwd(), f));
  return runSealed({ files });
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? "")) {
  process.exit(main());
}
