# C1 round 4: the lead's rulings on reports/C1-review-r3.md

- Round: 4. This round is past the three-round cap, so the lead narrows it to exact patches only. No redesign.
- Findings file: /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/reports/C1-review-r3.md
- Start from: wt/lane-closeout-1-C1 at 0fcd68699e13dfe83ffca2b096cbae5664c54972, in the same worktree.

## Research
- Repro: the reviewer's mutation log and its patched test are in /tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C1-review-r3/.
- Isolated to: work-record.mjs:2064-2066. No test fails when that refusal is removed.
- The check: apply the mutant on a scratch copy, never on the live worktree, and confirm the patched test fails.

## Fixes
- **R3-1 (blocker).** Add the reviewer's five assertions to the `closeoutRecord: R2-2` test verbatim. Prove on a SCRATCH COPY that removing lines 2064-2066 fails the test. Mutating the live worktree is forbidden: the reviewer caught round 3 doing that.
- **R3-2 to R3-7.** Apply the reviewer's patches as given. The two tests that fail on Windows are required, not optional: the Windows suite is this lane's second-host gate. Make them platform-correct. Do not skip them on win32.
- **Idempotent closeout (the lead's ruling on the R2-8 observation).** A closeout must be safe to re-run.
  - `Worktree:` names a path that does not exist on disk, and no registered worktree holds its branch: report `absent`, which does not raise the exit code.
  - The same, but the local branch still exists: go on to the branch step as usual.
  - `Worktree:` names a path that exists on disk but is not a registered worktree, or a value that cannot be parsed: keep `refused worktree-unresolved` with exit 2, as R2-8 ruled.
  - Add a test that runs closeout twice on one fixture. The second run exits 0, with every step `absent`.

## Gate and report
- Run the gate as in brief-C1.md. The GOALS.md STALE failure is pre-existing.
- Commit, and do not push.
- Write the report to reports/C1-r4-report.md:
  - line 1: `DONE <sha>` or `BLOCKED <reason>`;
  - a disposition for each finding;
  - the scratch-copy mutation proof for R3-1;
  - the gate numbers, with the log in reports/C1-r4-gate.log.
- ETA 40 minutes.
