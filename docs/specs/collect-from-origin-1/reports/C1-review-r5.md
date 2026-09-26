VERDICT: APPROVE 5e67b85605e8a946f8609980326e268e983d925a

# C1 review, round 5 (delta): Windows path-separator fix (skills-fable findings)

Scope: commit range 4843ef78219efaf716a3cbffc52e128053a6d71c..HEAD in
/home/ben/Code/wt-collect-from-origin-1-C1. HEAD, from `git rev-parse HEAD`:
5e67b85605e8a946f8609980326e268e983d925a. The range holds one commit.
File name note: the harness called this "round 2". C1-review-r2.md already exists and
holds real evidence, so I wrote this report as -r5 to match C1-report-r5.md and did not
overwrite anything.

## What changed (measured)
`git show --stat HEAD`: only `scripts/collect-from-origin.test.mjs` changed (+25/-1).
`scripts/collect-from-origin.mjs` did not change in this range. The prior round's APPROVE
for the collector's logic, including the C1 attack case and the no-writes check, still
applies to identical code.

1. The `writeRecord` helper at scripts/collect-from-origin.test.mjs:48 now uses
   `path.posix.join("docs","work",filename)` instead of `path.join(...)`.
2. A new test at scripts/collect-from-origin.test.mjs:514-530 pins `recordPath` to forward
   slashes. It checks the output of `changedRecordPaths` and a full `--json` row. Each gets
   a literal-string equality check and a no-backslash check.

## The prior finding (C1-windows-findings.md): the fix works
Cause: the test helper built the expected recordPath with the platform's path.sep.
The code's recordPath comes from `git diff --name-only`
(scripts/collect-from-origin.mjs:75-84, split on "\n"), which always prints forward slashes.
The builder called this a test defect, not a code defect, and that is correct: grep finds no
`path.join`, `path.sep` or backslash handling on the recordPath route in
collect-from-origin.mjs. The only `path.` use there is line 176, for isMainModule.

Discriminating check: I ran this on a scratch copy outside the reviewed tree. I changed the
helper to `path.win32.join`, which reproduces Windows' backslash on Linux, and ran
`node --test`. Result: pass 16, fail 6. The failures were the exact five tests named in the
Windows findings (bare-remote fixture; several changed records yield one row per record;
tip-equals-main attack; orphan branch; changedRecordPaths added/identical), plus the new
test. With the helper back to `path.posix.join`, 22/22 pass. This reproduces the reported
Windows failure set exactly, and the fix removes all of it.

Fix location: scripts/collect-from-origin.test.mjs:48, which is the right layer. Git's
output is canonical, and the expected value had to match it.

Simplification: none needed. The fix is a one-token change to the helper plus one pinning
test. Nothing in the code under test changed.

## The new test catches a regression in the code itself
Second mutation, on the scratch copy: I made `changedRecordPaths` in the code rewrite "/"
to "\\" and put the test file back to HEAD. The new test failed with
`actual: 'docs\\work\\wr-2026-09-26-slash.record.md'`,
`expected: 'docs/work/wr-2026-09-26-slash.record.md'`.
The test compares against a literal string, not only the helper's return value, so a
future change to the helper cannot make it pass while the code is wrong.
I discarded the scratch copy afterwards.

## Side effect: a check that could not fail on Windows now works
scripts/collect-from-origin.test.mjs:452 has
`assert.equal(rows.find((r) => r.recordPath === shared), undefined)`.
Before the fix, on Windows, `shared` held backslashes, so this could never match anything.
It passed because it wasn't looking. With the posix helper it now compares real strings on
every OS. This is an improvement from the fix, not a finding.

## Gate (run by me)
`node --test scripts/collect-from-origin.test.mjs` in the worktree: tests 22, pass 22,
fail 0. `git status --short` in the worktree is empty before and after my run.

## Not verified by me
- Windows 22/22 (C1-report-r5.md, "Verified on Windows itself"): I did not rerun it on the
  Windows host. The win32-separator mutation above is my stand-in: it reproduces the exact
  reported failure set on Linux, and the fix clears it. skills-fable's own rerun from
  origin will settle it.
- The record's Log line and the forward-merge into build/one-launch-2 belong to the
  orchestrator, not C1. They are not in this commit and are not a builder finding.

## Findings
None. Blockers 0, majors 0.
