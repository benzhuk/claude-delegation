Work: wr-2026-09-26-collect-from-origin
Scope: docs/specs/collect-from-origin-1/spec.md (read at origin/docs/lane-specs-0925 ce7ca65) with lead rulings docs/specs/collect-from-origin-1/contracts.md; territories C1 (collector script, test, docs/census.md) and C2 (team-build and decisions skills, decision-item template)
Owner: skills-n
Status: accepted
Authority: build, review, integrate, push build/collect-from-origin-1 on green, and post its merge item to Ben's decisions page, without Ben; merge to main waits for Ben's word
Artifact: build/collect-from-origin-1@645eb79d39df7c35525e2c5b92bdaff20eb6352c
Evidence: docs/work/evidence/wr-2026-09-26-collect-from-origin-C1.md, docs/work/evidence/wr-2026-09-26-collect-from-origin-C2.md, docs/work/evidence/wr-2026-09-26-collect-from-origin-seam.md, docs/work/evidence/wr-2026-09-26-collect-from-origin-C1-r5.md, docs/work/evidence/wr-2026-09-26-collect-from-origin-merge-645eb79.md
Next: accept, push, post the merge item to Ben's decisions page, RESULT to skills-fable
Opened: 2026-09-26T12:12:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-26T08:11:46-04:00
Base: 5f057a3959323bd0fd01231e6fe6d47688991cec
Worktree: build/collect-from-origin-1
Log: 2026-09-26T12:16:00.000Z owned skills-n launch dispatched, setup mode, script frozen from build/one-launch-1 55106db; ACK sent from Netcup over ssh on ben-desktop (Windows ledger)
Log: 2026-09-26T12:22:00.000Z owned skills-n first launch (wf_63e2ed2a-6c7) stopped seconds in, before setup created anything, on skills-fable's base ruling; relaunched on the local merge of ac9c842 and 05b9bcc
Log: 2026-09-26T13:15:49.000Z rejected skills-n launch wf_b9df59bc-46c returned: C2 APPROVE r2 at 1468a63 (merged, head 297d593); C1 NEEDS_FIXES(1) after 3 rounds at 0bf8be8, only F4 (77 runtime lines vs pinned 60); integrator sealed suite no-new-failure PASS, dogfood blocked because C1 was excluded
Log: 2026-09-26T13:16:38.000Z owned skills-n lead ruling docs/specs/collect-from-origin-1/reports/C1-lead-ruling-r4.md: 60-line pin WAIVED at real size, layout-only fix round; relaunch with C1 startFrom NEEDS_FIXES, C2 startFrom APPROVE
Log: 2026-09-26T13:34:35.000Z delivered skills-n (lines 17-19 re-timed from the lead transcript after accept; the hand-typed estimates were wrong, one was in the future; launch-2 startedAt arg said 09:38 NYC, real 09:16) launch wf_5aa4c182-f5e returned: C1 APPROVE r4 at 4843ef7 (layout-only), C2 APPROVE (startFrom), integrator PASS at 8de9e42 (no new failure vs base), seam r1 APPROVE at 8de9e42; accept-prep replaced the whole record header with five lines (defect), lead restored the record from 2166a26 and wrote the lines by hand
Log: 2026-09-26T13:35:12.000Z reviewed skills-n seam r1 APPROVE 8de9e42aa5e05658956e5253a428f3ae9dc38db3
Log: 2026-09-26T13:49:20.000Z rejected skills-n rework after acceptance: 5 of 21 collector tests fail on Windows (path separators), skills-fable rerun at 33aa023; fix round dispatched per docs/specs/collect-from-origin-1/reports/C1-windows-findings.md
Census: - leadTurns: 4
Census: - wallClockHours: 1.37
Census: - by-model: claude-opus-5-5=11626687, claude-sonnet-5=23262339
Census: - by-role: accept-prep=1023151, build=18915296, integrate=1822687, review=5277155, seam=690518, setup=1501205
Census: - subagentFiles: 37
Census: - Total assistant turns, deduped (whole file): **79**
Census: - Window assistant turns, deduped: **31**
Census: - leadTurns (conversational runs — see docs/census.md): **4**
Census: - Window: 2026-09-26T12:12:57.300Z .. 2026-09-26T13:35:14.554Z
Census: - Turns/hour in window: **22.60**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 158 | 466150 | 10475377 | 56151 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 62 | 333311 | 5306567 | 19074 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 294 | 402794 | 5430020 | 134565 |
Census: | claude-sonnet-5 | 674 | 864748 | 22094170 | 302747 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | accept-prep | 44 | 65018 | 943041 | 15048 |
Census: | build | 488 | 577227 | 18106487 | 231094 |
Census: | integrate | 92 | 111898 | 1682272 | 28425 |
Census: | review | 254 | 355044 | 4800578 | 121279 |
Census: | seam | 40 | 47750 | 629442 | 13286 |
Census: | setup | 50 | 110605 | 1362370 | 28180 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 153639 | 11473048 |
Census: | claude-sonnet-5 | 302747 | 22959592 |
Four numbers: Top-tier tokens per build: unavailable (no census)
Four numbers: Hours ask to accepted: 1.4h; gap unavailable (no lead transcript)
Four numbers: Rework after acceptance: unavailable (git: Command failed: git -C . diff --name-only ac9c842+05b9bcc..8de9e42aa5e05658956e5253a428f3ae9dc38db3)
Four numbers: Work lost or stalled: gaps unavailable (no lead transcript); 1 unanswered ASK(s) to skills-n: skills-fable-collect-from-origin-1
Log: 2026-09-26T13:35:18.000Z accepted skills-n artifact 8de9e42aa5e05658956e5253a428f3ae9dc38db3
Log: 2026-09-26T13:58:51.000Z reviewed skills-n C1 r5 APPROVE 5e67b85 (Windows path fix; builder ran 22 of 22 on ben-desktop), integrator PASS at 645eb79; Base rewritten to the one merge sha 5f057a3 (lane seven rule), Base-of keeps the two parents
Log: 2026-09-26T14:01:04.000Z reviewed skills-n Opus merge delta review 8de9e42..645eb79 APPROVE 645eb79d39df7c35525e2c5b92bdaff20eb6352c
Census: - leadTurns: 10
Census: - wallClockHours: 1.80
Census: - by-model: claude-opus-5-5=21275903, claude-sonnet-5=32730602
Census: - by-role: accept-prep=1023151, build=25484716, integrate=2520617, review=5542876, seam=690518, setup=3702118, unassigned=170432
Census: - subagentFiles: 43
Census: - Total assistant turns, deduped (whole file): **118**
Census: - Window assistant turns, deduped: **70**
Census: - leadTurns (conversational runs — see docs/census.md): **10**
Census: - Window: 2026-09-26T12:12:57.300Z .. 2026-09-26T14:01:04.314Z
Census: - Turns/hour in window: **38.85**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 236 | 524101 | 19600951 | 85611 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 140 | 391262 | 14432141 | 48534 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 338 | 454496 | 5801657 | 147335 |
Census: | claude-sonnet-5 | 912 | 1331029 | 30967845 | 430816 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | accept-prep | 44 | 65018 | 943041 | 15048 |
Census: | build | 626 | 890010 | 24271209 | 322871 |
Census: | integrate | 128 | 164190 | 2316531 | 39768 |
Census: | review | 280 | 383536 | 5031541 | 127519 |
Census: | seam | 40 | 47750 | 629442 | 13286 |
Census: | setup | 114 | 211811 | 3437064 | 53129 |
Census: | unassigned | 18 | 23210 | 140674 | 6530 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 195869 | 21080034 |
Census: | claude-sonnet-5 | 430816 | 32299786 |
Four numbers: Top-tier tokens per build: unavailable (census window ends 2026-09-26T14:01:04.314Z, after the last acceptance)
Four numbers: Hours ask to accepted: 1.4h; largest gap 61.0min at 2026-09-26T12:14:48.050Z
Four numbers: Rework after acceptance: 3 commit(s) touching build files within 7 days: 5e67b85 "fix(collect-from-origin): round-5 Windows path-separator fix (skills-fable findings)", 5da8fb9 "docs(work): collect-from-origin reopened for the Windows path fix", 33aa023 "docs(work): accept wr-2026-09-26-collect-from-origin at 8de9e42 with census, four-read, collector table and reports"; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 1 gap(s) over 30min: 2026-09-26T12:14:48.050Z (61.0min); 1 unanswered ASK(s) to skills-n: skills-fable-collect-from-origin-1
Log: 2026-09-26T14:01:05.000Z accepted skills-n artifact 645eb79d39df7c35525e2c5b92bdaff20eb6352c

Base parents (Base-of, kept in the body because work-record.mjs rejects an unknown header label): ac9c842d9fc865345ad725b90ecb617cc2e3cb82, 05b9bcce1bd7a6d1cc2bd95f6339e9a7176020b2

Observed: lane six built through the one-launch script (build/one-launch-1 55106db) in setup mode: one launch created worktrees, scout files and briefs, built and reviewed both territories (C2 APPROVE r2; C1 rounds-exhausted on the 60-line pin only), a lead ruling waived the pin, and a second launch closed C1, integration, seam and accept-prep. The collector, run read-only by the lead from wt-collect-1 against the main checkout at 2026-09-26T13:35:12.000Z, printed:

```
branch	tipSha	tipDate	recordPath	status	artifactSha	merged	hoursSinceLog	state
build/collect-from-origin-1	2166a2612af06847990a962cd73ae30ef82c247b	2026-09-26T09:16:14-04:00	docs/work/wr-2026-09-25-one-launch.record.md	accepted	55106db2acd9a5b1152cb5f71ee2482811ec791f	false	13.77	accepted-unmerged
build/collect-from-origin-1	2166a2612af06847990a962cd73ae30ef82c247b	2026-09-26T09:16:14-04:00	docs/work/wr-2026-09-26-collect-from-origin.record.md	rejected	-	-	0	rejected
build/decisions-actions-1	f82ecb4706a6b45c9ad0035d3e865261dae01d49	2026-09-26T07:37:14-04:00	-	-	-	-	-	no-record
build/one-launch-1	05b9bcce1bd7a6d1cc2bd95f6339e9a7176020b2	2026-09-25T19:48:33-04:00	docs/work/wr-2026-09-25-one-launch.record.md	accepted	55106db2acd9a5b1152cb5f71ee2482811ec791f	false	13.77	accepted-unmerged
docs/bearings-0925	7dfc59d7393a2e1b8648c78fca1304bc7c58b559	2026-09-25T10:33:58-04:00	-	-	-	-	-	no-record
docs/bearings-0926	c3605a0b94e3a0e36eceb049f196b423b912445c	2026-09-26T08:12:33-04:00	-	-	-	-	-	no-record
docs/lane-specs-0925	ce7ca6508b5c102444451f61ceaf37da91723894	2026-09-26T08:11:46-04:00	-	-	-	-	-	no-record
feat/working-smarter	6363a62012fb09e98b2b8ebbe4bba1e64bad0795	2026-09-20T12:51:37-04:00	-	-	-	-	-	no-record
```
