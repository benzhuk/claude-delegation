# Territory: seam-fix-r2 (one-launch-1)

## Contracts I rely on
`docs/specs/one-launch-1/contracts.md` (R1-R10, territory map: L1 =
`build-loop-workflow.js`/`.test.mjs`/example jsons/scout-brief.md, L2 = `SKILL.md`).
Base sha for the build: `fbd7cf6`. This round's findings source:
`docs/specs/one-launch-1/reports/seam-r1.md` (reviewed at HEAD
`be2a30bfec16cef0ac99ef94ac54472b5f09e4ed`).

## Done
Applied all seam-r1 findings (S1-S4 MAJOR, s5-s11 MINOR) to
`skills/team-build/references/build-loop-workflow.js`,
`skills/team-build/references/build-loop-workflow.test.mjs`, and
`skills/team-build/SKILL.md`. Added 8 new/extended tests; corrected every existing
fixture's `reportPath` literal to the newly-checked computed value. Committed at
`3169f986bd606ba4224632a6631ea5100c1a3fd8`. Territory-scoped test file: 67/67 pass. Full
suite gate (`node scripts/run-tests.mjs`): 1589/1594 pass, the 2 failures being the exact
pre-existing base failures named in the integrator brief's lead ruling (mirror-shim.test.mjs
V4, note-send.test.mjs H6) — no new failure vs base.

## Next
None outstanding from seam-r1. A fresh seam re-review (r2) against this commit and the
prior findings path is the natural next step, per the loop's own delta-re-review rule.

## Open questions
None. s6/s11's exact blocker-reason vocabulary (`report-path-mismatch`) was my own
mechanical extension of the existing `accept-prep`/`review-sha-mismatch` pattern — flagged
in the report's "Deviations" section for the seam re-reviewer to confirm.

## How to run my gate
Territory-scoped: `node --test skills/team-build/references/build-loop-workflow.test.mjs`
(67 tests, all pass).
Full-suite (integrator's gate, run here per this round's brief): `node scripts/run-tests.mjs`
— compare failing test names, not counts, against base `fbd7cf6`'s known 2 failures.
