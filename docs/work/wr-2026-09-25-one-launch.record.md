Work: wr-2026-09-25-one-launch
Scope: docs/specs/2026-09-25-build-loop-workflow.md (lane four, read at origin/docs/lane-specs-0925 388bcdc) with lead rulings docs/specs/one-launch-1/contracts.md; territories L1 (skills/team-build/references/build-loop-workflow.js, .test.mjs, args examples, scout-brief.md) and L2 (skills/team-build/SKILL.md), plus the L1-L2 seam
Owner: skills-n
Status: accepted
Authority: build, review, integrate and push build/one-launch-1 on green without Ben; merge to main waits for Ben's word
Artifact: build/one-launch-1@55106db2acd9a5b1152cb5f71ee2482811ec791f
Worktree: build/one-launch-1
Evidence: docs/work/evidence/wr-2026-09-25-one-launch-L1.md, docs/work/evidence/wr-2026-09-25-one-launch-L2.md, docs/work/evidence/wr-2026-09-25-one-launch-seam.md
Next: launch 1 (0.20.9 loop, build + one review round), then launch 2 (the new script) for fix rounds, integration, seam and accept-prep
Opened: 2026-09-25T22:30:00.000Z
Log: 2026-09-25T22:45:00.000Z owned skills-n launch 1 dispatched, L1 and L2 Sonnet builders via the 0.20.9 loop, maxRounds 1
Log: 2026-09-25T23:12:00.000Z rejected skills-n launch 1 returned (wf_21356b5b-b4b): L1 NEEDS_FIXES(15) at 41c4d43, L2 NEEDS_FIXES(10) at 21c313d, maxRounds 1 by design; launch-1 baseSha arg was typed fbd7cf6a (wrong, real fbd7cf62), used only in the dry integrator prompt
Log: 2026-09-25T23:14:00.000Z owned skills-n launch 2 dispatched with the new script frozen at L1 41c4d43, startFrom NEEDS_FIXES for L1 and L2
Log: 2026-09-25T23:33:00.000Z delivered skills-n launch 2 returned (wf_a8895a4c-118): L1 APPROVE r2 at c3a97b1, L2 APPROVE r3 at 0915fb6, integrator FAIL on two skills/multi tests at head be2a30b, seam SKIPPED, accept-prep skipped
Log: 2026-09-25T23:36:00.000Z owned skills-n lead reproduced both failing files at base fbd7cf6 (134 pass, 2 fail, mirror-shim and note-send tests): gate ruled no-new-failure-vs-base; launch 3 with the approved script at c3a97b1, startFrom APPROVE both, for integrate, seam and accept-prep
Log: 2026-09-25T23:46:19.000Z reviewed skills-n seam r3 APPROVE 55106db
Census: - leadTurns: 6
Census: - wallClockHours: 1.18
Census: - by-model: claude-opus-5-5=10513894, claude-sonnet-5=35867432
Census: - by-role: accept-prep=1108709, build=18670528, integrate=1762448, review=3700287, seam=2265166, seam-fix=14325747
Census: - subagentFiles: 19
Census: - Total assistant turns, deduped (whole file): **45**
Census: - Window assistant turns, deduped: **39**
Census: - leadTurns (conversational runs — see docs/census.md): **6** (of 7 in the whole file, unwindowed)
Census: - Window: 2026-09-25T22:37:28.716Z .. 2026-09-25T23:48:24.967Z
Census: - Turns/hour in window: **32.99**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 90 | 128590 | 4705149 | 33774 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 78 | 99229 | 4417239 | 31895 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 270 | 527193 | 5299756 | 138234 |
Census: | claude-sonnet-5 | 842 | 1030637 | 34512644 | 323309 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | accept-prep | 48 | 63858 | 1029728 | 15075 |
Census: | build | 386 | 597330 | 17869055 | 203757 |
Census: | integrate | 96 | 137580 | 1589513 | 35259 |
Census: | review | 164 | 335983 | 3276466 | 87674 |
Census: | seam | 106 | 191210 | 2023290 | 50560 |
Census: | seam-fix | 312 | 231869 | 14024348 | 69218 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 170129 | 10343765 |
Census: | claude-sonnet-5 | 323309 | 35544123 |
Log: 2026-09-25T23:48:25.485Z accepted skills-n artifact 55106db2acd9a5b1152cb5f71ee2482811ec791f

Observed: three Workflow launches from this pane. Launch 1 (0.20.9 loop, maxRounds 1) built L1 and L2, both NEEDS_FIXES. Launch 2 (new script at L1 41c4d43, startFrom NEEDS_FIXES) approved L1 r2 c3a97b1 and L2 r3 0915fb6, integrator FAIL on two base-failing skills/multi tests. Launch 3 (approved script c3a97b1, startFrom APPROVE) ran integrate PASS, seam 3 rounds APPROVE at 55106db, census, check-acceptance PASS in one return. Lead reran the sealed suite at 55106db: 1590 pass, 2 fail, H6 and V4, the same two named tests that fail at base fbd7cf6.
