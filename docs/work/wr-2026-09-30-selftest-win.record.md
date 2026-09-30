Work: wr-2026-09-30-selftest-win
Scope: docs/specs/selftest-win-60c/spec.md (lane 60c), from skills-fable-guard-60-5, written by the lead at b52757b9d78c328a4a3a4faaecec2581fa233e18
Owner: skills-n
Status: accepted
Authority: build and review on dotfiles branch build/selftest-win-60c-1 and plugin branch build/selftest-win-60c-1; test-only change; merge both on acceptance under the standing grant of 2026-09-26; no install on any machine
Next: accept, merge dotfiles and plugin branches, close, RESULT to skills-fable
Artifact: bfb5cd4447077b9e4fbc11143f35136674f45aef
Evidence: docs/work/evidence/wr-2026-09-30-selftest-win-review.md, docs/work/evidence/wr-2026-09-30-selftest-win-windows.md
Artifact-repo: /var/tmp/lane-60c/dot
Worktree: /var/tmp/lane-60c/dot
Scratch: /var/tmp/lane-60c
Opened: 2026-09-30T13:34:35.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-from: 2026-09-30T13:34:00Z
Base: b52757b9d78c328a4a3a4faaecec2581fa233e18
Log: 2026-09-30T13:34:35.000Z owned skills-n opened lane 60c from skills-fable-guard-60-5 (the Windows selftest is 27 of 74 without a python3 name, and 72 of 74 with a shim); Sonnet builder next
Log: 2026-09-30T14:08:04.000Z delivered skills-n Sonnet builder a1b7b78457cf5722b at dotfiles 2ddcbf5c87d871f218eba174e782d065e78bc593 (interpreter resolution with abort, path-form normalization, mode check skipped on MSYS); the builder wrote no report and hung on a banned rm of its scratch dir, so the lead stopped it; Netcup selftest 74 of 74 by the lead
Log: 2026-09-30T14:11:25.000Z rejected skills-n Opus reviewer a232f51a1b9e4f9a7 NEEDS_FIXES 2ddcbf5c87d871f218eba174e782d065e78bc593 (F1 HIGH abort guard exits only its command substitution, 27 of 74 reproduced, F2 MEDIUM basename fallback on every platform, F3 LOW empty stat passes on Windows); review-1.md
Log: 2026-09-30T14:15:59.000Z delivered skills-n Sonnet builder ab66d8117a39a67b4 at dotfiles bfb5cd4447077b9e4fbc11143f35136674f45aef (F1 abort reaches the parent, F2 strict paths off Windows, F3 empty stat fails); round-1 Windows run on 2ddcbf5 was 73 passed 0 failed 1 mode SKIP with no shim; build-2.md
Log: 2026-09-30T14:18:39.000Z reviewed skills-n Opus reviewer a232f51a1b9e4f9a7 APPROVE bfb5cd4447077b9e4fbc11143f35136674f45aef (delta: F1 to F3 fixed, no regressions); Sonnet integrator a0989f4cd6660f843 Windows desktop no shim 73 passed 0 failed 1 mode SKIP, no-python PATH aborts exit 1; Netcup 74 of 74
Census: - leadTurns: 11
Census: - wallClockHours: 0.74
Census: - wakes: 0 (0 note-flush, 0 Done-tick)
Census: - wakeSplit: wake 1, stopBlock 0, other 10 (coalescable 0 at hold 10m — see "Wake-opened turns" below)
Census: - stopBlocks: 0
Census: - stallNudges: unavailable (ledger dir unreadable)
Census: - by-model: claude-opus-5-5=8509747, claude-sonnet-5=7933451
Census: - by-role: unassigned=9504353
Census: - subagentFiles: 295
Census: - Total assistant turns, deduped (whole file): **2125**
Census: - Window assistant turns, deduped: **51**
Census: - leadTurns (conversational runs — see docs/census.md): **11**
Census: - Wakes (turns opened by a note-flush or Done-tick line, see docs/census.md): **0** (0 note-flush, 0 Done-tick)
Census: - Stop-blocks (multi-inbox Stop hook blocks): **0**
Census: - Stall nudges received (ledger `collect-*-stall-*` ASKs to the lead's slug, in the window): **unavailable (ledger dir unreadable)**
Census: - Window: 2026-09-30T13:34:35.353Z .. 2026-09-30T14:18:42.954Z
Census: - Turns/hour in window: **69.35**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 4248 | 6175948 | 358125654 | 1417219 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 102 | 109059 | 6799156 | 30528 |
Census: - wakeTurns: 1, stopBlockTurns: 0, otherTurns: 10
Census: - cache_creation per turn (M6) — wake: claude-opus-5-5=9637.0; other: claude-opus-5-5=9942.2
Census: - coalescable (W1b, hold 10m, RESULT wakes only, Done-tick excluded): turns 0, upper (none), lower (none); ceiling (every RESULT wake turn) turns 0, (none)
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 102 | 97329 | 1436870 | 36601 |
Census: | claude-sonnet-5 | 322 | 356562 | 7498769 | 77798 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 424 | 453891 | 8935639 | 114399 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 67129 | 8442618 |
Census: | claude-sonnet-5 | 77798 | 7855653 |
Four numbers: Top-tier tokens per build: 8509747 tokens: build 8509747 (claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 0.7h; largest gap 17.0min at 2026-09-30T13:50:29.951Z
Four numbers: Rework after acceptance: unavailable (git: Command failed: git -C /var/tmp/lane-60c/dot diff --name-only b52757b9d78c328a4a3a4faaecec2581fa233e18..bfb5cd4447077b9e4fbc11143f35136674f45aef)
Four numbers: Work lost or stalled: 0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); 0 unanswered ASKs to skills-n; wakes 0 (0 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-n
Log: 2026-09-30T14:18:47.000Z accepted skills-n artifact bfb5cd4447077b9e4fbc11143f35136674f45aef

Predicts: work lost or stalled drops, because the guard selftest now runs clean on the Windows desktop with no shim and aborts instead of passing vacuously when python is missing.
Observed: Netcup 74 of 74; Windows 73 passed, 0 failed, 1 mode SKIP with no shim; no-python PATH aborts with exit 1; two builder rounds, two Opus review rounds.
Stall: the round-1 builder hung about 25 minutes on a banned rm of its scratch dir and was stopped by the lead.
Gap: the round-1 abort guard exited only its own command substitution, which a lead-run Linux selftest could not show; the Opus review caught it.

## Spec
See Scope. Dotfiles base is 6f183eb5af09f8222e19d750a564b34c4f529326.
