# Builder brief C1 (lane 36, lane-closeout): record Scratch field, close --closeout, sweep-origin

Worktree: /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1 (local branch wt/lane-closeout-1-C1). Work only there.

Spec and contracts are in the lead's worktree; read them first:
- /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/contracts.md: the C1 rulings and "Rules for every agent". These are binding and win over the spec.
- /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/spec.md: the Lane 36 section, for the why.

Task: implement C1 (a), (b), (c) with a unit test for every refusal named there. Document the field and the two commands in docs/work-record.md, and the closeout in skills/janitor/SKILL.md (a short paragraph).

The origin-delete code deletes real branches in production. Test it only against a local bare fixture origin.

Gate:
1. The territory tests.
2. Then the full suite once: `node scripts/run-tests.mjs > /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/reports/C1-gate.log 2>&1`, which must show 0 fail.

Commit on wt/lane-closeout-1-C1 and do not push.

Report: /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/reports/C1-report.md
- Line 1: `DONE <full sha>` or `BLOCKED <reason>`.
- Then, per ruling: file:line and test names.
- The exact CLI usage of `close --closeout` and `sweep-origin`.
- A dry-run transcript of sweep-origin against a fixture.
- The gate numbers, quoted from the log.

State file: reports/C1-state.md. ETA 90 minutes.
