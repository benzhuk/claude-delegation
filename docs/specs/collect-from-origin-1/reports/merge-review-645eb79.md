VERDICT: APPROVE 645eb79d39df7c35525e2c5b92bdaff20eb6352c

# Merge delta review: 8de9e42..645eb79 (collect-from-origin Windows path-separator fix)

Worktree: /home/ben/Code/wt-collect-1, branch build/collect-from-origin-1.
`git rev-parse HEAD` = 645eb79d39df7c35525e2c5b92bdaff20eb6352c, which is the expected sha, so I reviewed it.
Merge parents: 5da8fb9 (docs, first parent) and 5e67b85 (C1 round 5, APPROVE in C1-review-r5.md).

Result: no defects found. There are 0 findings of any severity. Each of the four checks below was verified independently.

## (1) The merge brings in exactly the reviewed C1 change and no other code: VERIFIED
- `git diff --name-only 8de9e42 645eb79 | grep -v '^docs/'` prints a single path, `scripts/collect-from-origin.test.mjs`.
- `git diff 8de9e42 645eb79 -- scripts skills hooks` touches only that file (+25/-1). `scripts/collect-from-origin.mjs` and `scripts/work-record.mjs` have no diff.
- The merge's hunks for the test file are byte-identical to `git show 5e67b85 -- scripts/collect-from-origin.test.mjs`. I checked this with `diff` on the two hunk bodies, and it printed "IDENTICAL-HUNKS".
- On its own tree, 5e67b85 differs from 8de9e42 in skills/decisions and skills/team-build. That is only because the fork point of 5e67b85 comes before those docs landed on the integration branch. The merge result carries none of those differences, so the skill files at 645eb79 are the same as at 8de9e42.
- The other four commits in the range (33aa023, 5814066, 5da8fb9, and the merge's docs side) touch only docs/.

## (2) recordPath is forward-slash on every OS, and the fix was made in the right place: VERIFIED
- The defect was in the test. The code's recordPath is the unmodified output of `git diff --name-only` (scripts/collect-from-origin.mjs:75-84, split on "\n"), passed straight to `recordPath: filePath` (scripts/collect-from-origin.mjs:133). Git always prints `/`. No `path.join`, `path.sep` or `path.normalize` sits on that route. The only `path.` use in the file is line 176, for isMainModule.
- The fix is in `writeRecord`, scripts/collect-from-origin.test.mjs:48, which now uses `path.posix.join("docs", "work", filename)`. Every expected recordPath in the suite comes from this helper: p1/p2 (:295-296), sharedPath (:349), shared (:437) and rec (:460). No hardcoded backslash literal remains.
- A side benefit: line 452, `rows.find((r) => r.recordPath === shared) === undefined`, passed vacuously on Windows before the fix. It is now a real check.
- The new pin test is at scripts/collect-from-origin.test.mjs:514-530. It asserts the literal `"docs/work/..."` and no backslash in `changedRecordPaths` output. It asserts the same for the full-row `recordPath`, including equality to the helper's return value.
- I ran mutation checks on a scratch copy (git archive of 645eb79/scripts into the session scratchpad; the reviewed tree was not touched). After each mutation I restored the copy and got 22/22 again.
  - M1: code-side backslash. I changed `recordPath: filePath` to `filePath.replaceAll("/", "\\")`. 5 tests failed, including the new pin test.
  - M3: code-side backslash in `changedRecordPaths` (`.replaceAll("/", "\\")` after trim). 6 tests failed, including the new pin test and the changedRecordPaths unit test.
  - M2: Windows simulation. I changed the helper to `path.win32.join`, which is what `path.join` produces on Windows. 6 tests failed. Five of them are exactly the five named in C1-windows-findings.md, and the sixth is the new pin test. This reproduces the reported Windows failure on Linux and shows the fix removes it.
- Informational, not a finding: if a future code change built recordPath with `path.join`, the Linux run could not catch it, because path.sep is `/` there. The pin test would catch it on Windows. This is inherent to the platform and needs no change.

## (3) The merged/unmerged classification is unchanged: VERIFIED
- The collector code is byte-identical between 8de9e42 and 645eb79. computeMerged (:106-109), computeState (:111-114), extractArtifactSha, objectExists, isAncestor and the fully-merged skip (:159) are all unchanged.
- The classification tests' assertions are unchanged. The only test-side edits are the helper's return expression and the one added test.
- The spec attack test ("attack: tip equals main and Artifact: is missing never reads as merged, even with a later-Status record on main for the same path") passes. So do the bare-remote five-state fixture, the one-row-per-record test (R1) and the orphan-branch no-merge-base test.
- Missing artifact sha still means `merged: null` and state `accepted-unmerged` (:107, :112). Record-on-main with a later Status is still read from the branch ref via `blobAt(repo, branchInfo.ref, ...)` (:130), not from main.

## (4) Test suite in the worktree: GREEN
`node --test scripts/collect-from-origin.test.mjs` in /home/ben/Code/wt-collect-1: 22 tests, 22 pass, 0 fail, 0 cancelled, 0 skipped.

## Observation (not a code finding, no action required for this verdict)
The worktree has uncommitted docs changes that were not made by this review:
- modified: docs/work/wr-2026-09-26-collect-from-origin.record.md, four evidence files, C1-gate.log, C1-state.md
- untracked: C1-report-r5.md, C1-review-r5.md, integrate-win.md, integrate-win-gate.log, evidence/...-C1-r5.md

None of these are under scripts/, skills/ or hooks/, so they do not affect the reviewed code at 645eb79. The orchestrator should commit or account for them before re-acceptance, so that the accepted sha carries the round-5 evidence it cites.

## Bug-fix fields
Cause: the test helper `writeRecord` returned `path.join("docs","work",f)`, which uses path.sep and so gives `docs\work\...` on Windows. It was compared against the collector's recordPath, which comes straight from `git diff --name-only` and is always `/`.
Discriminating check: in a scratch copy, replace the helper's join with `path.win32.join`. The exact five tests from C1-windows-findings.md fail, plus the new pin test. With `path.posix.join` all 22 pass, and a backslash injected into the code's recordPath (M1/M3) fails the pin test.
Fix location: scripts/collect-from-origin.test.mjs:48 (the helper), plus the new pin test at scripts/collect-from-origin.test.mjs:514-530. scripts/collect-from-origin.mjs needs no change and has none.
Simplification: none needed. The fix is one expression plus one 17-line test, and the code path already passes git's string through unchanged.
