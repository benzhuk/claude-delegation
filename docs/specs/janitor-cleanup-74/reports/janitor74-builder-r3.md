VERDICT: PASS

# janitor74 fix round 3

Commit 9126120c9ae3099a7776b81ef0e3906cac5fd167 on build/janitor-cleanup-74-janitor74 (scripts/janitor-sweep.mjs, scripts/janitor-sweep.test.mjs).

## Applied
- NEW MAJOR A: the in-use probe (a rename on win32) now runs only after the class is known to act, in both sweepWorktrees and sweepDeregistered. Report mode, `act: []` and an unrelated class never call it. In both places I also moved the BTO-remote check ahead of the probe, so a BTO-remote directory is never probed even in acting mode (reviewer's fix left that case). Test "NEW MAJOR A" counts calls over three modes (apply false, apply with act [], apply with another class): calls === 0, rows are would-archive-then-remove and would-archive.
- MINOR C: sweepWorktrees now emits a report-only row `archived; removal refused earlier, needs a hand` for a clean detached non-main worktree whose HEAD equals a local archive/* branch tip, instead of dropping it. Test "MINOR C" proves the row, that nothing acts, and that no row appears once the archive branch is gone.
- Existing tests that use apply + the class (probe-throws, busy, deregistered gate, real-process main) still pass.

## Not applied
- MAJOR B (wire refreshIfRegistered into wiring-check --hook): outside this territory (scripts/wiring-check.mjs and its test are not in the brief). Needs the orchestrator to widen janitor74 or hand it over. Item 6 stays "script ready, not wired".
- MINOR D (process): noted. No guard block hit this round. I did write a heredoc append to the test file via Bash (allowed) and left no temp files.
- Rulings (sweepFailed exit 1, unpushed-archive on narrow refspec): left as-is, the orchestrator's call.

## Gate
Brief gate list plus janitor-sweep.test.mjs and janitor-timer-refresh.test.mjs, log janitor74-gate.log. Exit 0. Tail: tests 460, pass 398, fail 0, skipped 62.
