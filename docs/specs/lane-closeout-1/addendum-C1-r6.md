# C1 round 6: tests only (lead rulings on reports/C1-review-r5.md and reports/C1-r5-windows-findings.md)

- Round: 6. Test files only. Do not change scripts/janitor.mjs, scripts/work-record.mjs or the docs.
- Start from wt/lane-closeout-1-C1 at 22964783b1e26331ce3c3a503ee38028e1a09188, in /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1.
- State file: reports/C1-state.md.

Research: the reviewer reproduced R5-1 on a scratch copy forced to classify as win32. The Windows gate at 7ce9843 shows the same failure (W3).
- Cause: the W1 spec tests use a drive-letter value, and that value is native on win32. The code is right.
- Discriminating check: after the patch, both tests pick a value foreign to whichever host runs them. On Linux they must still fail when `hostAbsolute` is removed on a scratch copy. The lead re-runs Windows.

## Rulings
- **R5-1 / W3: the lead re-rules.** The earlier line "do not edit these tests" is lifted for exactly these two tests: scripts/janitor.test.mjs:2575 and scripts/work-record-closeout.test.mjs:1531.
  - Apply the reviewer's one-line patch to each, verbatim, from reports/C1-review-r5.md: a host-foreign value picked by `process.platform`.
  - Keep every asserted step and exit code unchanged.
- **R5-2: add the reviewer's two R4-5 tests verbatim.** They pass on 2296478.
  - On a `git archive` extract, show that each one kills its mutant.
  - Write the extract with `-o`, untar as a separate command, and never pipe.
  - Scratch: .../scratchpad/lane-closeout/C1-r6-mut/.
- **Suite collisions (the reviewer's note): not in this lane.** It is pre-existing, and lane 46 owns per-run TMPDIR. Never run two suites at once on this host.

## Gate and report
- Territory tests plus the full suite, each under `timeout`, one at a time. Write the gate log to reports/C1-r6-gate.log. The GOALS.md STALE failure is pre-existing.
- Commit, and do not push. Update reports/C1-state.md.
- Report to reports/C1-r6-report.md:
  - line 1: `DONE <full sha>` or `BLOCKED <reason>`;
  - the mutant results;
  - the gate numbers.
- ETA 20 minutes.
