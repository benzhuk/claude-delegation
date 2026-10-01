Work: wr-2026-09-29-clear-done-accounted
Scope: the spec section of this record (lane 58), from skills-fable-decisions-pickup-legacy-1 (its option: a lane that lets publish clear the page), read at 1090978
Owner: skills-n
Status: closed
Authority: build, review, integrate, push build/clear-done-accounted-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; after the merge, run publish --clear-done once for the live page 3e1da11277a18174bccfea187d5c3972 from Netcup; no install, no release
Next: accept pinned at 59b6222, merge into main, close, then publish --clear-done once for the live page from Netcup
Artifact: 59b6222d6fc80960e451d003f6bf22272f9ea49c
Evidence: docs/work/evidence/wr-2026-09-29-clear-done-accounted-review.md
Worktree: build/clear-done-accounted-1
Scratch: /var/tmp/lane-58
Opened: 2026-09-29T19:27:04.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-from: 2026-09-29T19:27:04Z
Base: 10909787e491e6aa8c327b7353eab33136c236c1
Log: 2026-09-29T19:27:04.000Z owned skills-n opened after round 5 was accounted before publish --clear-done, which then refused (no captured pickup round); the page is stuck with owner input pending, and the desktop publish is blocked too
Log: 2026-09-29T19:33:51.000Z delivered skills-n Sonnet builder a3aa7c115a1a1fed4 DONE c73d472cb (four tests red before, green after; decisions scripts 455 pass; full suite 3033 tests 3028 pass 0 fail); report docs/specs/clear-done-58/build.md
Log: 2026-09-29T19:39:49.000Z rejected skills-n Opus reviewer a18b02d1ea14ed8f1 NEEDS_FIXES c73d472 (MAJOR, measured: after round N is accounted and cleared, a same-input re-check of Done is cleared by clear-done with round N's capture, and nothing accounts for it; MINOR, SKILL.md wording); the lead adopts the reviewer's measured patch; the same builder resumes
Log: 2026-09-29T19:44:04.000Z delivered skills-n builder a3aa7c115a1a1fed4 fix round 1 DONE 14fc09d913d9149e7d5f6aa5533c18a6c5ad5f22 (Done label must match the capture; ACCOUNTED refused once an unchecked page was observed; SKILL.md reworded; regression red at c73d472, green after; full suite 3030 pass 0 fail); report docs/specs/clear-done-58/build-r1.md
Log: 2026-09-29T19:46:21.000Z rejected skills-n Opus reviewer a18b02d1ea14ed8f1 NEEDS_FIXES 14fc09d (the code matches its patch, both re-check cases exit 3, the live round-5 shape clears, the observed-unchecked guard is live; MINOR, the observed-unchecked and NEEDS_RECONCILIATION tests pass even with their guard deleted); a fresh builder applies the ready test patch
Log: 2026-09-29T19:50:26.000Z delivered skills-n Sonnet builder a16b5daa2d6c9e60c fix round 2 DONE 59b6222 (review-r2 test patch verbatim; guard-deleted and NEEDS_RECONCILIATION mutants each fail exactly their test; decisions scripts 509 pass; full suite 3030 pass 0 fail); report docs/specs/clear-done-58/build-r2.md
Log: 2026-09-29T19:51:29.000Z reviewed skills-n Opus reviewer a18b02d1ea14ed8f1 APPROVE 59b6222d6fc80960e451d003f6bf22272f9ea49c (patch verbatim, only the test file changed since 14fc09d, each guard mutant fails exactly its test, all round-1 and round-2 findings closed); evidence docs/work/evidence/wr-2026-09-29-clear-done-accounted-review.md
Census: - leadTurns: 13
Census: - wallClockHours: 0.41
Census: - wakes: 0 (0 note-flush, 0 Done-tick)
Census: - wakeSplit: wake 1, stopBlock 0, other 12 (coalescable 0 at hold 10m — see "Wake-opened turns" below)
Census: - stopBlocks: 0
Census: - stallNudges: unavailable (ledger dir unreadable)
Census: - by-model: claude-opus-5-5=15692337, claude-sonnet-5=13909392
Census: - by-role: unassigned=22018350
Census: - subagentFiles: 249
Census: - Total assistant turns, deduped (whole file): **1708**
Census: - Window assistant turns, deduped: **37**
Census: - leadTurns (conversational runs — see docs/census.md): **13**
Census: - Wakes (turns opened by a note-flush or Done-tick line, see docs/census.md): **0** (0 note-flush, 0 Done-tick)
Census: - Stop-blocks (multi-inbox Stop hook blocks): **0**
Census: - Stall nudges received (ledger `collect-*-stall-*` ASKs to the lead's slug, in the window): **unavailable (ledger dir unreadable)**
Census: - Window: 2026-09-29T19:27:04.829Z .. 2026-09-29T19:51:34.996Z
Census: - Turns/hour in window: **90.60**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 3414 | 5216737 | 288381640 | 1125965 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 74 | 108667 | 7448122 | 26516 |
Census: - wakeTurns: 1, stopBlockTurns: 0, otherTurns: 12
Census: - cache_creation per turn (M6) — wake: claude-opus-5-5=6219.0; other: claude-opus-5-5=8537.3
Census: - coalescable (W1b, hold 10m, RESULT wakes only, Done-tick excluded): turns 0, upper (none), lower (none); ceiling (every RESULT wake turn) turns 0, (none)
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 206 | 262213 | 7719080 | 127459 |
Census: | claude-sonnet-5 | 314 | 466974 | 13323950 | 118154 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 520 | 729187 | 21043030 | 245613 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 153975 | 15538362 |
Census: | claude-sonnet-5 | 118154 | 13791238 |
Four numbers: Top-tier tokens per build: 15692337 tokens: build 15692337 (claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 0.4h; largest gap 5.1min at 2026-09-29T19:34:34.366Z
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 0 gap(s) over 30min stalled; 0 waiting-on-agents (0.0 min); 0 unanswered ASKs to skills-n; wakes 0 (0 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-n
Log: 2026-09-29T19:51:38.000Z accepted skills-n artifact 59b6222d6fc80960e451d003f6bf22272f9ea49c
Log: 2026-09-29T19:52:42.000Z merged skills-n d3f905c383113b27ef0ac617993adab663e3ad62 into main (suite 3035 tests, 3030 pass, 0 fail); history bullet in docs/decisions/history/2026-09-29.md
Log: 2026-09-29T19:52:42.000Z closed skills-n merge d3f905c383113b27ef0ac617993adab663e3ad62

Observed: publish --clear-done now clears a page whose latest pickup round is ACCOUNTED, when Done is still checked and the fresh owner inputs equal that round's capture. It still refuses a cleared page, a same-input recheck after a clear, different inputs, and NEEDS_RECONCILIATION, UNKNOWN or legacy rounds. Three review rounds: a MAJOR hole (a stale capture clearing a recheck) and two vacuous tests, both fixed and re-measured. Full suite 3030 pass, 0 fail.
Predicts: the live decisions page, stuck since round 5 was accounted on 9/29, clears with one publish --clear-done from Netcup after the merge, and future rounds clear in either order around account.

Stall: none beyond review rounds. The lane ran about 45 minutes from spec to reviewed, with two fix rounds.

Gap: the fix is measured on fixtures and the live round-5 shape reproduced by the reviewer, not yet on the live page. The post-merge publish is the live check, and its outcome goes in the RESULT.

## Spec (lead)

Defect: once a pickup round is ACCOUNTED, no route clears the page.
- `publish --clear-done` reads the capture through defaultReadPickupCapture (skills/decisions/scripts/decisions-render-publish.mjs:97). That function accepts only PREPARED, RECORDED or WAITING_OWNER, so an ACCOUNTED round returns null, and publish exits 3 with "no captured pickup round".
- A plain publish exits 3 while any tick, comment or Done line is on the page (hasOwnerInput, line 50).
- The skill text says to account first and clear Done afterwards. Following it strands the page: on 9/29 round 5 was accounted and then could not be cleared. Round 4 worked only because Done was cleared before it was accounted.

Fix: defaultReadPickupCapture also accepts ACCOUNTED, and only for the latest round in the receipt. publish then accepts it only when the fresh page has Done checked AND the fresh owner-input triples exactly equal that capture's triples. The existing multiset check already does the second part.
- That is exactly the state after an accounting whose Done has not yet been cleared.
- Review M8's concern stands for every other case. A cleared page (Done unchecked, or different inputs) still refuses. NEEDS_RECONCILIATION, UNKNOWN and legacy states still return null.
- Update the M8 test at decisions-render-publish.test.mjs:178. Its new name says what is now accepted and why.

Tests, each shown red before the fix:
1. ACCOUNTED, Done checked, and triples equal: publish --clear-done proceeds, and the rendered Done line is `- [ ] Done (last cleared: ...)`.
2. ACCOUNTED with Done unchecked: exit 3.
3. ACCOUNTED with different triples: exit 3.
4. NEEDS_RECONCILIATION: still null.

Docs: in skills/decisions/SKILL.md's accounting paragraph, one sentence saying `publish --clear-done` works before or after `account`.

Territory:
- skills/decisions/scripts/decisions-render-publish.mjs;
- skills/decisions/scripts/decisions-render-publish.test.mjs;
- skills/decisions/SKILL.md, one sentence.

NOT: decisions-pickup.mjs receipts, legacy migration, or any page write during the build.

Measure: work lost or stalled. Owner input sits on the page, blocking every publish, until the page is cleared by hand.
