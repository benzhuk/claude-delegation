Work: wr-2026-09-26-one-launch-fix
Scope: docs/specs/one-launch-2/spec.md (read at origin/docs/lane-specs-0925 f72748a) with lead rulings docs/specs/one-launch-2/contracts.md; one territory F1 (loop script, its test and args example, new accept-prep helper and test, SKILL.md sentences)
Owner: skills-n
Status: accepted
Authority: build, review, integrate, push build/one-launch-2 on green, and post its merge item to Ben's decisions page, without Ben; merge to main waits for Ben's word
Artifact: build/one-launch-2@071c6aaef0d175a10e7dbc817576441ef118f8e4
Evidence: docs/work/evidence/wr-2026-09-26-one-launch-fix-census.md, docs/work/evidence/wr-2026-09-26-one-launch-fix-F1.md, docs/work/evidence/wr-2026-09-26-one-launch-fix-dogfood-lane6-four-read.md, docs/work/evidence/wr-2026-09-26-one-launch-fix-integrator.md, docs/work/evidence/wr-2026-09-26-one-launch-fix-delta-071c6aa.md, docs/work/evidence/wr-2026-09-26-one-launch-fix.census.json, docs/work/evidence/wr-2026-09-26-one-launch-fix.four-read.json
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
Log: 2026-09-26T19:24:26.000Z reviewed skills-n delta review APPROVE 071c6aaef0d175a10e7dbc817576441ef118f8e4 (F1 code unchanged from 4eb7bd1, clean forward merge of lane six 3048d19, suite fails only H6 and V4 as on base)
Census: - leadTurns: 9
Census: - wallClockHours: 5.74
Census: - by-model: claude-opus-5-5=15496248, claude-sonnet-5=36294004
Census: - by-role: accept-prep=2082519, build=28029500, integrate=3981072, review=5572516, setup=2200913, unassigned=675075
Census: - subagentFiles: 52
Census: - Total assistant turns, deduped (whole file): **147**
Census: - Window assistant turns, deduped: **53**
Census: - leadTurns (conversational runs — see docs/census.md): **9**
Census: - Window: 2026-09-26T13:40:20.578Z .. 2026-09-26T19:24:41.343Z
Census: - Turns/hour in window: **9.23**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 294 | 618669 | 22780632 | 103673 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 106 | 128444 | 9082425 | 37682 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 252 | 352703 | 5796932 | 97704 |
Census: | claude-sonnet-5 | 760 | 1122744 | 34884501 | 285999 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | accept-prep | 54 | 106394 | 1955974 | 20097 |
Census: | build | 474 | 709096 | 27131632 | 188298 |
Census: | integrate | 168 | 206048 | 3722201 | 52655 |
Census: | review | 198 | 286582 | 5206867 | 78869 |
Census: | setup | 64 | 101206 | 2074694 | 24949 |
Census: | unassigned | 54 | 66121 | 590065 | 18835 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 135386 | 15360862 |
Census: | claude-sonnet-5 | 285999 | 36008005 |
Four numbers: Top-tier tokens per build: 15496248 tokens: build 15496248 (claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 5.7h; largest gap 267.8min at 2026-09-26T14:01:20.774Z
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 2 gap(s) over 30min: 2026-09-26T14:01:20.774Z (267.8min), 2026-09-26T18:30:55.659Z (41.4min); 3 unanswered ASK(s) to skills-n: skills-fable-one-launch-fix-1, skills-fable-collect-from-origin-3, skills-fable-merge-on-acceptance-1
Log: 2026-09-26T19:24:46.000Z accepted skills-n artifact 071c6aaef0d175a10e7dbc817576441ef118f8e4

Observed: one territory F1, three launches of the one-launch script (setup-failed on an exact-string path compare, then given mode to integrator FAIL on N2, then a startFrom NEEDS_FIXES relaunch to PASS). F1 APPROVE at 4eb7bd1 (Opus), integrator PASS at c904a4a with no new failing test name vs base 33aa023 (H6, V4 fail on base too). The fixed accept-prep wrote Status, Artifact, Worktree, Evidence and the reviewed Log line and left every other header line byte-for-byte, and ran the census after the reviewed line. Its dry check-acceptance failed only on an Evidence path outside the worktree (docs/notes, main checkout), since removed. The ASK packet is docs/notes/skills-fable-one-launch-fix-1.md in the main checkout.

Dogfood (R8): four-read on a scratch copy of wr-2026-09-26-collect-from-origin with Base as the one merge sha 5f057a3 resolved and counted rework (4 commits, 1 re-accept), in the dogfood evidence file.
