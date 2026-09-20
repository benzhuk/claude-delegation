#!/usr/bin/env node
// janitor — dry-run by default, prints a SAFE table, a JUDGMENT table, and five drift numbers for
// the current project (per contracts/project.schema.json, read only through project-config.mjs).
//
// SAFE  = git worktrees whose branch is merged into main AND whose tree is clean; local branches
//         merged into main (never the current branch, never main); registry entries this tool
//         created (created_by_tool:true) whose end_condition is met.
// JUDGMENT = dirty worktrees; unmerged branches with no commit in 14 days; registry entries past
//         their end_condition that this tool did NOT create; untracked files matching the
//         project's scratch_patterns.
//
// `--apply` acts on SAFE only: a plain, unforced worktree removal, a worktree prune, a lower-case
// branch delete (the non-forcing form only - never its capital-letter sibling), and unlinking
// registry-created SINGLE FILES (fs.unlinkSync only, never a directory, never recursive). JUDGMENT
// is reported and never executed. This script never wipes uncommitted work, never resets a tree,
// never touches a work-in-progress shelf, never forces anything, and never recursively deletes a
// path it did not create.
//
// Exit codes: 0 ok (no findings, or --apply cleared everything), 1 findings remain, 3 blind
// (couldn't read git state at all). NEVER 2. Fail open on any unexpected crash: exit 0, silent.

import { existsSync, statSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { loadProjectConfig, switchedOff } from "./project-config.mjs";
import { listArtifacts, closeArtifact, endConditionMet, resolveRegistryPath } from "./artifact-registry.mjs";

const UNMERGED_STALE_DAYS = 14;

// ---------- git wrappers (each catches its own failure; callers decide safe/blind) ----------

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function gitToplevel(cwd) {
  try {
    return git(["rev-parse", "--show-toplevel"], cwd).trim();
  } catch {
    return null;
  }
}

export function currentBranch(root) {
  try {
    return git(["rev-parse", "--abbrev-ref", "HEAD"], root).trim();
  } catch {
    return null;
  }
}

/** Parses `git worktree list --porcelain` into [{ path, branch, bare, detached }]. */
export function listWorktrees(root) {
  let out;
  try {
    out = git(["worktree", "list", "--porcelain"], root);
  } catch {
    return null;
  }
  const worktrees = [];
  let cur = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (cur) worktrees.push(cur);
      cur = { path: line.slice("worktree ".length).trim(), branch: null, bare: false, detached: false };
    } else if (cur && line.startsWith("branch ")) {
      const ref = line.slice("branch ".length).trim();
      cur.branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
    } else if (cur && line === "bare") {
      cur.bare = true;
    } else if (cur && line === "detached") {
      cur.detached = true;
    }
  }
  if (cur) worktrees.push(cur);
  return worktrees;
}

export function isTreeClean(worktreePath) {
  try {
    return git(["status", "--porcelain"], worktreePath).trim() === "";
  } catch {
    return false;
  }
}

export function isBranchMerged(root, branch, mainBranch) {
  if (branch === mainBranch) return false;
  try {
    git(["merge-base", "--is-ancestor", branch, mainBranch], root);
    return true;
  } catch {
    return false;
  }
}

export function listLocalBranches(root) {
  try {
    return git(["for-each-ref", "refs/heads", "--format=%(refname:short)"], root)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

export function daysSinceLastCommit(root, branch, now = new Date()) {
  try {
    const epoch = Number(git(["log", "-1", "--format=%ct", branch], root).trim());
    if (!Number.isFinite(epoch)) return null;
    return (now.getTime() / 1000 - epoch) / 86400;
  } catch {
    return null;
  }
}

export function listUntrackedFiles(root) {
  try {
    return git(["status", "--porcelain", "--untracked-files=all"], root)
      .split("\n")
      .filter((l) => l.startsWith("?? "))
      .map((l) => l.slice(3).trim());
  } catch {
    return [];
  }
}

export function diskUsageKB(root) {
  try {
    const out = execFileSync("du", ["-sk", root], { encoding: "utf8" });
    const n = Number(out.split(/\s+/)[0]);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// ---------- simple glob for scratch_patterns (no "/" => matches basename only) ----------

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function matchesScratchPattern(relPath, patterns) {
  const base = relPath.split("/").pop();
  return patterns.some((p) => {
    const re = globToRegExp(p);
    return p.includes("/") ? re.test(relPath) : re.test(base);
  });
}

// ---------- classification ----------

/**
 * Builds the SAFE/JUDGMENT classes and the five drift numbers from already-gathered git + registry
 * state. Pure (no I/O) so it can be unit tested directly, separate from the git-shelling-out layer.
 */
export function classify({ root, mainBranch, worktrees, branches, untrackedFiles, registryEntries, now = new Date(), scratchPatterns = [] }) {
  const safe = { worktrees: [], branches: [], registryEntries: [] };
  const judgment = { worktrees: [], branches: [], registryEntries: [], untrackedFiles: [] };

  const cur = currentBranchOf(worktrees, root);

  for (const w of worktrees) {
    if (w.bare) continue;
    if (samePath(w.path, root)) continue; // never the worktree we are standing in
    const merged = w.branch ? isMergedFlag(w) : false;
    if (w.clean && merged) {
      safe.worktrees.push({ ref: w.path, branch: w.branch, reason: "branch merged into main, tree clean" });
    } else if (!w.clean) {
      judgment.worktrees.push({ ref: w.path, branch: w.branch, reason: "tree is dirty" });
    }
  }

  for (const b of branches) {
    if (b.name === mainBranch) continue;
    if (b.name === cur) continue; // never the current branch
    if (b.merged) {
      safe.branches.push({ ref: b.name, reason: "merged into main" });
    } else if (b.daysSinceCommit === null || b.daysSinceCommit >= UNMERGED_STALE_DAYS) {
      judgment.branches.push({
        ref: b.name,
        reason: b.daysSinceCommit === null ? "unmerged, last-commit age unknown" : `unmerged, no commit in ${Math.floor(b.daysSinceCommit)} days`,
      });
    }
  }

  for (const entry of registryEntries) {
    const met = endConditionMet(entry.record, { now, isMerged: (ref) => branches.some((b) => b.name === ref && b.merged) });
    if (!met) continue;
    if (entry.record.created_by_tool === true) {
      safe.registryEntries.push({ ref: entry.record.ref, kind: entry.record.kind, created: entry.record.created, reason: `end_condition met: ${entry.record.end_condition}` });
    } else {
      judgment.registryEntries.push({ ref: entry.record.ref, kind: entry.record.kind, created: entry.record.created, reason: `end_condition met (${entry.record.end_condition}), not tool-created - needs a human ok` });
    }
  }

  for (const f of untrackedFiles) {
    if (matchesScratchPattern(f, scratchPatterns)) {
      judgment.untrackedFiles.push({ ref: f, reason: "untracked, matches a scratch pattern" });
    }
  }

  const registryPastEndCount = registryEntries.filter((e) =>
    endConditionMet(e.record, { now, isMerged: (ref) => branches.some((b) => b.name === ref && b.merged) }),
  ).length;

  return {
    safe,
    judgment,
    drift: {
      worktreeCount: worktrees.filter((w) => !w.bare).length,
      openBranchCount: branches.length,
      untrackedFileCount: untrackedFiles.length,
      registryPastEndCount,
      // diskUsedKB is filled in by the caller, who alone knows how to measure disk.
    },
  };
}

function isMergedFlag(w) {
  return w.merged === true;
}
function samePath(a, b) {
  return String(a).replace(/\/$/, "") === String(b).replace(/\/$/, "");
}
function currentBranchOf(worktrees, root) {
  const mine = worktrees.find((w) => samePath(w.path, root));
  return mine ? mine.branch : null;
}

// ---------- gathering (I/O layer that feeds classify()) ----------

export function gatherState({ root, config, now = new Date() }) {
  const mainBranch = config.main_branch || "main";
  const rawWorktrees = listWorktrees(root);
  if (rawWorktrees === null) return null; // blind

  const worktrees = rawWorktrees.map((w) => ({
    ...w,
    clean: w.bare ? true : isTreeClean(w.path),
    merged: w.branch ? isBranchMerged(root, w.branch, mainBranch) : false,
  }));

  const branchNames = listLocalBranches(root);
  if (branchNames === null) return null; // blind

  const branches = branchNames.map((name) => ({
    name,
    merged: isBranchMerged(root, name, mainBranch),
    daysSinceCommit: daysSinceLastCommit(root, name, now),
  }));

  const untrackedFiles = listUntrackedFiles(root);
  const diskUsedKB = diskUsageKB(root);

  const registryPath = resolveRegistryPath(root, config.artifact_registry);
  const { entries: registryEntries } = listArtifacts({ registryPath, extraKinds: config.extra_artifact_kinds || [] });

  const result = classify({
    root,
    mainBranch,
    worktrees,
    branches,
    untrackedFiles,
    registryEntries,
    now,
    scratchPatterns: config.scratch_patterns || [],
  });
  result.drift.diskUsedKB = diskUsedKB;
  result._raw = { root, mainBranch, worktrees, branches, registryPath, registryEntries };
  return result;
}

// ---------- apply (SAFE class only) ----------

export function applySafe(state, { registryPath, extraKinds = [] }) {
  const log = [];
  const { root } = state._raw;

  for (const w of state.safe.worktrees) {
    try {
      git(["worktree", "remove", w.ref], root);
      log.push({ action: "worktree-remove", ref: w.ref, ok: true });
    } catch (err) {
      log.push({ action: "worktree-remove", ref: w.ref, ok: false, error: String(err.message || err) });
    }
  }
  try {
    git(["worktree", "prune"], root);
    log.push({ action: "worktree-prune", ok: true });
  } catch (err) {
    log.push({ action: "worktree-prune", ok: false, error: String(err.message || err) });
  }

  const stillCheckedOut = new Set((listWorktrees(root) || []).map((w) => w.branch).filter(Boolean));
  for (const b of state.safe.branches) {
    if (stillCheckedOut.has(b.ref)) {
      log.push({ action: "branch-delete", ref: b.ref, ok: false, error: "still checked out in a worktree" });
      continue;
    }
    try {
      git(["branch", "-d", b.ref], root);
      log.push({ action: "branch-delete", ref: b.ref, ok: true });
    } catch (err) {
      log.push({ action: "branch-delete", ref: b.ref, ok: false, error: String(err.message || err) });
    }
  }

  for (const entry of state.safe.registryEntries) {
    if (entry.kind === "scratch" || entry.kind === "packet" || entry.kind === "state") {
      const filePath = entry.ref;
      let unlinked = true;
      try {
        if (existsSync(filePath)) {
          const st = statSync(filePath);
          if (st.isDirectory()) {
            log.push({ action: "registry-unlink", ref: filePath, ok: false, error: "is a directory, refusing" });
            unlinked = false;
          } else {
            unlinkSync(filePath);
          }
        }
      } catch (err) {
        log.push({ action: "registry-unlink", ref: filePath, ok: false, error: String(err.message || err) });
        unlinked = false;
      }
      if (unlinked) {
        closeArtifact({ ref: entry.ref, created: entry.created }, { registryPath, extraKinds });
        log.push({ action: "registry-close", ref: filePath, ok: true });
      }
    } else {
      // worktree/branch/other registry entries: the underlying git action above already handles
      // worktrees and branches; just retire the registry line once the end_condition is met.
      closeArtifact({ ref: entry.ref, created: entry.created }, { registryPath, extraKinds });
      log.push({ action: "registry-close", ref: entry.ref, ok: true });
    }
  }

  return log;
}

// ---------- output ----------

function table(rows, columns) {
  if (rows.length === 0) return "  (none)";
  return rows.map((r) => `  ${columns.map((c) => r[c] ?? "").join("  |  ")}`).join("\n");
}

function printReport(state) {
  console.log("SAFE:");
  console.log("  worktrees:");
  console.log(table(state.safe.worktrees, ["ref", "branch", "reason"]));
  console.log("  branches:");
  console.log(table(state.safe.branches, ["ref", "reason"]));
  console.log("  registry entries:");
  console.log(table(state.safe.registryEntries, ["ref", "kind", "reason"]));
  console.log("");
  console.log("JUDGMENT:");
  console.log("  worktrees:");
  console.log(table(state.judgment.worktrees, ["ref", "branch", "reason"]));
  console.log("  branches:");
  console.log(table(state.judgment.branches, ["ref", "reason"]));
  console.log("  registry entries:");
  console.log(table(state.judgment.registryEntries, ["ref", "kind", "reason"]));
  console.log("  untracked files:");
  console.log(table(state.judgment.untrackedFiles, ["ref", "reason"]));
  console.log("");
  console.log("DRIFT:");
  console.log(`  disk used (project root): ${state.drift.diskUsedKB === null ? "unknown" : `${state.drift.diskUsedKB} KB`}`);
  console.log(`  worktree count: ${state.drift.worktreeCount}`);
  console.log(`  open local branch count: ${state.drift.openBranchCount}`);
  console.log(`  untracked file count: ${state.drift.untrackedFileCount}`);
  console.log(`  registry entries past end condition: ${state.drift.registryPastEndCount}`);
}

function hasFindings(state) {
  return (
    state.safe.worktrees.length > 0 ||
    state.safe.branches.length > 0 ||
    state.safe.registryEntries.length > 0 ||
    state.judgment.worktrees.length > 0 ||
    state.judgment.branches.length > 0 ||
    state.judgment.registryEntries.length > 0 ||
    state.judgment.untrackedFiles.length > 0
  );
}

// ---------- main ----------

export function main(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  try {
    if (switchedOff("janitor")) return 0;

    const { root, config } = loadProjectConfig(cwd);
    if (config.vcs === "none") return 0;
    if (!root) return 0; // nothing to see here either

    const toplevel = gitToplevel(root);
    if (!toplevel) {
      process.stderr.write("janitor: could not read git state (not a git working tree?)\n");
      return 3;
    }

    const applyFlag = argv.includes("--apply");
    const jsonFlag = argv.includes("--json");

    const state = gatherState({ root: toplevel, config });
    if (state === null) {
      process.stderr.write("janitor: could not read git worktree/branch state\n");
      return 3;
    }

    const registryPath = resolveRegistryPath(toplevel, config.artifact_registry);
    let applyLog = null;
    if (applyFlag) {
      applyLog = applySafe(state, { registryPath, extraKinds: config.extra_artifact_kinds || [] });
    }

    if (jsonFlag) {
      console.log(JSON.stringify({ safe: state.safe, judgment: state.judgment, drift: state.drift, applied: applyLog }, null, 2));
    } else {
      printReport(state);
      if (applyLog) {
        console.log("");
        console.log("APPLIED:");
        console.log(table(applyLog, ["action", "ref", "ok", "error"]));
      }
    }

    if (applyFlag) {
      const applyFailed = (applyLog || []).some((l) => l.ok === false);
      const judgmentRemains =
        state.judgment.worktrees.length > 0 ||
        state.judgment.branches.length > 0 ||
        state.judgment.registryEntries.length > 0 ||
        state.judgment.untrackedFiles.length > 0;
      return applyFailed || judgmentRemains ? 1 : 0;
    }
    return hasFindings(state) ? 1 : 0;
  } catch {
    // Fail open: an uncaught error is silent and exits 0, per switches-and-exit-codes.md.
    return 0;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
