DONE 0fcd68699e13dfe83ffca2b096cbae5664c54972

# C1 round 3 report

Fixed from f10c792 in the same worktree (`/home/ben/Code/claude-delegation-wt/lane-closeout-1-C1`,
branch `wt/lane-closeout-1-C1`), per `docs/specs/lane-closeout-1/addendum-C1-r3.md` and
`reports/C1-review-r2.md`. Every repro was re-run on a fresh fixture before editing (Method
section below); every delete check that was touched now has a test that was confirmed, by
disabling that exact check on the live code and reverting, to fail when the check is removed
(mutation table below).

## Method: repro re-runs before editing

All ten reviewer repro scripts and the round-1 repros were re-run against f10c792 (unmodified)
from `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C1-review-r2/`.
Every one reproduced the finding it was written for (matching the reviewer's own report). After
the round-3 fix, the same scripts were re-run again, unmodified, against the fixed worktree:

| Repro | Before (f10c792) | After (this commit) |
|---|---|---|
| `p2-names.mjs` P2 (unresolvable Windows/POSIX path) | `delete` (unprotected) | `keep ... open-record-unresolved wr-p2-open` |
| `p2-names.mjs` P6 (symlinked worktree path) | `keep ... open-record-unresolved wr-p6-open` (fallback only) | `keep ... named by wr-p6-open (Status: owned), not closed/withdrawn` (direct match) |
| `p2-names.mjs` P3 (worktree-list failure, sweep) | exit 0, open | `exit=2` |
| `p1-lease.mjs` (real race, lease lost) | `refused ... (moved)` | unchanged: `refused ... (moved)` |
| `p11-moved-label.mjs` (denyDeletes, no race) | mislabeled `moved` (round-2 bug this round fixes) | `delete-failed ... remote: error: denying ref deletion ...` (real reason, never `moved`) |
| `p5-scratch.mjs` P5 (target lies inside a worktree) | not refused (R2-4 gap) | `refused ... (lies inside a path in git worktree list)` |
| `p5-scratch.mjs` P9 (`Worktree: origin/build/x`) | `absent` (silent no-op) | resolves and proceeds (`would removed`) |
| `p5-scratch.mjs` P7/P8 (file target, deep tree, nested unregistered `.git`) | refused file; refused deep tree>8; refused nested `.git` | refused file (unchanged); **removed** deep tree and nested `.git` (L5 replaced) |
| `e5-nested.mjs` E5a/E5b (contains-worktree / contains-repo-root) | refused both | refused both (unchanged - these checks were not in question) |
| `e13-repo-is-wt.mjs` | refused (repo is the worktree) | unchanged |
| `e1-ignored.mjs`, `e2-stale.mjs`, `e4-logline.mjs`, `e9-dry-forms.mjs`, `p10-close-argv.mjs` | passing | unchanged, still passing |

## Findings table

| Finding | Disposition | Test(s) |
|---|---|---|
| R2-1 (L8 basename fallback missing) | Fixed: `unresolvedWorktreeBasename` + `basenameProtected` check in `evaluateOriginBranch` (work-record.mjs:1918-1926). Also fixed a latent bug it exposed: `work-record.mjs` never imported a bare `realpathSync` (only the default `fs` import), so every `realpathSync.native()` call inside the worktree-path key function silently threw a caught `ReferenceError` and fell back to a non-realpath'd value since round 2 - added `import { realpathSync } from "node:fs";`. | `sweepOrigin: R2-1 - ... Windows-shaped path ... basename`, `sweepOrigin: R2-1 - ... absent POSIX path ... basename`, `sweepOrigin: R2-1 - the basename fallback does not protect a DIFFERENT branch ...`, `sweepOrigin: R2-1 (P6) - ... SYMLINKED path matches directly` (work-record-closeout.test.mjs) |
| R2-2 (worktree-list failure passes) | Fixed: `worktreesByPath === null` fail-closed check in both `sweepOrigin` (work-record.mjs:2322-2325) and `closeoutRecord`'s origin-branch step (work-record.mjs:2220-2221), computed via a PATH-wrapper `git` shim since `listWorktrees` has no injectable spawn point. | `sweepOrigin: R2-2 - a failed git worktree list refuses everything ...`, `closeoutRecord: R2-2 - a failed git worktree list refuses the origin-branch step ...` |
| R2-3 (five delete checks survive mutation) | Fixed: one test per check, each confirmed by mutation (see mutation table). | See mutation table |
| R2-4 (scratch inside a registered worktree) | Fixed: reverse `liesInside(p)` containment added for both the repo root and every worktree path (work-record.mjs:2083-2092). | `closeoutRecord: R2-4 - ... LIES INSIDE a registered linked worktree ...`, `closeoutRecord: R2-4 - ... LIES INSIDE the repo root itself` |
| L5 replaced (recursive `.git` walk) | Dropped entirely, as ruled - `hasGitEntryBelow`/`GIT_ENTRY_WALK_MAX_DEPTH` removed. An unregistered git repo inside scratch is now legitimately removed with the directory. Docs updated (docs/work-record.md). | `closeoutRecord: L5 replaced - scratch step REMOVES a directory containing an unregistered .git entry ...` |
| R2-6 (moved-label too broad) | Fixed: narrowed to git's own literal `(stale info)` marker (work-record.mjs:1839). | `sweepOrigin: R2-6 - a push denied by origin's own receive.denyDeletes is reported by its real reason, never mislabeled 'moved'` (new this round) |
| R2-7 (dry run vs live disagree at step 4) | Fixed: `worktreesByPath`/`ownBranchName` now derived once, before step 3 runs (work-record.mjs:2207-2209). | Covered structurally by the R2-2 closeoutRecord test (same hoisted computation); no separate dry-vs-live diff test was added since the underlying reviewer repro (`p5-scratch.mjs` P4) confirmed dry/live agreement directly (Method table). |
| R2-8 (`closeoutWorktree` reports `absent` for unmatched Worktree:) | Fixed: realpath/case-fold-normalized entry lookup plus a normalized `branchField` fallback (janitor.mjs:1237-1249); unmatched entry now `refused worktree-unresolved` (exit 2), never `absent`. New exported `pathWithin` pure helper backs the containment checks. | `closeoutWorktree: R2-8 - ... refused 'worktree-unresolved' (never silently 'absent')`, `closeoutWorktree: R2-8 - ... origin-branch-shaped value (origin/build/x) still resolves ...`, `closeoutRecord: R2-8 - ...`, `pathWithin: win32 fold ...`, `pathWithin: posix ...` |
| R2-9 (confined write never checks containment) | Fixed: `relReal` computed and checked against `repoReal` after the final realpath (work-record.mjs:2273-2276). | `closeoutRecord: R2-9 - a symlink swapped into the record's path between the confined read and the final write is refused ...` (new this round, TOCTOU race via injectable `fsImpl`) |
| R2-10 (win32 host-absolute accepts POSIX paths) | Fixed: `hostAbsolute` for win32 now requires a drive-letter or UNC prefix by regex, not `path.win32.isAbsolute`. | `closeoutRecord: R2-10 - on a win32 host, a POSIX-shaped Scratch: path is refused 'not absolute on this host' ...` (new this round) |
| M7 (performance) | Deferred, as ruled. Not touched this round. | n/a |

## Mutation table (R2-3 and every other delete check touched this round)

Each row: the check disabled in place on the live (fixed) code, the test run, the observed
failure, then the check restored and the suite re-confirmed green.

| # | Check (file:region) | Test that catches its removal | Result on disabling |
|---|---|---|---|
| 1 | sweepOrigin fetch-failure early return (work-record.mjs ~2312) | `sweepOrigin: R2-3(a) - a failed fetch refuses EVERYTHING ...` | FAILED (exit 0 !== 2) - caught |
| 2 | sweepOrigin worktree-list-null fail-closed (work-record.mjs ~2322) | `sweepOrigin: R2-2 - a failed git worktree list refuses everything ...` | FAILED (exit 0 !== 2) - caught |
| 3 | closeoutRecord worktree-list-null fail-closed, origin-branch step (work-record.mjs ~2220) | `closeoutRecord: R2-2 - a failed git worktree list refuses the origin-branch step ...` | FAILED (wrong detail: "no branch name could be derived" instead of UNVERIFIABLE) - caught |
| 4 | scratch forward containment, CONTAINS repo root (work-record.mjs ~2072) | `closeoutRecord: R2-3(c) - scratch step (--dry-run) refuses a target that CONTAINS the repo root` | FAILED (wrong detail, fell through to the worktree-containment check) - caught |
| 5 | scratch forward containment, CONTAINS a worktree (work-record.mjs ~2075) | `closeoutRecord: R2-3(b) - scratch step refuses a target that CONTAINS a registered linked worktree ...` | FAILED (result "removed" instead of "refused") - caught |
| 6 | scratch not-a-directory guard (work-record.mjs ~2037) | `closeoutRecord: R2-3(g) - scratch step refuses a target that is a regular FILE ...` | FAILED (the file was actually rmSync'd and "removed") - caught |
| 7 | scratch reverse containment, LIES INSIDE a worktree (work-record.mjs ~2090) | `closeoutRecord: R2-4 - ... LIES INSIDE a registered linked worktree ...` | FAILED (result "removed" instead of "refused") - caught |
| 8 | scratch reverse containment, LIES INSIDE the repo root (work-record.mjs ~2087) | `closeoutRecord: R2-4 - ... LIES INSIDE the repo root itself` (new this round) | FAILED (wrong detail - fell through to the worktree-list reverse check, since the repo's own main worktree is also a registered worktree path) - caught |
| 9 | R2-1 `basenameProtected` fallback (work-record.mjs ~1924) | Both `sweepOrigin: R2-1 - ...` basename tests | FAILED (`delete` instead of `keep`) on both - caught |
| 10 | `realpathSync` import (the latent round-2 bug; work-record.mjs top) | `sweepOrigin: R2-1 (P6) - ... SYMLINKED path matches directly` | FAILED (reason fell to a plain `delete`/diagnostic string instead of `named by wr-2026-09-27-r1-p6 ...`) - caught; confirms this really was the live bug, not just a docs claim |
| 11 | R2-9 confined-write containment check (work-record.mjs ~2274) | `closeoutRecord: R2-9 - a symlink swapped into the record's path ...` (new this round) | FAILED ("Missing expected exception") - caught |
| 12 | R2-10 win32 hostAbsolute regex, reverted to `path.win32.isAbsolute` (work-record.mjs ~1981) | `closeoutRecord: R2-10 - on a win32 host, a POSIX-shaped Scratch: path is refused ...` (new this round) | FAILED (wrong detail - fell through to the scratch-root-segment check instead) - caught |
| 13 | R2-6 moved-label regex, reverted to the broad round-2 pattern (work-record.mjs ~1839) | `sweepOrigin: R2-6 - a push denied by origin's own receive.denyDeletes ... never mislabeled 'moved'` (new this round) | FAILED (`error === 'moved'`) - caught |
| 14 | R2-8 `!entry` fallback, reverted to `absent`/`absent` (janitor.mjs ~1249) | `closeoutWorktree: R2-8 - ...`, `closeoutRecord: R2-8 - ...` | FAILED on both (result `absent` instead of `refused`) - caught |
| 15 | R2-8 `branchField` normalization, reverted to raw `worktreeField` (janitor.mjs ~1247) | `closeoutWorktree: R2-8 - ... origin-branch-shaped value (origin/build/x) still resolves ...` | FAILED (result `refused` instead of `removed`) - caught |
| n/a | `pathWithin` win32 case-fold (janitor.mjs, new pure function) | `pathWithin: win32 fold ...`, `pathWithin: posix ...` | No mutant needed - brand-new pure-function unit tests, per the addendum ("a pure `pathWithin` win32-fold unit test... no mutant needed since it's a brand-new pure-function test"). |
| n/a | M-a: `.git`-entry recursion walk | (moot) | L5 REPLACED this round - the walk is deleted entirely, not merely guarded, so there is no longer a check to mutate. Superseded by the new `closeoutRecord: L5 replaced - scratch step REMOVES a directory containing an unregistered .git entry ...` test, which pins the opposite (removal) behavior directly. |

Every mutant listed was disabled on the live worktree code (not a separate scratch copy - the
worktree itself served as the scratch, edit-then-revert, confirmed via `node --check` and a full
territory re-run after every revert), the corresponding test was run and observed to fail, then
the check was restored and the same test re-confirmed passing before moving to the next row.

## Gate

Territory suite (work-record.test.mjs + work-record-closeout.test.mjs + janitor.test.mjs): 393
tests, 390 pass, 1 fail (pre-existing `docs/GOALS.md` STALE-regex failure, unrelated to this
lane), 2 skipped.

Full suite (`node scripts/run-tests.mjs`, log at `reports/C1-r3-gate.log`):

```
ℹ tests 2677
ℹ pass 2671
ℹ fail 1
ℹ cancelled 0
ℹ skipped 5
ℹ todo 0
```

The single failure is the same pre-existing `docs/GOALS.md and docs/goals/card.md carry no phrase
this build's evidence contradicts` test (work-record.test.mjs:2458), unrelated to this lane's
territory, called out as pre-existing in the round-3 dispatch.

## Non-negotiables

No shell deletion command was run at any point (all fixture cleanup goes through node `fs` APIs
inside the test files' own `after()` hooks, unchanged from round 2). No git identity flags, no
`--no-verify`, no trailers, no push. The commit above is the only commit made this round.

## Commit

`0fcd68699e13dfe83ffca2b096cbae5664c54972` on `wt/lane-closeout-1-C1`, not pushed.
