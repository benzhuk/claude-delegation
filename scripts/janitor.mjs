#!/usr/bin/env node
// janitor — dry-run by default, prints a SAFE table, a JUDGMENT table, and four drift numbers for
// the current project (per contracts/project.schema.json, read only through project-config.mjs).
//
// janitor NEVER deletes a file. Its only two destructive actions, both delegated straight to git,
// are: `git worktree remove` (a whole worktree directory, via git's own bookkeeping) and
// `git branch -D` (a ref, force form — see the J1 note below for why). There is no unlink path in
// this tool, on purpose (round-2 review found a working escape out of the project root through a
// symlinked parent directory, and a second way to delete a git-tracked file on a self-asserted
// `created_by_tool` boolean; rather than harden a containment check further, the capability was
// cut). A tool that cannot delete files cannot delete the wrong file.
//
// SAFE (a human would agree without looking) = a git worktree whose branch's tip is confirmed
//   present on `refs/remotes/origin/<main>` (J1: fetched first, this run — see below; with no
//   origin remote at all, or a fetch that failed this run, nothing is ever confirmed and nothing is
//   ever SAFE; LOCAL main plays no part in this proof) AND is: not locked, not the main working
//   tree, not the worktree we are standing in, not checked out on a protected branch name, not
//   prunable (its directory must actually be there), `git status --porcelain --ignored` fully empty
//   (untracked AND ignored content both count), no submodules; OR a local branch confirmed on
//   origin/<main> the same way, that is not a protected name, not the current branch, not main, and
//   not checked out in ANY worktree unless that worktree is ALSO SAFE this same run (round-4 review:
//   a branch checked out anywhere else is never mechanically safe by itself, even if the worktree
//   holding it is the main working tree).
// JUDGMENT = everything that fails one of the above proofs but still looks stale: a dirty/ignored/
//   locked/submoduled/prunable worktree, a protected-name worktree (even if otherwise SAFE), a
//   worktree/branch merged into LOCAL main but not confirmed on origin (J1: this is now the ONLY
//   thing "merged locally" means — a stale local main gets no say in SAFE either way), a merge
//   judgment this run could not confirm because `git fetch origin --prune` itself failed
//   (UNVERIFIABLE, never SAFE), an unmerged branch with no commit in 14 days, a protected-name
//   branch that happens to be merged, a merged branch checked out in a worktree this run is not
//   removing, an untracked file matching the project's scratch_patterns; also (T4) one row per
//   `WORKAROUND:` line found across every `docs/work/*.record.md` (gathered via `listRecords`,
//   scripts/work-record.mjs, never parsed here) - an OVERDUE one (`remove when` a past
//   `by <yyyy-mm-dd>` date) is a finding, an open one (not yet due, or a worded condition this tool
//   can't evaluate) is display-only; a missing `docs/work` directory is not a finding either way.
//
// J1 origin-truth fix (2026-09-26, this sweep): the janitor used to call a branch "merged" when it
// was an ancestor of the CHECKOUT's local main, and only used the origin check as a second
// confirmation — so a stale local main (six releases behind, on a lead's Netcup checkout) meant a
// branch genuinely merged and pushed on origin was never even considered, never mind deleted.
// Merged now means an ancestor of `refs/remotes/origin/<main>`, full stop; local main plays no part
// in SAFE. Every run that will judge a merge begins with `git fetch origin --prune` in the root
// first (`--no-fetch` skips it); a failed fetch (offline, no remote, half of a fetch's refs updated
// before it errored) downgrades every merge judgment to UNVERIFIABLE, never to SAFE, and the report
// says so on its own first lines — a stale or absent origin ref is not proof of anything once this
// run couldn't refresh it. Under `--no-fetch`, every verdict that rests on origin ancestry is
// labelled "as of last fetch, <age>", the age read from `origin/<main>`'s own reflog or (when that
// ref has no reflog entry, e.g. it never moved) `FETCH_HEAD`'s mtime — the two together are the only
// record git keeps of when a fetch last actually happened. Because merged-on-origin can now be true
// while local main is stale, `git branch -d` (which git itself judges against the checkout's own
// HEAD/merge state, not origin) would refuse to delete exactly the branch this file just proved
// safe — so a branch reaching `-D` here has ALREADY passed the origin-ancestry check, in this same
// run, after the fetch; `-D`'s force is redundant with that proof, never a substitute for it, and it
// is reached from the SAFE class only.
//
// J1 (2026-09-26 sweep findings) additions:
//   UNSTARTED: a worktree/branch whose tip sits on the FIRST-PARENT chain of origin/<main> (or local
//   <main>'s, with no origin) never diverged, so it is never "merged" and never SAFE, whatever an
//   ancestor-based check would otherwise say - reported under JUDGMENT as `unstarted (tip is main)`.
//   J1 review round 2 (F1): a bare SHA-equality test against origin/<main>'s CURRENT tip only holds
//   while main never moves again; the moment any other lane merges and pushes, a zero-commit branch
//   or worktree cut earlier reads as "merged" and becomes SAFE. First-parent-chain membership does
//   not have that hole: a --no-ff merge's feature tip is reachable only through the merge's SECOND
//   parent, never the first-parent chain, so it stays correctly distinguishable from an unstarted
//   tip no matter how far main has since moved.
//   Age floor: nothing younger than `--min-age-hours` (CLI default 6) is ever SAFE. Age is the
//   younger of the ref's last-commit time and its own reflog time (F3: a branch re-created at an old
//   commit, e.g. by `git switch` on a merged remote branch, is not old just because the commit is),
//   and a checked-out branch reports its worktree's own age, per item 1's "with its worktree's age".
//   Remote class (report-only): an `origin/*` branch merged into origin/<main> is a JUDGMENT row
//   with the exact `git push origin --delete <name>` a human would run - never executed here. An
//   UNSTARTED remote branch (F2: same first-parent-chain test) is its own row instead, "a person
//   decides", with no delete command - it is never called "merged".
//   `--record <dir>` feeds the four drift numbers to `<dir>/<date>-<host>.json` + `<dir>/drift.md`.
//   `--outside` (report-only) lists `~/.agents/rollout-backups/*` and `~/.agents/ws/*`.
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
// `--apply` acts on SAFE only: a plain, unforced worktree removal, and a branch delete whose force
// (`-D`) is reached only via the SAFE class's own origin-ancestry proof (see the J1 note above) —
// everywhere else in this file, deletion is exactly as forceless and narrow as before. JUDGMENT is
// reported and never executed. This script never wipes uncommitted work, never resets a tree, never
// touches a work-in-progress shelf, never recursively deletes a path it did not create, and never
// unlinks a file.
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

import { existsSync, realpathSync, mkdirSync, writeFileSync, appendFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

import { loadProjectConfig, switchedOff } from "./project-config.mjs";
import { checkWiring } from "./wiring-check.mjs";
import { listRecords } from "./work-record.mjs";

const UNMERGED_STALE_DAYS = 14;
const PROTECTED_BRANCH_NAMES = new Set(["main", "master", "develop", "development", "release", "production", "stable", "trunk"]);
const PROTECTED_BRANCH_PREFIXES = ["release/", "hotfix/"];
// J1 item 2: nothing younger than this is ever SAFE, whatever else is true about it.
const DEFAULT_MIN_AGE_HOURS = 6;
// J1 item 4: default --record directory when the flag is given bare (no path after it).
const DEFAULT_RECORD_DIR = "docs/work/evidence/janitor/";

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

/**
 * J1 item 1: fetches origin before any merge judgment is made this run - the record of truth for
 * this repo is origin, and this is the one call that refreshes this checkout's view of it. `--prune`
 * keeps a deleted remote branch's tracking ref from lingering and answering a later merge question
 * with a name that no longer exists on origin. Never throws: a failure here (offline, no `origin`
 * remote at all, a network error partway through) is exactly the condition that downgrades every
 * origin-ancestry judgment to UNVERIFIABLE this run, so the caller needs the error message, not an
 * exception to catch again.
 *
 * J1 round 2 (MINOR 4): this is the janitor's only network call, made unconditionally on every run.
 * `timeout` bounds an unreachable host (the OS connect timeout otherwise); `GIT_TERMINAL_PROMPT: "0"`
 * and `GCM_INTERACTIVE: "never"` stop an https origin needing credentials from opening a blocking
 * terminal or Git Credential Manager prompt (measured on Windows) - a network call this file never
 * made before now must fail closed (into UNVERIFIABLE) rather than hang. `execFileSync` directly, not
 * the shared `git()` wrapper, because this is the one call site that needs its own timeout/env - the
 * wrapper's job is a bare, minimal, always-inherited environment for every OTHER call.
 */
export function fetchOrigin(root) {
  try {
    execFileSync("git", ["fetch", "origin", "--prune"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
    });
    return { ok: true, error: null };
  } catch (err) {
    // J1 round 2 (MINOR 3): git's raw stderr is a multi-line blob (advice lines, credential-helper
    // chatter, the remote URL) - it used to land verbatim as the report's first line and inside every
    // UNVERIFIABLE row's reason, breaking the table. One line: prefer the first `fatal:`/`error:` line
    // git itself prints (its actual verdict), else the first non-blank line, else "unknown error".
    const text = String((err && (err.stderr || err.message)) || err);
    const lines = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const first = lines.find((l) => /^(fatal|error):/.test(l)) || lines[0] || "unknown error";
    return { ok: false, error: first };
  }
}

/**
 * J1 item 1 (`--no-fetch` labelling): "as of last fetch, <age>" needs a timestamp for when origin
 * was last actually fetched, without fetching now. Two sources, the newest of the two wins:
 * `refs/remotes/origin/<mainBranch>`'s own reflog (the time that ref itself last MOVED - the more
 * precise signal, but absent when the ref has never moved, or `core.logAllRefUpdates` is off) and
 * `FETCH_HEAD`'s mtime, ACCEPTED ONLY when its own content proves the fetch it was written by is the
 * one that produced the CURRENT `origin/<mainBranch>` tip (J1 round 2, MINOR 2: `FETCH_HEAD` is
 * rewritten by a fetch/pull of ANY remote, or a fetch of one narrow branch on this one - measured
 * reporting "1m ago" for an origin/main untouched in 5 days, right after `git fetch upstream`).
 * `--git-path` resolves through a worktree's own `.git` file (which points elsewhere) rather than
 * assuming `<root>/.git` directly. Returns null (never throws) when neither source is available - a
 * repo that has never fetched, or whose `FETCH_HEAD` cannot be tied to this ref.
 */
export function lastFetchAgeHours(root, mainBranch, now = new Date()) {
  let refTime = null;
  try {
    const out = git(["log", "-g", "-1", "--date=unix", "--format=%gd", `refs/remotes/origin/${mainBranch}`], root);
    const m = /@\{(\d+)\}/.exec(out);
    if (m) refTime = Number(m[1]);
  } catch {
    // no reflog entry for the remote-tracking ref (core.logAllRefUpdates off, or it has never moved)
  }
  let fetchHeadTime = null;
  try {
    const gitPath = git(["rev-parse", "--git-path", "FETCH_HEAD"], root).trim();
    const full = path.isAbsolute(gitPath) ? gitPath : path.join(root, gitPath);
    const currentTip = refSha(root, `refs/remotes/origin/${mainBranch}`);
    const marker = `branch '${mainBranch}' of `;
    const matchesThisRef = currentTip
      ? readFileSync(full, "utf8")
          .split("\n")
          .some((line) => line.startsWith(currentTip) && line.includes(marker))
      : false;
    if (matchesThisRef) fetchHeadTime = statSync(full).mtimeMs / 1000;
  } catch {
    // never fetched at all, or FETCH_HEAD's content doesn't name this ref at its current tip
  }
  const candidates = [refTime, fetchHeadTime].filter((t) => typeof t === "number" && Number.isFinite(t));
  if (candidates.length === 0) return null;
  return (now.getTime() / 1000 - Math.max(...candidates)) / 3600;
}

/** Renders `lastFetchAgeHours`'s output for a report line - never throws on null/NaN. */
function formatFetchAge(hours) {
  if (typeof hours !== "number" || !Number.isFinite(hours)) return "age unknown";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 48) return `${hours.toFixed(1)}h ago`;
  return `${(hours / 24).toFixed(1)}d ago`;
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

/** Existence-plus-value read of a full refname in one call: `show-ref --verify` (no `--quiet`)
 * prints `<sha> <fullref>` on success and nothing on failure, so this both proves the ref exists
 * (reading the ref store directly, never DWIMing) and returns its tip - the same safety shape as
 * every other ref touch in this file, minus a second round-trip for the SHA. */
export function refSha(root, fullRef) {
  try {
    const out = git(["show-ref", "--verify", fullRef], root);
    return out.trim().split(/\s+/)[0] || null;
  } catch {
    return null;
  }
}

/**
 * UNSTARTED (J1 item 1, revised in review round 2, finding F1): true when `sha` sits on the
 * FIRST-PARENT chain of origin/<mainBranch> (or, when there is no origin/<mainBranch> ref, of local
 * <mainBranch>) - it was main's own tip at some point, so a branch/worktree sitting on it has no
 * commits of its own. A builder worktree cut from main minutes earlier is the exact repro
 * (2026-09-25 sweep finding): its tip sits on main's own history, so the OLD ancestor-based
 * `isBranchMerged`/`isBranchOnOrigin` pair answered "merged" for it.
 *
 * Round 2 found that a bare SHA-equality test against origin/<mainBranch>'s CURRENT tip (the
 * original J1 fix) only holds while main never advances again: the pinning tests never let main
 * move after the cut, but in real use another lane merges and pushes constantly, and the moment
 * that happens a zero-commit branch/worktree cut earlier stops equaling main's NEW tip and reads as
 * "merged" - `--apply` deleted one seconds after it was cut (round-2 repro). First-parent-chain
 * membership does not have that hole and needs no "was it ever equal" history: this project always
 * merges real work with `--no-ff` (see `mergeIntoMain()` below and every build's own RESULT), so a
 * genuinely completed branch's tip is reachable from main only through a merge commit's SECOND
 * parent, never the first-parent chain, while an unstarted tip - main's own historical tip - is
 * always ON that chain, no matter how far main has since moved. A fast-forward-merged branch also
 * reads true here: conservative on purpose, it goes to JUDGMENT, never SAFE, exactly as before.
 */
const mainlineCache = new Map();
export function isTipOnMainline(root, sha, mainBranch) {
  if (!sha) return false;
  for (const ref of [`refs/remotes/origin/${mainBranch}`, headRef(mainBranch)]) {
    const tip = refSha(root, ref);
    if (!tip) continue;
    // Cached per (root, ref, tip): the same triple can be asked about many branches/worktrees in one
    // run, and the cache key includes the CURRENT tip, so a ref that moves mid-process (never happens
    // within a single janitor run, but does across the many gatherState() calls in this test file)
    // is never read stale.
    const key = [root, ref, tip].join("|");
    if (!mainlineCache.has(key)) {
      try {
        mainlineCache.set(key, new Set(git(["rev-list", "--first-parent", ref], root).split(/\r?\n/).filter(Boolean)));
      } catch {
        mainlineCache.set(key, new Set());
      }
    }
    if (mainlineCache.get(key).has(sha)) return true;
  }
  return false;
}

/** UNSTARTED for a local branch: its own tip, tested against `isTipOnMainline` above. */
export function isUnstarted(root, branch, mainBranch) {
  return isTipOnMainline(root, refSha(root, headRef(branch)), mainBranch);
}

/** Worktree age (J1 item 2): git records no worktree-add timestamp anywhere queryable, so the
 * directory's own creation time is the simplest available proxy for "how long has this worktree
 * existed". Falls back to mtime on a filesystem that does not report birthtime. */
export function worktreeAgeHours(worktreePath, now = new Date()) {
  try {
    const st = statSync(worktreePath);
    const createdMs = st.birthtimeMs && st.birthtimeMs > 0 ? st.birthtimeMs : st.mtimeMs;
    return (now.getTime() - createdMs) / 3600000;
  } catch {
    return null;
  }
}

/** Branch age (J1 item 2, revised in review round 2, finding F3): a bare branch ref has no directory
 * to stat, so its last-commit time (already computed for the unmerged-staleness check below) is one
 * age proxy - but it is wrong for a branch re-created AT an old commit (`git switch -c` or `git
 * branch <name> <old-sha>` both point a brand-new ref at a commit made long ago; a merged remote
 * branch checked out again to look at it is the exact repro). The ref's own reflog records when the
 * REF itself last moved, creation included, so the younger of the two wins - never older than the
 * ref has actually existed, which is what "age" means here. */
export function branchAgeHours(root, branch, now = new Date()) {
  const days = daysSinceLastCommit(root, branch, now);
  if (days === null) return null;
  let refHours = null;
  try {
    // -g walks the ref's reflog; %gd with --date=unix gives `<shortname>@{<epoch>}`, the time the ref
    // was last updated (branch creation is itself a ref update, logged by default in a non-bare
    // repo). %ct would be the COMMIT's own time, which is the bug this replaces.
    const out = git(["log", "-g", "-1", "--date=unix", "--format=%gd", headRef(branch)], root);
    const m = /@\{(\d+)\}/.exec(out);
    const t = m ? Number(m[1]) : NaN;
    if (Number.isFinite(t) && t > 0) refHours = (now.getTime() / 1000 - t) / 3600;
  } catch {
    // No reflog at all (core.logAllRefUpdates off, or a very old git) - fall back to commit time only.
  }
  return refHours === null ? days * 24 : Math.min(days * 24, refHours);
}

/** Remote class (J1 item 3), report-only: every `origin/*` branch except `origin/HEAD` (a symbolic
 * ref, not a branch). `%(refname)` is the full, unambiguous name, exactly like `listLocalBranches`. */
export function listRemoteBranches(root) {
  try {
    return git(["for-each-ref", "refs/remotes/origin", "--format=%(refname)"], root)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/^refs\/remotes\/origin\//, ""))
      .filter((name) => name !== "HEAD");
  } catch {
    return [];
  }
}

/** Same show-ref-then-merge-base shape as `isBranchOnOrigin` above, both operands already
 * remote-tracking refs: is `origin/<name>` contained in `origin/<mainBranch>`. Used only to build a
 * report-only JUDGMENT row (J1 item 3) - this file never deletes a remote ref itself. */
export function isRemoteBranchMergedIntoOrigin(root, name, mainBranch) {
  const ref = `refs/remotes/origin/${name}`;
  const mainRef = `refs/remotes/origin/${mainBranch}`;
  try {
    git(["show-ref", "--verify", "--quiet", ref], root);
    git(["show-ref", "--verify", "--quiet", mainRef], root);
  } catch {
    return false;
  }
  try {
    git(["merge-base", "--is-ancestor", ref, mainRef], root);
    return true;
  } catch {
    return false;
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
  minAgeHours = DEFAULT_MIN_AGE_HOURS,
  remoteBranches = [],
  // J1 item 1: set by gatherState when this run's `git fetch origin --prune` itself failed (offline,
  // no origin remote, a partial fetch that errored) - every origin-ancestry-based merge judgment
  // (the `onOrigin` proof below) is downgraded to JUDGMENT, never SAFE, regardless of what a stale or
  // absent origin ref would otherwise say. Defaults false so a caller (a test, most often) that
  // builds its own `worktrees`/`branches` state directly, without going through gatherState's fetch
  // step, gets the pre-J1 behavior unchanged.
  originUnverifiable = false,
  fetchFailNote = "",
  // Appended to the SAFE reason text only under `--no-fetch` (gatherState sets this; empty otherwise
  // since a live, successful fetch this run needs no "as of last fetch" caveat).
  fetchAgeSuffix = "",
}) {
  const safe = { worktrees: [], branches: [] };
  const judgment = { worktrees: [], branches: [], untrackedFiles: [] };

  const cur = currentBranchOf(worktrees, root);
  // J1 review round 2 (F9): a lane that never diverged produces ONE row here (worktree) and, absent
  // this set, a SECOND row in the branch loop below for the exact same branch - two lines on Ben's
  // decisions item for one unstarted lane. Any branch named here got its "unstarted" story told by a
  // worktree row already; the branch loop skips it rather than repeat it.
  const unstartedBranchesReportedByWorktree = new Set();

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
      // J1 review round 2 (F9): the spec covers "clean or dirty" for unstarted - a dirty unstarted
      // worktree used to fall straight into the generic "tree not clean" reason with no mention that
      // it never diverged either.
      if (w.branch && w.unstarted) unstartedBranchesReportedByWorktree.add(w.branch);
      const unstartedNote = w.branch && w.unstarted ? ", unstarted (tip is main)" : "";
      judgment.worktrees.push({ ref: w.path, branch: w.branch, reason: `tree not clean (uncommitted, untracked or ignored files present)${unstartedNote}` });
      continue;
    }
    // J1 item 1: UNSTARTED trumps the merged check entirely - a branch that never diverged is
    // never "merged", it just never left the gate. Checked ahead of the unmerged/detached
    // early-continue below because an unstarted branch's tip trivially IS an ancestor of main, so
    // the OLD `merged` flag would otherwise be true for it too.
    if (w.branch && w.unstarted) {
      unstartedBranchesReportedByWorktree.add(w.branch);
      judgment.worktrees.push({ ref: w.path, branch: w.branch, reason: `unstarted (tip is main)${ageSuffix(w.ageHours)}` });
      continue;
    }
    if (!w.branch) continue; // detached: normal in-progress state, not a finding
    // J1 item 2: origin ancestry is now the WHOLE merged proof - `w.merged` (local main) never gates
    // SAFE by itself, it only supplies wording for the one JUDGMENT case where origin disagrees.
    if (!w.onOrigin) {
      if (w.merged) {
        judgment.worktrees.push({ ref: w.path, branch: w.branch, reason: `merged locally, not confirmed on origin/${mainBranch}` });
      }
      continue; // not merged on origin, and not even merged locally: normal in-progress state
    }
    // J1 item 1: a fetch that failed this run means origin/<mainBranch> cannot be trusted - never
    // SAFE, whatever it currently (possibly stale) says.
    if (originUnverifiable) {
      judgment.worktrees.push({ ref: w.path, branch: w.branch, reason: `merge judgment UNVERIFIABLE this run: git fetch origin failed${fetchFailNote}` });
      continue;
    }
    const protectedWt = PROTECTED_BRANCH_NAMES.has(w.branch) || PROTECTED_BRANCH_PREFIXES.some((p) => w.branch.startsWith(p));
    if (protectedWt) {
      // Same reasoning as the branch class below: a name whose whole value IS the name is never
      // mechanically safe, whether it's a ref or a directory checked out on that ref.
      judgment.worktrees.push({ ref: w.path, branch: w.branch, reason: "protected branch name, a person decides" });
      continue;
    }
    // J1 item 2: age floor - nothing younger than minAgeHours is SAFE, whatever else is true. A
    // non-numeric age (F4: stat failure, unreadable log) is UNKNOWN, not "old enough" - it is never
    // allowed to fall through to SAFE just because the numeric comparison below is vacuously false.
    if (belowAgeFloor(w.ageHours, minAgeHours)) {
      judgment.worktrees.push({ ref: w.path, branch: w.branch, reason: ageFloorReason(w.ageHours, minAgeHours) });
      continue;
    }
    safe.worktrees.push({ ref: w.path, branch: w.branch, reason: `branch merged into origin/${mainBranch}${fetchAgeSuffix}, tree fully clean` });
  }

  // round-4 review F1: a branch checked out in ANY worktree - the main one included - is never SAFE
  // by itself. It is SAFE only together with its own worktree ALSO being SAFE this run (in which
  // case that worktree's removal frees the branch before the branch-delete step ever runs); checked
  // out anywhere else, it goes to JUDGMENT with one row, not two silently-contradicting tables.
  const checkedOutAnywhere = new Set(worktrees.map((w) => w.branch).filter(Boolean));
  const removedHere = new Set(safe.worktrees.map((w) => w.branch).filter(Boolean));
  // J1 review round 2 (F3): a branch checked out in a worktree reports THAT worktree's own age, not
  // its last-commit time - item 1's own wording ("with its worktree's age"). A branch re-created at
  // an old, already-merged commit (`git switch` on a merged remote branch does exactly this) is
  // seconds old as a ref/worktree even though the commit it points at is not.
  const worktreeAgeByBranch = new Map();
  for (const w of worktrees) {
    if (w.branch && typeof w.ageHours === "number") worktreeAgeByBranch.set(w.branch, w.ageHours);
  }
  for (const b of branches) {
    if (b.name === mainBranch) continue;
    if (b.name === cur) continue; // never the current branch
    const bAgeHours = worktreeAgeByBranch.has(b.name) ? worktreeAgeByBranch.get(b.name) : b.ageHours;
    // J1 item 1: same UNSTARTED trump as the worktree loop above, checked before anything else -
    // this branch is not "merged", it never diverged. F9: a worktree row already told this branch's
    // unstarted story - one row per lane, not two.
    if (b.unstarted) {
      if (!unstartedBranchesReportedByWorktree.has(b.name)) {
        judgment.branches.push({ ref: b.name, reason: `unstarted (tip is main)${ageSuffix(bAgeHours)}` });
      }
      continue;
    }
    // J1 item 1: a fetch that failed this run means ANY "merged on origin" reading (however this
    // branch would otherwise be classified below - checked out elsewhere, protected, or plain SAFE)
    // cannot be trusted, so this is checked ahead of every one of those, not just the plain SAFE
    // path. A branch not (yet) merged on origin has nothing for a failed fetch to have gotten wrong
    // about IT specifically, so this only fires when `onOrigin` is (possibly stale-ly) true.
    if (b.onOrigin && originUnverifiable) {
      judgment.branches.push({ ref: b.name, reason: `merge judgment UNVERIFIABLE this run: git fetch origin failed${fetchFailNote}` });
      continue;
    }
    if (checkedOutAnywhere.has(b.name) && !removedHere.has(b.name)) {
      // J1 item 2: `b.onOrigin` (not `b.merged`, local main) is the "would otherwise be SAFE" test
      // from here on - a branch merged only locally still isn't SAFE-eligible regardless of checkout,
      // so it keeps the more informative "not confirmed on origin" reason instead.
      if (b.onOrigin) {
        judgment.branches.push({ ref: b.name, reason: "merged, but checked out in a worktree this run is not removing" });
      } else if (b.merged) {
        judgment.branches.push({ ref: b.name, reason: `merged locally, not confirmed on origin/${mainBranch}, and checked out in a worktree` });
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
      if (b.onOrigin || b.merged) {
        // A branch whose whole value is its name is never mechanically safe: being an ancestor of
        // main (local OR origin) is exactly what a bookmark/alias looks like.
        judgment.branches.push({ ref: b.name, reason: "protected name, merged but a person decides" });
      }
      continue;
    }
    // J1 item 2: `onOrigin` is now the WHOLE merged proof for SAFE - local main (`b.merged`) never
    // gates it, it only supplies wording for the one JUDGMENT case where origin disagrees.
    if (!b.onOrigin) {
      if (b.merged) {
        // Same proof the worktree class demands: a merge that exists only in a local main is not
        // confirmed anywhere else, and the branch name is the only handle on that work.
        judgment.branches.push({ ref: b.name, reason: `merged locally, not confirmed on origin/${mainBranch}` });
      } else if (b.daysSinceCommit === null || b.daysSinceCommit >= UNMERGED_STALE_DAYS) {
        judgment.branches.push({
          ref: b.name,
          reason: b.daysSinceCommit === null ? "unmerged, last-commit age unknown" : `unmerged, no commit in ${Math.floor(b.daysSinceCommit)} days`,
        });
      }
      continue;
    }
    // b.onOrigin is true and originUnverifiable is false from here (both already handled above).
    // J1 item 2: age floor applies here too - a merged, on-origin branch younger than the floor
    // is JUDGMENT, not SAFE, whatever else is true about it. F4: an unknown age is never treated
    // as old enough.
    if (belowAgeFloor(bAgeHours, minAgeHours)) {
      judgment.branches.push({ ref: b.name, reason: ageFloorReason(bAgeHours, minAgeHours) });
    } else {
      // J1 round 2 (MAJOR 2): carry the sha this run proved merged on origin - applySafe rechecks it
      // immediately before `-D` rather than trusting the name alone.
      safe.branches.push({ ref: b.name, sha: b.tip || null, reason: `merged into origin/${mainBranch}${fetchAgeSuffix}` });
    }
  }

  for (const f of untrackedFiles) {
    if (matchesScratchPattern(f, scratchPatterns)) {
      judgment.untrackedFiles.push({ ref: f, reason: "untracked, matches a scratch pattern" });
    }
  }

  // J1 item 3: remote class, report-only. Never `origin/<mainBranch>` itself, never a protected
  // name (a bookmark/alias is never mechanically safe, same reasoning as the local classes above),
  // and the exact human command is printed, never run - this tool's two destructive actions
  // (worktree remove, local branch delete) stay exactly two.
  const judgmentRemoteBranches = [];
  for (const rb of remoteBranches) {
    if (rb.name === mainBranch) continue;
    const protectedName = PROTECTED_BRANCH_NAMES.has(rb.name) || PROTECTED_BRANCH_PREFIXES.some((p) => rb.name.startsWith(p));
    if (protectedName) continue;
    // J1 review round 2 (F2): an unstarted pushed branch (a lane's base branch, cut from main and
    // pushed before any work happened) is checked BEFORE the merged test, same trump as the local
    // classes above - its tip sitting on main's own history is not "merged", and item 1 says an
    // unstarted branch is never called that. No delete command: it is real, if empty, work someone
    // may still push to, not a candidate for the same recommendation a truly merged branch gets.
    if (rb.unstarted) {
      judgmentRemoteBranches.push({ ref: `origin/${rb.name}`, reason: "unstarted remote branch (tip is main), a person decides", command: "" });
      continue;
    }
    if (rb.merged) {
      // J1 round 2 (MINOR 1): the same fetch failure that downgrades local worktree/branch verdicts
      // to UNVERIFIABLE applies here too - `rb.merged` is read off this same (possibly stale)
      // `refs/remotes/origin/*`, and the spec says "every merge judgment", not only the destructive
      // ones. Report-only either way; this only changes the wording and drops the copy/paste command.
      if (originUnverifiable) {
        judgmentRemoteBranches.push({
          ref: `origin/${rb.name}`,
          reason: `merge judgment UNVERIFIABLE this run: git fetch origin failed${fetchFailNote}`,
          command: "",
        });
        continue;
      }
      // J1 review round 2 (F6): the verdict was read off `refs/remotes/origin/*` as of this host's
      // last fetch - another host may have pushed new commits to the same name since. Naming the tip
      // sha this verdict actually used lets a human compare before running the command against
      // whatever is there NOW. The command itself is unchanged (the spec asks for the plain
      // `git push origin --delete <name>`) except for shell-quoting the name, which only ever changes
      // anything for a name no sane branch would have.
      const tipNote = rb.tip ? ` (at ${rb.tip.slice(0, 7)}, as of last fetch)` : "";
      judgmentRemoteBranches.push({
        ref: `origin/${rb.name}`,
        reason: `remote branch merged into main${tipNote}`,
        command: `git push origin --delete ${shellQuote(rb.name)}`,
      });
    }
  }
  judgment.remoteBranches = judgmentRemoteBranches;

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

/** Formats an optional age (hours) as a trailing report clause, e.g. ", 0.2h old" - never throws on
 * a null/undefined/NaN age, it just omits the clause. */
function ageSuffix(ageHours) {
  return typeof ageHours === "number" && Number.isFinite(ageHours) ? `, ${ageHours.toFixed(1)}h old` : "";
}

/** J1 review round 2 (F4): an UNKNOWN age (stat failure, unreadable log - `ageHours` is `null`) is
 * not "old enough for SAFE" just because `age < floor` is vacuously false for a non-number. It is
 * below the floor, same as a too-young age: an unknown is never rendered as a confident "yes,
 * SAFE". */
function belowAgeFloor(ageHours, minAgeHours) {
  return !(typeof ageHours === "number" && Number.isFinite(ageHours)) || ageHours < minAgeHours;
}

/** The JUDGMENT reason text for `belowAgeFloor` above - distinguishes "too young" from "unknown"
 * rather than printing a age clause that silently vanishes for the null case. */
function ageFloorReason(ageHours, minAgeHours) {
  if (typeof ageHours === "number" && Number.isFinite(ageHours)) {
    return `younger than the age floor${ageSuffix(ageHours)}, floor ${minAgeHours}h`;
  }
  return `age unknown, floor ${minAgeHours}h`;
}

/** J1 review round 2 (F6): `git check-ref-format --branch` accepts a branch name containing shell
 * metacharacters (`;`, `$(...)`, backticks - a real reproduction, not theoretical). The printed
 * delete command is advice a human copies and runs; quote the one variable part of it so pasting it
 * verbatim can never execute anything embedded in the name. A no-op for every ordinary branch name. */
function shellQuote(name) {
  return /^[A-Za-z0-9._/-]+$/.test(name) ? name : `'${name.replace(/'/g, `'\\''`)}'`;
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
  // Bounded like every regex in this repo (hooks/agent-dispatch-guard.mjs:79-135): [ \t]{0,20},
  // never an unbounded run. `by` is optional and trailing words are allowed, so a bare
  // `<yyyy-mm-dd>` and `by <date> at the latest` are judged too - C1 says ANY remove-when date
  // in the past, not only the canonical form. A worded condition still never matches.
  const m = /^(?:by[ \t]{1,20})?(\d{4}-\d{2}-\d{2})\b/i.exec(String(removeWhen ?? "").trim());
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
  let entries;
  try {
    entries = listRecords(dir, fsImpl ? { fsImpl } : {});
  } catch (err) {
    // One unreadable `*.record.md` (a directory with that name, a locked file on win32) threw out
    // of gatherState, where main()'s fail-open catch swallowed EVERY finding and printed nothing
    // at exit 0. Blind is not clean: say so on stderr and keep the rest of the report.
    process.stderr.write(`janitor: could not read work records in ${dir}: ${String(err && err.message ? err.message : err)}\n`);
    return [];
  }
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
export function gatherState({ root, config, now = new Date(), minAgeHours = DEFAULT_MIN_AGE_HOURS, noFetch = false }) {
  const mainBranch = config.main_branch || "main";

  // J1 item 1: fetch first, before any merge judgment - origin is this repo's record of truth, and
  // this checkout's view of it is only as fresh as its last fetch. `--no-fetch` skips the call
  // entirely and every origin-ancestry verdict is labelled with how old that view actually is
  // instead; a fetch that IS attempted and fails downgrades every such verdict to UNVERIFIABLE,
  // never SAFE - a stale (or, with no origin remote at all, permanently absent) ref is not proof of
  // anything once this run couldn't refresh it.
  const fetch = noFetch
    ? { attempted: false, ok: true, error: null, ageHours: lastFetchAgeHours(root, mainBranch, now) }
    : (() => {
        const res = fetchOrigin(root);
        return { attempted: true, ok: res.ok, error: res.error, ageHours: null };
      })();
  const originUnverifiable = fetch.attempted && !fetch.ok;
  const fetchFailNote = fetch.error ? `: ${fetch.error}` : "";
  const fetchAgeSuffix = !fetch.attempted ? ` (as of last fetch, ${formatFetchAge(fetch.ageHours)})` : "";

  const rawWorktrees = listWorktrees(root);
  if (rawWorktrees === null) return { __blind: true, reason: "could not read git worktree state" };

  const worktrees = rawWorktrees.map((w) => {
    const clean = w.bare ? true : isTreeClean(w.path);
    const merged = w.branch ? isBranchMerged(root, w.branch, mainBranch) : false;
    // J1 item 2: onOrigin is now computed unconditionally - it no longer requires `merged` (local
    // main) to be true first, so a branch merged on origin while local main is stale still surfaces.
    const onOrigin = w.branch ? isBranchOnOrigin(root, w.branch, mainBranch) : false;
    const unstarted = w.branch ? isUnstarted(root, w.branch, mainBranch) : false;
    const ageHours = w.bare ? null : worktreeAgeHours(w.path, now);
    return { ...w, clean, merged, onOrigin, unstarted, ageHours, hasSubmodules: w.bare ? false : hasSubmodules(w.path) };
  });

  const branchNames = listLocalBranches(root);
  if (branchNames === null) return { __blind: true, reason: "could not read git branch state" };

  const branches = branchNames.map((name) => {
    const merged = isBranchMerged(root, name, mainBranch);
    return {
      name,
      merged,
      // J1 item 2: unconditional, same reasoning as the worktree map above.
      onOrigin: isBranchOnOrigin(root, name, mainBranch),
      daysSinceCommit: daysSinceLastCommit(root, name, now),
      unstarted: isUnstarted(root, name, mainBranch),
      ageHours: branchAgeHours(root, name, now),
      // J1 round 2 (MAJOR 2): the sha classify() proved merged on origin THIS run - carried into the
      // SAFE row so applySafe can recheck it immediately before deleting, instead of trusting a name
      // that may have moved (a new local commit) in the window between gather and apply.
      tip: refSha(root, headRef(name)),
    };
  });

  const remoteBranches = listRemoteBranches(root)
    .filter((name) => name !== mainBranch)
    .map((name) => ({
      name,
      merged: isRemoteBranchMergedIntoOrigin(root, name, mainBranch),
      // J1 review round 2 (F2): same first-parent-chain test as the local UNSTARTED class, applied to
      // the remote tip - an unstarted pushed branch must never read as "merged into main" either.
      unstarted: isTipOnMainline(root, refSha(root, `refs/remotes/origin/${name}`), mainBranch),
      tip: refSha(root, `refs/remotes/origin/${name}`),
    }));

  const untrackedFiles = listUntrackedFiles(root);
  const diskUsedKB = diskUsageKB(root);

  const result = classify({
    root,
    mainBranch,
    worktrees,
    branches,
    untrackedFiles,
    scratchPatterns: config.scratch_patterns || [],
    minAgeHours,
    remoteBranches,
    originUnverifiable,
    fetchFailNote,
    fetchAgeSuffix,
  });
  result.drift.diskUsedKB = diskUsedKB;
  // T4: workarounds are gathered independently of git state - a missing docs/work directory (no
  // work records yet, or a project not using this build at all) is not a finding, so this never
  // throws and never blocks the git-derived classification above.
  result.judgment.workarounds = gatherWorkarounds(root, { now });
  // J1 item 1: surfaced for the report's first lines (a failed fetch) and for --json callers.
  result.fetch = fetch;
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
  // J1 round 2 (MAJOR 1, defence in depth): main() already refuses `--apply` with `--no-fetch`, but
  // `applySafe` is exported and callable on its own (every test in this file calls it directly) - a
  // SAFE row is only ever trustworthy for `-D` if THIS state came from a fetch that was attempted and
  // succeeded. `noFetch`'s own report-only run sets `attempted: false`, which fails this the same way.
  const fetchLiveThisRun = Boolean(state.fetch && state.fetch.attempted && state.fetch.ok);
  for (const b of state.safe.branches) {
    if (failedWorktreeBranches.has(b.ref)) {
      log.push({ action: "branch-delete", ref: b.ref, ok: false, error: "skipped: its worktree removal did not report success" });
      continue;
    }
    if (stillCheckedOut.has(b.ref)) {
      log.push({ action: "branch-delete", ref: b.ref, ok: false, error: "still checked out in a worktree" });
      continue;
    }
    if (!fetchLiveThisRun) {
      log.push({ action: "branch-delete", ref: b.ref, ok: false, error: "skipped: no successful fetch this run" });
      continue;
    }
    // J1 round 2 (MAJOR 2): classify() proved `b.sha` an ancestor of origin/<main> when state was
    // gathered. Anything can have happened since (a new local commit, an amend, a reset) in the
    // window between gather and this exact call - re-read the ref's CURRENT tip and re-run the same
    // origin-ancestry proof right before deleting, rather than trusting the name. A mismatch or a
    // fresh "not an ancestor" answer means some of what this branch now holds was never proven, so
    // `-D` (which does not re-check on its own) must not run.
    const tipNow = refSha(root, headRef(b.ref));
    if (!b.sha || tipNow !== b.sha || !isBranchOnOrigin(root, b.ref, state._raw.mainBranch)) {
      log.push({
        action: "branch-delete",
        ref: b.ref,
        ok: false,
        error: `skipped: tip moved since it was proven merged on origin this run (${b.sha ? b.sha.slice(0, 7) : "none"} -> ${tipNow ? tipNow.slice(0, 7) : "gone"})`,
      });
      continue;
    }
    try {
      // b.ref is a short name here, the one shape this file otherwise avoids - `git branch -D`
      // rejects a fully-qualified refname outright ("not found"), so a short name is the only input
      // it accepts. Safe anyway: `branch -D` is scoped to refs/heads by the subcommand itself (a
      // same-named tag cannot shadow it - round-3 review measured this directly), and `--` plus
      // git's own branch-name validation rules out any option-shaped value reaching it as a flag.
      // J1 item 3: `-D` (force), not `-d` - `state.safe.branches` is reachable ONLY through
      // classify()'s origin-ancestry proof (this same run, after the fetch; see the file's top
      // banner), so by the time a ref gets here it is already proven merged on origin. `-d` judges
      // merge state against the CHECKOUT's own HEAD, which is exactly the stale signal this whole
      // fix replaces - it would refuse to delete a branch merged on origin while local main is
      // stale, the original bug. The ancestry check above is the safety; `-D`'s force is redundant
      // with it, never a substitute for it.
      git(["branch", "-D", "--", b.ref], root);
      log.push({ action: "branch-delete", ref: b.ref, ok: true });
    } catch (err) {
      log.push({ action: "branch-delete", ref: b.ref, ok: false, error: String(err.message || err) });
    }
  }

  return log;
}

/**
 * (C1 ruling b, lane-closeout) The one new export this file gains for `work-record.mjs close
 * --closeout`: given a record's `Worktree:` field (a path or a bare branch name), resolves it
 * through `git worktree list --porcelain`, refuses the main worktree and the worktree
 * containing `cwd`, and — when not a dry run — hands a state narrowed to exactly that one
 * worktree (and NO branches) to `applySafe`, so the same unforced `git worktree remove` path is
 * used here as for a routine sweep. `applySafe`'s own `-D` branch-delete path is never reached
 * (`state.safe.branches` is always empty): the local branch is deleted separately below, with
 * `-d`, never `-D` — the caller (close --closeout) has already proven the record's Artifact: is
 * an ancestor of origin/main, but `-d` still re-derives its own merge judgment against THIS
 * checkout's HEAD and simply refuses (never throws, never forces) when it disagrees, which is
 * the right "reported and left in place" behavior for a branch not yet fast-forwarded locally.
 *
 * Never throws for an ordinary refusal: returns `{ steps: [{ step: "worktree"|"branch", ref?,
 * result: "removed"|"refused"|"absent"|"dirty", detail? }] }` so a caller stepping through one
 * record never has to wrap this in try/catch. Dry run performs no git mutation at all — it
 * reports the same verdicts (clean tree => "removed"/"removed", dirty => "dirty"/"refused")
 * that a live run would, computed from `isTreeClean` alone.
 */
export function closeoutWorktree({ root, worktreeField, mainBranch = "main", cwd = process.cwd(), dryRun = false }) {
  if (!worktreeField) {
    return { steps: [{ step: "worktree", result: "refused", detail: "no Worktree: field" }] };
  }
  const worktrees = listWorktrees(root);
  if (worktrees === null) {
    return { steps: [{ step: "worktree", result: "refused", detail: "could not read git worktree state" }] };
  }
  const target = path.isAbsolute(worktreeField) ? worktreeField : path.resolve(root, worktreeField);
  let entry = worktrees.find((w) => samePath(w.path, target));
  if (!entry) entry = worktrees.find((w) => w.branch === worktreeField);
  if (!entry) {
    return { steps: [{ step: "worktree", result: "absent" }, { step: "branch", result: "absent" }] };
  }
  if (entry.main) {
    return { steps: [{ step: "worktree", ref: entry.path, result: "refused", detail: "refuses the main worktree" }] };
  }
  // F7 (C1 round 2, MAJOR): realpath-normalized, win32-case-folded containment. A plain
  // path.resolve comparison of git's forward-slash paths against process.cwd()'s (backslash, on
  // win32) paths never matched on that platform, and nothing at all refused the entry that IS, or
  // CONTAINS, `root` (--repo) itself - closeoutWorktree can be called with `root` set to a linked
  // worktree, whose own `entry.main` is always false, so the main-worktree check above never
  // catches this case.
  const normPath = (p) => {
    let r = path.resolve(p);
    try { r = realpathSync.native(r); } catch { /* unreadable/missing still compares by its resolved form */ }
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  const within = (child, parent) => {
    const rel = path.relative(normPath(parent), normPath(child));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  if (within(cwd, entry.path)) {
    return { steps: [{ step: "worktree", ref: entry.path, result: "refused", detail: "refuses the worktree containing process.cwd()" }] };
  }
  if (within(root, entry.path)) {
    return { steps: [{ step: "worktree", ref: entry.path, result: "refused", detail: "refuses the worktree that is (or contains) --repo" }] };
  }

  const branch = entry.branch;
  const clean = entry.bare ? true : isTreeClean(entry.path);
  const steps = [];

  if (dryRun) {
    steps.push({ step: "worktree", ref: entry.path, result: clean ? "removed" : "dirty" });
    if (branch) {
      steps.push(clean
        ? { step: "branch", ref: branch, result: "removed" }
        : { step: "branch", ref: branch, result: "refused", detail: "worktree removal did not report success" });
    }
    return { steps };
  }

  // F1 (C1 round 2, CRITICAL): the live path must refuse on the same `clean` the dry run above
  // already computed - `isTreeClean`'s own contract counts ignored files exactly because `git
  // worktree remove` deletes them (silently, never asking, never reporting it), so skipping this
  // check here let a live run delete files a dry run of the identical state had just reported
  // `dirty` for.
  if (!clean) {
    steps.push({ step: "worktree", ref: entry.path, result: "dirty", detail: "untracked, modified or ignored files present (git worktree remove would delete ignored files)" });
    if (branch) steps.push({ step: "branch", ref: branch, result: "refused", detail: "worktree left in place (dirty)" });
    return { steps };
  }

  const state = {
    safe: { worktrees: [{ ref: entry.path, branch }], branches: [] },
    judgment: { worktrees: [], branches: [], untrackedFiles: [] },
    fetch: { attempted: true, ok: true },
    _raw: { root, mainBranch },
  };
  const log = applySafe(state, []);
  const wtLog = log.find((l) => l.action === "worktree-remove" && samePath(l.ref, entry.path));
  if (wtLog && wtLog.ok) {
    steps.push({ step: "worktree", ref: entry.path, result: "removed" });
  } else {
    const dirty = Boolean(wtLog && /modified|untracked|locked|contains/i.test(wtLog.error || ""));
    steps.push({ step: "worktree", ref: entry.path, result: dirty ? "dirty" : "refused", detail: wtLog ? wtLog.error : "worktree removal did not run" });
  }
  if (branch) {
    if (wtLog && wtLog.ok) {
      try {
        git(["branch", "-d", "--", branch], root);
        steps.push({ step: "branch", ref: branch, result: "removed" });
      } catch (err) {
        steps.push({ step: "branch", ref: branch, result: "refused", detail: String(err.message || err) });
      }
    } else {
      steps.push({ step: "branch", ref: branch, result: "refused", detail: "worktree removal did not report success" });
    }
  }
  return { steps };
}

// ---------- output ----------

function table(rows, columns) {
  if (rows.length === 0) return "  (none)";
  return rows.map((r) => `  ${columns.map((c) => r[c] ?? "").join("  |  ")}`).join("\n");
}

/**
 * Packet finding (2026-09-26): a Windows sweep's prose said "39 SAFE worktrees" while its own table
 * and JSON listed 43 - a hand-typed count had drifted from the list it was describing. Every count
 * here is a `.length` read directly off the exact arrays `printReport`/the JSON output print, so a
 * summary number can never diverge from its own table again - there is no second, separately
 * maintained counter to drift.
 */
export function summarizeCounts(state) {
  return {
    safeWorktrees: state.safe.worktrees.length,
    safeBranches: state.safe.branches.length,
    judgmentWorktrees: state.judgment.worktrees.length,
    judgmentBranches: state.judgment.branches.length,
    judgmentUntrackedFiles: state.judgment.untrackedFiles.length,
    judgmentRemoteBranches: (state.judgment.remoteBranches || []).length,
    judgmentOverdueWorkarounds: state.judgment.workarounds.filter((w) => w.overdue).length,
  };
}

function printReport(state, wiring, outsideRows) {
  // J1 item 1: a fetch that failed this run is said on the report's own first lines - every merge
  // judgment below is UNVERIFIABLE, and a stale or absent origin ref proved nothing this run.
  if (state.fetch && state.fetch.attempted && !state.fetch.ok) {
    console.log(`FETCH FAILED: git fetch origin --prune did not succeed this run${state.fetch.error ? ` (${state.fetch.error})` : ""}.`);
    console.log("Every merge judgment below is UNVERIFIABLE: nothing merged on origin can be SAFE until a fetch succeeds.");
    console.log("");
  } else if (state.fetch && !state.fetch.attempted) {
    console.log(`--no-fetch: every origin-ancestry verdict below is as of last fetch, ${formatFetchAge(state.fetch.ageHours)}.`);
    console.log("");
  }
  const counts = summarizeCounts(state);
  console.log("SAFE:");
  console.log(`  summary: ${counts.safeWorktrees} worktree(s), ${counts.safeBranches} branch(es)`);
  console.log("  worktrees:");
  console.log(table(state.safe.worktrees, ["ref", "branch", "reason"]));
  console.log("  branches:");
  console.log(table(state.safe.branches, ["ref", "reason"]));
  console.log("");
  console.log("JUDGMENT:");
  console.log(
    `  summary: ${counts.judgmentWorktrees} worktree(s), ${counts.judgmentBranches} branch(es), ${counts.judgmentUntrackedFiles} untracked file(s), ${counts.judgmentRemoteBranches} remote branch(es), ${counts.judgmentOverdueWorkarounds} overdue workaround(s)`,
  );
  console.log("  worktrees:");
  console.log(table(state.judgment.worktrees, ["ref", "branch", "reason"]));
  console.log("  branches:");
  console.log(table(state.judgment.branches, ["ref", "reason"]));
  console.log("  untracked files:");
  console.log(table(state.judgment.untrackedFiles, ["ref", "reason"]));
  console.log("  remote branches (report-only, never applied):");
  console.log(table(state.judgment.remoteBranches || [], ["ref", "reason", "command"]));
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
  if (outsideRows) {
    // J1 item 5: report-only, never a SAFE/JUDGMENT class, never affects the exit code.
    console.log("");
    console.log("OUTSIDE (report-only, never acted on by janitor):");
    console.log(table(outsideRows, ["ref", "reason"]));
  }
}

function hasFindings(state) {
  return (
    state.safe.worktrees.length > 0 ||
    state.safe.branches.length > 0 ||
    state.judgment.worktrees.length > 0 ||
    state.judgment.branches.length > 0 ||
    state.judgment.untrackedFiles.length > 0 ||
    (state.judgment.remoteBranches || []).length > 0 ||
    // T4: only an OVERDUE workaround is a finding; an open one is display-only.
    state.judgment.workarounds.some((w) => w.overdue)
  );
}

// ---------- --record (J1 item 4): drift numbers, fed and kept, not printed and lost ----------

function sanitizeHost(name) {
  const cleaned = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "unknown-host";
}

/** The base sha a --record snapshot is taken against: local mainBranch's own tip when it exists
 * (proven via show-ref, never DWIMed), else whatever HEAD currently resolves to - HEAD is git's one
 * reserved, unshadowable pointer to the current checkout, never a bare/guessable name. */
function baseShaFor(root, mainBranch) {
  const mainSha = refSha(root, headRef(mainBranch));
  if (mainSha) return mainSha;
  try {
    return git(["rev-parse", "HEAD"], root).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Writes `<dir>/<YYYY-MM-DD>-<host>.json` (the four drift numbers, the SAFE/JUDGMENT counts, the
 * base sha, the host) and appends one line to `<dir>/drift.md`. Deterministic apart from `now` and
 * `hostName`, both parameters here rather than read from the live clock/os.hostname() inside this
 * function, so a test can assert exact bytes. `dir` resolves relative to `root` unless already
 * absolute; bare `--record` (no path) resolves to DEFAULT_RECORD_DIR by the caller in main().
 */
export function writeRecord({ root, dir, state, mainBranch, now = new Date(), hostName = os.hostname() }) {
  const host = sanitizeHost(hostName);
  // J1 review round 2 (F7): `toISOString()` is UTC. facts.md fixes Ben's clock as America/New_York,
  // so a run between 20:00 and 24:00 EDT/EST filed under UTC's tomorrow - a drift record dated a day
  // it wasn't taken on. `en-CA` formats as YYYY-MM-DD directly, no reassembly of parts needed.
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
  const targetDir = path.isAbsolute(dir) ? dir : path.join(root, dir);
  mkdirSync(targetDir, { recursive: true });
  const counts = summarizeCounts(state);
  const record = {
    date: dateStr,
    host,
    baseSha: baseShaFor(root, mainBranch),
    drift: state.drift,
    safeCounts: { worktrees: counts.safeWorktrees, branches: counts.safeBranches },
    judgmentCounts: {
      worktrees: counts.judgmentWorktrees,
      branches: counts.judgmentBranches,
      untrackedFiles: counts.judgmentUntrackedFiles,
      remoteBranches: counts.judgmentRemoteBranches,
      overdueWorkarounds: counts.judgmentOverdueWorkarounds,
    },
  };
  const jsonPath = path.join(targetDir, `${dateStr}-${host}.json`);
  writeFileSync(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
  const diskStr = state.drift.diskUsedKB === null ? "unknown" : String(state.drift.diskUsedKB);
  const driftLine = `- ${dateStr} ${host}: worktrees=${state.drift.worktreeCount} branches=${state.drift.openBranchCount} untracked=${state.drift.untrackedFileCount} diskKB=${diskStr}\n`;
  const driftPath = path.join(targetDir, "drift.md");
  appendFileSync(driftPath, driftLine);
  return { jsonPath, driftPath, record };
}

// ---------- --outside (J1 item 5): report-only visibility into ~/.agents, never acted on ----------

function listOutsideEntries(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .map((name) => {
      const p = path.join(dir, name);
      let sizeKB = null;
      let mtimeMs = null;
      try {
        const st = statSync(p);
        mtimeMs = st.mtimeMs;
        // diskUsageKB (F5: was a byte-for-byte copy of this file's own du wrapper) already shells
        // `du -sk` for a directory; a plain file's size is just its stat size.
        sizeKB = st.isDirectory() ? diskUsageKB(p) : Math.ceil(st.size / 1024);
      } catch {
        // unreadable entry: report it with unknown size/date rather than dropping it silently.
      }
      return { name, sizeKB, mtimeMs };
    })
    .sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0));
}

/**
 * J1 item 5: sizes and dates of `<agentsDir>/rollout-backups/*` and `<agentsDir>/ws/*` under
 * JUDGMENT - report-only, never read by classify() or applySafe(), never affects SAFE or the exit
 * code. `agentsDir` defaults to the real `~/.agents` only when this is actually run (main()); tests
 * always pass a fixture directory.
 *
 * J1 review round 2 (F5): "keep the newest two" is the spec's rule for BACKUPS, disposable copies
 * where "older than the two newest" is a reasonable removal signal on its own. A `ws/*` entry may be
 * a live workspace a person is still using - its top-level mtime says nothing about activity inside
 * it (a long-running checkout whose own files changed recently but whose directory entry itself
 * didn't) - so `ws/*` always reads "a person decides", never a removal recommendation. An entry whose
 * stat failed (unreadable, permissions) sorts oldest by the `?? 0` fallback above but must not then
 * read as a confident "recommend: remove" over an unknown date - it gets "a person decides" too.
 */
export function gatherOutside({ agentsDir = path.join(os.homedir(), ".agents") } = {}) {
  const rows = [];
  for (const sub of ["rollout-backups", "ws"]) {
    const entries = listOutsideEntries(path.join(agentsDir, sub));
    entries.forEach((e, i) => {
      const dateStr = e.mtimeMs ? new Date(e.mtimeMs).toISOString().slice(0, 10) : "unknown date";
      const sizeStr = e.sizeKB === null ? "unknown size" : `${e.sizeKB} KB`;
      const canRecommend = sub === "rollout-backups" && e.mtimeMs !== null;
      const rec = !canRecommend ? "a person decides" : i < 2 ? "keep (one of the newest two)" : "recommend: remove (older than the newest two)";
      rows.push({ ref: `~/.agents/${sub}/${e.name}`, reason: `${sizeStr}, ${dateStr} - ${rec}` });
    });
  }
  return rows;
}

// ---------- main ----------

/** All CLI flag parsing in one place. `--record` takes an optional path (defaulting to
 * DEFAULT_RECORD_DIR when bare or immediately followed by another flag); `--min-age-hours` takes a
 * required number (defaulting to DEFAULT_MIN_AGE_HOURS when absent or unparsable). */
function parseFlags(argv) {
  const applyFlag = argv.includes("--apply");
  const jsonFlag = argv.includes("--json");
  const outsideFlag = argv.includes("--outside");
  // J1 item 1: skips this run's `git fetch origin --prune`; every origin-ancestry verdict is then
  // labelled with how old that view actually is instead (see gatherState/lastFetchAgeHours).
  const noFetchFlag = argv.includes("--no-fetch");

  let minAgeHours = DEFAULT_MIN_AGE_HOURS;
  const ageIdx = argv.indexOf("--min-age-hours");
  if (ageIdx !== -1) {
    const n = Number(argv[ageIdx + 1]);
    if (Number.isFinite(n) && n >= 0) minAgeHours = n;
  }

  let record = null;
  const recordIdx = argv.indexOf("--record");
  if (recordIdx !== -1) {
    const next = argv[recordIdx + 1];
    record = next && !next.startsWith("--") ? next : DEFAULT_RECORD_DIR;
  }

  // J1 (janitor-daily-1): a scheduled --record run's os.hostname() is not guaranteed to match the
  // name a fleet knows the host by (containers, renamed machines) - --host overrides writeRecord's
  // hostName so the record's host stays whatever the installer baked in, run to run. Absent, nothing
  // changes: writeRecord still defaults to os.hostname() exactly as before this flag existed.
  let host = null;
  const hostIdx = argv.indexOf("--host");
  if (hostIdx !== -1) {
    const next = argv[hostIdx + 1];
    if (next && !next.startsWith("--")) host = next;
  }

  return { applyFlag, jsonFlag, outsideFlag, minAgeHours, record, noFetchFlag, host };
}

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

    const { applyFlag, jsonFlag, outsideFlag, minAgeHours, record, noFetchFlag, host } = parseFlags(argv);
    if (applyFlag && noFetchFlag) {
      // J1 round 2 (MAJOR 1): `-D` is reached only from the SAFE class after THIS run's own fetch
      // proved the origin ancestry - `--no-fetch` has no such fetch to point to, so it reports as of
      // whatever origin/<main> last held (labelled "as of last fetch, <age>") but never applies.
      process.stderr.write("janitor: --apply needs this run's own fetch; --no-fetch is report-only\n");
      return 3;
    }

    const state = gatherState({ root: toplevel, config, minAgeHours, noFetch: noFetchFlag });
    if (state.__blind) {
      process.stderr.write(`janitor: ${state.reason}\n`);
      return 3;
    }

    if (record) {
      // J1 item 4: fed and measured, not printed and lost. A write failure here is reported but
      // never blinds or fails the rest of the report - --record is additive, not load-bearing.
      try {
        const recordArgs = { root: toplevel, dir: record, state, mainBranch: config.main_branch || "main" };
        if (host) recordArgs.hostName = host;
        writeRecord(recordArgs);
      } catch (err) {
        process.stderr.write(`janitor: --record failed: ${String(err && err.message ? err.message : err)}\n`);
      }
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

    // J1 item 5: report-only, never affects findings or the exit code. F5: gatherOutside() never
    // throws (listOutsideEntries already catches readdir/stat failures per entry), so no wrapping
    // try/catch is needed here.
    const outsideRows = outsideFlag ? gatherOutside() : null;

    if (jsonFlag) {
      console.log(
        JSON.stringify(
          {
            fetch: state.fetch,
            safe: state.safe,
            judgment: state.judgment,
            drift: state.drift,
            summary: summarizeCounts(state),
            wiring,
            outside: outsideRows,
            applied: applyFlag ? applyLog : null,
          },
          null,
          2,
        ),
      );
    } else {
      printReport(state, wiring, outsideRows);
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
        (state.judgment.remoteBranches || []).length > 0 ||
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
