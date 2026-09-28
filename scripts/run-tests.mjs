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
import { spawn } from "node:child_process";
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

// ---------------------------------------------------------------------------
// Per-run temp root (lane 46, test-temp-hygiene): the CLI path (`main`, never a programmatic
// `runSealed` caller that passes no `tmpRoot`) mkdtemps ONE directory directly under the real temp
// dir per invocation, points the sealed child's TMPDIR/TEMP/TMP at it (see `runSealed`'s `tmpRoot`
// option), and removes it (or trims it down to just the retained sealed home) once the run ends -
// see `main` below. `sweepStaleHomes` is the backstop for a root a process never got to clean up
// itself (killed -9, power loss, an older runner before this fix): a root older than 24h whose pid
// is provably dead is swept the same way a stale `sealed-home-*` already was.
// ---------------------------------------------------------------------------
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
export const TEST_RUN_ROOT_PREFIX = "delegation-test-run-";
const TEST_RUN_ROOT_RE = /^delegation-test-run-(\d+)-/;

/** `process.kill(pid, 0)` throws ESRCH exactly when no process with that pid exists. Any OTHER
 * outcome - it returns normally, or throws something else (EPERM: the pid exists but we can't
 * signal it) - counts as alive, per the spec: never remove a root whose owning process might still
 * be running. */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return Boolean(e) && e.code !== "ESRCH";
  }
}

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
  let sweptRoots = 0;
  try {
    const cutoff = now() - SIX_HOURS_MS;
    const rootCutoff = now() - TWENTY_FOUR_HOURS_MS;
    for (const entry of fs.readdirSync(tmpDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(tmpDir, entry.name);

      if (entry.name.startsWith(SEALED_HOME_PREFIX)) {
        let stat;
        try {
          stat = fs.statSync(full);
        } catch {
          continue; // vanished between readdir and stat - not this run's problem
        }
        if (stat.mtimeMs >= cutoff) continue; // younger than 6h - another suite may still own it
        try {
          fs.rmSync(full, { recursive: true, force: true });
          swept++;
        } catch (e) {
          console.error(`run-tests: sweep could not remove ${full}: ${e.code ?? e.message}`);
        }
        continue;
      }

      const rootMatch = TEST_RUN_ROOT_RE.exec(entry.name);
      if (rootMatch) {
        let stat;
        try {
          stat = fs.statSync(full);
        } catch {
          continue; // vanished between readdir and stat - not this run's problem
        }
        if (stat.mtimeMs >= rootCutoff) continue; // younger than 24h - its own run may still be live
        if (isPidAlive(Number(rootMatch[1]))) continue; // owning process may still be running
        try {
          fs.rmSync(full, { recursive: true, force: true });
          sweptRoots++;
        } catch (e) {
          console.error(`run-tests: sweep could not remove ${full}: ${e.code ?? e.message}`);
        }
      }
    }
  } catch (e) {
    // Fail open: a sweep error never blocks the suite, it's just reported.
    console.error(`run-tests: sweep error: ${e.message} - continuing without a full sweep`);
    console.log(`swept ${swept} stale sealed homes, ${sweptRoots} stale test-run roots`);
    return { swept, sweptRoots, skipped: false, error: e.message };
  }
  console.log(`swept ${swept} stale sealed homes, ${sweptRoots} stale test-run roots`);
  return { swept, sweptRoots, skipped: false };
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

function runChild(args, options) {
  return new Promise((resolve) => {
    const child = spawn(NODE, args, options);
    let finished = false;
    const signals = ["SIGINT", "SIGTERM"];
    if (process.platform !== "win32") signals.push("SIGHUP");

    function forwardSignal(signal) {
      try {
        child.kill(signal);
      } catch {
        // The child may have exited in the interval before its close event reaches us.
      }
      for (const handled of signals) process.removeListener(handled, forwardSignal);
      if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
    }

    for (const signal of signals) process.on(signal, forwardSignal);

    function finish(result) {
      if (finished) return;
      finished = true;
      for (const signal of signals) process.removeListener(signal, forwardSignal);
      resolve(result);
    }

    child.once("error", (error) => finish({ error }));
    child.once("close", (status, signal) => finish({ status, signal }));
  });
}

export async function runSealed({ files, cwd = REPO_ROOT, tmpRoot, onHome } = {}) {
  // P1 (lane 46, test-temp-hygiene): with a `tmpRoot` (the CLI path's own per-run root, directly
  // under the real temp dir - see `main`), the sealed home is created INSIDE it, and the child's
  // own TMPDIR/TEMP/TMP point at it too, so a test file's OWN mkdtemp (which reads those, not this
  // process's os.tmpdir()) lands inside the root as well, never directly under the real temp dir.
  // Without a `tmpRoot`, every programmatic caller (this runner's own tests included) gets exactly
  // today's behaviour - `makeTempHome`'s own `tmpDir` default is the real `os.tmpdir()`.
  const { home, env, cleanup, keep } = makeTempHome(
    tmpRoot ? { gitIdentity: true, tmpDir: tmpRoot } : { gitIdentity: true },
  );
  if (tmpRoot) {
    env.TMPDIR = tmpRoot;
    env.TEMP = tmpRoot;
    env.TMP = tmpRoot;
  }
  // Told to the CLI path before anything can fail, so `main` always knows which entry of `tmpRoot`
  // to keep on a nonzero exit - never inferred later by re-scanning the root for a `sealed-home-`
  // name, which a leaking test's OWN mkdtemp could coincidentally shadow.
  if (onHome) onHome(home);
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
    const canary = await runChild(
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

    const result = await runChild(["--test", ...targets], { cwd, env, stdio: "inherit" });
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
      // Unregister from the exit/signal leak-fix registry before retaining this failed run's home.
      keep();
      console.error(`run-tests: leaving the sealed home for inspection: ${home}`);
    }
  }
}

// ---------------------------------------------------------------------------
// The leak check (P4, lane 46): every prefix a test file in this repo is known to mkdtemp with,
// under the real temp dir, MINUS `sealed-home` (concurrent sealed runs create those legitimately
// and the 6h sweep already bounds them), PLUS `dispatch`. A name matching this directly under the
// real `os.tmpdir()` after a run that did not exist there before it is a leak: P1's per-run root
// should have contained every test's own mkdtemp call, so nothing new here means the seal held.
// A concurrent legacy run of an older runner (pre-lane-46, or `--no-sweep` racing another host
// process) can still create one of these directly under the real temp dir at the same time and
// cause a false red here - accepted, not fixed by this lane.
// ---------------------------------------------------------------------------
export const LEAK_PREFIX_RE =
  /^(note-send|note-flush|hook-core|multi-hook|inbox|note-inbox|pane-binding|multi-inbox-home|session-name|resume-notice|resume-size|delete-guard|continuation-native|note-cursor-fallback|bugfix-fields|build-loop-check|goal|state-hold|decisions-handback|decisions-render|work-record|backlog|reminder|mirror|knowledge-log|knowledge-counts|codex-census|four-read|goal-card|accept-prep|discrim|dispatch|decisions|transport-identity)-/;

/** The set of names directly under `tmpDir` that match `LEAK_PREFIX_RE` - `main` calls this once
 * before the suite and once after; a name in the "after" set that isn't in the "before" set is a
 * leak. Never throws: an unreadable temp dir yields an empty snapshot rather than aborting the run
 * over a check that exists to report leaks, not to become one itself. */
export function snapshotLeakNames(tmpDir = os.tmpdir()) {
  const names = new Set();
  try {
    for (const entry of fs.readdirSync(tmpDir, { withFileTypes: true })) {
      if (entry.isDirectory() && LEAK_PREFIX_RE.test(entry.name)) names.add(entry.name);
    }
  } catch {
    // best-effort only; see the doc comment above
  }
  return names;
}

/** Pure (no I/O) so a test can drive it with fabricated before/after sets, never the real temp
 * dir. Exactly one line, per P4: `leak check: 0 new temp entries` when clean, otherwise the count
 * plus up to 5 names. */
export function describeLeak(before, after) {
  const leaked = [...after].filter((name) => !before.has(name));
  if (leaked.length === 0) return { leaked: false, line: "leak check: 0 new temp entries" };
  const shown = leaked.slice(0, 5).join(", ");
  return { leaked: true, line: `leak check: ${leaked.length} new temp entries: ${shown}` };
}

/** Removes every entry of `root` except `keepPath` (P2: what a nonzero-exit run leaves behind).
 * `keepPath` absent (or already gone) removes everything. Errors are reported on stderr and never
 * thrown - removal never changes the run's exit code. */
function trimRootExceptHome(root, keepPath) {
  let entries;
  try {
    entries = fs.readdirSync(root);
  } catch (e) {
    console.error(`run-tests: could not read ${root}: ${e.code ?? e.message}`);
    return;
  }
  const keep = keepPath ? path.resolve(keepPath) : null;
  for (const name of entries) {
    const full = path.resolve(path.join(root, name));
    if (keep && full === keep) continue;
    try {
      fs.rmSync(full, { recursive: true, force: true });
    } catch (e) {
      console.error(`run-tests: could not remove ${full}: ${e.code ?? e.message}`);
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
export async function main(argv = process.argv.slice(2), { sweep = sweepStaleHomes } = {}) {
  const parsed = parseArgv(argv);
  if (parsed.error) {
    console.error("run-tests: flags are not supported");
    return 2;
  }
  if (!parsed.noSweep) sweep();
  // Resolved against the REAL invocation directory here, not inside runSealed (whose own
  // `cwd` default is REPO_ROOT, correct for a programmatic/test caller but wrong for argv).
  const files = parsed.files.map((f) => path.resolve(process.cwd(), f));

  // P1: one disposable root per CLI run, directly under the REAL os.tmpdir() - never a
  // programmatic `runSealed({})` caller's concern (those pass no `tmpRoot` and keep today's
  // byte-for-byte behaviour; see run-tests.test.mjs).
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${TEST_RUN_ROOT_PREFIX}${process.pid}-`));

  // P2: a synchronous, non-competing signal guard for the root. Installed here, BEFORE
  // `runSealed` (and therefore before `makeTempHome`'s own registry handlers and `runChild`'s
  // `forwardSignal` are ever registered), it fires FIRST on a signal: remove the root, remove our
  // own listener, and re-raise only when we're the LAST listener left for that signal - the exact
  // "clean up, drop your own listener, re-raise only if nobody else remains" shape test-home.mjs's
  // registry already uses, so this never races or duplicates `runChild`'s own forwarding; it just
  // runs earlier in the same chain.
  let rootGone = false;
  function removeRootBestEffort() {
    if (rootGone) return;
    rootGone = true;
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch (e) {
      console.error(`run-tests: could not remove ${tmpRoot}: ${e.code ?? e.message}`);
    }
  }
  const rootSignals = ["SIGINT", "SIGTERM"];
  if (process.platform !== "win32") rootSignals.push("SIGHUP");
  function onRootSignal(signal) {
    removeRootBestEffort();
    process.removeListener(signal, onRootSignal);
    if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
  }
  for (const signal of rootSignals) process.on(signal, onRootSignal);

  const before = snapshotLeakNames();
  let home;
  let code;
  try {
    code = await runSealed({
      files,
      tmpRoot,
      onHome: (h) => {
        home = h;
      },
    });
  } catch (e) {
    console.error(`run-tests: runSealed threw: ${e.message}`);
    code = 1;
  } finally {
    for (const signal of rootSignals) process.removeListener(signal, onRootSignal);
  }
  const after = snapshotLeakNames();

  // P2 continued: a signal already removed the whole root above (rootGone) - nothing left to do.
  // Otherwise, exit 0 removes the whole root; a nonzero exit trims it down to just the retained
  // sealed home `runSealed` printed and kept.
  if (!rootGone) {
    if (code === 0) removeRootBestEffort();
    else trimRootExceptHome(tmpRoot, home);
  }

  // P4: always exactly one line, printed after the trim above so a leak the trim itself could not
  // have caused (it only ever removes, never creates) is still measured against the real state.
  const leak = describeLeak(before, after);
  console.log(leak.line);
  // A suite that is already failing keeps its own nonzero code; a clean-looking pass with a leak
  // is forced to 1 so the leak is never silently reported as green.
  if (leak.leaked && code === 0) code = 1;

  return code;
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? "")) {
  main().then((code) => {
    process.exitCode = code;
  });
}
