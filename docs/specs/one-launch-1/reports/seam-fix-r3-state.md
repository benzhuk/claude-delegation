# Territory: seam-fix-r3 (one-launch-1)

## Contracts I rely on
`docs/specs/one-launch-1/contracts.md` (R1-R10, territory map: L1 =
`build-loop-workflow.js`/`.test.mjs`/example jsons/scout-brief.md, L2 = `SKILL.md`).
Base sha for the build: `fbd7cf6`. This round's findings source:
`docs/specs/one-launch-1/reports/seam-r2.md` (reviewed at HEAD
`a548b145c0c4dc6e3e7d9e1c3dabf639315cac94`).

## Done
Applied N1 (MAJOR) and N2, N3 (MINOR) from seam-r2 to
`skills/team-build/references/build-loop-workflow.js`,
`skills/team-build/references/build-loop-workflow.test.mjs`, and
`skills/team-build/SKILL.md`. N1: `acceptReportPath` now anchors at
`integrationWorktree` when `specPath` is repo-relative (mirrors S2); added
`acceptReportPathFor(args)` test helper and swapped it into all 7 call sites that
previously used `reportPathFor(args.specPath, "accept-prep")`. N2: the setup prompt's
integration clause now guards `integrationBranch`/`integrationGate` independently (twin
of S4), plus a new test. N3: SKILL.md's accept-prep blocker sentence now names both
`review-sha-mismatch` and `report-path-mismatch`. Committed at
`3609483f1cbfaaac2f4705098a8b4ac7dacd02ee`. Territory-scoped test file: 68/68 pass
(67 prior + 1 new N2 test). Full suite gate (`node scripts/run-tests.mjs`): 1590/1595
pass, the 2 failures being the exact pre-existing base failures named in the integrator
brief's lead ruling (mirror-shim.test.mjs V4, note-send.test.mjs H6) — no new failure
vs base fbd7cf6.

## Next
N4 (s10 vs contracts.md R5's pinned Log literal) is a lead ruling on contracts.md, not a
code change — left open per seam-r2's own instruction ("Fix (lead action, no code
change)"). No other findings outstanding from seam-r2.

## Open questions
None from my side. N4 needs the lead's ruling on contracts.md R5 step 3's Log-line
literal (amend it to allow "seam SKIPPED", or revert s10's script/SKILL rendering).

## How to run my gate
Territory-scoped: `node --test skills/team-build/references/build-loop-workflow.test.mjs`
(68 tests, all pass).
Full-suite (integrator's gate, run here per this round's brief):
`node scripts/run-tests.mjs` — compare failing test names, not counts, against base
`fbd7cf6`'s known 2 failures (mirror-shim.test.mjs V4, note-send.test.mjs H6).
