Work: wr-2026-09-27-sealed-home-leak
Scope: docs/specs/sealed-home-leak-1/spec.md (lane 24 of skills-fable's follow-up bundle, origin/docs/lane-specs-0925 at 7e92f16); territory scripts/test-home.mjs, scripts/test-home.test.mjs, scripts/run-tests.mjs, scripts/run-tests.test.mjs
Owner: skills-n
Status: closed
Authority: build, review, integrate, push build/sealed-home-leak-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; delete sealed-home-* temp dirs only through the suite's own cleanup and sweep
Next: none
Artifact: be8028019245ea7aa7b5e374242d603ae5326c37
Evidence: docs/work/evidence/wr-2026-09-27-sealed-home-leak-review.md, docs/work/evidence/wr-2026-09-27-sealed-home-leak-review-r1.md, docs/work/evidence/wr-2026-09-27-sealed-home-leak-review-r2.md, docs/work/evidence/wr-2026-09-27-sealed-home-leak-suites.md
Worktree: build/sealed-home-leak-1
Opened: 2026-09-27T20:31:01.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T20:15:00Z
Base: 0c926057a948c4365cf92d82d8fb584cbcc77dcd
Log: 2026-09-27T20:31:01.000Z owned skills-n picked up skills-fable-lane-24-1, ACK sent over ssh on ben-desktop, base 0c92605
Log: 2026-09-27T20:31:39.000Z owned skills-n Sonnet builder spawned on the four-file territory; /tmp holds 72 sealed-home dirs at pickup
Log: 2026-09-27T20:43:13.000Z delivered skills-n Sonnet builder DONE ea16c1f (report 2812595), territory gate 37 of 37; Opus reviewer spawned on 2812595
Log: 2026-09-27T20:52:25.000Z rejected skills-n Opus review r1 NEEDS_FIXES 2812595: F1 BLOCKER runner home still leaks and signal swallowed under spawnSync, F2 MAJOR keep-on-failure test not discriminating, F3 MINOR one unremovable dir aborts the sweep; lead rules F1-F3 in, F4 (re-raise with another listener) left to the spec session, R1 left. Spec-from corrected 20:40Z to 20:15Z per skills-fable-lane-24-3 (spec 04d771b)
Log: 2026-09-28T02:16:16.000Z rejected skills-n fix-round-1 builder stalled from 20:55:28Z (transcript mtime) on a compound command carrying rm -rf, likely held at a permission prompt; stopped by the lead at 2026-09-28T02:16:16.000Z with uncommitted edits to run-tests.mjs and run-tests.test.mjs; fresh builder spawned with the recovery prompt
Log: 2026-09-28T02:20:10.000Z delivered skills-n recovery builder DONE f8aa816 (F1 F2 F3; both discriminating checks fail on revert), territory gate 39 of 39; Opus delta review started
Log: 2026-09-28T02:24:56.000Z rejected skills-n Opus delta r2 NEEDS_FIXES f8aa816 (F1 F2 F3 fixed; N1 MAJOR: the F1 test signals before the sealed child exists, so it never reaches the keep path; N2 NIT: F3 untested). Windows full suite at f8aa816: 2360 of 2370, 3 fail, 7 skipped; 2 are lane defects (hooks.test N2 childEnv lint on both new CLI tests, and the F2 test ignoring TEMP/TMP on win32), 1 is the lead's bundle lacking origin/main. The first sweep on Windows removed 1743 stale homes
Log: 2026-09-28T02:34:49.000Z reviewed skills-n Opus delta r3 APPROVE be80280 (reviewer claude-opus-5-5, subagent ac06d17763ff792ba); Linux 2367 of 2371 and Windows 2363 of 2371, 0 fail; Netcup live count 129 before, 57 after one run, swept 72 older than 6 h
Census: - leadTurns: 10
Census: - wallClockHours: 6.07
Census: - by-model: claude-opus-5-5=10767259, claude-sonnet-5=12287877
Census: - by-role: unassigned=17042637
Census: - subagentFiles: 182
Census: - Total assistant turns, deduped (whole file): **714**
Census: - Window assistant turns, deduped: **48**
Census: - leadTurns (conversational runs — see docs/census.md): **10**
Census: - Window: 2026-09-27T20:31:02.002Z .. 2026-09-28T02:34:56.917Z
Census: - Turns/hour in window: **7.91**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 1426 | 2982326 | 117439360 | 463774 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 96 | 150044 | 5837095 | 25264 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 126 | 300616 | 4392835 | 61183 |
Census: | claude-sonnet-5 | 284 | 416491 | 11744740 | 126362 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 410 | 717107 | 16137575 | 187545 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 86447 | 10680812 |
Census: | claude-sonnet-5 | 126362 | 12161515 |
Four numbers: Top-tier tokens per build: 10767259 tokens: build 10767259 (claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 6.1h; largest gap 323.0min at 2026-09-27T20:52:45.401Z
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 2 gap(s) over 30min stalled; 1 waiting-on-agents (323.0 min); agent a4b99791b198900fe silent 320.7 min from 2026-09-27T20:55:28.952Z; agent ac06d17763ff792ba silent 328.2 min from 2026-09-27T20:52:08.881Z; 0 unanswered ASKs to skills-n
Log: 2026-09-28T02:34:59.000Z accepted skills-n artifact be8028019245ea7aa7b5e374242d603ae5326c37
Log: 2026-09-28T02:36:51.000Z closed skills-n merge 71f8351b86463f74859856d90dd7b8e8486bac2d

Observed: the sealed test home no longer outlives its suite on a kill. A group SIGINT, SIGTERM or SIGHUP now exits 130, 143 or 129 with no home left. Before the fix the exit code was 1 and the runner home leaked. A failed suite still keeps its home. On Netcup one full run swept 72 stale homes, 129 before and 57 after, all 57 younger than 6 h. On Windows the first run swept 1743. F4 (re-raise with another listener) and R1 (pid-only SIGTERM waits for the suite) are deferred to the spec session.
