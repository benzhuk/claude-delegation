#!/usr/bin/env node
// janitor — dry-run by default, prints a SAFE table, a JUDGMENT table, and five drift numbers for
// the current project (per contracts/project.schema.json, read only through project-config.mjs).
//
// janitor NEVER deletes a file. Its only two destructive actions, both delegated straight to git,
// are: `git worktree remove` (a whole worktree directory, via git's own bookkeeping) and
// `git branch -d` (a ref). There is no unlink path in this tool, on purpose (round-2 review found a
// working escape out of the project root through a symlinked parent directory, and a second way to
// delete a git-tracked file on a self-asserted `created_by_tool` boolean; rather than harden a
// containment check further, the capability was cut). A tool that cannot delete files cannot delete
// the wrong file.
//
// SAFE (a human would agree without looking) = a git worktree that is: not locked, not the main
//   working tree, not the worktree we are standing in, its branch fully merged into main AND its
//   tip confirmed present on origin/<main> (when an origin/<main> ref exists — with no origin
//   remote at all, nothing is ever confirmed and nothing is ever SAFE), `git status --porcelain
//   --ignored` fully empty (untracked AND ignored content both count), no submodules; OR a local
//   branch merged into main AND confirmed on origin/<main> the same way, that is not a protected
//   name, not the current branch, not main.
// JUDGMENT = everything that fails one of the above proofs but still looks stale: a dirty/ignored/
//   locked/submoduled worktree, a merged worktree whose branch is not confirmed on origin, an
//   unmerged branch with no commit in 14 days, a merged branch not confirmed on origin, a
//   protected-name branch that happens to be merged, a registry entry past its end_condition (of
//   ANY kind, whatever it claims — registry entries are report-only, nothing ever acts on one), an
//   untracked file matching the project's scratch_patterns.
//
// `--apply` acts on SAFE only: a plain, unforced worktree removal, a worktree prune, and a
// lower-case branch delete (the non-forcing form only - never its capital-letter sibling). JUDGMENT
// is reported and never executed. This script never wipes uncommitted work, never resets a tree,
// never touches a work-in-progress shelf, never forces anything, never recursively deletes a path
// it did not create, and never unlinks a file.
//
// Fail-open applies to READING state, never to a run that has already started deleting something.
// Once --apply has taken even one destructive action, a later failure is never silent: whatever was
// already done is printed, and the exit code is 1 or 3, never 0.
//
// Exit codes: 0 ok (no findings, or --apply cleared everything with nothing left over), 1 findings
// remain (or an apply action failed), 3 blind (couldn't read project config, the registry, or git
// state at all — this is NOT the same as clean). NEVER 2. The only silent-0 paths are the switch
// file and `vcs: "none"`; every other blind or crash condition says so on stderr before returning 3
// (a genuinely unexpected, unreached exception is the sole silent-0 fail-open case, and only when
// no destructive action has been taken yet).

import { existsSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadProjectConfig, switchedOff } from "./project-config.mjs";
import { listArtifacts, endConditionMet, resolveRegistryPath } from "./artifact-registry.mjs";
import { checkWiring } from "./wiring-check.mjs";

const UNMERGED_STALE_DAYS = 14;
const PROTECTED_BRANCH_NAMES = new Set(["main", "master", "develop", "development", "release", "production", "stable", "trunk"]);
const PROTECTED_BRANCH_PREFIXES = ["release/", "hotfix/"];

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

/** Parses `git worktree list --porcelain` into [{ path, branch, bare, detached, locked, lockReason, prunable, main }]. */
export function listWorktrees(root) {
  let out;
  try {
    out = git(["worktree", "list", "--porcelain"], root);
  } catch {
    return null;
  }
  const worktrees = [];
  let cur = null;
  const push = () => {
    if (cur) worktrees.push(cur);
  };
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      push();
      cur = {
        path: line.slice("worktree ".length).trim(),
        branch: null,
        bare: false,
        detached: false,
        locked: false,
        lockReason: null,
        prunable: false,
        // `git worktree list --porcelain` always lists the main working tree first.
        main: worktrees.length === 0,
      };
    } else if (cur && line.startsWith("branch ")) {
      const ref = line.slice("branch ".length).trim();
      cur.branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
    } else if (cur && line === "bare") {
      cur.bare = true;
    } else if (cur && line === "detached") {
      cur.detached = true;
    } else if (cur && (line === "locked" || line.startsWith("locked "))) {
      cur.locked = true;
      cur.lockReason = line === "locked" ? "" : line.slice("locked ".length).trim();
    } else if (cur && (line === "prunable" || line.startsWith("prunable "))) {
      cur.prunable = true;
    }
  }
  push();
  return worktrees;
}

export function isTreeClean(worktreePath) {
  try {
    // --ignored=matching is not optional: `git worktree remove` deletes the whole directory,
    // ignored files included, and an ignored file with content (local config, build output) is
    // work this tool did not create. Any output at all - untracked or ignored - means NOT clean.
    return git(["status", "--porcelain", "--untracked-files=all", "--ignored=matching"], worktreePath).trim() === "";
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

/**
 * "the branch tip is on origin's main": true only if an `origin/<mainBranch>` remote-tracking ref
 * exists AND `branch`'s tip is an ancestor of it. No `origin/<mainBranch>` ref at all (no remote
 * configured, or never fetched) is UNVERIFIABLE, not true - a locally-merged, never-pushed branch
 * is exactly the case this guards: deleting it (or its worktree) would be the only copy of that
 * work. Used for BOTH worktree and branch SAFE classification - a directory being visible is not a
 * weaker guarantee than a branch name being the only handle on the same commits.
 */
export function isBranchOnOrigin(root, branch, mainBranch) {
  try {
    git(["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${mainBranch}`], root);
  } catch {
    return false;
  }
  try {
    git(["merge-base", "--is-ancestor", branch, `origin/${mainBranch}`], root);
    return true;
  } catch {
    return false;
  }
}

/** Any local `.gitmodules` file in the worktree means "has submodules" - present is enough, clean or not. */
export function hasSubmodules(worktreePath) {
  try {
    return existsSync(`${worktreePath}/.gitmodules`);
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

/** -z: NUL-separated and NEVER C-quoted. Without it a path with a space or non-ASCII byte comes
 * back quoted (e.g. "tmp-caf\303\251.md") and silently matches no scratch pattern. */
export function listUntrackedFiles(root) {
  try {
    return git(["status", "--porcelain", "--untracked-files=all", "-z"], root)
      .split("\0")
      .filter((l) => l.startsWith("?? "))
      .map((l) => l.slice(3));
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
  // Escape every regex metacharacter INCLUDING "?" (this glob has no single-char wildcard, so a
  // literal "?" in a pattern must stay literal, not become a regex quantifier). "*" -> "[^/]*":
  // never crosses a path separator, in either a basename-only or a slash-bearing pattern.
  const escaped = pattern.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

/**
 * `git status -uall` reports FILES, never directories, so a scratch directory
 * (e.g. `scripts/_tmp-run/`) is only ever seen as `scripts/_tmp-run/out.txt`. Matching only the
 * full relative path or the basename (round-1/round-2's shape) silently stops matching anything
 * once a scratch pattern names a directory - so every path SEGMENT and every ancestor PREFIX is
 * tried too.
 */
export function matchesScratchPattern(relPath, patterns) {
  const segments = relPath.split("/");
  const base = segments[segments.length - 1];
  const prefixes = segments.map((_, i) => segments.slice(0, i + 1).join("/"));
  return patterns.some((p) => {
    const re = globToRegExp(p);
    if (p.includes("/")) return prefixes.some((prefix) => re.test(prefix));
    return segments.some((seg) => re.test(seg)) || re.test(base);
  });
}

// ---------- classification ----------

/**
 * Builds the SAFE/JUDGMENT classes and the five drift numbers from already-gathered git + registry
 * state. Pure (no I/O) so it can be unit tested directly, separate from the git-shelling-out layer.
 */
export function classify({
  root,
  mainBranch,
  worktrees,
  branches,
  untrackedFiles,
  registryEntries,
  now = new Date(),
  scratchPatterns = [],
}) {
  const safe = { worktrees: [], branches: [] };
  const judgment = { worktrees: [], branches: [], registryEntries: [], untrackedFiles: [] };

  const cur = currentBranchOf(worktrees, root);

  for (const w of worktrees) {
    if (w.bare) continue;
    if (w.main) continue; // the main working tree is never a cleanup candidate, from anywhere
    if (samePath(w.path, root)) continue; // never the worktree we are standing in
    if (w.locked) {
      judgment.worktrees.push({ ref: w.path, branch: w.branch, reason: `locked${w.lockReason ? `: ${w.lockReason}` : ""}` });
      continue;
    }
    if (w.hasSubmodules) {
      judgment.worktrees.push({ ref: w.path, branch: w.branch, reason: "has submodules" });
      continue;
    }
    if (!w.clean) {
      judgment.worktrees.push({ ref: w.path, branch: w.branch, reason: "tree not clean (uncommitted, untracked or ignored files present)" });
      continue;
    }
    if (!w.branch || !w.merged) continue; // unmerged/detached: normal in-progress state, not a finding
    if (!w.onOrigin) {
      judgment.worktrees.push({ ref: w.path, branch: w.branch, reason: `merged locally, not confirmed on origin/${mainBranch}` });
      continue;
    }
    safe.worktrees.push({ ref: w.path, branch: w.branch, reason: "branch merged into main (and on origin), tree fully clean" });
  }

  for (const b of branches) {
    if (b.name === mainBranch) continue;
    if (b.name === cur) continue; // never the current branch
    const protectedName = PROTECTED_BRANCH_NAMES.has(b.name) || PROTECTED_BRANCH_PREFIXES.some((p) => b.name.startsWith(p));
    if (protectedName) {
      if (b.merged) {
        // A branch whose whole value is its name is never mechanically safe: being an ancestor of
        // main is exactly what a bookmark/alias looks like.
        judgment.branches.push({ ref: b.name, reason: "protected name, merged but a person decides" });
      }
      continue;
    }
    if (b.merged && !b.onOrigin) {
      // Same proof the worktree class demands: a merge that exists only in a local main is not
      // confirmed anywhere else, and the branch name is the only handle on that work.
      judgment.branches.push({ ref: b.name, reason: `merged locally, not confirmed on origin/${mainBranch}` });
    } else if (b.merged) {
      safe.branches.push({ ref: b.name, reason: "merged into main (and on origin)" });
    } else if (b.daysSinceCommit === null || b.daysSinceCommit >= UNMERGED_STALE_DAYS) {
      judgment.branches.push({
        ref: b.name,
        reason: b.daysSinceCommit === null ? "unmerged, last-commit age unknown" : `unmerged, no commit in ${Math.floor(b.daysSinceCommit)} days`,
      });
    }
  }

  // Registry entries are REPORT-ONLY: janitor has no unlink path at all, so an overdue entry -
  // whatever kind, whatever it claims about who created it - is always a JUDGMENT row for a human
  // to act on by hand, never a SAFE one.
  for (const entry of registryEntries) {
    const met = endConditionMet(entry.record, { now, isMerged: (ref) => branches.some((b) => b.name === ref && b.merged) });
    if (!met) continue;
    judgment.registryEntries.push({
      ref: entry.record.ref,
      kind: entry.record.kind,
      created: entry.record.created,
      reason: `end_condition met: ${entry.record.end_condition}${entry.record.created_by_tool === true ? " (tool-created)" : ""}`,
    });
  }

  for (const f of untrackedFiles) {
    if (matchesScratchPattern(f, scratchPatterns)) {
      judgment.untrackedFiles.push({ ref: f, reason: "untracked, matches a scratch pattern" });
    }
  }

  return {
    safe,
    judgment,
    drift: {
      worktreeCount: worktrees.filter((w) => !w.bare).length,
      openBranchCount: branches.length,
      untrackedFileCount: untrackedFiles.length,
      registryPastEndCount: judgment.registryEntries.length,
      // diskUsedKB, registryMalformedCount are filled in by the caller.
    },
  };
}

function samePath(a, b) {
  return String(a).replace(/\/$/, "") === String(b).replace(/\/$/, "");
}
function currentBranchOf(worktrees, root) {
  const mine = worktrees.find((w) => samePath(w.path, root));
  return mine ? mine.branch : null;
}

// ---------- gathering (I/O layer that feeds classify()) ----------

/**
 * Returns either a normal state object, or `{ __blind: true, reason }` when git state could not be
 * read at all (distinct from the registry being unreadable, which is layered on afterward so the
 * caller can give a specific reason for each).
 */
export function gatherState({ root, config, now = new Date() }) {
  const mainBranch = config.main_branch || "main";
  const rawWorktrees = listWorktrees(root);
  if (rawWorktrees === null) return { __blind: true, reason: "could not read git worktree state" };

  const worktrees = rawWorktrees.map((w) => {
    const clean = w.bare ? true : isTreeClean(w.path);
    const merged = w.branch ? isBranchMerged(root, w.branch, mainBranch) : false;
    const onOrigin = w.branch && merged ? isBranchOnOrigin(root, w.branch, mainBranch) : false;
    return { ...w, clean, merged, onOrigin, hasSubmodules: w.bare ? false : hasSubmodules(w.path) };
  });

  const branchNames = listLocalBranches(root);
  if (branchNames === null) return { __blind: true, reason: "could not read git branch state" };

  const branches = branchNames.map((name) => {
    const merged = isBranchMerged(root, name, mainBranch);
    return {
      name,
      merged,
      onOrigin: merged ? isBranchOnOrigin(root, name, mainBranch) : false,
      daysSinceCommit: daysSinceLastCommit(root, name, now),
    };
  });

  const untrackedFiles = listUntrackedFiles(root);
  const diskUsedKB = diskUsageKB(root);

  const registryPath = resolveRegistryPath(root, config.artifact_registry);
  const { entries: registryEntries, malformedCount, unreadable } = listArtifacts({
    registryPath,
    extraKinds: config.extra_artifact_kinds || [],
  });
  if (unreadable) return { __blind: true, reason: `could not read the artifact registry (${registryPath})` };

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
  result.drift.registryMalformedCount = malformedCount;
  result._raw = { root, mainBranch };
  return result;
}

// ---------- apply (SAFE class only) ----------

/**
 * Mutates and returns `log`, so a caller can still see partial progress if something outside the
 * per-item try/catches below somehow throws (defense in depth; every actual mutation site below is
 * already individually guarded and never throws past this function). Only two kinds of action
 * exist: a worktree removal (a directory, via git) and a branch delete (a ref, via git). Neither
 * this function nor anything it calls ever unlinks a file.
 */
export function applySafe(state, log = []) {
  const { root } = state._raw;

  for (const w of state.safe.worktrees) {
    try {
      git(["worktree", "remove", "--", w.ref], root);
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

  let stillCheckedOut;
  try {
    stillCheckedOut = new Set((listWorktrees(root) || []).map((w) => w.branch).filter(Boolean));
  } catch {
    stillCheckedOut = new Set();
  }
  for (const b of state.safe.branches) {
    if (stillCheckedOut.has(b.ref)) {
      log.push({ action: "branch-delete", ref: b.ref, ok: false, error: "still checked out in a worktree" });
      continue;
    }
    try {
      git(["branch", "-d", "--", b.ref], root);
      log.push({ action: "branch-delete", ref: b.ref, ok: true });
    } catch (err) {
      log.push({ action: "branch-delete", ref: b.ref, ok: false, error: String(err.message || err) });
    }
  }

  return log;
}

// ---------- output ----------

function table(rows, columns) {
  if (rows.length === 0) return "  (none)";
  return rows.map((r) => `  ${columns.map((c) => r[c] ?? "").join("  |  ")}`).join("\n");
}

function printReport(state, wiring) {
  console.log("SAFE:");
  console.log("  worktrees:");
  console.log(table(state.safe.worktrees, ["ref", "branch", "reason"]));
  console.log("  branches:");
  console.log(table(state.safe.branches, ["ref", "reason"]));
  console.log("");
  console.log("JUDGMENT:");
  console.log("  worktrees:");
  console.log(table(state.judgment.worktrees, ["ref", "branch", "reason"]));
  console.log("  branches:");
  console.log(table(state.judgment.branches, ["ref", "reason"]));
  console.log("  registry entries (report-only, nothing acts on these):");
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
  if (state.drift.registryMalformedCount > 0) {
    console.log(`  registry lines unreadable or malformed: ${state.drift.registryMalformedCount}`);
  }
  if (wiring) {
    console.log("");
    console.log("WIRING (read-only visibility, never acted on by janitor):");
    console.log(table(wiring.results, ["id", "state", "why"]));
  }
}

function hasFindings(state) {
  return (
    state.safe.worktrees.length > 0 ||
    state.safe.branches.length > 0 ||
    state.judgment.worktrees.length > 0 ||
    state.judgment.branches.length > 0 ||
    state.judgment.registryEntries.length > 0 ||
    state.judgment.untrackedFiles.length > 0
  );
}

// ---------- main ----------

export function main(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  let startedApplying = false;
  const applyLog = [];
  try {
    if (switchedOff("janitor")) return 0;

    const { root, config, source } = loadProjectConfig(cwd);
    if (source === "unreadable") {
      // A corrupt project config is blind, not clean: exiting 0 here would hide every finding
      // behind a typo in one JSON file.
      process.stderr.write("janitor: .agents/project.json is unreadable\n");
      return 3;
    }
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
    if (state.__blind) {
      process.stderr.write(`janitor: ${state.reason}\n`);
      return 3;
    }

    if (applyFlag) {
      startedApplying = true;
      try {
        applySafe(state, applyLog);
      } catch (err) {
        // Once we have started deleting, silence is not an option: say what was done before
        // failing. Fail-open applies to READING state, never to reporting a destructive run.
        for (const line of applyLog) process.stderr.write(`janitor: applied ${JSON.stringify(line)}\n`);
        process.stderr.write(`janitor: --apply aborted partway: ${String(err && err.message ? err.message : err)}\n`);
        return 1;
      }
    }

    // J5: the wiring check is its own read-only tool with its own fail-open contract - a failure
    // here must never take down janitor's own report. It is display only: it never affects janitor's
    // findings or exit code.
    let wiring = null;
    try {
      wiring = checkWiring();
    } catch {
      wiring = null;
    }

    if (jsonFlag) {
      console.log(JSON.stringify({ safe: state.safe, judgment: state.judgment, drift: state.drift, wiring, applied: applyFlag ? applyLog : null }, null, 2));
    } else {
      printReport(state, wiring);
      if (applyFlag) {
        console.log("");
        console.log("APPLIED:");
        console.log(table(applyLog, ["action", "ref", "ok", "error"]));
      }
    }

    if (applyFlag) {
      const applyFailed = applyLog.some((l) => l.ok === false);
      const judgmentRemains =
        state.judgment.worktrees.length > 0 ||
        state.judgment.branches.length > 0 ||
        state.judgment.registryEntries.length > 0 ||
        state.judgment.untrackedFiles.length > 0;
      return applyFailed || judgmentRemains ? 1 : 0;
    }
    return hasFindings(state) ? 1 : 0;
  } catch (err) {
    if (startedApplying) {
      // We began deleting things before this unexpected throw. Never claim a clean exit here.
      for (const line of applyLog) process.stderr.write(`janitor: applied ${JSON.stringify(line)}\n`);
      process.stderr.write(`janitor: --apply aborted partway: ${String(err && err.message ? err.message : err)}\n`);
      return 1;
    }
    // Fail open: an uncaught error while only READING state is silent and exits 0.
    return 0;
  }
}

/**
 * Only when RUN, never when imported (a plain `import.meta.url === file://${argv[1]}` check never
 * matches on win32: argv[1] is a backslash path, import.meta.url is a forward-slash file:// URL -
 * without this fix `node scripts/janitor.mjs` silently did nothing at all on this machine, exit 0,
 * no output. Same fix already used by scripts/mirror-shared-skills.mjs's isMainModule()).
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
