# Integrator state — collect-from-origin-1

Last updated: after this session's one and only full-suite gate run (2026-09-26), both
territories merged.

## Merge state
- Base: `5f057a3959323bd0fd01231e6fe6d47688991cec`.
- Merged: C2 (via `git merge --no-ff build/collect-from-origin-1-C2`, reviewer APPROVE at
  `1468a6303fda1972e1ac103c9835fb7db4cc886b` — this merge, commit `297d593`, was already
  on the branch when this session started, done by an earlier integrator round) and C1
  (via `git merge --no-ff build/collect-from-origin-1-C1` this session, reviewer APPROVE
  at `4843ef78219efaf716a3cbffc52e128053a6d71c`, round 4 after the F4 60-line pin was
  waived by the lead). Both clean, no conflicts.
- Head of `build/collect-from-origin-1` now: `8de9e42aa5e05658956e5253a428f3ae9dc38db3`.
- Nothing pushed to origin.

## Gate state
- `node scripts/run-tests.mjs` run once this session on `8de9e42`: 1714 tests, 1709 pass,
  2 fail (V4 mirror-shim, H6 note-send), 3 skipped. Both fails confirmed pre-existing at
  base `ac9c842` via a fresh scratch-worktree re-run (1662 tests, 1657 pass, same 2 fails,
  same 2 names, same file/line). No new failure by failing-test-name diff. Sealed-suite
  gate: PASS.
- R4 dogfood (`node scripts/collect-from-origin.mjs --repo /home/ben/Code/claude-delegation
  --json`) run this session from `/home/ben/Code/wt-collect-1`: exit 0, empty stderr, 8
  JSON rows, verbatim table in `reports/integrator-report.md`. Two `accepted-unmerged`
  rows correctly report `merged: false` for an artifact sha not yet an ancestor.

## Outstanding
- None for this gate. Both territories merged and reviewed APPROVE at the shas named in
  the integrator brief; gate is no-new-failure PASS; dogfood ran successfully.
- Ship decision is the orchestrator's, not mine.

## Cleanup
- Scratch base-worktree at `.../scratchpad/base-ac9c842` created and removed this session
  via `git worktree remove --force` (a worktree I created, not tracked work).
- `run-tests.mjs`'s own sealed-home debug dirs under `/tmp/sealed-home-*` left in place
  (the tool's own artifact from each of the 3 runs this session — merged-branch run,
  base-worktree fresh run, and the prior round's leftover log's run — not mine to delete).
