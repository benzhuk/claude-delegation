# C1 round 5: the lead's rulings on reports/C1-review-r4.md and reports/C1-r4-windows-findings.md

- Round: 5. This round is past the cap, so it contains exact patches only. No redesign, no refactor, and no touching code outside the lines named here.
- Findings files, and the only source of what to fix:
  - reports/C1-review-r4.md, findings R4-1 to R4-7;
  - reports/C1-r4-windows-findings.md, findings W1 and W2.
- Start from: wt/lane-closeout-1-C1 at dd99ae1f67a88bfc06163fad27f4591762d33b4d, in /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1.
- State file: reports/C1-state.md. Read it first. You are a fresh builder, and it holds what earlier rounds did.

Research (round 5): the reviewer reproduced R4-2 and R4-3 on scratch copies. Its fixtures are under /tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C1-review-r4/ (t4/, fixsim/, probe.out). The lead reproduced W1 and W2 on the Windows gate (log path in the W file). There is one cause behind R4-2, R4-4 and W1: the round-4 `absent` branch decides from the `Worktree:` string alone, without checking the record's real branch or the value's platform form. The discriminating check is to apply R4-2's patch, then run the two new R4-2 tests and the two W1 tests. They must fail before the patch and pass after it. The Windows half is re-run by the lead.

## Rulings
- **R4-1: take the seam.**
  - Add the optional `opts.listWorktreesImpl`, exactly as the reviewer describes it.
  - Both R2-2 tests pass `listWorktreesImpl: () => null` and are not skipped on any platform.
  - Remove `withFailingWorktreeList` if nothing else uses it.
  - The production default stays janitor's `listWorktrees`.
- **R4-2: apply the reviewer's patch and its two tests verbatim.** The patch also carries R4-4 (`hostAbsolute`) and R4-7 (the whitespace collapse).
- **W1** must be closed by R4-4's `hostAbsolute`. Do not add a second classifier.
  - Show by reading the code that on win32 a value starting with a single `/` is classified foreign, and so gives `refused worktree-unresolved`.
  - The existing tests janitor.test.mjs:2575 and work-record-closeout.test.mjs:1556 are the spec. Do not edit them.
  - Also add a pure unit test of the classifier that feeds it both forms with the host forced to `win32` and to `posix`, so Linux holds the Windows logic too.
- **R4-3:** add the reviewer's dry-run test verbatim.
- **R4-5:** apply the reviewer's `ls-remote` confirm, exactly as given.
- **R4-6:** apply the reviewer's doc text.
- **W2:** fix the test at janitor.test.mjs:2490 so both sides go through `path.resolve` (or the module's normalizer). The assertion must still name the real linked worktree path.

## Mutation proof (scratch copy only; never mutate the live worktree)
Run each mutant on a `git archive` copy under .../scratchpad/lane-closeout/C1-r5-mut/:
- Remove R4-2's `ownBranch` check.
- Remove `hostAbsolute` (so a posix value on win32 counts as native). Prove it with the pure classifier test.
- Remove the R4-3 dry-run guard.
- Make the default seam ignore `listWorktreesImpl`.

Each mutant must fail at least one test. Record which test failed.

## Gate and report
- Gate as in brief-C1.md: territory tests plus the full suite. The GOALS.md STALE failure is pre-existing.
- Commit on wt/lane-closeout-1-C1, and do not push.
- Update reports/C1-state.md.
- Report to reports/C1-r5-report.md:
  - line 1: `DONE <full sha>` or `BLOCKED <reason>`;
  - a disposition per finding (R4-1 to R4-7, W1, W2);
  - the mutation table;
  - the gate numbers, with the log at reports/C1-r5-gate.log.
- ETA 40 minutes.
