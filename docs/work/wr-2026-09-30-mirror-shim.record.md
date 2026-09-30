Work: wr-2026-09-30-mirror-shim
Scope: docs/specs/mirror-shim-59b/spec.md (lane 59b), from skills-fable-janitor-59-4, written by the lead at b52757b9d78c328a4a3a4faaecec2581fa233e18
Owner: skills-n
Status: accepted
Authority: build and review on plugin branch build/mirror-shim-59b-1; merge on acceptance under the standing grant of 2026-09-26
Next: accept, merge to main, close, RESULT to skills-fable
Artifact: 9bc94906728cb412a549d6147d44222f247fc8be
Evidence: docs/work/evidence/wr-2026-09-30-mirror-shim-review.md, docs/work/evidence/wr-2026-09-30-mirror-shim-windows.md
Worktree: /var/tmp/lane-59b/wt
Scratch: /var/tmp/lane-59b
Opened: 2026-09-30T13:34:35.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-from: 2026-09-30T13:34:00Z
Base: b52757b9d78c328a4a3a4faaecec2581fa233e18
Log: 2026-09-30T13:34:35.000Z owned skills-n opened lane 59b from skills-fable-janitor-59-4 (mirror-shim R4 expects 8 and plans 10 on a durable Windows checkout); Sonnet builder next
Log: 2026-09-30T13:38:49.000Z delivered skills-n Sonnet builder a5c129777cf8b7e8d at 9bc94906728cb412a549d6147d44222f247fc8be (R4 counts the four note shims by name, reclaim gate asserted, red in a durable clone before the fix); scratch clone left at /home/ben/Code/scratch-l59b-9vz1; build.md
Log: 2026-09-30T13:48:49.000Z reviewed skills-n Opus reviewer a5ccc5cd4a88c9966 APPROVE 9bc94906728cb412a549d6147d44222f247fc8be (R4 by name, reclaim gate assertion, no bare PATH shim counts left); Sonnet integrator a157c0ed991826c28 Windows suite in durable checkout C:\Users\benzh\Code\scratch-l59b-win1 PASS
Census: - leadTurns: 5
Census: - wallClockHours: 0.24
Census: - wakes: 0 (0 note-flush, 0 Done-tick)
Census: - wakeSplit: wake 1, stopBlock 0, other 4 (coalescable 0 at hold 10m — see "Wake-opened turns" below)
Census: - stopBlocks: 0
Census: - stallNudges: unavailable (ledger dir unreadable)
Census: - by-model: claude-opus-5-5=4475175, claude-sonnet-5=5160137
Census: - by-role: unassigned=6092072
Census: - subagentFiles: 292
Census: - Total assistant turns, deduped (whole file): **2091**
Census: - Window assistant turns, deduped: **17**
Census: - leadTurns (conversational runs — see docs/census.md): **5**
Census: - Wakes (turns opened by a note-flush or Done-tick line, see docs/census.md): **0** (0 note-flush, 0 Done-tick)
Census: - Stop-blocks (multi-inbox Stop hook blocks): **0**
Census: - Stall nudges received (ledger `collect-*-stall-*` ASKs to the lead's slug, in the window): **unavailable (ledger dir unreadable)**
Census: - Window: 2026-09-30T13:34:35.353Z .. 2026-09-30T13:49:01.963Z
Census: - Turns/hour in window: **70.62**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 4180 | 6143624 | 354779998 | 1399662 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 34 | 76735 | 3453500 | 12971 |
Census: - wakeTurns: 1, stopBlockTurns: 0, otherTurns: 4
Census: - cache_creation per turn (M6) — wake: claude-opus-5-5=9637.0; other: claude-opus-5-5=16774.5
Census: - coalescable (W1b, hold 10m, RESULT wakes only, Done-tick excluded): turns 0, upper (none), lower (none); ceiling (every RESULT wake turn) turns 0, (none)
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 56 | 50647 | 863405 | 17827 |
Census: | claude-sonnet-5 | 176 | 252929 | 4859225 | 47807 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 232 | 303576 | 5722630 | 65634 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 30798 | 4444377 |
Census: | claude-sonnet-5 | 47807 | 5112330 |
Four numbers: Top-tier tokens per build: 4475175 tokens: build 4475175 (claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 0.2h; largest gap 3.8min at 2026-09-30T13:43:49.131Z
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); 0 unanswered ASKs to skills-n; wakes 0 (0 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-n
Log: 2026-09-30T13:49:02.000Z accepted skills-n artifact 9bc94906728cb412a549d6147d44222f247fc8be

Predicts: rework after acceptance drops, because a durable-path gated count is now tested by name and one gate ran in a durable checkout before merge.
Observed: R4 red in a durable clone before the fix and green after, on Linux and on the Windows durable checkout; one builder round, one Opus review round.
Stall: none.
Gap: lane 59 gates ran only in non-durable locations, so this reached main; the lesson is recorded as a lead memory, not yet a script check.

## Spec
See Scope.
