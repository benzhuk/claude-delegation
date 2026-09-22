Work: wr-2026-09-21-next-build-t7
Scope: next-build/spec.md@95d5453
Owner: orchestrator
Status: reviewed
Authority: build and self-gate in own worktree; review by an Opus reviewer; merge to integrate/next-build by the integrator after APPROVE; nothing to main or any machine without Ben's word
Artifact: feat/next-build-T7@c439be0
Evidence: docs/work/evidence/wr-2026-09-21-next-build-t7-review.md, docs/work/evidence/wr-2026-09-21-next-build-t7-builder.md
Next: integrator merges after all six territories are reviewed
Opened: 2026-09-22T00:23:42.447Z
Builder: sonnet
Rounds: 2
Log: 2026-09-22T00:23:42.447Z runnable none
Log: 2026-09-22T00:23:42.447Z owned builder-t7 spawned
Log: 2026-09-22T01:03:27.000Z delivered builder-t7 artifact c439be0
Log: 2026-09-22T01:03:28.000Z owned orchestrator agent-exited artifact c439be0
Log: 2026-09-22T01:03:29.000Z reviewed orchestrator artifact c439be0

T7 covers the sealed test runner: `scripts/run-tests.mjs`, `scripts/test-home.mjs`,
`scripts/test-home.test.mjs`, `docs/sealed-baseline.json`, and `package.json`
`scripts.test` only if the file exists.
