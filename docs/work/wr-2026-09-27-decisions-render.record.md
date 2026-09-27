Work: wr-2026-09-27-decisions-render
Scope: docs/specs/2026-09-27-decisions-render.md@952c6ef (origin/docs/lane-specs-0925), section Lane 26, decisions-render
Owner: skills-o
Status: closed
Authority: skills-fable ASK skills-fable-lane-26-1: build, review, live proof on the decisions page (dry-run plus one publish after a session.md edit), merge on acceptance under the standing grant of 2026-09-26, Closed bullet in docs/decisions/history in the merge commit. No release, chezmoi or install. Never fake owner input.
Artifact: build/decisions-render-1@4a2b21c279e058f98cc009747ce1162c64d7930f
Worktree: build/decisions-render-1
Evidence: docs/work/evidence/wr-2026-09-27-decisions-render-review-r3.md
Next: accept, merge with the history bullet and Summary line, one real publish from main after a session.md edit, readback diff only in This session
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T21:00:00Z
Base: d153389a2eea3e8008c2038360ab5d74f92a9adf
Opened: 2026-09-27T20:51:05Z
Log: 2026-09-27T20:51:05Z owned skills-o pack at C:/Users/benzh/Code/decisions-render/pack, live page read saved as pack/live-page.md
Log: 2026-09-27T22:40:07Z delivered skills-o Sonnet builder, three rounds: a806bb3 (r1), e2ceba8 (r2), 4a2b21c279e058f98cc009747ce1162c64d7930f (r3); gate 451/451
Log: 2026-09-27T22:40:07Z reviewed skills-o Opus APPROVE 4a2b21c279e058f98cc009747ce1162c64d7930f after Opus NEEDS_FIXES on a806bb3 (1 blocker, 5 major) and on e2ceba8 (1 new blocker); live publish --dry-run exit 0 equal to the live page; Netcup 2446/2450 0 fail 4 skipped
Census: - leadTurns: 9
Census: - wallClockHours: 1.82
Census: - by-model: claude-opus-5-5=13529007, claude-sonnet-5=59654810
Census: - by-role: unassigned=68424276
Census: - subagentFiles: 66
Census: - Total assistant turns, deduped (whole file): **237**
Census: - Window assistant turns, deduped: **22**
Census: - leadTurns (conversational runs — see docs/census.md): **9**
Census: - Window: 2026-09-27T20:51:09.028Z .. 2026-09-27T22:40:16.709Z
Census: - Turns/hour in window: **12.10**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 474 | 1919930 | 36039407 | 136356 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 44 | 29222 | 4717235 | 13040 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 190 | 446872 | 8224916 | 97488 |
Census: | claude-sonnet-5 | 814 | 1117562 | 58179284 | 357150 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 1004 | 1564434 | 66404200 | 454638 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 110528 | 13418479 |
Census: | claude-sonnet-5 | 357150 | 59297660 |
Four numbers: Top-tier tokens per build: 13529007 tokens: build 13529007 (claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 1.8h; largest gap 49.1min at 2026-09-27T20:51:30.581Z
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 1 gap(s) over 30min stalled; 2 waiting-on-agents (80.1 min); agent a08096cc56c5a4a93 silent 31.5 min from 2026-09-27T21:52:18.672Z; 0 unanswered ASKs to skills-o
Log: 2026-09-27T22:40:17.000Z accepted skills-o artifact 4a2b21c279e058f98cc009747ce1162c64d7930f
Log: 2026-09-27T22:43:36Z closed skills-o merged to main at a4ae147 after the merged-tree suite passed 2477/2479 with 0 fail on Windows; first real publish d58835f at 2026-09-27T22:43:15Z (18:43 NY) after editing one session.md bullet: exit 0, backup 2026-09-27T22-43-16-196Z.md, title Skills: 9/27 6:43PM Decisions, readback diff against the previous last-render.md touches only the edited This-session bullet and the Sep 27 History bullet whose Summary changed in the merge
Log: 2026-09-27T22:43:36Z gap skills-o publish renders the working tree and commits only last-render.md, so a lead-edited session.md stayed uncommitted until the lead committed it by hand; follow-up: publish should refuse uncommitted source files under docs/decisions

Observed: round 1 would have made every real --clear-done exit 4 (drift compared against a page still holding the owner input); round 2 fixed that but read the pickup status from the wrong field, so every real --clear-done exited 3; round 3 fixed it with a test on the real receipt shape, and the Opus end-to-end probe (real pickup receipt, real reader and git, fake Notion and push) dropped only the committed owner line and cleared Done. Open minors: M3(b), M3(c), M5, M9 deferred with reasons in review-r2; the Done-line refusal names the item last line rather than the Done line (decisions-render-core.mjs:282, patch in review-r3). No clear-done round runs live: faking owner input on the real page is forbidden, so that path is proved by unit test and the scratch probe only.

Predicts: the page is never again written except by publish; the next hand or anchored edit makes the next publish exit 4 instead of silently growing the page.
