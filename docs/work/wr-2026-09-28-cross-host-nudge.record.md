Work: wr-2026-09-28-cross-host-nudge
Scope: docs/specs/cross-host-nudge-1/packet.md (lane 43, skills-fable's pickup packet) and the "Lane 43" sentences of docs/specs/cross-host-nudge-1/spec.md (bundle spec at dc16de3 on origin/docs/lane-specs-0925)
Owner: skills-n
Status: accepted
Authority: build, review, integrate, push build/cross-host-nudge-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; one live proof note to skills-h on Hetzner, labelled as a proof; the live Netcup collector unit is not changed
Next: accept, merge into main, close, publish, RESULT to skills-fable; going live on Netcup needs a release and a reinstall of the collector timer from the new cache
Artifact: 4cb22f16383e5ccb6d17b5e2e64d8c05a9cb900d
Evidence: docs/work/evidence/wr-2026-09-28-cross-host-nudge-review.md, docs/work/evidence/wr-2026-09-28-cross-host-nudge-review-r1.md, docs/work/evidence/wr-2026-09-28-cross-host-nudge-suites.md, docs/work/evidence/wr-2026-09-28-cross-host-nudge-live.md
Worktree: build/cross-host-nudge-1
Opened: 2026-09-28T19:56:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-28T19:03:14Z
Base: 14174e81dfc49a18018fc07d246a30f35bd39f80
Log: 2026-09-28T19:56:28.000Z owned skills-n picked up skills-fable-lane-43-1, ACK sent; Sonnet builder spawned, ETA 45 min, watcher on its transcript
Log: 2026-09-28T20:06:37.000Z delivered skills-n Sonnet builder DONE c12a494 (owner_hosts in .agents/project.json, --sender-host from the owner's host); Opus review r1 and Windows suite started
Log: 2026-09-28T20:13:14.000Z rejected skills-n Opus review r1 NEEDS_FIXES c12a494 (Windows 2588 of 2600, 0 fail). Rulings: F1 in, because the mirror writes the owner's ~/.agents/notes (what note-inbox reads), not its docs/ledger, so the census lines and the live proof read the notes mirror and the packet's docs/ledger wording is amended here (no new transport); F2 F3 F5 in as patched; F4 the duplicate gate log removed by the lead in this commit; F6 in as the reviewer's alternative, owner_hosts read from origin/main:.agents/project.json with the working tree as fallback, because the timer's --repo is the parked checkout at 0c92605
Log: 2026-09-28T20:26:35.000Z delivered skills-n fix builder DONE 4cb22f1 (F1 F2 F3 F5 F6 as ruled), unit 81 of 81, full 2601 of 2606 with 0 fail; proof harness written in scratch, dry-run only; Opus delta r2 and Windows suite started
Log: 2026-09-28T20:34:43.000Z reviewed skills-n Opus reviewer a59ef3b3dbd0ae94c delta r2 VERDICT: APPROVE 4cb22f1 (F1 F2 F3 F5 F6 verified); Windows 2594 of 2606 and Linux 2601 of 2606, 0 fail; live proof id collect-proof-host-stall-build-proof-cross-host-1-d7d73c1-1 read back once from Hetzner's ~/.agents/notes
Census: - leadTurns: 9
Census: - wallClockHours: 0.64
Census: - by-model: claude-opus-5-5=11623981, claude-sonnet-5=11106894
Census: - by-role: unassigned=16220884
Census: - subagentFiles: 196
Census: - Total assistant turns, deduped (whole file): **940**
Census: - Window assistant turns, deduped: **33**
Census: - leadTurns (conversational runs — see docs/census.md): **9**
Census: - Window: 2026-09-28T19:56:07.521Z .. 2026-09-28T20:34:48.456Z
Census: - Turns/hour in window: **51.19**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 1878 | 3486075 | 157920376 | 610205 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 66 | 103536 | 6381521 | 24868 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 120 | 247102 | 4806266 | 60502 |
Census: | claude-sonnet-5 | 262 | 278586 | 10728411 | 99635 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 382 | 525688 | 15534677 | 160137 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 85370 | 11538611 |
Census: | claude-sonnet-5 | 99635 | 11007259 |
Four numbers: Top-tier tokens per build: unavailable (no census)
Four numbers: Hours ask to accepted: 0.6h; gap unavailable (no lead transcript)
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: gaps unavailable (no lead transcript); 1 unanswered ASK(s) to skills-n: skills-fable-lane-43-1
Log: 2026-09-28T20:34:53.000Z accepted skills-n artifact 4cb22f16383e5ccb6d17b5e2e64d8c05a9cb900d

Scratch directory for this lane (in the body until lane 36 lands the header field): /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-43

Observed: one live run of collect-status at 4cb22f1 on Netcup sent one ASK to skills-h with --sender-host zhuk-vps32; note-send reported mirrorLedger ok for zhuk-vps32, and grep -c of the id in Hetzner's ~/.agents/notes/2026-09-28.md read 1 over ssh. Before this lane the same ASK was written only on Netcup, where skills-h never reads.

Predicts: after a release and a reinstall of the Netcup collector timer from the new cache, the next stall ASK for a lane owned by skills-h or skills-n shows up in note-inbox on the owner's own host within one timer pass, and the census counts it from the notes mirror (work lost or stalled).

Stall: the watcher named in the Log lines is the lead's transcript watcher on each spawned agent; no agent went quiet, every one reported inside its ETA.
