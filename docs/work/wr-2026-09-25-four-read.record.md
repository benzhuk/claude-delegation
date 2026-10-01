Work: wr-2026-09-25-four-read
Scope: docs/specs/2026-09-25-four-number-read.md@931588a4e366e8df75ce796beb1ead161fac9693
Owner: skills-o
Status: accepted
Authority: skills-fable spec and Ben's push-on-green rule of 2026-09-24: build, review, push build/four-read-1. No merge to main, install, release, Notion.
Artifact: build/four-read-1@5d8eccfdee7c0c759ef5e6a99bfb4768bcbcdedd
Worktree: build/four-read-1
Evidence: docs/work/evidence/wr-2026-09-25-four-read-seam-review-r3.md
Next: skills-fable merge assessment of build/four-read-1
Children: wr-2026-09-25-four-read-r1, wr-2026-09-25-four-read-r2
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Base: 931588a4e366e8df75ce796beb1ead161fac9693
Opened: 2026-09-25T22:24:19Z
Log: 2026-09-25T22:24:19Z owned skills-o briefs at C:/Users/benzh/Code/four-read/pack, build-loop Workflow launching
Log: 2026-09-26T01:57:38Z reviewed skills-o artifact build/four-read-1@5d8eccfdee7c0c759ef5e6a99bfb4768bcbcdedd; R1 APPROVE 57661bf (5 rounds, then childEnv fix cfdc5ae), R2 APPROVE bb121c0 (3 rounds), seam APPROVE 5d8eccf after 3 rounds; full suite 1662/1662
Census: - leadTurns: 13
Census: - wallClockHours: 3.56
Census: - by-model: claude-opus-5-5=22376922, claude-sonnet-5=122844299
Census: - by-role: build=82233938, integrate=1979160, review=8210099, unassigned=48879774
Census: - subagentFiles: 18
Census: - Total assistant turns, deduped (whole file): **43**
Census: - Window assistant turns, deduped: **34**
Census: - leadTurns (conversational runs — see docs/census.md): **13**
Census: - Window: 2026-09-25T22:24:20.236Z .. 2026-09-26T01:58:00.984Z
Census: - Turns/hour in window: **9.55**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 86 | 165681 | 4465124 | 21145 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 68 | 104994 | 3797793 | 15395 |
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 500 | 1022216 | 17157301 | 278655 |
Census: | claude-sonnet-5 | 1902 | 2445643 | 119709386 | 687368 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | build | 1226 | 1355198 | 80374298 | 503216 |
Census: | integrate | 62 | 95232 | 1858592 | 25274 |
Census: | review | 274 | 514769 | 7523436 | 171620 |
Census: | unassigned | 840 | 1502660 | 47110361 | 265913 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 294050 | 22082872 |
Census: | claude-sonnet-5 | 687368 | 122156931 |
Four numbers: Top-tier tokens per build: 22376922 tokens: build 22376922 (claude-opus-5-5); partial (no spec slice): Spec-session:/Spec-from: missing from record
Four numbers: Hours ask to accepted: 3.6h; largest gap 78.6min at 2026-09-25T22:24:32.944Z
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 2 gap(s) over 30min: 2026-09-25T22:24:32.944Z (78.6min), 2026-09-25T23:43:06.966Z (45.3min); 0 unanswered ASKs to skills-o
Log: 2026-09-26T01:58:02.000Z accepted skills-o artifact 5d8eccfdee7c0c759ef5e6a99bfb4768bcbcdedd

Observed: Build loop Workflow wf_5d32ff3d-222 returned R1 rounds-exhausted at 53df20f and R2 APPROVE. The lead ran R1 rounds 4 and 5 by hand, then the integrator found one sealed-suite failure (childEnv), and the Opus seam review found a BLOCKER (Base: label refused by accept) and two MAJORs (accept-time read always unavailable, backdatable --at), all fixed and pinned. Final evidence: docs/work/evidence/wr-2026-09-25-four-read-R1-review-r5.md, docs/work/evidence/wr-2026-09-25-four-read-R2-review-r3.md, docs/work/evidence/wr-2026-09-25-four-read-seam-review-r3.md, docs/work/evidence/wr-2026-09-25-four-read-integrator-2.md, docs/work/evidence/wr-2026-09-25-four-read-seam-fix-report-2.md. Spec session id is not recorded (not provable by the lead), so tokens print partial.

Predicts: The four numbers become readable per build at accept time, with unavailable plus a reason where an input is missing.
