VERDICT: PASS

# Seam fix round 2 — build-loop-workflow.js / SKILL.md

Worktree: `/home/ben/Code/claude-delegation-lane4` (branch `build/one-launch-1`).
Findings applied from: `docs/specs/one-launch-1/reports/seam-r1.md` (HEAD at review time
`be2a30bfec16cef0ac99ef94ac54472b5f09e4ed`).
Fix commit (code): `3169f986bd606ba4224632a6631ea5100c1a3fd8`. This report and its state
file were committed on top of that as `eabb799be5dfb3148276c3d9da26a72577a19c0b`, the
sha this report field names below (the last commit in the worktree, per `git rev-parse
HEAD` run after it).

Applied every seam-reviewer-verified finding in one round, across both files named in the
findings report (`build-loop-workflow.js`, `build-loop-workflow.test.mjs`, `SKILL.md`).

## MAJOR

- **S1** — `integratePrompt` now takes an `integration` object; when `integrationWorktree`
  is given it appends the worktree, branch (if given) and full-suite gate to the
  integrator's prompt. `setupPrompt` appends the same three facts to the integrator brief
  it writes. Legacy (no `integrationWorktree`) prompts are unchanged (verified: the
  existing byte-compat test — "given path: returns the full R7 superset shape" — plus a
  new test asserting the legacy prompt never contains "Integration worktree").
- **S2** — `acceptPrepPrompt`'s three relative output paths (census `--out`, evidence
  copy destination, and the record write target) are now anchored at
  `${integrationWorktree}/...` instead of the plugin-root-relative paths from the prior
  round. `--record`/`--repo` in step 4 were already safe (per the finding) and untouched.
- **S3** — SKILL.md's Accept-turn routing now reads `integrator.verdict` explicitly:
  a non-`PASS` integrator verdict is checked before `acceptance.skipped`/blockers, and the
  "acceptance: null with no blockers" escape clause is now conditioned on
  `integrator.verdict === 'PASS'` too. `blockers`'s definition now says explicitly it never
  carries integrator failures.
- **S4** — accept-prep now short-circuits to `acceptance: { skipped: 'no-integration-branch' }`
  when `integrationWorktree` is given but `integrationBranch` is not (new test). The
  seam-fix builder's `Gate:` line falls back to a named literal instead of rendering
  `undefined` when `integrationGate` is absent (new test). SKILL.md documents that
  `integrationBranch` is required alongside `integrationWorktree`/`recordPath` for
  accept-prep.

## MINOR

- **s5** — SKILL.md's two stage-order lists now read Setup, Build, Review, Fix,
  Integrate, Seam, Accept, matching `meta.phases` and the script's actual call order.
- **s6** — SKILL.md's blocker-id vocabulary now names `accept-prep` ("when its
  `integrationHead` is not the reviewed head") alongside `seam` and territory ids.
- **s7** — SKILL.md now spells out the three launch-error subtleties: `setup-failed`'s
  id is the failing territory or `*`; an invalid `startFrom` (bad sha shape, bad verdict,
  missing `findingsPath` on `NEEDS_FIXES`, or used on a setup territory) is `missing-args`;
  a partially-given territory is `mixed-territory-modes`. The `startFrom` resuming
  paragraph now says `NEEDS_FIXES` "(requires `findingsPath`)".
- **s8** — SKILL.md's territory-blocker list now includes `parallel-result-missing`.
- **s9** — SKILL.md now says an all-given call's `reviewerBriefPath` is also the seam
  brief, so it needs a seam section.
- **s10** — the accept-prep prompt's Log-line instruction now renders
  `seam r<n> APPROVE <sha>` only when `seam.verdict === 'APPROVE'`, and `seam SKIPPED`
  otherwise, computed from the script's own `seam` object rather than a hardcoded
  literal. SKILL.md's description of that Log line was updated to match. New tests cover
  both branches.
- **s11** — `setupPrompt` and `acceptPrepPrompt` now carry a `Report path: <computed>.`
  line (`${dirName(specPath)}/reports/setup.md` and `.../reports/accept-prep.md`), and the
  script checks the returned `reportPath` against that computed value the same way M5
  checks the brief paths: a setup mismatch is folded into the existing `setup-failed`
  blocker (id `*`); an accept-prep mismatch adds a new `{ id: 'accept-prep', reason:
  'report-path-mismatch' }` blocker entry (new tests for both).

## Deviations / judgment calls

- s11 asked only to "compare the returned reportPath... the same way script:447-449
  checks brief paths" without pinning the failure's exact shape for accept-prep (setup
  already had a vocabulary — `setup-failed`). I reused the existing `accept-prep` blocker
  id (already established by the finding's own s6, and by M3's `review-sha-mismatch` use
  of that same id) with a new reason `report-path-mismatch`, parallel to M3's own
  `review-sha-mismatch` check on `integrationHead`.
- No SKILL.md change was needed for s11 beyond what S4 already covers, since the finding's
  fix was script-only prose about the runner's report path, not existing SKILL.md text.

## Tests

Added 8 new tests to `build-loop-workflow.test.mjs` (S1 x2, S4 x2, s10 embedded in 2
existing tests, s11 x3) plus a shared `reportPathFor()` helper mirroring the script's own
`${dirName(specPath)}/reports/<name>.md` computation, and updated every existing
accept-prep/setup fixture's hardcoded `reportPath` literal to match. All existing fixtures
needed their `reportPath` value corrected once the script started checking it — this was
additive (no existing assertion depended on the old literal values) and is reflected in
the diff.

`node --test skills/team-build/references/build-loop-workflow.test.mjs`: 67/67 pass
(61 pre-existing + 6 new named tests; some new assertions were added inline to two
existing tests rather than as separate tests).

## Gate

`node scripts/run-tests.mjs` (full suite, per integrator brief's lead ruling: gate is
"no NEW failure vs base fbd7cf6"):

```
tests 1594
pass 1589
fail 2
skipped 3
```

The 2 failing tests are exactly the two the integrator brief's lead ruling names as
known base failures (both by test name, matched verbatim):
- `V4: a real install writes one shim per command, each naming ITS OWN command in its
  errors` (skills/multi/scripts/mirror-shim.test.mjs)
- `H6: a plain checkout resolves to itself, and backslashes are normalised (L1)`
  (skills/multi/scripts/note-send.test.mjs)

Neither file is in my territory (L1: build-loop-workflow.js/.test.mjs/example.json/
scout-brief.md; L2: SKILL.md) and neither failure was touched by this round's diff. No new
failure vs base fbd7cf6.

## Files changed

- `skills/team-build/references/build-loop-workflow.js`
- `skills/team-build/references/build-loop-workflow.test.mjs`
- `skills/team-build/SKILL.md`

## Not touched

`docs/specs/one-launch-1/briefs/integrator.md`, `docs/work/wr-2026-09-25-one-launch.record.md`,
`docs/specs/one-launch-1/reports/integrate.md` — pre-existing local modifications/untracked
files from the integrator's own round, left exactly as found (not staged, not committed).
