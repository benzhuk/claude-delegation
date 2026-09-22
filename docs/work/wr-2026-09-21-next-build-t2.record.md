Work: wr-2026-09-21-next-build-t2
Scope: next-build/spec.md@95d5453
Owner: orchestrator
Status: accepted
Authority: build and self-gate in own worktree; review by an Opus reviewer; merge to integrate/next-build by the integrator after APPROVE; nothing to main or any machine without Ben's word
Artifact: feat/next-build-T2@17265e8
Evidence: docs/work/evidence/wr-2026-09-21-next-build-t2-review.md, docs/work/evidence/wr-2026-09-21-next-build-t2-builder.md, docs/work/evidence/integrate-653f813.md
Next: integrator merges after all six territories are reviewed
Opened: 2026-09-22T00:23:42.447Z
Builder: sonnet
Rounds: 3
Log: 2026-09-22T00:23:42.447Z runnable none
Log: 2026-09-22T00:23:42.447Z owned builder-t2 spawned
Log: 2026-09-22T01:11:47.000Z delivered builder-t2 artifact d0737ce
Log: 2026-09-22T01:11:48.000Z owned orchestrator agent-exited artifact d0737ce
Log: 2026-09-22T01:11:49.000Z reviewed orchestrator artifact d0737ce
Log: 2026-09-22T01:21:24.000Z reviewed orchestrator evidence-normalised
Log: 2026-09-22T01:48:04.000Z reviewed orchestrator artifact 17265e8
Log: 2026-09-22T01:56:11.000Z accepted lead artifact 17265e8 integration 653f813

T2 covers the backlog notice: `hooks/backlog-notice.js`, `hooks/backlog-notice.test.mjs`,
`hooks/hooks.json`, `skills/multi/scripts/hooks.test.mjs` (only the "V3" test),
`scripts/required-wiring.default.json`, and `docs/backlog-notice.md`.
