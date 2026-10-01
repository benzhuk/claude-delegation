# Territory: janitor-daily-1 seam fix, round 3

## Contracts I rely on
- docs/specs/janitor-daily-1/reports/seam-review.md (round 2 verdict, NEEDS_FIXES at 162d2b3): the pinned list of findings for this round.
- scripts/required-wiring.default.json's `janitor-last-run` entry shape (id, type, file, maxAgeSeconds, whenMissing, requiresFile, why, fix) — unchanged, only the `fix` string's text edited.

## Done
- Applied n1 (MINOR, J2): scripts/required-wiring.default.json:133, `fix` text `systemd --user list-timers` -> `systemctl --user list-timers`. Exact single-word patch as specified by the seam reviewer.
- Confirmed B1 and M1 were already CLOSED per round-2 review; m1's residual gap was fully covered by n1 (no separate action needed).
- Full gate: `node scripts/run-tests.mjs` -> tests 2040, pass 2037, fail 0, skipped 3, exit 0.
- Committed as a8e0bb578e2f84cd034720cbf38c2ec74fc43800 on build/janitor-daily-1.

## Next
- None expected from this round's findings. If a round-4 seam review runs, it should find only the n1 patch applied and no other diff.

## Open questions
- None raised by this round.

## How to run my gate
`cd /home/ben/Code/claude-delegation-wt/janitor-daily-base && node scripts/run-tests.mjs`
Full log at docs/specs/janitor-daily-1/reports/seam-fix-r3-gate.log.
