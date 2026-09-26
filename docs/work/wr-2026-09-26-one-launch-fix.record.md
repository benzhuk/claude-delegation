Work: wr-2026-09-26-one-launch-fix
Scope: docs/specs/one-launch-2/spec.md (read at origin/docs/lane-specs-0925 f72748a) with lead rulings docs/specs/one-launch-2/contracts.md; one territory F1 (loop script, its test and args example, new accept-prep helper and test, SKILL.md sentences)
Owner: skills-n
Status: reviewed
Authority: build, review, integrate, push build/one-launch-2 on green, and post its merge item to Ben's decisions page, without Ben; merge to main waits for Ben's word
Artifact: build/one-launch-2@c904a4aac6c92d5735c768be8d2a4bc08114af51
Evidence: docs/work/evidence/wr-2026-09-26-one-launch-fix-census.md, docs/work/evidence/wr-2026-09-26-one-launch-fix-F1.md, docs/work/evidence/wr-2026-09-26-one-launch-fix-dogfood-lane6-four-read.md, docs/work/evidence/wr-2026-09-26-one-launch-fix-integrator.md
Next: accept, then merge item on Ben's decisions page; merge to main waits for Ben's word
Opened: 2026-09-26T13:40:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-26T09:39:55-04:00
Base: 33aa023bd927b44b23292d540cc0c2aed4ced212
Worktree: build/one-launch-2
Log: 2026-09-26T13:41:22.000Z owned skills-n launch dispatched, setup mode, one territory F1; ACK sent over ssh on ben-desktop
Log: 2026-09-26T13:47:27.000Z owned skills-n launch wf_bc76a98a-05b returned setup-failed after setup had succeeded (relative briefPath vs absolute computed path, exact-string compare): added as contracts R7; relaunched in given mode on setup's own worktree and briefs
Log: 2026-09-26T18:31:00.000Z rejected skills-n launch wf_86297318-c59 returned F1 APPROVE 8791423 after 2 rounds, integrator FAIL at 2f659bf: new failing test N2 (hooks.test.mjs:429), findings docs/specs/one-launch-2/reports/integrator-report.md; H6 and V4 reproduce on base 33aa023
Log: 2026-09-26T19:19:01.000Z reviewed skills-n seam SKIPPED

Observed: one territory F1, three launches of the one-launch script (setup-failed on an exact-string path compare, then given mode to integrator FAIL on N2, then a startFrom NEEDS_FIXES relaunch to PASS). F1 APPROVE at 4eb7bd1 (Opus), integrator PASS at c904a4a with no new failing test name vs base 33aa023 (H6, V4 fail on base too). The fixed accept-prep wrote Status, Artifact, Worktree, Evidence and the reviewed Log line and left every other header line byte-for-byte, and ran the census after the reviewed line. Its dry check-acceptance failed only on an Evidence path outside the worktree (docs/notes, main checkout), since removed. The ASK packet is docs/notes/skills-fable-one-launch-fix-1.md in the main checkout.

Dogfood (R8): four-read on a scratch copy of wr-2026-09-26-collect-from-origin with Base as the one merge sha 5f057a3 resolved and counted rework (4 commits, 1 re-accept), in the dogfood evidence file.
