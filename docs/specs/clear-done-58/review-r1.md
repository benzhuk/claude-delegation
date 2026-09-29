VERDICT: NEEDS_FIXES (2) c73d4725a4c6d3d587071dbf37e5cc5d049d5154

# Lane 58 review: clear-done accepts ACCOUNTED (wr-2026-09-29-clear-done-accounted)

Reviewed: diff 08a0b27..c73d472 in /var/tmp/lane-58/wt (branch build/clear-done-accounted-1). The worktree was not modified: `git status --short` is empty and HEAD is still 36e84ac. All probes ran on `git archive` copies under /var/tmp/l58r-6SaC with TMPDIR=/var/tmp. Nothing touched Notion and notion.js was never run. Written 2026-09-29 15:38 EDT.

Cause: `defaultReadPickupCapture` now accepts ACCOUNTED. `publish` then treats "fresh Done is checked and the fresh triples equal the capture's" as proof that the page is still in round N's own Done episode. That proof fails once round N's Done has been cleared and the owner checks it again with the same inputs (zero inputs, or the same note typed again). Round N's capture then matches a new hand-back the pickup has not captured.
Discriminating check: the Done label, `Done (last cleared: <stamp>)`. Round N's capture carries the stamp from before round N. Any `publish --clear-done` writes a newer stamp. So "capture.doneLabel === fresh doneLabel" is true only in the legitimate state: accounted, and Done not yet cleared. The receipt's `observedUncheckedAt` is also set once the pickup host has seen the page unchecked after accounting. That is a second, independent sign that round N's episode is over.
Fix location: skills/decisions/scripts/decisions-render-publish.mjs, `defaultReadPickupCapture` (lines 122-140) and the `capture.accounted` guard in `publish` (line 459). Also skills/decisions/SKILL.md:128-130 (the sentence).
Simplification: no new comparison machinery is needed. `parseDocument` already returns `doc.doneLabel`, the same field `extractDoneLineVerbatim` uses. Carrying it on the capture and comparing strings closes the hole. Optionally, make the Done-label check apply to every status, not only ACCOUNTED (see N2). That removes the `capture.accounted` special case from the second guard.

## Answers to the attack brief

### 1. Does accepting ACCOUNTED reopen M8? Yes. Measured.

M8 is in docs/work/evidence/wr-2026-09-27-decisions-render-review-r1.md:254. It said `receipt.round` was used "whatever the receipt status is (ACCOUNTED, …). Accept only an unaccounted captured round". The lane's defence is two added conditions: Done still checked, and the triples still match. Neither condition tells round N's still-checked Done apart from a new check made after round N was cleared.

Worst case, measured with the real `publish` and the real `defaultReadPickupCapture`, using a fake `pickup` that returns an ACCOUNTED round 5. Probe: /var/tmp/l58r-6SaC/probe.mjs, run against the pre (08a0b27), post (c73d472) and patched copies.
- Capture (round N): `- [x] Done (last cleared: …1:00 PM…)`.
- `last-render.md`, as round N's clear left it: `- [ ] Done (last cleared: …2:10 PM…)`.
- Fresh page: the owner checked Done again, so `- [x] Done (last cleared: …2:10 PM…)`.

| case | 08a0b27 | c73d472 | patched |
|---|---|---|---|
| Legitimate: accounted, Done never cleared | exit 3 (no capture) | code 0, Done cleared | code 0, Done cleared |
| HOLE A: Done-only re-check after clear (zero inputs) | exit 3 | **code 0: new Done cleared** | exit 3 (Done line differs) |
| HOLE B: same note typed again, Done re-checked after clear | exit 3 | **code 0: new note and Done cleared** | exit 3 (Done line differs) |

So at c73d472, `publish --clear-done` clears Ben's new input using round N's capture, and nothing accounts for it. Why this is reachable in practice:
- The drift check passes, because `revertOwnerInput(fresh)` equals the post-clear `last-render.md`.
- The verbatim check passes. HOLE A has zero triples to check. In HOLE B, round N's answer is already quoted in today's history.
- The pickup cannot admit round N+1 until it has observed an unchecked page (decisions-pickup.mjs:1136). An account-then-clear or clear-then-account round leaves `observedUncheckedAt: null` (decisions-pickup.mjs:1370). Between the clear and the host's next poll, the receipt reads ACCOUNTED. On a host that is down (Netcup), that window is unbounded.
- The plain-publish error message itself tells the operator to "run the pickup, then publish --clear-done". Before this change such a publish stopped with "no captured pickup round". Now it silently consumes the hand-back. The pickup then sees Done unchecked and never wakes anyone for it.

Mutation check: I added a regression test (below) to the post copy. It fails there with "Missing expected rejection" (publish resolved with code 0). With the patch it passes, along with the whole file: 54/54.

### 2. Is "latest round" guaranteed? Yes for round identity. It does not show the round is still live (F1).
`status()` (decisions-pickup.mjs:1272-1305) reads the single receipt for the (project, page) pair. `openPrivateCapture` (decisions-pickup.mjs:1380-1398) throws unless `requestedRound === receipt.round` and the version is 2. A pending round-N+1 capture next to an ACCOUNTED + observed receipt makes `status()` return ORPHAN_CAPTURE (line 1301), and the read layer returns null for that. A round in progress is CAPTURE_INTENT/PREPARED/SENDING. An older round's capture cannot be opened. The comment at decisions-render-publish.mjs:114-116 is correct about round identity. But "never a stale earlier one" overstates things: the latest round can itself be stale relative to the page, which is F1. The patch below rewrites that comment's claim.

### 3. Non-accepted statuses still return null: verified (a first-class no-defect result)
Sweep at /var/tmp/l58r-6SaC/sweep.mjs, post copy, with a fake whose `openPrivateCapture` would succeed if called. NEEDS_RECONCILIATION, UNKNOWN, SENDING, ORPHAN_CAPTURE, PENDING_MANUAL_HANDOFF, CAPTURE_INTENT, INVALID, IDLE and undefined all return null, and none of them opens the capture. Only PREPARED/RECORDED/WAITING_OWNER/ACCOUNTED are accepted, and only ACCOUNTED is tagged. Legacy v1 ACCOUNTED returns null. See N1: it is now null through one layer, not two.

### 4. Are the four tests genuinely red before the fix? Yes. Re-checked all four.
I put c73d472's test file into the 08a0b27 source copy and ran it: 52 tests, 48 pass, 4 fail. The four failures are exactly the new ACCOUNTED tests:
- the shape test failed with `actual: null`;
- the other three failed with "no captured pickup round for this page".

The NEEDS_RECONCILIATION test is green before and after. That is expected, since it documents unchanged behaviour, and the builder says so. Its name in the spec ("each shown red") is the only slight inaccuracy. One caveat: the Done-unchecked test is red before the fix only for the wrong reason, the missing capture. It stays discriminating after the fix because its regex `/Done.*checked/` would not match the verbatim-check error the code falls through to without the guard.

### 5. The SKILL.md sentence and skill-text.test.mjs
`skill-text.test.mjs`: 14/14 pass. The decisions scripts suite, run once on a clean archive of c73d472: 507 tests, 506 pass, 1 fail. The failure is `decisions-handback.test.mjs:909` "CLI: real process … calls real git". It fails because the archive copy is not a git repository ("fatal: not a git repository"), so it comes from my environment, not the change. The builder's run inside the worktree reports it green, and 507 = 52 + 455 matches the builder's counts.

The sentence (SKILL.md:128-130) describes c73d472 accurately, but it inherits F1. "Whose Done is still checked" is exactly the ambiguous condition. After the fix it must say "still checked from that same round (not cleared and re-checked since)". See F2.

## Findings

### F1 (MAJOR): an ACCOUNTED capture clears a re-checked Done with identical inputs (M8 reopened)
- Evidence: decisions-render-publish.mjs:122 accepts ACCOUNTED, and :459 checks only `doc.done !== true`. The measured table above shows code 0 in HOLE A and HOLE B at c73d472, against exit 3 at 08a0b27.
- Fix: carry the capture's Done label and require the fresh label to equal it. Also refuse an ACCOUNTED round whose unchecked page the pickup host has already observed. The second check also covers an owner who unticks and re-ticks Done by hand, where the label does not change but the host saw the page unchecked.
- Predicted outcome: the legitimate account-then-clear state still gives code 0, because the page was never cleared and the labels are equal (this is the live round-5 case). HOLE A and HOLE B give exit 3. Measured: the patched copy passes 54/54, which includes the lane's own four tests. The ACCOUNTED shape test needs `doneLabel: 'Done'`.
- Ready patch, file skills/decisions/scripts/decisions-render-publish.mjs.

Current (lines 123-124):
```js
  if (!acceptableStatuses.has(st?.status)) return null;
  let originalBuf;
```
Replacement:
```js
  if (!acceptableStatuses.has(st?.status)) return null;
  // An ACCOUNTED round whose unchecked page the pickup host has already observed is over: any
  // checked Done now is a new hand-back (round + 1), never this round's.
  if (st.status === 'ACCOUNTED' && st.receipt.observedUncheckedAt) return null;
  let originalBuf;
```
Current (line 139):
```js
    ...(st.status === 'ACCOUNTED' ? { accounted: true } : {}),
```
Replacement:
```js
    ...(st.status === 'ACCOUNTED' ? { accounted: true, doneLabel: doc.doneLabel } : {}),
```
Current (lines 459-461):
```js
    if (capture.accounted && doc.done !== true) {
      throw new PublishError(3, "clear-done: an already-accounted round requires the fresh page's Done to still be checked");
    }
```
Replacement:
```js
    if (capture.accounted && doc.done !== true) {
      throw new PublishError(3, "clear-done: an already-accounted round requires the fresh page's Done to still be checked");
    }
    // Review (lane 58): Done still checked is not enough. Once that round's Done was cleared, the
    // page carries a newer `last cleared:` stamp; a re-check (even with identical inputs) is a NEW
    // hand-back the pickup has not captured. Only the capture's own Done line proves same episode.
    if (capture.accounted && doc.doneLabel !== capture.doneLabel) {
      throw new PublishError(3, `clear-done: an already-accounted round's Done line ("${capture.doneLabel}") differs from the fresh page's ("${doc.doneLabel}"): Done was cleared and re-checked since that round; run the pickup for the new round`);
    }
```
Also, at lines 114-116, replace "— `st.receipt.round` above is always that round, never a stale earlier one." with "— `st.receipt.round` above is always that round; whether the page is still in that round's Done episode is checked separately (observedUncheckedAt here, the Done label in `publish`)."

- Test file, skills/decisions/scripts/decisions-render-publish.test.mjs. At line 188, replace `    accounted: true,` with `    accounted: true,\n    doneLabel: 'Done',`. Then add these two tests after the lane-58 block. Both were verified: red at c73d472 and green with the patch.
```js
test('publish --clear-done: an ACCOUNTED round whose Done was cleared and then re-checked with the same inputs is exit 3 (a new hand-back, not that round)', async () => {
  const OLD = 'Done (last cleared: Sep 27, 2026, 1:00 PM America/New_York)';
  const NEW = 'Done (last cleared: Sep 27, 2026, 2:10 PM America/New_York)';
  const captured = pageWithComment('please look at this').replace('- [x] Done', `- [x] ${OLD}`);
  const live = pageWithComment('please look at this').replace('- [x] Done', `- [x] ${NEW}`);
  const historyWithAnswer = '# Sep 27, 2026\nSummary: five lanes merged, the delete guard shipped.\n'
    + '- Your note, 9-27: "please look at this" — looked at it, nothing further needed.\n';
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: CLEAN_PAGE_WITH_DECISION.replace('- [ ] Done', `- [ ] ${NEW}`) });
  const pickup = {
    status: () => ({ status: 'ACCOUNTED', receipt: { state: 'ACCOUNTED', round: 1, captureReadAt: '2026-09-27T17:05:00Z' } }),
    openPrivateCapture: () => Buffer.from(captured, 'utf8'),
  };
  const { deps } = baseDeps({
    files,
    readPage: async () => live,
    readPickupCapture: (ctx) => defaultReadPickupCapture(ctx, { pickup }),
    gitOverrides: { show: showOverride({ 'origin/main:docs/decisions/history/2026-09-27.md': historyWithAnswer }) },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE', clearDone: true, dryRun: true }, deps),
    (e) => e instanceof PublishError && e.code === 3 && /Done line/.test(e.message),
  );
});

test('defaultReadPickupCapture: an ACCOUNTED round whose unchecked page was already observed yields null and never opens the capture', async () => {
  const pickup = {
    status: () => ({ status: 'ACCOUNTED', receipt: { state: 'ACCOUNTED', round: 4, observedUncheckedAt: '2026-09-27T22:00:00Z' } }),
    openPrivateCapture: () => { throw new Error('must not be called once the round was observed unchecked'); },
  };
  assert.equal(await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup }), null);
});
```
- Residual: the label has minute resolution (`formatClearedTimestamp`, decisions-render-core.mjs:297-299). A collision needs two clears in the same New York minute with a full tick → capture → account cycle between them. That is negligible, and the observedUncheckedAt check still covers it whenever the host has polled.
- Effect on the post-merge live run: page 3e1da112… round 5 was accounted with Done never cleared. Its capture label equals the live label, and its receipt has `observedUncheckedAt` null. The patched code still clears it.

### F2 (MINOR): the SKILL.md sentence states the ambiguous condition
- Evidence: SKILL.md:128-130, "accepts an already-`ACCOUNTED` round whose Done is still checked and whose owner inputs still match". Unlike its neighbours, the sentence also carries no `(checked by …)` or `(not checked)` tag.
- Fix (apply with F1). Current:
```
--clear-done`: it also accepts an already-`ACCOUNTED` round whose Done is still checked
and whose owner inputs still match, so accounting first no longer strands the page.
```
Replacement:
```
--clear-done`: it also accepts an already-`ACCOUNTED` round whose Done is still checked
from that same round (the Done line unchanged since the capture, never cleared and
re-checked) and whose owner inputs still match, so accounting first no longer strands the
page (checked by `decisions-render-publish.test.mjs`).
```
- Predicted outcome: skill-text.test.mjs has no assertion on this paragraph (grep for `clear-done`/`ACCOUNTED` there finds nothing), so it stays 14/14.

## Notes (no fix required for this lane)
- N1 (INFO): a legacy v1 receipt reports `status: receipt.state` (decisions-pickup.mjs:825-835), so a legacy ACCOUNTED round now passes the status filter. It still returns null, but only because `openPrivateCapture` refuses version 1 (decisions-pickup.mjs:1387). Before this change the status filter also refused it. An optional belt-and-braces line after line 123: `if (st.legacyLocation || st.receipt.version !== 2) return null;`.
- N2 (INFO, pre-existing, not introduced here): the twin of F1 exists for RECORDED in the clear-first order. Between `publish --clear-done` and `account`, an identical re-check is also accepted. The window is short, because the owner lead is running the round. Dropping the `capture.accounted &&` from the Done-label guard, and always returning `doneLabel`, would close both. The legitimate clear-first read has equal labels, so it still passes. The existing R2-1 exact-shape test would then need `doneLabel`. That is the builder's call and in territory, but outside the spec.

Scratch left at /var/tmp/l58r-6SaC (probe.mjs, sweep.mjs, the pre/post/fix/clean archive copies, and the run logs). Nothing was deleted, per the brief.
