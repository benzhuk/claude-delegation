# Integrator state — collect-from-origin-1

Last updated: after the one and only gate run this session (2026-09-26).

## Merge state
- Base: `5f057a3959323bd0fd01231e6fe6d47688991cec`.
- Merged: C2 only, via `git merge --no-ff build/collect-from-origin-1-C2` (reviewer
  APPROVE at `1468a6303fda1972e1ac103c9835fb7db4cc886b`). Clean, no conflicts.
- Not merged: C1 — excluded per task input ("rounds-exhausted"); still `NEEDS_FIXES`
  (round 3) per `reports/C1-review-r3.md`, pending a lead ruling on F4/F6.
- Head of `build/collect-from-origin-1` now: `297d593803bbe1962bfc6e7d476dd36e237f1673`.
- Nothing pushed to origin.

## Gate state
- `node scripts/run-tests.mjs` run once on `297d593`: 1693 tests, 1688 pass, 2 fail
  (V4 mirror-shim, H6 note-send) — both confirmed pre-existing at base `ac9c842` via a
  scratch worktree (also 2 fail, same two names). No new failure. Sealed-suite gate:
  PASS on the no-new-failure criterion.
- R4 dogfood (`node scripts/collect-from-origin.mjs --repo /home/ben/Code/claude-delegation
  --json`): could not run — the script is not on this branch (C1, its owner, excluded).
  Not re-run, not faked.

## Outstanding
- Orchestrator decision needed: whether a C2-only merge without the R4 dogfood evidence
  satisfies this gate, or whether it waits for C1 to land.
- If C1 later lands: re-run the full suite once more (still once per gate, per the rule —
  this would be a new gate invocation for the new merge state) and then run R4 for real.

## Cleanup
- Scratch base-worktree at `.../scratchpad/base-ac9c842` removed cleanly via
  `git worktree remove --force`.
- Two `run-tests.mjs`-created sealed-home debug dirs left in place (tool's own artifact,
  not mine to delete): `/tmp/sealed-home-YUjh6X` (this branch), `/tmp/sealed-home-ZQuVBl`
  (base scratch run).
