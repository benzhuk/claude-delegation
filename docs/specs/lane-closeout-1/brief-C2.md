# Builder brief C2 (lane 36, lane-closeout): delete-guard quoted-text false positives, scratch sentence

Worktree: /home/ben/Code/claude-delegation-wt/lane-closeout-1-C2 (local branch wt/lane-closeout-1-C2). Work only there.

Spec and contracts are in the lead's worktree; read them first:
- /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/contracts.md: the C2 rulings, the pinned scratch sentence and "Rules for every agent". These are binding.
- /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/spec.md: the Lane 36 section.

Task: implement C2.

This is a safety guard, so loosening it must never let a real delete through:
- Every "stay refused" shape gets a test.
- The three false-positive shapes get tests.
- Unparseable input fails closed.

In your report, list every shape the guard refused before your change and whether it still refuses. Run the old test file's cases unchanged.

Do not type a literal recursive-delete command in your own shell commands, even inside quotes. Build test strings in the test file with string concatenation if the guard would stop you. If a command is denied, stop and report it verbatim.

Gate:
1. `node --test hooks/delete-guard.test.mjs agents/agents.test.mjs`.
2. Then the full suite once: `node scripts/run-tests.mjs > /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/reports/C2-gate.log 2>&1`, which must show 0 fail.

Commit on wt/lane-closeout-1-C2 and do not push.

Report: /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/reports/C2-report.md
- Line 1: `DONE <full sha>` or `BLOCKED <reason>`.
- Then: the before/after shape table, file:line and test names.
- The gate numbers, quoted from the log.

State file: reports/C2-state.md. ETA 60 minutes.
