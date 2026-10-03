VERDICT: NEEDS_FIXES (1) 9126120c9ae3099a7776b81ef0e3906cac5fd167

# janitor74 review, round 3 (delta re-review)

NEEDS_FIXES

Territory: janitor74. Worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-janitor-cleanup-74-janitor74. HEAD is 9126120c9ae3099a7776b81ef0e3906cac5fd167, from my own `git rev-parse HEAD`. I read `git diff 171bb68e..HEAD`: one commit, 2 files (scripts/janitor-sweep.mjs and scripts/janitor-sweep.test.mjs), +62/-9. `git status --short` is empty before and after my checks.

Counts: 0 BLOCKER, 1 MAJOR, 0 MINOR. The one MAJOR is MAJOR B, carried over. It is a scope problem the builder cannot fix inside this territory. Both round-2 code findings are fixed and verified, and I found no regression.

## Gate re-run (mine)
- I ran the brief's Gate list plus scripts/janitor-sweep.test.mjs and scripts/janitor-timer-refresh.test.mjs. The log went to my session scratchpad (`.../scratchpad/j74r3/gate.log`), not to the repo.
- Result: exit 0, `tests 460, pass 398, fail 0, skipped 62`. This matches the builder's r3 gate log.
- No hook file changed, and install-janitor-timer.mjs did not change, so the timer units are still byte-stable.

## Mutation check (on a scratch copy, outside the reviewed tree)
- I made the scratch copy with `git archive HEAD | tar -x` into `.../scratchpad/j74r3/copy`.
- I put the 171bb68e version of scripts/janitor-sweep.mjs into the copy and kept the new tests. Both new tests then fail:
  - `NEW MAJOR A`: `AssertionError: the probe renames on win32; it runs only where a class acts`
  - `MINOR C`: `Expected values to be strictly equal`
- With the HEAD version put back, both pass (`pass 2, fail 0`).
- So both tests tell the old code from the new; neither passes just because it is not looking.

## Prior findings, one by one
- **NEW MAJOR A (report mode renamed directories on win32): FIXED, verified.**
  - In sweepWorktrees, `pathHasOpenProcess` now runs at scripts/janitor-sweep.mjs:158, after the `!ctx.acts(CLASS_IDS.dirtyWorktree)` return at :153.
  - In sweepDeregistered it runs at :296, after the `!ctx.acts(CLASS_IDS.deregistered)` return at :291.
  - The fix goes beyond what I asked for: the BTO-remote check now comes before the probe in both functions (:148 and :286), so a BTO-remote directory is never renamed, even in acting mode.
  - `grep pathHasOpenProcess|winRenameBusyProbe|sweepPathInUse` finds no other probe call in the sweep. The only other non-test call is applySafe's, at scripts/janitor.mjs:1557, which is still inside its act branch.
  - The test at janitor-sweep.test.mjs:664 covers three modes: `apply:false`, `apply:true, act:[]`, and `apply:true` with an unrelated class. In each, the probe is called 0 times and the rows say would-archive-then-remove and would-archive.
  - The existing acting-mode tests still reach the probe: the probe-throws, busy, deregistered-gate and real-process main() tests all pass in my gate run.
  - Order change in acting mode, checked for regressions: a dirty worktree that holds ignored content and is in use now gets the "ignored content" keep row instead of the "process holds" keep row. Both rows are keep, and nothing acts either way.
- **MAJOR B (item 6 not wired): NOT FIXED. Carried below.** The builder was right not to touch files outside the territory.
- **MINOR C (archived worktree whose removal was refused dropped out of every report): FIXED, verified.**
  - scripts/janitor-sweep.mjs:130-135 now keeps reporting a clean, detached, non-main worktree whose HEAD is the tip of a local `archive/*` branch, as `report-only` with "archived; removal refused earlier, needs a hand".
  - That state is exactly what a failed removal leaves behind. On success, archiveCheckout (scripts/janitor-archive.mjs:115-128) leaves HEAD detached at `sha` with `archive/<name>-<sha7>` pointing at `sha`. Then archiveThenRemoveWorktree:138 returns failed without moving HEAD.
  - The worktree parser sets `branch: null` when HEAD is detached (scripts/janitor.mjs:320), so `!wt.branch` matches.
  - The existing SAFE classifier skips detached worktrees (scripts/janitor.mjs:740), so this row is the only place such a worktree shows up. It is not a duplicate.
  - `headSha` runs only for detached clean worktrees, because the `&&` short-circuits.
  - The test at :679 checks three things: the row appears, nothing acts, and the row goes away once the archive branch is deleted.
  - The deregistered twin was already covered: once a deregistered folder has been archived, it is clean, and :278 keeps listing it as report-only "removal needs a hand".
- **MINOR D (process): no repeat this round.**
  - The builder reports no guard block in this round and no temp files left behind.
  - I saw no stray file in the worktree, and `git status` is empty.
  - This was the orchestrator's ruling to make. It is not counted.

## MAJOR B (carried from round 1 MAJOR 6 and round 2): spec item 6 is still not delivered, because nothing calls `refreshIfRegistered()`
Evidence:
- `grep -rln "janitor-timer-refresh|refreshIfRegistered"` across *.mjs, *.json and *.md in the worktree finds only scripts/janitor-timer-refresh.mjs and its own test.
- No hook file and no installer entry point changed.

Fix (the orchestrator's call, not the builder's): either widen janitor74 to scripts/wiring-check.mjs and scripts/wiring-check.test.mjs, or hand the wiring to whoever owns those files.
- The change: call `refreshIfRegistered()` from wiring-check's `--hook` SessionStart path, after that path's own output, inside a try/catch so it fails open.
- The test: the hook entry calls it with an injected `install`, so no real scheduler is ever called.
- If hooks/hooks.json changes as part of this, add the six hook-reading tests to the gate.

Predicted outcome: item 6 becomes claimable, and the existing refresh tests stay green.

Until then, item 6 is "script ready, not wired". On the code alone, this territory would be APPROVE; the single MAJOR is the missing wiring.

## Rulings still open for the orchestrator (not counted as findings, unchanged from round 2)
- **Exit code:** a `--apply` run returns 1 when a sweep row is failed or stopped (`sweepFailed`, scripts/janitor.mjs:2403-2404). It is never 2. Keep it or revert it.
- **Narrow fetch refspec:** `unpushed-archive` reads the remote-tracking ref, so a clone with a narrow fetch refspec reports every pushed archive as unpushed. The row is report-only.

## Attack-brief answers (delta)
- **Work lost:** no new path removes or discards anything. The MINOR C row is report-only.
- **Report mode:** with no policy file, with `act: []`, or with an unrelated class, the sweep no longer calls the rename probe (proven by the test plus the mutation check). Output with no `--sweep` and no policy is unchanged (the main() wiring tests pass).
- **Ownership:** no change in this round.
- **Roots and exclusions:** a BTO-remote directory is now never probed.
- **Push scope:** no change.
- **Item 5:** no change.
- **Item 6:** not wired (MAJOR B).
- **Items 7 and 8:** the policy gate is still tested both ways. The new tests go through the real gate, and the mutation check shows they would catch a regression.

## Cause / fix fields (MAJOR B, carried)
Cause: the item-6 refresh logic was built as a standalone script, but its only valid trigger (the SessionStart hook in scripts/wiring-check.mjs) is outside the files this territory's brief names.
Discriminating check: `grep -rln refreshIfRegistered` over the worktree finds only the script and its own test. Once the wiring lands, wiring-check.mjs and its test appear there too.
Fix location: scripts/wiring-check.mjs, in the `--hook` SessionStart path, plus scripts/wiring-check.test.mjs. Both need a scope change from the orchestrator.
Simplification: a single fail-open try/catch call after the hook's existing output, with no new hook entry. That keeps hooks.json unchanged and the six hook-reading tests untouched.
