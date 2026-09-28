Work: wr-2026-09-28-collect-followups
Scope: docs/specs/collect-followups-1/spec.md (lane 33, skills-fable's spec at 34ecdbe on origin/docs/lane-specs-0925); territory as pinned in the spec
Owner: skills-n
Status: accepted
Authority: build, review, integrate, push build/collect-followups-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; live proof only against a scratch HOME with --force-root --dry-run --json, never the live Netcup unit
Next: accept, merge into main, close, RESULT to skills-fable
Artifact: 0523ec8e82bb48d8fa775f0c20bfa6559813b049
Evidence: docs/work/evidence/wr-2026-09-28-collect-followups-review.md, docs/work/evidence/wr-2026-09-28-collect-followups-review-r1.md, docs/work/evidence/wr-2026-09-28-collect-followups-suites.md, docs/work/evidence/wr-2026-09-28-collect-followups-live.md
Worktree: build/collect-followups-1
Opened: 2026-09-28T03:48:18.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-28T03:44:00Z
Base: e9ccec4948e9689e58b0a4374fcfc36b2a8a8037
Log: 2026-09-28T03:48:18.000Z owned skills-n picked up skills-fable-lane-33-1, ACK sent over ssh on ben-desktop, base e9ccec4
Log: 2026-09-28T04:05:04.000Z delivered skills-n Sonnet builder DONE 19607cf (report 6cd4ec2), gate 140 of 140; a secret-guard warning on its state file was checked by the lead with secret-tool grep-safe over every changed file, no key prefix found; Opus reviewer and Windows suite started
Log: 2026-09-28T04:12:41.000Z rejected skills-n Opus review r1 NEEDS_FIXES 6cd4ec2 (Windows 2545 of 2554, 0 fail at 19607cf): F1 no test ties --stale-hours given to main to the written unit (4 mutants survive), F2 the closed grep test finds nothing and a comment defeats it, F4 --stale-hours silently ignored for janitor-record, F5 K3 overclaims. Lead rules F1 F2 F4 F5 in verbatim; F3 keep exit 1 like --hour/--every, spec Acceptance amended here (exit 1, not 2); F6 no change
Log: 2026-09-28T04:18:19.000Z delivered skills-n fix builder DONE 0523ec8 (F1 F2 F4 F5; F1 test fails on M4, F2 on M1), gate 141 of 141; secret-tool grep-safe over changed files again clean; Opus delta r2 and Windows suite started
Log: 2026-09-28T04:22:20.000Z reviewed skills-n Opus reviewer a8261c864f5d0c8dc delta r2 VERDICT: APPROVE 0523ec8 (F1 F2 F4 F5 verified, M1-M7 and M15 killed, gate 141 of 141); Windows 2546 of 2555, 0 fail; Linux green bar a remote-dependent test that passes in the worktree; live dry-run proof in a scratch HOME
Census: - leadTurns: 7
Census: - wallClockHours: 0.58
Census: - by-model: claude-opus-5-5=9838870, claude-sonnet-5=15815995
Census: - by-role: unassigned=19758958
Census: - subagentFiles: 189
Census: - Total assistant turns, deduped (whole file): **820**
Census: - Window assistant turns, deduped: **35**
Census: - leadTurns (conversational runs — see docs/census.md): **7**
Census: - Window: 2026-09-28T03:48:18.805Z .. 2026-09-28T04:23:04.858Z
Census: - Turns/hour in window: **60.40**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 1638 | 3175671 | 137066525 | 528797 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 70 | 107554 | 5766699 | 21584 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 108 | 229156 | 3669575 | 44124 |
Census: | claude-sonnet-5 | 268 | 271663 | 15450436 | 93628 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 376 | 500819 | 19120011 | 137752 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 65708 | 9773162 |
Census: | claude-sonnet-5 | 93628 | 15722367 |
Four numbers: Top-tier tokens per build: 9838870 tokens: build 9838870 (claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 0.6h; largest gap 14.4min at 2026-09-28T03:48:51.781Z
Four numbers: Rework after acceptance: 1 commit(s) touching build files within 7 days: 55ae08f "docs(work): wr-2026-09-28-collect-followups evidence paths"; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); 0 unanswered ASKs to skills-n
Log: 2026-09-28T04:23:05.000Z accepted skills-n artifact 0523ec8e82bb48d8fa775f0c20bfa6559813b049

Observed: at 0523ec8 a collect-status reinstall keeps --stale-hours. The dry-run ExecStart ends with --stale-hours 2, and installed.json carries staleHours 2. --stale-hours is refused for the janitor job. computeState returns a terminal closed for a closed record; this is unit-tested, and mutant M3 was killed in review r2. No live closed row appears in collect-from-origin today, because every closed lane's branch is an ancestor of main and is filtered out first, by design (see the live evidence). One extra RESULT to skills-fable is expected after the next install, because the K2 change key now carries the closed state.
