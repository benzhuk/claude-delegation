Work: wr-2026-09-26-merge-on-acceptance
Scope: docs/specs/merge-on-acceptance-1/spec.md (read at origin/docs/lane-specs-0925 aa11302) with lead rulings in docs/specs/merge-on-acceptance-1/contracts.md; territories M1 (merge gate and page entry) and M2 (Done tick wakes an idle lead)
Owner: skills-n
Status: accepted
Authority: build, review, integrate and push build/merge-on-acceptance-1 on green without Ben; the dogfood merge into main follows the M1 rule once the second-host suite is green
Artifact: build/merge-on-acceptance-1@f3ec5333b9e91847fc86be4c4f7f98e9ea951a26
Evidence: docs/work/evidence/wr-2026-09-26-merge-on-acceptance-M1.md, docs/work/evidence/wr-2026-09-26-merge-on-acceptance-M2.md, docs/work/evidence/wr-2026-09-26-merge-on-acceptance-seam.md, docs/work/evidence/wr-2026-09-26-merge-on-acceptance-integrator.md, docs/work/evidence/wr-2026-09-26-merge-on-acceptance-windows-gate.log, docs/work/evidence/wr-2026-09-26-merge-on-acceptance.census.json, docs/work/evidence/wr-2026-09-26-merge-on-acceptance.four-read.json
Next: merge into main under its own M1 rule (merge-result suite first, R3), Closed entry on the decisions page, RESULT
Opened: 2026-09-26T19:30:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-26T15:12:00-04:00
Base: 6d8ba95a33019e30adf4ecb4c5367c4b756f3e1e
Worktree: build/merge-on-acceptance-1
Log: 2026-09-26T19:30:00.000Z owned skills-n picked up after lane seven RESULT, base origin/main 6d8ba95 (release 0.20.11)
Log: 2026-09-26T19:45:00.000Z owned skills-n Opus red-team REWORK_M2 (M2 duplicated registered pickup, which is unfed); rulings R1-R8 in contracts.md, M2 reduced to a status line, Windows registration becomes a by-hand item for Ben
Log: 2026-09-26T20:10:00.000Z owned skills-n launch wf_fd1322af-501: setup succeeded, both builders and the integrator died on a revoked login token (401); partial uncommitted work left in both builder worktrees; relaunched in given mode on setup's worktrees and briefs with a recovery section
Log: 2026-09-26T20:46:21.499Z reviewed skills-n seam r1 APPROVE f3ec5333b9e91847fc86be4c4f7f98e9ea951a26
Log: 2026-09-26T20:54:34.000Z reviewed skills-n second-host suite on Windows at f3ec5333b9e91847fc86be4c4f7f98e9ea951a26: 1727 of 1727, log in evidence
Census: - leadTurns: 6
Census: - wallClockHours: 1.39
Census: - by-model: <synthetic>=0, claude-opus-5-5=8968140, claude-sonnet-5=16020955
Census: - by-role: accept-prep=724239, build=9972110, integrate=1129499, review=4211947, seam=581258, setup=3284649, unassigned=910458
Census: - subagentFiles: 72
Census: - Total assistant turns, deduped (whole file): **187**
Census: - Window assistant turns, deduped: **26**
Census: - leadTurns (conversational runs — see docs/census.md): **6**
Census: - Window: 2026-09-26T19:31:54.204Z .. 2026-09-26T20:55:03.959Z
Census: - Turns/hour in window: **18.76**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 372 | 835336 | 28558357 | 133739 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 50 | 193766 | 3962068 | 19051 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 192 | 356283 | 4357448 | 79282 |
Census: | claude-sonnet-5 | 562 | 745708 | 15094088 | 180597 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | accept-prep | 32 | 56552 | 652883 | 14772 |
Census: | build | 346 | 460031 | 9407374 | 104359 |
Census: | integrate | 46 | 63954 | 1056343 | 9156 |
Census: | review | 160 | 306010 | 3840371 | 65406 |
Census: | seam | 32 | 50273 | 517077 | 13876 |
Census: | setup | 78 | 125508 | 3116668 | 42395 |
Census: | unassigned | 60 | 39663 | 860820 | 9915 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | <synthetic> | 0 | 0 |
Census: | claude-opus-5-5 | 98333 | 8869807 |
Census: | claude-sonnet-5 | 180597 | 15840358 |
Four numbers: Top-tier tokens per build: 8968140 tokens: build 8968140 (claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 1.4h; largest gap 27.6min at 2026-09-26T20:20:06.223Z
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 0 gaps over 30min; 0 unanswered ASKs to skills-n
Log: 2026-09-26T20:55:04.000Z accepted skills-n artifact f3ec5333b9e91847fc86be4c4f7f98e9ea951a26

Observed: two territories, M1 docs (team-build, decisions skill and template, census.md, pane-setup.md) and M2 reduced by the lead's red-team ruling to the pickup state on note-flush --status, since registered pickup already reads the page on a Done flip and was only unfed. The first launch died on a revoked login token after setup; the relaunch recovered both builders' partial work. M1 and M2 each APPROVE by Opus after two rounds, seam APPROVE at f3ec533, integrator PASS on Netcup, sealed suite 1727 of 1727 on Windows from the pushed sha. Registration of pickup on Windows is left to Ben as a by-hand item; GOALS.md line 21 (Ben's word to merge) is not edited here.
