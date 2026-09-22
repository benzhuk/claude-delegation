#!/usr/bin/env node
// scripts/run-tests.mjs [files...]
//
// The sealed test runner (C5). Every test file runs inside a fresh, empty, disposable home -
// never the real machine's - so a test that touches HOME, AGENTS_HOME or the machine's git
// identity can no longer reach it by accident. See scripts/test-home.mjs for the home itself,
// and docs/sealed-baseline.json for the ratchet: files that still fail under the seal at the
// release this runner was introduced (out of scope for this territory to fix); from the next
// release on this run IS the suite and that list must be empty.
//
// Usage: `node scripts/run-tests.mjs` (walks the repo for every *.test.mjs, node_modules/.claude/.git
// excluded) or `node scripts/run-tests.mjs <file> [file...]` (an explicit list, relative or absolute).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { makeTempHome } from "./test-home.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const NODE = process.execPath;
const TEST_HOME_MODULE = path.join(HERE, "test-home.mjs");

const EXCLUDED_DIRS = new Set(["node_modules", ".claude", ".git"]);

function walkTestFiles(dir, out = []) {
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
  const { home, env, cleanup } = makeTempHome({ gitIdentity: true });
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
      console.error(`run-tests: leaving the sealed home for inspection: ${home}`);
    }
  }
}

function main(argv = process.argv.slice(2)) {
  if (argv.some((a) => a.startsWith("-"))) {
    console.error("run-tests: flags are not supported");
    process.exit(2);
  }
  // Resolved against the REAL invocation directory here, not inside runSealed (whose own
  // `cwd` default is REPO_ROOT, correct for a programmatic/test caller but wrong for argv).
  const files = argv.map((f) => path.resolve(process.cwd(), f));
  const code = runSealed({ files });
  process.exit(code);
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? "")) {
  main();
}
