Work: wr-2026-09-29-clear-done-accounted
Scope: the spec section of this record (lane 58), from skills-fable-decisions-pickup-legacy-1 (its option: a lane that lets publish clear the page), read at 1090978
Owner: skills-n
Status: delivered
Authority: build, review, integrate, push build/clear-done-accounted-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; after the merge, run publish --clear-done once for the live page 3e1da11277a18174bccfea187d5c3972 from Netcup; no install, no release
Next: Opus delta review at 14fc09d
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
