Work: wr-2026-09-28-test-temp-hygiene
Scope: docs/specs/test-temp-hygiene-1/spec.md (lane 46 lead spec, rulings P1 to P6) from packet docs/specs/test-temp-hygiene-1/packet.md (skills-fable-lane-46-1, from skills-n-release-0-20-17-2)
Owner: skills-n
Status: accepted
Authority: build, review, integrate, push build/test-temp-hygiene-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; the live proof runs one full suite on Netcup; no release, no install, no manual deletion under /tmp
Next: accept, merge into main, close, publish, RESULT to skills-fable; live on hosts only after the next release; the m3 file-leak pin (review r2 NIT 1) is a follow-up
Artifact: 3ff71effc9cb9933edcb7446d1412e32bd2b8f98
Evidence: docs/work/evidence/wr-2026-09-28-test-temp-hygiene-review.md, docs/work/evidence/wr-2026-09-28-test-temp-hygiene-review-r1.md, docs/work/evidence/wr-2026-09-28-test-temp-hygiene-suites.md, docs/work/evidence/wr-2026-09-28-test-temp-hygiene-live.md
Worktree: build/test-temp-hygiene-1
Opened: 2026-09-28T22:03:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-28T22:05:00Z
Base: 357fc15d5d2daaf47a9655246a16b852210f0117
Log: 2026-09-28T22:06:59.000Z owned skills-n picked up skills-fable-lane-46-1, ACK sent; lead spec written with rulings P1 to P6 after reading run-tests.mjs and test-home.mjs at 357fc15 (checkSeal forces the sealed home inside the per-run root); Sonnet builder spawned
Log: 2026-09-28T22:23:36.000Z delivered skills-n Sonnet builder DONE 2455f1d (per-run root with TMPDIR TEMP TMP, sealed home inside it, trim on failure, signal removal, 24 h dead-pid sweep, leak check line; one straggler, the nested --no-sweep CLI test, fixed); four full runs each read leak check: 0 new temp entries, two with 0 fail, one straggler fail before the fix, one note-flush H4 timing flake; Opus review and Windows suite started
Log: 2026-09-28T22:35:53.000Z rejected skills-n Opus review r1 NEEDS_FIXES 2455f1d: M1 the kept home is deleted under a symlinked temp dir, M2 the leak regex misses about 18 test prefix families, M3 Windows leak check red; the lead resolved M3 as concurrent runs (four-read and backlog-notice alone read 0 on Windows, and a concurrent legacy full suite was seen), and ruled the leak check a reader, not a gate (lead-ruling-r1.md); the reviewer re-ran a hook-denied grep with a narrower pattern, recorded
Log: 2026-09-28T22:43:27.000Z delivered skills-n fix builder DONE 3ff71ef (R1 reader not gate, R2 nested run skips the check, M1 M2 m1 to m3 n2 n3 as patched; the M1 symlink, m1 EPERM and R2 nested tests each fail with their fix reverted); full 2665 of 2670, 0 fail, leak check: 0 new temp entries; Opus delta r2 and Windows suite started
Log: 2026-09-28T22:47:25.000Z reviewed skills-n Opus reviewer adac9198d7d100193 delta r2 VERDICT: APPROVE 3ff71ef (M1 M2 m1 to m4 n2 n3 R1 R2 verified by mutation; NIT 1, m3 unpinned, left as a follow-up); Windows 2656 and Netcup 2665 of 2670, 0 fail, leak check 0 on both; live proof /tmp prefix count 30588 before and after one full suite
Census: - leadTurns: 10
Census: - wallClockHours: 0.74
Census: - by-model: claude-opus-5-5=14735966, claude-sonnet-5=13105453
Census: - by-role: unassigned=18253846
Census: - subagentFiles: 205
Census: - Total assistant turns, deduped (whole file): **1158**
Census: - Window assistant turns, deduped: **61**
Census: - leadTurns (conversational runs — see docs/census.md): **10**
Census: - Window: 2026-09-28T22:03:03.123Z .. 2026-09-28T22:47:25.681Z
Census: - Turns/hour in window: **82.48**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 2314 | 3842815 | 192359891 | 754763 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 122 | 94995 | 9448929 | 43527 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 116 | 279204 | 4800872 | 68201 |
Census: | claude-sonnet-5 | 224 | 309037 | 12679464 | 116728 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 340 | 588241 | 17480336 | 184929 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 111728 | 14624238 |
Census: | claude-sonnet-5 | 116728 | 12988725 |
Four numbers: Top-tier tokens per build: unavailable (no census)
Four numbers: Hours ask to accepted: 0.7h; gap unavailable (no lead transcript)
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: gaps unavailable (no lead transcript); 1 unanswered ASK(s) to skills-n: skills-fable-lane-47-1
Log: 2026-09-28T22:47:28.000Z accepted skills-n artifact 3ff71effc9cb9933edcb7446d1412e32bd2b8f98

Scratch directory for this lane (in the body until lane 36 lands the header field): /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-46

Observed: one full suite on Netcup from the branch left /tmp unchanged. The LEAK_PREFIX_RE entry count stayed at 30588 before and after, the test-run roots stayed at 2 before and after, used inodes went from 400749 to 400752 on a shared host, and the run printed leak check: 0 new temp entries. Windows and Netcup both passed with 0 fail and a clean leak check at 3ff71ef. Before this lane, one full suite left about 1,300 test directories in the real temp dir.

Predicts: after the next release, Netcup /tmp inode use stops climbing with each suite run. Nobody has to delete test directories by hand, and no session dies on a full /tmp (work lost or stalled). The leak check: line in suite logs reads 0 except when a legacy runner or a direct node --test run overlaps.

Stall: the watcher named in the Log lines is the lead's transcript watcher on each spawned agent. No agent went quiet; every one reported inside its ETA.
