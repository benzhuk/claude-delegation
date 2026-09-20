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

import { loadProjectConfig, switchedOff } from "./project-config.mjs";
import { matchesScratchPattern } from "./janitor.mjs";

export function stagedPaths(cwd) {
  try {
    return execFileSync("git", ["diff", "--cached", "--name-only"], { cwd, encoding: "utf8" })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return null; // blind
  }
}

export function findScratchMatches(paths, scratchPatterns) {
  return paths.filter((p) => matchesScratchPattern(p, scratchPatterns));
}

export function main(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  try {
    if (switchedOff("commit-check")) return 0;

    const { root, config } = loadProjectConfig(cwd);
    if (config.vcs === "none") return 0;
    if (!root) return 0;

    const cliPaths = argv.filter((a) => !a.startsWith("--"));
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

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
