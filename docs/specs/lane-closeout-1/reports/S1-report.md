DONE cfa1fc0

# S1: seam fix after merging main (lead) - report

## What changed

`scripts/work-record.mjs` - added `env: withoutRepoLocatingGitEnv(process.env)` (the exact
form used at line 425/665, per main's 7248ba5) to every `execImpl`/`spawnImpl("git", ...)`
call in the closeout and sweep-origin region the addendum named (about lines 1830-2360),
so an inherited `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR` can never redirect one of these
calls at a different repo. 13 call sites, all newly wrapped:

- 1835 `deleteOriginBranchWithLease` - `push --force-with-lease=...:<tip> origin :<ref>` (the origin delete)
- 1852 `resolveRefSha` - `show-ref --verify <ref>`
- 1863 `tipBehindMergeCommit` - `rev-list --first-parent --merges <mainRef>`
- 1867 `tipBehindMergeCommit` - `rev-parse <m>^2`
- 1870 `tipBehindMergeCommit` - `rev-parse <m>^1`
- 1873 `tipBehindMergeCommit` - `merge-base --is-ancestor <tip> <p2sha>`
- 1875 `tipBehindMergeCommit` - `merge-base --is-ancestor <tip> <p1sha>`
- 1936 `evaluateOriginBranch` - `merge-base --is-ancestor <tip> <mainRef>`
- 2182 `closeoutRecord` step 2 - `fetch --prune origin`
- 2195 `closeoutRecord` step 2 - `merge-base --is-ancestor <artifactSha> <mainRef>`
- 2243 `closeoutRecord` step 4 - `ls-remote --exit-code --heads origin refs/heads/<branchName>`
- 2339 `sweepOrigin` - `fetch --prune origin`
- 2354 `sweepOrigin` - `for-each-ref refs/remotes/origin/build --format=%(refname)`

## Whole-file grep, every remaining git call site

`grep -n 'execImpl("git"\|spawnImpl("git"'` finds 19 total call sites. The 6 outside the
1830-2360 region were already wrapped before this round (confirmed via a per-site
multi-line check, not just the single grep line, since several of these split the options
object across lines and the `env:` key sits a few lines below the match):

- 423 (`checkAcceptance` scope-drift check) - already wrapped, main's 7248ba5 form, line 425
- 864 (`resolveCommit`) - already wrapped, `env:` on line 867
- 1289 (`checkAcceptance` worktree-HEAD resolve) - already wrapped, `env:` on line 1292
- 1318 (`checkAcceptance` pinned-mode ancestry) - already wrapped, `env:` on line 1321
- 1678 (`isRemoteBranchMergedIntoOrigin`) - already wrapped inline
- 1684 (`isRemoteBranchMergedIntoOrigin`) - already wrapped inline

No call site in the file is left unwrapped. `janitor.mjs` confirmed fine per the addendum:
its own `git()` helper (line 165-166) always passes `env: withoutRepoLocatingGitEnv(process.env)`,
and its one other git spawn (the push at line ~201) merges the same wrapper in.

## Test

Added one test to `scripts/work-record-closeout.test.mjs`, modeled on
`work-record.test.mjs`'s "checkAcceptance resolves against repoRoot, not an inherited
GIT_DIR pointed at another repo": "sweepOrigin and closeoutRecord never let an inherited
GIT_DIR redirect their git calls at a different repo".

- Two wholly separate fixture repos, A and B, each with its own local bare origin
  (`fixtureEnv()`/`buildRepo()`, this file's existing machinery).
- Repo A gets two `build/`-prefixed branches merged `--no-ff` into `main` and pushed: one
  left for `sweepOrigin --apply` to find and delete, one given a worktree plus a
  `Status: closed` record for `closeoutRecord` to close out (its own origin-branch step).
- Repo B gets one never-merged `build/`-prefixed branch, pushed to its own bare origin.
  `git for-each-ref` against B's bare origin is captured before the mutation.
- With `process.env.GIT_DIR` set to `path.join(repoB, ".git")`, runs `sweepOrigin({
  repoRoot: repoA, apply: true, exclude: closeBranch })` then `closeoutRecord({ repoRoot:
  repoA, recordPath, closeoutBy: by })` live, restoring `GIT_DIR` in a `finally` exactly as
  the modeled test does.
- Asserts: A's swept branch is gone from A's own origin (`ls-remote`), A's closeoutRecord
  branch step reports `removed` with the right tip and is gone from A's origin, its
  worktree directory no longer exists, and B's bare origin's `for-each-ref` output is
  byte-identical before and after (proof nothing reached B, not just that A's own effect
  looked right).

Passes: 68/68 in `work-record-closeout.test.mjs` (see below).

## Mutation proof

`git archive --format=tar -o head.tar HEAD` (after committing cfa1fc0) into
`/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/S1-mut/head.tar`,
untarred as a separate command into `.../S1-mut/extract/`. Removed only the
` env: withoutRepoLocatingGitEnv(process.env)` fragment from the
`deleteOriginBranchWithLease` push call (line 1835) in the extract's copy of
`scripts/work-record.mjs` (Edit tool, exact string match, nothing else touched).

Ran `node scripts/run-tests.mjs scripts/work-record-closeout.test.mjs` inside the extract:
67 pass, 1 fail - exactly the new test, on the assertion that `sweepOrigin` deleted the
swept branch on A's own origin. With `GIT_DIR` pointed at repo B and the wrapper removed,
`deleteOriginBranchWithLease`'s `execImpl("git", ["push", ...])` inherits the leaked
`GIT_DIR` and acts against repo B instead of repo A, so A's branch is never actually
deleted - the mutant is killed by the intended mechanism, not by an unrelated assertion.
The repo's real (unmutated) `scripts/work-record.mjs` was never touched by this step; only
the throwaway tar extract was edited.

## Gate

Both runs used `timeout`, run one at a time, on this worktree
(`/home/ben/Code/claude-delegation-wt/lane-closeout-1`) at `cfa1fc0`. Full log:
`reports/S1-gate.log`.

- **Territory** (`timeout 300 node --test --test-reporter=tap scripts/work-record.test.mjs
  scripts/work-record-closeout.test.mjs scripts/janitor.test.mjs
  scripts/record-closed-and-skip.contract.test.mjs`): **414 tests, 412 pass, 0 fail, 2
  skipped.** +2 tests / +2 pass over C1 round 6's 412/409, matching the one new S1 test
  (closeout suite alone: 68/68, +1 over round 6's 67).
- **Full gate** (`timeout 900 node scripts/run-tests.mjs`): **2907 tests, 2902 pass, 0
  fail, 5 skipped.**

### GOALS.md STALE failure

The addendum flagged this as pre-existing and asked me to check it after the main merge.
At C1 round 6 (`docs/specs/lane-closeout-1/reports/C1-r6-report.md`), both the territory
and full-gate runs showed exactly one failure:
`scripts/work-record.test.mjs:2458` - "docs/GOALS.md and docs/goals/card.md carry no
phrase this build's evidence contradicts (STALE regexes, doesNotMatch)", on the assertion
`the unsourced 152-turn baseline must be marked as such`.

After the merge of origin/main (f7df941) into build/lane-closeout-1 as 103e636, this test
now **passes** - both gate runs above show 0 fail. `docs/GOALS.md` was itself among the
files main's merge brought in (it already carries the sourced form the test expects, per
this session's own `docs/GOALS.md` header: "as of 2026-09-25 18:30 NYC"). No code change
in this round touched `docs/GOALS.md`, `docs/goals/card.md`, or the STALE-check test
itself; the fix was already present on main before this seam round started.

## Deviations / assumptions

None. Changed nothing outside `scripts/work-record.mjs` (the 13 wrapper additions),
`scripts/work-record-closeout.test.mjs` (the one new test), and this round's report/gate
log/state files.

## GOAL line

Serves "Rework after acceptance" (fewer fix commits/review rounds on a shipped territory,
no recurring failure class): main's 7248ba5 already fixed this GIT_DIR-leak class once
project-wide; this round closes the one place lane 36's own new code reintroduced it,
before merge to main, rather than after. Nearest NOT: "not a fix aimed at a symptom" -
the fix is the same wrapper the rest of the codebase already standardizes on, applied at
every call site named by the addendum's grep, not a narrower patch to just the one call
site the merge diff happened to flag.
