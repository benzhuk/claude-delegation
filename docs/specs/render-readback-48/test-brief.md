Task: Independently implement spec's exact snapshot red/green comparison and meaningful-change negative controls. Own only skills/decisions/scripts/decisions-render.test.mjs, decisions-render-publish.test.mjs, fixtures/render-readback-48/* and docs/specs/render-readback-48/L48-test-report.md. First commit regression tests and exact snapshot fixtures on unchanged base; scoped run must fail specifically for intended/read equality, while bullet/tick/moved-line and fenced-literal controls remain sensitive. Tell root before production author proceeds. Then after fix run focused gate once and report actual red/green.
Goal: reduce post-acceptance manual publish recoveries without hiding changed content.
Work: wr-2026-09-28-render-readback, root exclusively owns docs/work record.
Inputs: docs/work/wr-2026-09-28-render-readback.record.md (authoritative spec), docs/specs/render-readback-48/scout.md, pickup.md.
PROJECT FACTS: explicit cwd C:/Users/benzh/orca/workspaces/claude-delegation/render-readback-48 every command. Base926c6f801ce21383b06bd5f92ffb18b5ca2603bc. Shared checkout has disjoint production/test ownership. All scratch/logs under C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/render-readback-48. Original exact snapshots copied there. No git identity changes, force/reset/clean/stash. No ordinary full-suite runs; scoped gates only. Use Global\claude-verify for scoped node tests, process-owned <=60s acquisition, release/dispose finally. No extra live page writes or installs. If command denied, stop that step and report verbatim; never repeat via another tool/shell.
NOT: docs/work edits, peer messaging, page changes, renderer composition, title/autolink guards, pickup, adopt-live semantics, notion.js, run-tests/test-home, docs/census, other lane files.
Evidence: first-line VERDICT:, exact base/change SHA, commands, native exit, pass/fail counts, raw-log paths, before/after proof; no success inferred from reply text.
Autonomy: minimal implementation/test choices inside your named territory; pause only the contested step if scope/permission fails, complete independent work.
Un-agent-able: root owns Opus handoff, final host gates, acceptance/main/publication.
ETA: 15 minutes scoped work. No peer waits.
Fix kind: bug
Class: notion-readback-whitespace-mismatch
Base sha: 926c6f801ce21383b06bd5f92ffb18b5ca2603bc
Reports require Cause:, Discriminating check:, Fix location:, Simplification:.
Termination: write report then return verdict, <=10 lines and path, stop.
Report: docs/specs/render-readback-48/L48-test-report.md
State file: C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/render-readback-48/tests-state.md
Gate: node --test skills/decisions/scripts/decisions-render.test.mjs skills/decisions/scripts/decisions-render-publish.test.mjs, capture immediate native exit and raw to scratch. Fixture hashes must match scout/source exactly. No production mutation or test-only replacement normalizer. Use existing publisher mock/dependency style if a narrow integration regression is possible. Commit only your files with separate add/commit calls. Do not stage root docs or builder code.
