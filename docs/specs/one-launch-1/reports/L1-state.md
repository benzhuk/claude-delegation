## Territory
L1 — the loop script: `skills/team-build/references/build-loop-workflow.js`, its test
harness, and the two example arg files. Worktree `/home/ben/Code/wt-one-launch-L1`,
branch `build/one-launch-1-L1`, cut from `fbd7cf6`. Round 2 sha: `c3a97b1`.

## Contracts I rely on
`docs/specs/one-launch-1/contracts.md` R1-R9 (pinned, WIN over the spec). Territory map
confines me to the four L1 files; L2 owns SKILL.md; `scripts/`, `hooks/`, etc. off-limits.

## Done
Round 1 (R3-R9, see prior state) plus round 2 fixes for every MAJOR/MINOR finding in
`review-L1-r1.md` that had a concrete patch:
- M1: accept-prep evidence uses reviewers' `findingsPath`, never builders' `reportPath`.
- M2: seam delta-review prompt never leaks a no-commit seam-fix's live HEAD (mirrors the
  existing `reviewPrompt` guard); `seamPrompt` takes a `fixSha` param now.
- M3: accept-prep's `integrationHead` is checked against the seam/integrator's own
  verified head; a mismatch adds `{id:'accept-prep', reason:'review-sha-mismatch'}`.
- M4: accept-prep skips (`{skipped:'territory-blockers'}`) when any territory is
  excluded or none are approved, before the seam check.
- M5: setup's returned reviewer/integrator/seam brief paths are verified against the
  script's own computed names; mismatch -> `setup-failed`, id `'*'`.
- M6: the full-fixture journal test now genuinely discriminates (live wrapping stub,
  return-is-last assertion, pinned-pair check, exact label set).
- m1/m3/m4/m5/m7: trailing-slash strip in baseName/dirName; phase() calls gated on the
  stage actually running; setup/accept-prep prompts tightened (echo prevention, plugin
  root for scripts); seam keeps its verified sha on rounds-exhausted.
- m2: startFrom validated (sha shape, verdict enum, NEEDS_FIXES needs findingsPath, must
  be a given territory) — folds into `missing-args` (no new reason without lead OK).
- m9: added tests for setup-dying-twice, branch/briefPath/missing-row mismatches, seam
  round-1 sha mismatch, seam agent dying twice.
- Gate: 61/61 (was 42/42), `node --test skills/team-build/references/build-loop-workflow.test.mjs`.

## Next
Nothing outstanding for L1's own scope this round.

## Open questions (for the lead — left unresolved on purpose)
- **m6**: R5 pins the accept-prep Log line literally (`seam r<n> APPROVE <sha>`); when
  seam is SKIPPED (not APPROVE) that literal doesn't quite fit. Review flagged this
  "needs the lead's call, since R5 pins the literal" — left the prompt's wording
  unchanged rather than deviate from the pinned contract text without a ruling.
- **m8**: `reviewerBriefPath`/`integratorBriefPath` are still not a hard validation
  error when every territory is given and either is absent (matches 0.20.9's permissive
  behavior; review's own fix note says "leave it for the lead to rule on"). Strict
  enforcement would also require adding brief paths to ~8 existing given-path test
  fixtures.
- "last seam APPROVE" report to copy in accept-prep: still treating the seam review's
  `findingsPath` as its report (REVIEW schema has no separate `reportPath` field) — this
  reading is now also what M1's fix relies on for territories, so it's consistent.

## How to run my gate
```
node --test skills/team-build/references/build-loop-workflow.test.mjs
```
Green, 61/61, from `/home/ben/Code/wt-one-launch-L1`.
