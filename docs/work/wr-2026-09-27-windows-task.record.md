Work: wr-2026-09-27-windows-task
Scope: docs/specs/2026-09-27-followup-bundle.md@7e92f16 (origin/docs/lane-specs-0925), section Lane 22, windows-task
Owner: skills-o
Status: closed
Authority: skills-fable ASK skills-fable-lane-22-1: build, review, live proof on Windows, merge on acceptance under the standing grant of 2026-09-26, post the Closed entry. Ben approved the janitor timer on all four hosts on 2026-09-27 12:38 PM NY. No release, chezmoi or install beyond the timer.
Artifact: build/windows-task-1@899a6e615d895aea074c51e25e3f116329f5cbd4
Worktree: build/windows-task-1
Evidence: docs/work/evidence/wr-2026-09-27-windows-task-review.md
Next: accept, merge to main, Closed bullet in docs/decisions/history, final --enable from the main checkout
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T20:15:00Z
Base: 0c926057a948c4365cf92d82d8fb584cbcc77dcd
Opened: 2026-09-27T20:30:59Z
Log: 2026-09-27T20:30:59Z owned skills-o pack at C:/Users/benzh/Code/windows-task/pack
Log: 2026-09-27T20:46:55Z delivered skills-o Sonnet builder 899a6e615d895aea074c51e25e3f116329f5cbd4: task xml written as UTF-16LE with BOM and encoding=UTF-16, readMarked decodes a BOM-led .xml as UTF-16 before the marker check; gate 72 pass 0 fail
Log: 2026-09-27T20:46:55Z reviewed skills-o Opus APPROVE 899a6e615d895aea074c51e25e3f116329f5cbd4; live on ben-desktop at 2026-09-27T20:42:49Z: --enable --json exit 0 with schtasks /Create /XML accepted, schtasks /Query showed Next Run Time 9/28/2026 6:00:00 AM Status Ready, --remove --enable exit 0 then Query said the task cannot be found; Netcup 2346/2350 0 fail 4 skipped
Census: - leadTurns: 3
Census: - wallClockHours: 0.27
Census: - by-model: claude-opus-5-5=2762869, claude-sonnet-5=6777393
Census: - by-role: unassigned=7583505
Census: - subagentFiles: 62
Census: - Total assistant turns, deduped (whole file): **206**
Census: - Window assistant turns, deduped: **11**
Census: - leadTurns (conversational runs — see docs/census.md): **3**
Census: - Window: 2026-09-27T20:31:02.238Z .. 2026-09-27T20:47:04.798Z
Census: - Turns/hour in window: **41.14**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 412 | 1874830 | 29620856 | 118382 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 22 | 15963 | 1933307 | 7465 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 40 | 55078 | 737441 | 13553 |
Census: | claude-sonnet-5 | 128 | 150391 | 6577027 | 49847 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 168 | 205469 | 7314468 | 63400 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 21018 | 2741851 |
Census: | claude-sonnet-5 | 49847 | 6727546 |
Four numbers: Top-tier tokens per build: 2762869 tokens: build 2762869 (claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 0.3h; largest gap 11.1min at 2026-09-27T20:31:19.569Z
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); 0 unanswered ASKs to skills-o
Log: 2026-09-27T20:47:05.000Z accepted skills-o artifact 899a6e615d895aea074c51e25e3f116329f5cbd4
Log: 2026-09-27T20:50:03Z closed skills-o merged to main at da6b9f6 after the merged-tree suite passed 2348/2350 with 0 fail on Windows; final --enable waits for the release carrying this fix

Observed: schtasks accepts the UTF-16 task xml on Windows (0.20.15 UTF-8 file was refused with "unable to switch the encoding"). The /TR fallback was not needed. An old 0.20.15 UTF-8 file is still recognised as ours and overwritten (review probe). The live runs used --force-root from the branch worktree; the final --enable is run from the main checkout after the merge so the task does not point at a worktree. The collect-status job is NOT wired on Windows in this lane; the collector runs on Netcup only. Minors open: three byte-identical test checks read the UTF-16 file as UTF-8 (test :1192, :1211, :1239); the BOM at install-janitor-timer.mjs:284 is a literal character, better written as an escape.

Predicts: the janitor records a run on ben-desktop at 6:00 AM NY on 2026-09-28 and last-run.log exists after it.
