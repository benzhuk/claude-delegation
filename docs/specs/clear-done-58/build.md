VERDICT: PASS

# Lane 58 builder report — wr-2026-09-29-clear-done-accounted

## Territory touched
- /var/tmp/lane-58/wt/skills/decisions/scripts/decisions-render-publish.mjs
- /var/tmp/lane-58/wt/skills/decisions/scripts/decisions-render-publish.test.mjs
- /var/tmp/lane-58/wt/skills/decisions/SKILL.md (one sentence)

## Cause
`defaultReadPickupCapture` (decisions-render-publish.mjs) only treated
`PREPARED`/`RECORDED`/`WAITING_OWNER` as an acceptable pickup status; an
`ACCOUNTED` round (or anything else) returned `null`. SKILL.md's registered-pickup
order is account, then clear Done — so the very first thing that happens after
`account` leaves the receipt ACCOUNTED with Done still checked on the page, and
`publish --clear-done` then had no route to that round at all: it always exited 3
("no captured pickup round"), permanently, until someone cleared the page by hand.

## Discriminating check
`defaultReadPickupCapture` returning `null` for `ACCOUNTED` vs. returning the
capture (tagged) is the fork. Once accepted at the read layer, `publish()` needed
one more discriminator to stay safe for every OTHER case reachable through an
ACCOUNTED capture: the fresh page's `Done` checkbox. Only "ACCOUNTED, and Done is
still checked, and the fresh owner-input triples still equal the capture's" is the
exact post-accounting/pre-clear state; anything else (Done already unchecked, or
different triples) still refuses.

## Fix location
- `defaultReadPickupCapture`: `acceptableStatuses` now includes `'ACCOUNTED'`;
  the returned capture gets `accounted: true` only for that status (RECORDED/
  PREPARED/WAITING_OWNER captures are unchanged in shape — no new field — so the
  pre-existing R2-1 regression test's exact-shape `deepEqual` still holds).
- `publish()`: right after retrieving the capture, a new guard —
  `if (capture.accounted && doc.done !== true) throw PublishError(3, ...)` —
  before the existing (unchanged) `multisetsEqual` check, which already covers
  the "triples still equal" half per the spec.
- `SKILL.md`: one sentence added to the registered-pickup order paragraph
  ("Either order reaches a working `publish --clear-done`: it also accepts an
  already-`ACCOUNTED` round whose Done is still checked and whose owner inputs
  still match, so accounting first no longer strands the page.").

## Simplification
None beyond the spec's own note that the existing multiset-equality check is
reused as-is for the "triples still match" half of the new rule — no duplicate
comparison logic was added.

## Red evidence (mktemp copy, pre-fix source, scratch: /var/tmp/l58-0CEf/wt-red)
Ran `TMPDIR=/var/tmp node --test skills/decisions/scripts/decisions-render-publish.test.mjs`
on a copy of the worktree with only the new/changed tests added (source
untouched): 48 pass, 4 fail — exactly the four new/changed tests, all for the
right reason:

1. `defaultReadPickupCapture: an ACCOUNTED wrapper ... yields the captured
   triples, tagged ...` — pre-fix got `null` instead of the expected capture
   object (AssertionError, actual `null`).
2. `publish --clear-done: an ACCOUNTED round whose Done is still checked and
   whose triples match proceeds, clearing Done` — pre-fix threw
   `PublishError(3, 'clear-done: no captured pickup round for this page')`
   instead of returning `{code: 0, ...}`.
3. `publish --clear-done: an ACCOUNTED round with Done unchecked on the fresh
   page is exit 3` — pre-fix threw exit 3 but for the wrong reason (no captured
   round, since ACCOUNTED was rejected at the read layer) rather than the
   Done-checked message the test asserts; the `assert.rejects` validator
   returned false because the message regex didn't match.
4. `publish --clear-done: an ACCOUNTED round whose captured triples differ from
   the fresh read is exit 3, naming the difference` — same shape: pre-fix threw
   exit 3 for "no captured pickup round" rather than "do not match the fresh
   read", so the message-regex validator returned false.

The fifth new test, `defaultReadPickupCapture: a NEEDS_RECONCILIATION wrapper
still yields null ...`, passed both before and after (documents unchanged
behavior explicitly, per spec item 4 — not itself a regression).

## Post-fix gates (all on /var/tmp/lane-58/wt, TMPDIR=/var/tmp)
1. `node --test skills/decisions/scripts/decisions-render-publish.test.mjs`
   → 52 pass, 0 fail (the four red tests above now green; nothing else moved).
2. Every other `skills/decisions/scripts/*.test.mjs`
   (decisions-archive.contract, decisions-handback, decisions-pickup,
   decisions-read, decisions-render-core, decisions-render, decisions-title,
   goals-mirror, registered-pickup.contract, skill-text)
   → 455 pass, 0 fail (includes `skill-text.test.mjs`, which checks quoted
   SKILL.md wording elsewhere — unaffected by the one added sentence).
3. `TMPDIR=/var/tmp node scripts/run-tests.mjs` → 3033 tests, 3028 pass,
   5 skipped, 0 fail; "leak check: 0 new temp entries". Full log at
   /var/tmp/lane-58/l58-full-run.log (not committed).

## Commit
c73d472 fix(decisions): let publish --clear-done accept an ACCOUNTED round
(branch build/clear-done-accounted-1, not pushed by this builder — that is the
lead's/integrator's authority per the work record).

## Notes / deviations
- No dev server, no process started, nothing to clean up.
- No writes to any Notion page; `notion.js` was never invoked.
- Did not touch decisions-pickup.mjs (out of territory, and NOT-list says its
  receipts/legacy migration are out of scope) — only read its exported
  `status`/`openPrivateCapture` shape via injected fakes, same convention the
  file already used.
