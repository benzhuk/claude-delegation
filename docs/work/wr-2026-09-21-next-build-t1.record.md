Work: wr-2026-09-21-next-build-t1
Scope: next-build/spec.md@95d5453
Owner: orchestrator
Status: accepted
Authority: build and self-gate in own worktree; review by an Opus reviewer; merge to integrate/next-build by the integrator after APPROVE; nothing to main or any machine without Ben's word
Artifact: feat/next-build-T1@8f9fa76
Evidence: docs/work/evidence/wr-2026-09-21-next-build-t1-review.md, docs/work/evidence/wr-2026-09-21-next-build-t1-builder.md, docs/work/evidence/integrate-653f813.md
Next: integrator merges after all six territories are reviewed
Opened: 2026-09-22T00:23:42.447Z
Builder: sonnet
Rounds: 5
Log: 2026-09-22T00:23:42.447Z runnable none
Log: 2026-09-22T00:23:42.447Z owned builder-t1 spawned
Log: 2026-09-22T00:54:38.000Z delivered builder-t1 artifact 8500d9a
Log: 2026-09-22T00:54:39.000Z owned orchestrator agent-exited artifact 8500d9a
Log: 2026-09-22T00:54:40.000Z reviewed orchestrator artifact 8500d9a
Log: 2026-09-22T01:21:23.000Z reviewed orchestrator evidence-normalised
Log: 2026-09-22T01:48:03.000Z reviewed orchestrator artifact 8f9fa76
Log: 2026-09-22T01:56:10.000Z accepted lead artifact 8f9fa76 integration 653f813

T1 covers record and fields: `scripts/work-record.mjs`, `scripts/work-record.test.mjs`,
`docs/work-record.md`, `docs/mandate-template.md`, `agents/builder.md`, `agents/reviewer.md`,
and `agents/agents.test.mjs`.
