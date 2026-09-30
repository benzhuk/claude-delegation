Work: wr-2026-09-29-baseline
Scope: docs/notes/skills-fable-baseline-61-1.md, from skills-fable-baseline-61-1; measure: all four, the baseline makes them comparable to a hand-run build
Owner: skills-o
Status: accepted
Authority: skills-fable ASK skills-fable-baseline-61-1 on Ben's ticks read 5:51 PM NY 9/29: hand-run baseline and continue census, merge under the standing grant
Artifact: build/baseline-61@8abcc84c2365a8e389424a95fc8dd04140ef8c1a
Worktree: build/baseline-61
Evidence: docs/work/evidence/wr-2026-09-29-baseline-review.md
Next: accept, merge, close, then the continue retire lane
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-29T21:54:00Z
Scratch: C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/588290d9-ee43-400b-a808-cf44c407171c/baseline-61
Base: 8541bc1795da2df603a7fac7e434d5fab8ccf84b
Opened: 2026-09-29T21:54:57Z
Log: 2026-09-29T21:54:57Z owned skills-o lane 61 taken (Scratch: C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/588290d9-ee43-400b-a808-cf44c407171c/baseline-61)
Log: 2026-09-30T13:39:29Z delivered skills-o Sonnet runners pulled candidates and the continue census, Opus marked five builds; baseline docs/work/evidence/baseline/hand-run-baseline.md, census docs/work/evidence/continue/census-0929.md
Log: 2026-09-30T13:39:29Z reviewed skills-o Opus APPROVE 8abcc84c2365a8e389424a95fc8dd04140ef8c1a (r1 one wrong build number, fixed)
Log: 2026-09-30T13:39:29Z verified skills-o baseline medians 17298421 top-tier tokens, 4.70 h ask to accepted, 0 rework, 1 lost or stalled; continue skill 0 invocations on Windows, Netcup and Hetzner, Mac unreachable
Census: - leadTurns: 9
Census: - wallClockHours: 15.75
Census: - wakes: 3 (3 note-flush, 0 Done-tick)
Census: - wakeSplit: wake 4, stopBlock 0, other 5 (coalescable 0 at hold 10m — see "Wake-opened turns" below)
Census: - stopBlocks: 0
Census: - stallNudges: unavailable (ledger dir unreadable)
Census: - by-model: claude-opus-5-5=6676166, claude-sonnet-5-5=6857946
Census: - by-role: unassigned=10490245
Census: - subagentFiles: 85
Census: - Total assistant turns, deduped (whole file): **489**
Census: - Window assistant turns, deduped: **26**
Census: - leadTurns (conversational runs — see docs/census.md): **9**
Census: - Wakes (turns opened by a note-flush or Done-tick line, see docs/census.md): **3** (3 note-flush, 0 Done-tick)
Census: - Stop-blocks (multi-inbox Stop hook blocks): **0**
Census: - Stall nudges received (ledger `collect-*-stall-*` ASKs to the lead's slug, in the window): **unavailable (ledger dir unreadable)**
Census: - Window: 2026-09-29T21:55:00.178Z .. 2026-09-30T13:40:09.041Z
Census: - Turns/hour in window: **1.65**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 976 | 3208643 | 71913711 | 262571 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 52 | 120510 | 2908755 | 14550 |
Census: - wakeTurns: 4, stopBlockTurns: 0, otherTurns: 5
Census: - cache_creation per turn (M6) — wake: claude-opus-5-5=25022.5; other: claude-opus-5-5=4084.0
Census: - coalescable (W1b, hold 10m, RESULT wakes only, Done-tick excluded): turns 0, upper (none), lower (none); ceiling (every RESULT wake turn) turns 1, claude-opus-5-5=501062
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 106 | 190815 | 3390567 | 50811 |
Census: | claude-sonnet-5-5 | 160 | 278427 | 6487654 | 91705 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 266 | 469242 | 9878221 | 142516 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 65361 | 6610805 |
Census: | claude-sonnet-5-5 | 91705 | 6766241 |
Four numbers: Top-tier tokens per build: 6676166 tokens: build 6676166 (claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 15.8h; largest gap 916.9min at 2026-09-29T22:13:52.911Z
Four numbers: Rework after acceptance: 1 commit(s) touching build files within 7 days: de37916 "docs: lane 61 record scratch"; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 1 gap(s) over 30min stalled: 2026-09-29T22:13:52.911Z (916.9min); 0 waiting-on-agents (0.0 min); 0 unanswered ASKs to skills-o; wakes 3 (3 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-o
Log: 2026-09-30T13:40:10.000Z accepted skills-o artifact 8abcc84c2365a8e389424a95fc8dd04140ef8c1a

Observed: the census had no hand-run number to beat, so the DONE line's four-measure comparison could not be made.
Predicts: the next plugin-led build's four-read compares against these medians, and the continue retire lane removes a skill with zero use.
