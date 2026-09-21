#!/usr/bin/env node
// commit-check — refuses scratch/temp paths from a commit. Given staged paths (from
// `git diff --cached --name-only`, or passed as CLI args for testing/other callers), exits 1 and
// lists every path matching the project's `scratch_patterns` (contracts/project.schema.json).
//
// This is a script a project MAY wire into its own pre-commit hook. This build wires it nowhere -
// no hook, no package.json entry, no git config change. It only reads.
//
// Exit codes: 0 nothing flagged, 1 one or more staged paths match a scratch pattern, 3 blind
// (couldn't read project config or git state at all). NEVER 2. Fail open: exit 0, silent on crash.

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadProjectConfig, switchedOff } from "./project-config.mjs";
import { matchesScratchPattern } from "./janitor.mjs";

export function stagedPaths(cwd) {
  try {
    // -z: NUL-separated and NEVER C-quoted. Without it a path with a space or a non-ASCII byte
    // comes back quoted (e.g. "tmp-caf\303\251.md") and silently matches no scratch pattern.
    return execFileSync("git", ["diff", "--cached", "--name-only", "-z"], { cwd, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  } catch {
    return null; // blind
  }
}

export function findScratchMatches(paths, scratchPatterns) {
  return paths.filter((p) => matchesScratchPattern(p, scratchPatterns));
}

/** Splits argv into flags and path arguments. A literal `--` ends flag parsing: everything after
 * it is a path, even one that starts with `-`. Without a `--`, anything starting with `--` is a
 * flag (this script has no path-looking flag names, so this stays unambiguous in practice). */
export function splitArgv(argv) {
  const dashIndex = argv.indexOf("--");
  if (dashIndex === -1) {
    return { flags: argv.filter((a) => a.startsWith("--")), paths: argv.filter((a) => !a.startsWith("--")) };
  }
  return { flags: argv.slice(0, dashIndex).filter((a) => a.startsWith("--")), paths: argv.slice(dashIndex + 1) };
}

export function main(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  try {
    if (switchedOff("commit-check")) return 0;

    const { root, config, source } = loadProjectConfig(cwd);
    if (source === "unreadable") {
      process.stderr.write("commit-check: .agents/project.json is unreadable\n");
      return 3;
    }
    if (config.vcs === "none") return 0;
    if (!root) return 0;

    const { paths: cliPaths } = splitArgv(argv);
    const paths = cliPaths.length > 0 ? cliPaths : stagedPaths(root);
    if (paths === null) {
      process.stderr.write("commit-check: could not read staged paths\n");
      return 3;
    }

    const matches = findScratchMatches(paths, config.scratch_patterns || []);
    if (matches.length === 0) return 0;

    process.stderr.write("commit-check: refusing scratch/temp paths in this commit:\n");
    for (const m of matches) process.stderr.write(`  ${m}\n`);
    return 1;
  } catch {
    return 0; // fail open
  }
}

/**
 * Only when RUN, never when imported (a plain `import.meta.url === file://${argv[1]}` check never
 * matches on win32: argv[1] is a backslash path, import.meta.url is a forward-slash file:// URL -
 * without this fix `node scripts/commit-check.mjs` silently did nothing at all on this machine, exit
 * 0, no output. Same fix used by scripts/mirror-shared-skills.mjs's isMainModule() and by janitor.mjs).
 */
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const real = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const canon = (p) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  const self = real(fileURLToPath(import.meta.url));
  const argv1 = real(entry);
  return canon(self) === canon(argv1);
}

if (isMainModule()) {
  process.exit(main());
}
