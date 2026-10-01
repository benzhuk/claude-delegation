VERDICT: NEEDS_FIXES (1) 14fc09d913d9149e7d5f6aa5533c18a6c5ad5f22

# Lane 58 delta review r2: c73d472..14fc09d

Scope: this is a delta review of the r1 fixes (the F1 patch and the F2 wording), with a hunt for regressions. The worktree was not modified: `git status --short` is empty. All measurements ran on `git archive` copies under /var/tmp/l58r-6SaC with TMPDIR=/var/tmp. Nothing touched Notion. Written 2026-09-29 15:50 EDT.

Cause: the remaining defect is in the tests, not the code. The observedUncheckedAt guard and the NEEDS_RECONCILIATION rejection are each covered by a test whose fake `openPrivateCapture` throws. `defaultReadPickupCapture` catches that throw and returns null (decisions-render-publish.mjs, the `try { originalBuf = pickupMod.openPrivateCapture(...) } catch { return null; }` right after the guard). So both tests pass whether or not the guard exists. I proposed the observed test in r1, so the flaw is mine; the builder disclosed it honestly in build-r1.md:67-79.
Discriminating check: I deleted the observedUncheckedAt guard in one scratch copy, and added NEEDS_RECONCILIATION to `acceptableStatuses` in another. At 14fc09d both copies still run 54/54 green. With the patched tests below, each copy fails exactly its own test (53/54), and the unmutated 14fc09d copy stays 54/54.
Fix location: skills/decisions/scripts/decisions-render-publish.test.mjs:193-209. Tests only; no source change.
Simplification: the fake returns a valid capture and records whether it was opened. Asserting `opened === false` proves the status filter is what rejected the round, and it needs no new helper.

## Checks the coordinator asked for

1. **The patch matches mine: verified.** `diff` of my r1 scratch fix against 14fc09d's `decisions-render-publish.mjs` shows differences in comments only (lines 116-127): the rewritten block comment and a "Review r1 F1:" prefix. The code is identical: the observedUncheckedAt early return, `doneLabel: doc.doneLabel` on the ACCOUNTED capture, and the Done-label guard at `publish`. The SKILL.md:128-132 wording is my F2 replacement verbatim. The test changes are my r1 tests verbatim, plus `doneLabel: 'Done'` in the shape test.

2. **Both re-check cases exit 3, and the accounted-never-cleared case still clears: measured.** /var/tmp/l58r-6SaC/probe.mjs was run against the 14fc09d copy:
   - LEGIT account-then-clear (the live round-5 shape): code 0, and the page renders `- [ ] Done (last cleared: Sep 27, 2026, 3:00 PM America/New_York)`.
   - HOLE A, a Done-only re-check after the clear: exit 3, with the message "an already-accounted round's Done line (…1:00 PM…) differs from the fresh page's (…2:10 PM…)".
   - HOLE B, the same note typed again with Done re-checked after the clear: exit 3, same message.

3. **The regression test is red at c73d472: verified.** I ran 14fc09d's test file against c73d472's source: 54 tests, 52 pass, 2 fail.
   - The re-check test failed with "Missing expected rejection", because `publish` resolved code 0 there.
   - The shape test failed on the missing `doneLabel`.
   This matches build-r1.md:59-65.

4. **observedUncheckedAt is live on the real path: verified end to end.** The host loop `runRegisteredPickup` calls `pickupOnce` (decisions-pickup.mjs:799), and the CLI `once` does too (:1434). I added a scratch-only test to a copy of decisions-pickup.test.mjs, using the file's own `fixture()`/`deps()` harness, the real `pickupOnce`/`account`/`status`/`openPrivateCapture`, and the real `defaultReadPickupCapture`:
   - After `account`, with Done still checked: status is ACCOUNTED, `observedUncheckedAt` is null, and the capture is accepted with `accounted: true, doneLabel: 'Done'` and the two captured triples.
   - A host poll of the still-checked page leaves `observedUncheckedAt` null.
   - A host poll of the UNCHECKED page writes `observedUncheckedAt = 2026-09-23T16:00:00.000Z` (decisions-pickup.mjs:1119-1124). After that, `defaultReadPickupCapture` returns null.
   So the guard is not inert in production. Only its unit test is (F1 below).

5. **No regressions.** I ran the decisions scripts tests once, on a clean archive of 14fc09d: 509 tests, 508 pass, 1 fail. The failure is `decisions-handback.test.mjs:909` "CLI: real process … calls real git", which fails because the archive copy is not a git repository ("fatal: not a git repository"). It is the same environment-only failure I noted in r1, and 507 + 2 new tests = 509.
   - The publish test file passes 54/54.
   - The status sweep is unchanged: every non-accepted status (NEEDS_RECONCILIATION, UNKNOWN, SENDING, ORPHAN_CAPTURE, PENDING_MANUAL_HANDOFF, CAPTURE_INTENT, INVALID, IDLE, and legacy v1) still returns null.

## Findings

### F1 (MINOR): the two "yields null and never opens the capture" tests do not discriminate
- Evidence:
  - decisions-render-publish.test.mjs:196 and :205: `openPrivateCapture: () => { throw … }` is swallowed by the read layer's catch.
  - Mutation 1 deletes the observedUncheckedAt guard: 54/54 still pass.
  - Mutation 2 accepts NEEDS_RECONCILIATION: 54/54 still pass.
  - Either guard can therefore be removed with the suite green. That is a rule no script checks.
- Fix: the ready patch below, applied to both tests. Verified outcome: 14fc09d 54/54 green; mutation 1 fails only the observed test; mutation 2 fails only the NEEDS_RECONCILIATION test.

Current (lines 193-209):
```js
test('defaultReadPickupCapture: a NEEDS_RECONCILIATION wrapper still yields null and never opens the private capture', async () => {
  const pickup = {
    status: () => ({ status: 'NEEDS_RECONCILIATION', receipt: { state: 'NEEDS_RECONCILIATION', round: 4 } }),
    openPrivateCapture: () => { throw new Error('must not be called once status is rejected'); },
  };
  const capture = await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup });
  assert.equal(capture, null);
});

test('defaultReadPickupCapture: an ACCOUNTED round whose unchecked page was already observed yields null and never opens the capture', async () => {
  const pickup = {
    status: () => ({ status: 'ACCOUNTED', receipt: { state: 'ACCOUNTED', round: 4, observedUncheckedAt: '2026-09-27T22:00:00Z' } }),
    openPrivateCapture: () => { throw new Error('must not be called once the round was observed unchecked'); },
  };
  assert.equal(await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup }), null);
});
```
Replacement:
```js
test('defaultReadPickupCapture: a NEEDS_RECONCILIATION wrapper still yields null and never opens the private capture', async () => {
  let opened = false;
  const pickup = {
    status: () => ({ status: 'NEEDS_RECONCILIATION', receipt: { state: 'NEEDS_RECONCILIATION', round: 4 } }),
    openPrivateCapture: () => { opened = true; return Buffer.from(pageWithComment('hello'), 'utf8'); },
  };
  const capture = await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup });
  assert.equal(capture, null);
  assert.equal(opened, false, 'the status filter, not a failed open, must reject it');
});

test('defaultReadPickupCapture: an ACCOUNTED round whose unchecked page was already observed yields null and never opens the capture', async () => {
  let opened = false;
  const pickup = {
    status: () => ({ status: 'ACCOUNTED', receipt: { state: 'ACCOUNTED', round: 4, observedUncheckedAt: '2026-09-27T22:00:00Z' } }),
    openPrivateCapture: () => { opened = true; return Buffer.from(pageWithComment('hello'), 'utf8'); },
  };
  assert.equal(await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup }), null);
  assert.equal(opened, false, 'the observedUncheckedAt guard, not a failed open, must reject it');
});
```
`pageWithComment` is a hoisted function declaration (line ~776), so calling it from these earlier tests works. This was measured: the patched file runs.

## Prior findings
- r1 F1 (MAJOR, the M8 hole): **fixed**. Code identical to the proposed patch, both holes exit 3, the legitimate case clears, and the regression test is red at c73d472.
- r1 F2 (MINOR, SKILL.md wording): **fixed**, verbatim. skill-text.test.mjs stays green inside the 508.

Scratch at /var/tmp/l58r-6SaC: the r2, redc73, mut1, mut2 and clean2 copies, plus logs. Nothing was deleted, per the brief.
