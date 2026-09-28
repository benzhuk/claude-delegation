Work: wr-2026-09-27-autolink-guard
Scope: docs/specs/2026-09-27-autolink-guard.md@a7b1d20 (origin/docs/lane-specs-0925)
Owner: skills-o
Status: closed
Authority: skills-fable ASK skills-fable-lane-32-1: build, review, second-host suite, merge, publish from main
Artifact: build/autolink-guard-1@72f8b71e0410b55ce5402e5013de6541042f50a0
Worktree: build/autolink-guard-1
Evidence: docs/work/evidence/wr-2026-09-27-autolink-guard-review-r2.md
Next: accept, merge with the closing bullet, publish from main
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-28T03:02:00Z
Base: a06848d249eedd9f7caa3e7b40e9081915aaa910
Opened: 2026-09-28T03:06:46Z
Log: 2026-09-28T03:06:46Z owned skills-o pack at C:/Users/benzh/Code/autolink-guard/pack
Log: 2026-09-28T10:11:12Z delivered skills-o Sonnet builder 3af975a: 83\/83 render tests, full Windows suite 2546 pass 0 fail, real sources render exit 0, and a scratch bare GOALS.md exits 2 naming session.md:9
Log: 2026-09-28T10:27:31Z delivered skills-o Sonnet builder round 2 at 72f8b71e0410b55ce5402e5013de6541042f50a0: F1 angle-bracket exemption narrowed to real autolinks, F2 file-line numbering in session.md
Log: 2026-09-28T10:27:31Z reviewed skills-o Opus reviewer APPROVE 72f8b71e0410b55ce5402e5013de6541042f50a0 after Opus NEEDS_FIXES on 3af975a (F1, F2); Netcup 2561/2565 0 fail 4 skipped at 72f8b71e0410b55ce5402e5013de6541042f50a0
Census: - leadTurns: 9
Census: - wallClockHours: 7.36
Census: - by-model: claude-opus-5-5=4844410, claude-sonnet-5=9371669
Census: - by-role: unassigned=11451454
Census: - subagentFiles: 73
Census: - Total assistant turns, deduped (whole file): **337**
Census: - Window assistant turns, deduped: **26**
Census: - leadTurns (conversational runs — see docs/census.md): **9**
Census: - Window: 2026-09-28T03:06:49.535Z .. 2026-09-28T10:28:18.919Z
Census: - Turns/hour in window: **3.53**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 674 | 2464867 | 49116922 | 177704 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 52 | 223424 | 2529876 | 11273 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 100 | 125589 | 1908166 | 45930 |
Census: | claude-sonnet-5 | 156 | 582498 | 8732473 | 56542 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 256 | 708087 | 10640639 | 102472 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 57203 | 4787207 |
Census: | claude-sonnet-5 | 56542 | 9315127 |
Four numbers: Top-tier tokens per build: 4844410 tokens: build 4844410 (claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 7.4h; largest gap 179.1min at 2026-09-28T07:11:42.049Z
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 1 gap(s) over 30min stalled; 4 waiting-on-agents (415.1 min); agent a356bf87ac505c39d silent 413.3 min from 2026-09-28T03:15:48.781Z; 0 unanswered ASKs to skills-o
Log: 2026-09-28T10:28:19.000Z accepted skills-o artifact 72f8b71e0410b55ce5402e5013de6541042f50a0
Log: 2026-09-28T10:31:15.000Z closed skills-o merge 321bb3afe18bbc21d1e37a7180acb3195b73f031

Observed: at 72f8b71, render refuses with exit 2 and the true file:line a bare word.md (md, sh, io, ai, co, me, so, py, final segment), a bare tilde and a bare URL outside a link or a real <http(s)://> autolink, before any write. Current docs/decisions sources render with exit 0.

Predicts: no publish fails after the write on text Notion autolinks. The next publish with a bare GOALS.md exits 2 at render with zero Notion writes, not exit 5 after replace-md.
Log: 2026-09-28T10:31:15Z verified skills-o merged-tree Windows suite 2577/2589 0 fail at 321bb3a. render on main exits 0, publish --dry-run exits 0, and the real publish exited 0, retitled 9/28 6:31AM with Ben's Done line and release item untouched.
