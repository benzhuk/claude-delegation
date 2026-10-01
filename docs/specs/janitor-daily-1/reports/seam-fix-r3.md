VERDICT: PASS

# Seam fix round 3 (wr-2026-09-27-janitor-daily)

- Worktree: /home/ben/Code/claude-delegation-wt/janitor-daily-base, branch build/janitor-daily-1.
- Seam findings reviewed: docs/specs/janitor-daily-1/reports/seam-review.md (round 2, verdict NEEDS_FIXES at 162d2b3).
- Prior findings B1, M1 were already CLOSED per that review. m1 was PARTIALLY CLOSED — its remaining gap was folded into new finding n1, so n1 is the only actionable, seam-reviewer-verified finding for this round.

## Finding applied

### n1 (MINOR, owner J2): CLOSED
- File: scripts/required-wiring.default.json:133 (the `janitor-last-run` wiring-check entry's `fix` text).
- Problem: the text told the user to run `systemd --user list-timers janitor-record.timer`. `systemd` is PID 1, not a CLI verb — `list-timers` belongs to `systemctl`. The command as written does not exist and fails if pasted.
- Fix applied exactly as the reviewer's patch specified: `systemd --user list-timers` -> `systemctl --user list-timers`, one word, no other change.
- Verified no other occurrence of the bad string remains anywhere in the tree outside the seam-review report itself (which documents the finding and is not mine to edit):
  `grep -rn "systemd --user list-timers" .` now only matches docs/specs/janitor-daily-1/reports/seam-review.md (the finding's own write-up).
- No test asserts this exact string (confirmed by the reviewer's own grep in the finding); state and exit codes are unaffected by this change, consistent with the reviewer's prediction.

## Gate

Command: `node scripts/run-tests.mjs`
Result: `tests 2040, pass 2037, fail 0, cancelled 0, skipped 3, todo 0` (exit 0).
Full log: docs/specs/janitor-daily-1/reports/seam-fix-r3-gate.log

## Commit

- `a8e0bb578e2f84cd034720cbf38c2ec74fc43800` — fix(janitor-daily-1-seam): correct systemctl command in wiring-check fix text (n1)
- Diff: one line changed in scripts/required-wiring.default.json (the `fix` string for the `janitor-last-run` entry).

## Notes for the lead
- The untracked docs/specs/janitor-daily-1/briefs/ and docs/specs/janitor-daily-1/reports/ directories were already present in the worktree before this round (prior rounds' artifacts) and were left as-is; only scripts/required-wiring.default.json was staged and committed.
- No worktree or scratch directories were removed by this builder.
