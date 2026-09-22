Work: wr-2026-09-21-next-build-t7
Scope: next-build/spec.md@95d5453
Owner: builder-t7
Status: owned
Authority: build and self-gate in own worktree; review by an Opus reviewer; merge to integrate/next-build by the integrator after APPROVE; nothing to main or any machine without Ben's word
Artifact: none
Evidence: none
Next: builder reports to next-build/reports/T7-report.md; orchestrator spawns the Opus reviewer in the same turn
Opened: 2026-09-22T00:23:42.447Z
Builder: sonnet
Rounds: 1
Log: 2026-09-22T00:23:42.447Z runnable none
Log: 2026-09-22T00:23:42.447Z owned builder-t7 spawned

T7 covers the sealed test runner: `scripts/run-tests.mjs`, `scripts/test-home.mjs`,
`scripts/test-home.test.mjs`, `docs/sealed-baseline.json`, and `package.json`
`scripts.test` only if the file exists.
