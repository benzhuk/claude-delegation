Work: wr-2026-09-21-next-build-t2
Scope: next-build/spec.md@95d5453
Owner: builder-t2
Status: owned
Authority: build and self-gate in own worktree; review by an Opus reviewer; merge to integrate/next-build by the integrator after APPROVE; nothing to main or any machine without Ben's word
Artifact: none
Evidence: none
Next: builder reports to next-build/reports/T2-report.md; orchestrator spawns the Opus reviewer in the same turn
Opened: 2026-09-22T00:23:42.447Z
Builder: sonnet
Rounds: 1
Log: 2026-09-22T00:23:42.447Z runnable none
Log: 2026-09-22T00:23:42.447Z owned builder-t2 spawned

T2 covers the backlog notice: `hooks/backlog-notice.js`, `hooks/backlog-notice.test.mjs`,
`hooks/hooks.json`, `skills/multi/scripts/hooks.test.mjs` (only the "V3" test),
`scripts/required-wiring.default.json`, and `docs/backlog-notice.md`.
