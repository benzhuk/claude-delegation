#!/usr/bin/env node
// janitor — dry-run by default, prints a SAFE table, a JUDGMENT table, and four drift numbers for
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
//   working tree, not the worktree we are standing in, not checked out on a protected branch name,
//   not prunable (its directory must actually be there), its branch fully merged into main AND its
//   tip confirmed present on origin/<main> (when an origin/<main> ref exists — with no origin remote
//   at all, nothing is ever confirmed and nothing is ever SAFE), `git status --porcelain --ignored`
//   fully empty (untracked AND ignored content both count), no submodules; OR a local branch merged
//   into main AND confirmed on origin/<main> the same way, that is not a protected name, not the
//   current branch, not main, and not checked out in ANY worktree unless that worktree is ALSO SAFE
//   this same run (round-4 review: a branch checked out anywhere else is never mechanically safe by
//   itself, even if the worktree holding it is the main working tree).
// JUDGMENT = everything that fails one of the above proofs but still looks stale: a dirty/ignored/
//   locked/submoduled/prunable worktree, a protected-name worktree (even if otherwise SAFE), a
//   merged worktree whose branch is not confirmed on origin, an unmerged branch with no commit in 14
//   days, a merged branch not confirmed on origin, a protected-name branch that happens to be
//   merged, a merged branch checked out in a worktree this run is not removing, an untracked file
//   matching the project's scratch_patterns; also (T4) one row per `WORKAROUND:` line found across
//   every `docs/work/*.record.md` (gathered via `listRecords`, scripts/work-record.mjs, never
//   parsed here) - an OVERDUE one (`remove when` a past `by <yyyy-mm-dd>` date) is a finding, an
//   open one (not yet due, or a worded condition this tool can't evaluate) is display-only; a
//   missing `docs/work` directory is not a finding either way.
//
// round-1 fix note: the artifact registry (scripts/artifact-registry.mjs) and commit-check
// (scripts/commit-check.mjs) were CUT from this build per review — the registry read a file nothing
// shipped ever wrote, and commit-check implemented no agent/owner distinction while blocking
// nobody. Losing the registry means janitor no longer has a `registryEntries` JUDGMENT row, a
// `registryPastEndCount`/`registryMalformedCount` drift number, or a "registry entries" report
// section — SAFE/JUDGMENT worktree and branch classification is unaffected.
//
// round-4 fix note: `git worktree prune` was CUT from `--apply` per review — it is a blanket
// operation that cannot be scoped to SAFE entries only, so it could deregister a JUDGMENT worktree's
// own bookkeeping (one merely moved aside, directory unreachable) in the same run that then let its
// branch look free to delete. A prunable worktree is now its own JUDGMENT row (see classify()) and
// is never touched by --apply; the report-only path already told the operator about it, --apply just
// never acted on it.
//
// `--apply` acts on SAFE only: a plain, unforced worktree removal, and a lower-case branch delete
// (the non-forcing form only - never its capital-letter sibling). JUDGMENT is reported and never
// executed. This script never wipes uncommitted work, never resets a tree, never touches a
// work-in-progress shelf, never forces anything, never recursively deletes a path it did not create,
// and never unlinks a file.
//
// Fail-open applies to READING state, never to a run that has already started deleting something.
// Once --apply has taken even one destructive action, a later failure is never silent: whatever was
// already done is printed, and the exit code is 1 or 3, never 0.
//
// Exit codes: 0 ok (no findings, or --apply cleared everything with nothing left over), 1 findings
// remain (or an apply action failed), 3 blind (couldn't read project config or git state at all —
// this is NOT the same as clean). NEVER 2. The only silent-0 paths are the switch
// file and `vcs: "none"`; every other blind or crash condition says so on stderr before returning 3
// (a genuinely unexpected, unreached exception is the sole silent-0 fail-open case, and only when
// no destructive action has been taken yet).

import { existsSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadProjectConfig, switchedOff } from "./project-config.mjs";
import { checkWiring } from "./wiring-check.mjs";
import { listRecords } from "./work-record.mjs";

const UNMERGED_STALE_DAYS = 14;
const PROTECTED_BRANCH_NAMES = new Set(["main", "master", "develop", "development", "release", "production", "stable", "trunk"]);
const PROTECTED_BRANCH_PREFIXES = ["release/", "hotfix/"];

/**
 * Round-2/3 invariant, checked by hand against every git() call site in this file (see the table in
 * those rounds' build reports): NO short or guessable name ever reaches git here. Every ref this file
 * hands to git is either (a) a full refname (`refs/heads/<name>` or `refs/remotes/origin/<name>`)
 * used as the OPERAND of `merge-base --is-ancestor` or `log`, and ONLY after an existence check on
 * that same full refname via `git show-ref --verify` - a full refname is unambiguous only once its
 * existence is proven; an ABSENT one still falls through gitrevisions' ambiguity order and a tag
 * named the same string can answer in its place (round 3, see below); (b) an EXISTENCE test done
 * with `git show-ref --verify`, which reads the ref store only and never DWIMs the way
 * `git rev-parse --verify` does; or (c) a LISTING done with `--format=%(refname)` (the full name,
 * never the short/DWIM `%(refname:short)` form), with the literal, known-exact `refs/heads/` prefix
 * stripped in code afterward. A bare name handed to git is resolved through gitrevisions' ambiguity
 * order - $GIT_DIR/<refname>, then refs/<refname>, refs/tags/<refname>, refs/heads/<refname>,
 * refs/remotes/<refname>, refs/remotes/<refname>/HEAD, in that order - so a same-named TAG or a
 * like-named branch/remote-tracking ref can shadow the one this tool means, EVEN WHEN the name is
 * fully qualified, if the qualified ref itself does not exist (rule 3, refs/tags/<the whole
 * qualified string>, still matches). Round 1 found a local branch literally named `origin/main`
 * shadowing a bare `merge-base` operand. Round 2 found a bare `rev-parse --verify` EXISTENCE check
 * DWIMing past a tag named `refs/remotes/origin/main` in a repo with no origin remote at all, and
 * `%(refname:short)` LISTING branches under a name git itself had to mangle to `heads/<name>` to
 * disambiguate against a same-named tag - which then also slipped past the plain string-equality
 * protected-name checks. Round 3 found that a full, qualified refname used as a merge-base/log
 * operand still DWIMs to a tag of the identical name when the real branch is ABSENT (a repo whose
 * main branch was deleted, with a tag named `refs/heads/main` left behind, made `isBranchMerged`
 * answer `true`) - non-destructive in every reachable case (SAFE always requires the separately
 * `show-ref`-gated `onOrigin` proof too) but a wrong answer in the JUDGMENT reason nonetheless, so
 * `isBranchMerged` and `daysSinceLastCommit` now `show-ref --verify` both operands before ever using
 * them as a revision. The shapes above (full-name operand PROVEN to exist first, show-ref existence,
 * full-name listing) are the only ways this file is allowed to touch a git ref; anything else added
 * later must justify why it doesn't need one of them.
 */
function headRef(name) {
  return `refs/heads/${name}`;
}

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

/** Parses `git worktree list --porcelain -z` into [{ path, branch, bare, detached, locked, lockReason, prunable, main }].
 * -z: without it, git C-quotes any "unusual" character in a lock reason (a literal `\n` or `\t`
 * appears escaped, not as the real byte) - round-4 review found this could make a lock/prune reason
 * unreadable or misleading. -z NUL-terminates each field instead and never quotes, and this file's
 * own line-by-line parsing (splitting on the terminator, matching known prefixes) is unaffected by
 * the switch - verified against a reason containing a real embedded newline and a tab. */
export function listWorktrees(root) {
  let out;
  try {
    out = git(["worktree", "list", "--porcelain", "-z"], root);
  } catch {
    return null;
  }
  const worktrees = [];
  let cur = null;
  const push = () => {
    if (cur) worktrees.push(cur);
  };
  for (const line of out.split("\0")) {
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
  // Both operands must EXIST as real branches before they are used as revisions: a full refname
  // still falls through gitrevisions' order when the ref is absent, so a tag named
  // `refs/heads/<mainBranch>` would otherwise answer this question in a repo whose main branch is
  // gone. show-ref reads the ref store only.
  try {
    git(["show-ref", "--verify", "--quiet", headRef(branch)], root);
    git(["show-ref", "--verify", "--quiet", headRef(mainBranch)], root);
  } catch {
    return false;
  }
  try {
    git(["merge-base", "--is-ancestor", headRef(branch), headRef(mainBranch)], root);
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
    // show-ref --verify reads the ref store directly and never DWIMs through gitrevisions'
    // disambiguation order the way `rev-parse --verify` does - round-2 review found a TAG named
    // `refs/remotes/origin/<mainBranch>` satisfying a bare `rev-parse` existence check even in a
    // repo with no origin remote at all, which let a never-pushed branch look confirmed.
    git(["show-ref", "--verify", "--quiet", `refs/remotes/origin/${mainBranch}`], root);
  } catch {
    return false;
  }
  // The merge-base call below is safe not because both sides are fully qualified (round-3 review:
  // that alone is not enough when a ref is absent) but because BOTH operands are already proven to
  // exist as real refs by this point: the right side by the show-ref call just above, the left side
  // because `branch` always comes from `for-each-ref refs/heads` (listLocalBranches) or a worktree's
  // own `branch` line (listWorktrees) - never a name the caller made up.
  try {
    git(["merge-base", "--is-ancestor", headRef(branch), `refs/remotes/origin/${mainBranch}`], root);
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
    // %(refname) is the full, unambiguous ref (never guessed at); %(refname:short) is git's own
    // DWIM output and comes back as `heads/<name>` whenever a tag of the same name exists - round-2
    // review found that mangled form then failing headRef() qualification entirely (reported as
    // permanently unmerged) AND slipping past both the mainBranch and protected-name string checks,
    // which could list the protected main branch itself as a cleanup candidate. Stripping the known,
    // literal `refs/heads/` prefix off the full name never guesses.
    return git(["for-each-ref", "refs/heads", "--format=%(refname)"], root)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/^refs\/heads\//, ""));
  } catch {
    return null;
  }
}

export function daysSinceLastCommit(root, branch, now = new Date()) {
  try {
    git(["show-ref", "--verify", "--quiet", headRef(branch)], root);
    const epoch = Number(git(["log", "-1", "--format=%ct", headRef(branch)], root).trim());
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
    // The one non-git subprocess in this file. `root` is always an absolute path returned by
    // `git rev-parse --show-toplevel`, never user/config-supplied, and there is no `--` for `du` to
    // need: nothing here reaches this call as an option-shaped or otherwise hostile string.
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
 * Builds the SAFE/JUDGMENT classes and the four drift numbers from already-gathered git state. Pure
 * (no I/O) so it can be unit tested directly, separate from the git-shelling-out layer.
 */
export function classify({
  root,
  mainBranch,
  worktrees,
  branches,
  untrackedFiles,
  scratchPatterns = [],
}) {
  const safe = { worktrees: [], branches: [] };
  const judgment = { worktrees: [], branches: [], untrackedFiles: [] };

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
    if (w.prunable) {
      // round-4 review F3: a worktree whose directory git can no longer find (moved aside, an
      // unmounted drive, an offline share) reports `--ignored` status as a bare error, which fell
      // through to the generic "tree not clean" reason - telling the operator there is uncommitted
      // work at a path that does not exist. Say what is actually true instead.
      judgment.worktrees.push({ ref: w.path, branch: w.branch, reason: "worktree directory is missing (git reports it prunable)" });
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
    const protectedWt = PROTECTED_BRANCH_NAMES.has(w.branch) || PROTECTED_BRANCH_PREFIXES.some((p) => w.branch.startsWith(p));
    if (protectedWt) {
      // Same reasoning as the branch class below: a name whose whole value IS the name is never
      // mechanically safe, whether it's a ref or a directory checked out on that ref.
      judgment.worktrees.push({ ref: w.path, branch: w.branch, reason: "protected branch name, a person decides" });
      continue;
    }
    safe.worktrees.push({ ref: w.path, branch: w.branch, reason: "branch merged into main (and on origin), tree fully clean" });
  }

  // round-4 review F1: a branch checked out in ANY worktree - the main one included - is never SAFE
  // by itself. It is SAFE only together with its own worktree ALSO being SAFE this run (in which
  // case that worktree's removal frees the branch before the branch-delete step ever runs); checked
  // out anywhere else, it goes to JUDGMENT with one row, not two silently-contradicting tables.
  const checkedOutAnywhere = new Set(worktrees.map((w) => w.branch).filter(Boolean));
  const removedHere = new Set(safe.worktrees.map((w) => w.branch).filter(Boolean));
  for (const b of branches) {
    if (b.name === mainBranch) continue;
    if (b.name === cur) continue; // never the current branch
    if (checkedOutAnywhere.has(b.name) && !removedHere.has(b.name)) {
      if (b.merged) {
        judgment.branches.push({ ref: b.name, reason: "merged, but checked out in a worktree this run is not removing" });
      } else if (b.daysSinceCommit === null || b.daysSinceCommit >= UNMERGED_STALE_DAYS) {
        judgment.branches.push({
          ref: b.name,
          reason: b.daysSinceCommit === null ? "unmerged, last-commit age unknown, checked out in a worktree" : `unmerged, no commit in ${Math.floor(b.daysSinceCommit)} days, checked out in a worktree`,
        });
      }
      continue;
    }
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
      // diskUsedKB is filled in by the caller.
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

// ---------- workarounds (T4): a JUDGMENT row per open WORKAROUND: line in docs/work ----------

/**
 * `removeWhen` (C1's `WORKAROUND: <cause> / <blocked by> / <remove when>`, parsed by
 * scripts/work-record.mjs) is either "by <yyyy-mm-dd>" or a condition in words. Only the dated
 * shape can ever be judged mechanically overdue; a worded condition ("T1 lands") is never
 * evaluated - it stays "open" until a person (or the orchestrator) says otherwise.
 */
function isWorkaroundOverdue(removeWhen, now) {
  const m = /^by[ \t]+(\d{4}-\d{2}-\d{2})[ \t]*$/i.exec(String(removeWhen ?? "").trim());
  if (!m) return false;
  const due = new Date(`${m[1]}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < now.getTime();
}

/**
 * Gathers the JUDGMENT `workarounds` sub-array from every `docs/work/*.record.md` record under
 * `root`, via `listRecords` (scripts/work-record.mjs, C2) - never reads or parses a record file
 * itself. A missing `docs/work` directory is not a finding: `listRecords` already returns `[]`
 * when the directory can't be read (any project with none yet, or none at all). A record with no
 * usable `Work:` id is skipped rather than guessed at - it can't make a `ref` for a row.
 */
export function gatherWorkarounds(root, { now = new Date(), fsImpl } = {}) {
  const dir = path.join(root, "docs", "work");
  const entries = listRecords(dir, fsImpl ? { fsImpl } : {});
  const rows = [];
  for (const { record } of entries) {
    const workId = record?.fields?.work;
    if (!workId) continue;
    for (const wa of record.workarounds || []) {
      const overdue = isWorkaroundOverdue(wa.removeWhen, now);
      rows.push({
        ref: workId,
        reason: `${wa.cause} / remove when ${wa.removeWhen} (${overdue ? "overdue" : "open"})`,
        overdue,
      });
    }
  }
  return rows;
}

// ---------- gathering (I/O layer that feeds classify()) ----------

/**
 * Returns either a normal state object, or `{ __blind: true, reason }` when git state could not be
 * read at all.
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

  const result = classify({
    root,
    mainBranch,
    worktrees,
    branches,
    untrackedFiles,
    scratchPatterns: config.scratch_patterns || [],
  });
  result.drift.diskUsedKB = diskUsedKB;
  // T4: workarounds are gathered independently of git state - a missing docs/work directory (no
  // work records yet, or a project not using this build at all) is not a finding, so this never
  // throws and never blocks the git-derived classification above.
  result.judgment.workarounds = gatherWorkarounds(root, { now });
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
 *
 * A branch is only ever deleted after ITS OWN worktree removal (if it had one) logged `ok: true`.
 * Round-1 review found a case where `git worktree remove` reported failure (a permission-denied
 * final rmdir) yet had already deregistered the worktree and emptied its directory - `stillCheckedOut`
 * alone no longer saw the branch as checked out, so it was deleted anyway even though the log line
 * read "failed". The branch is the last copy of those commits if anything went wrong; when in doubt
 * it stays, and the log says exactly what happened to each.
 */
export function applySafe(state, log = []) {
  const { root } = state._raw;

  const failedWorktreeBranches = new Set();
  for (const w of state.safe.worktrees) {
    try {
      git(["worktree", "remove", "--", w.ref], root);
      log.push({ action: "worktree-remove", ref: w.ref, ok: true });
    } catch (err) {
      // A failure here can still have left git's own bookkeeping deregistered and the directory
      // emptied (only the final rmdir failed) - round-2 review found that on Windows the empty
      // directory SHELL survives even then, so `!existsSync(w.ref)` never fired the note and the
      // operator read a bare error as "the worktree survived intact". Ask git's own worktree list
      // instead of the filesystem: if git no longer lists it, it is gone, regardless of what is left
      // on disk.
      const goneAnyway = w.ref ? !(listWorktrees(root) || []).some((x) => samePath(x.path, w.ref)) : false;
      const note = goneAnyway
        ? " (git no longer lists this worktree and its contents are gone; only an empty directory remains - treat it as removed, not survived)"
        : "";
      log.push({ action: "worktree-remove", ref: w.ref, ok: false, error: `${String(err.message || err)}${note}` });
      if (w.branch) failedWorktreeBranches.add(w.branch);
    }
  }
  // round-4 review F2: `git worktree prune` used to run here, unconditionally, before this
  // function's own `stillCheckedOut` guard was computed - it deregisters ANY worktree whose
  // directory git can no longer find, including one this same run correctly classified JUDGMENT
  // (moved aside, an unmounted drive), not only the SAFE ones this function is scoped to. Measured
  // erasing a JUDGMENT worktree's registration and then, on the pruned listing, letting its merged
  // branch look free to delete in the same run. The invariant for this whole function is: act ONLY
  // on rows this run printed as SAFE, and never touch, prune, or delete anything it called JUDGMENT.
  // `git worktree prune` cannot be scoped to SAFE entries only - it is a blanket operation - so it
  // does not belong in a function that must keep that promise; a prunable worktree is now its own
  // JUDGMENT row instead (see classify()). Fewer moving parts: no snapshot-before-prune bookkeeping
  // is needed here because nothing here deregisters anything this loop did not itself just remove.

  let stillCheckedOut;
  try {
    stillCheckedOut = new Set((listWorktrees(root) || []).map((w) => w.branch).filter(Boolean));
  } catch {
    stillCheckedOut = new Set();
  }
  for (const b of state.safe.branches) {
    if (failedWorktreeBranches.has(b.ref)) {
      log.push({ action: "branch-delete", ref: b.ref, ok: false, error: "skipped: its worktree removal did not report success" });
      continue;
    }
    if (stillCheckedOut.has(b.ref)) {
      log.push({ action: "branch-delete", ref: b.ref, ok: false, error: "still checked out in a worktree" });
      continue;
    }
    try {
      // b.ref is a short name here, the one shape this file otherwise avoids - `git branch -d`
      // rejects a fully-qualified refname outright ("not found"), so a short name is the only input
      // it accepts. Safe anyway: `branch -d` is scoped to refs/heads by the subcommand itself (a
      // same-named tag cannot shadow it - round-3 review measured this directly), and `--` plus
      // git's own branch-name validation rules out any option-shaped value reaching it as a flag.
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
  console.log("  untracked files:");
  console.log(table(state.judgment.untrackedFiles, ["ref", "reason"]));
  console.log("  workarounds:");
  console.log(table(state.judgment.workarounds, ["ref", "reason"]));
  console.log("");
  console.log("DRIFT:");
  console.log(`  disk used (project root): ${state.drift.diskUsedKB === null ? "unknown" : `${state.drift.diskUsedKB} KB`}`);
  console.log(`  worktree count: ${state.drift.worktreeCount}`);
  console.log(`  open local branch count: ${state.drift.openBranchCount}`);
  console.log(`  untracked file count: ${state.drift.untrackedFileCount}`);
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
    state.judgment.untrackedFiles.length > 0 ||
    // T4: only an OVERDUE workaround is a finding; an open one is display-only.
    state.judgment.workarounds.some((w) => w.overdue)
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
        state.judgment.untrackedFiles.length > 0 ||
        state.judgment.workarounds.some((w) => w.overdue);
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
