VERDICT: NEEDS_FIXES 6b95a2d6d0396000472b69ee5e4b9a36d74f3e28

# Lane 51 fix round 1, delta review (wr-2026-09-28-fable-wave), artifact 6b95a2d

Diff reviewed: `git diff 828dc30 6b95a2d`. 6b95a2d itself touches only scripts/build-census.mjs, scripts/build-census.wake-split.test.mjs and docs/census.md. The other files in the range (fable-lead-read.md, review-r1.md, the record) come from the orchestrator's commits fe94c8d and 037d6c4, not the builder. Scope is clean.

All checks ran on scratch copies under the lane-51 scratch dir: `rv2-Ja54` (git archive 6b95a2d), `rv2-base-QuWP` (828dc30), `rv2-full2-gZwW` (6b95a2d plus the patches below), `rv2-testonly2-3xiQ` (6b95a2d plus only the new tests), and mutants in `rv2-mut*`. Fixture scripts are in `rv2-fx/`. The reviewed worktree is untouched: `git status --short` shows 0 entries. Host-transcript reads print only counts and token sums.

Count: 1 MAJOR, 4 MINOR.

Cause: MINOR 3's fix records a pre-window RESULT wake line as a wave starter. When that line's own run straddles the window start (MINOR 2's shape), the same wake is also a `wakeRunRecords` entry with the same timestamp. The pre-window copy sorts first, starts the wave, and the record then counts as coalescable against its own start. The MINOR 2 test has exactly this shape but never asserts `coalescable.turns`.
Discriminating check: on this host's transcript with `--from 2026-09-27T18:21:30Z` (13 s after a RESULT wake whose run straddles), 828dc30 prints coalescable 0, 6b95a2d prints coalescable 1 with upper = 630025 (the whole straddling run, equal to the ceiling), and the patched copy prints 0. Fixture A (the MINOR 2 test's own lines) gives `coalescable.turns` 1 at 6b95a2d and 0 when the same file is read unwindowed.
Fix location: scripts/build-census.mjs censusLeadFile, the `preWindowResultAts` push (:489) and the `preWindowEligible` build (:545-554), plus the ceiling loop (:593-595). Tests go in scripts/build-census.wake-split.test.mjs after :216.
Simplification: no special window-edge bookkeeping is needed. Record every pre-window RESULT line (no hold filter), and drop the ones whose timestamp equals a RESULT record's `at`. A dropped line at the same millisecond as a record can never change the wave result, because the record itself sits in `eligible` at that millisecond and starts the same wave.

---

## Prior findings, one by one

| r1 finding | status at 6b95a2d | evidence |
|---|---|---|
| MAJOR 1: ceiling | Fixed as specified | The `resultRecords`/`resultByModel` block is at build-census.mjs:588-598, the JSON fields at :613 and the markdown line at :1636. Tests at wake-split.test.mjs:141-142, :157 and :165. Mutants "ceiling = coalescableRecords" and "ceiling of any kind" each fail 2 tests. One direction issue remains in the guard it carries; see MINOR 4 below. |
| MINOR 2: straddle tag, test | Test added verbatim at :212-217 and passes | The test does not look at `coalescable`. On its own lines, coalescable is 1 at 6b95a2d. See MAJOR 1. |
| MINOR 3: pre-window wave starter | Implemented, with regressions | The straddle2 test passes, and a mutant that removes the push fails it. The implementation introduces MAJOR 1, MINOR 2 and MINOR 3 below. |
| MINOR 4: re-used request guard | Patch applied verbatim at :573-585 | Untested: mutants that drop the guard in the upper, lower or ceiling loop all give 121 pass, 0 fail. The guard on the ceiling loop points the wrong way for a bound (MINOR 4 below). |
| MINOR 5: wave-start and boundary tests | Fixed | The `>` mutant fails 1 test (the exact-N test). The rolling-wave mutant fails 1 test (the wave-start test). |
| NIT 6: docs/census.md:290 | Fixed | The heading pointer is fixed, and the +1 sentence and the ceiling clause are present. |

Census suite at 6b95a2d: 121 pass, 0 fail. four-read suite: 109 pass, 0 fail.

---

## MAJOR 1: a straddling RESULT run coalesces into the wave it started itself, so the printed W1b count is inflated (a regression from the MINOR 3 fix)

Evidence:
- build-census.mjs:489-491 pushes a pre-window RESULT wake line's timestamp to `preWindowResultAts`.
- If that wake's run is still running when the window starts, the first in-window assistant line opens a windowed run that inherits the pending tag (:451-465). It becomes a `wakeRunRecords` entry with `at` equal to the same timestamp.
- :550-559 then puts both copies into `eligible`. The sort is stable and `preWindowEligible` is spread first, so the pre-window copy starts the wave. The record, 0 ms later, lands in the `else` branch (:565-566) and is pushed to `coalescableRecords`.
- Fixtures (rv2-fx/fx.mjs), 6b95a2d against the patched copy:

  | fixture | 6b95a2d coalescable | patched | truth (unwindowed or by hand) |
  |---|---|---|---|
  | A: the MINOR 2 test's own lines, RESULT wake at -60 s, run straddles `--from` | 1 (upper = the whole run) | 0 | 0 (D, unwindowed: 0) |
  | B: the same, wake 9 min before | 1 | 0 | 0 |
  | G: straddle at -60 s plus an in-window RESULT at +3 min | 2 | 1 | 1 |

- Real data, this host's transcript, `--from 2026-09-27T18:21:30Z` (a RESULT wake at 18:21:17Z whose run straddles; wakes 16, wakeTurns 17): 828dc30 gives 0, 6b95a2d gives 1 with upper claude-opus-5-5=630025, which equals the ceiling, and the patched copy gives 0. With `--from 2026-09-27T03:56:40Z`: 0, then 1 (upper 344962), then 0.
- The Fable re-read fits this shape exactly:
  - At 828dc30 it printed coalescable 0; at 6b95a2d it prints 1 (upper 0.73M).
  - The lead's cross-check lists 7 in-window RESULT wakes, nearest pair 13.8 min.
  - wakeTurns 22 against wakes 21 means a straddling run exists, and the ceiling of 8 turns against 7 in-window RESULT wakes says that straddling run is a RESULT.
  - So "coalescable 1 turn (upper 0.73M, 1.5 percent)" in the record's 01:45:09Z Log line is very likely this artifact, not a real hold saving. Predicted on ben-desktop at the patched head, same window: coalescable 0, unless a second, distinct pre-window RESULT wake lies under 10 min before an in-window RESULT.
  - The ceiling (8 turns, 11172487) is unaffected. The ceiling does not read `eligible`, and the straddling run's in-window tokens belong in it.
- This is the past bug class: the MINOR 2 test's lines trigger the bug, and the test passes because it does not check coalescable.

Fix: the combined patch for build-census.mjs below, part (b). The test patch below extends the MINOR 2 test and adds the G shape.
Predicted outcome, verified on rv2-full2-gZwW: A and B give 0, G gives 1, the census suite passes 125 of 125, and the host windows above give 0.

## MINOR 2: the hold-window filter on pre-window lines breaks wave chaining, so the windowed count differs from the whole-file count

Evidence:
- build-census.mjs:553 keeps only pre-window lines less than `holdMs` before `windowStartAt`.
- Waves chain from their own start, so an older line decides whether a later pre-window line is a wave starter or an absorbed wake.
- Fixture K (rv2-fx/fx2.mjs): RESULT wakes at -15, -8 and +1 min, `--from 0`.
  - Unwindowed: -15 starts a wave, -8 joins it, and +1 (16 min after that wave's start) starts its own. The in-window record is not coalescable.
  - Windowed at 6b95a2d: -15 is filtered out, so -8 becomes a starter and +1 joins it. That gives `coalescable.turns` 1; the truth is 0.
  - The error is an over-count, and the number is still printed as fact.
- The filter came from r1's own wording ("only the ones within WAKE_SPLIT_HOLD_MINUTES before the window start matter"). That wording was wrong, and the builder followed it faithfully.
- The filter is also keyed to `windowStartAt`, the first line at or after `--from`, not to `--from` itself. With no `--from`, `windowStartAt` is `firstAt` (:524), and only post-`--to` lines were ever collected (MINOR 3). With the filter removed, that keying no longer matters.

Fix: the combined patch, part (b), drops the filter. Predicted outcome, verified: K windowed gives 0 and K unwindowed gives 1. The new "chain" test fails at 6b95a2d and passes after the patch. The patched copy's host output equals 6b95a2d's on the 6 windows that have no straddling RESULT.

## MINOR 3: `!inWindowNow` also records wake lines after a `--to` end as "pre-window" starters

Evidence:
- The guard at build-census.mjs:489 is `!inWindowNow`, which is true after `windowEnded` as well as before the window.
- Every such post-window line then passes :553, because `windowStart - atMs` is negative.
- With monotonic timestamps these lines sort after every in-window record and change nothing: fixture E gives 0 either way.
- With a backwards timestamp after the end they do change the count. In fixture L, records at 0 and 15 min fall in separate waves. `--to 16 min` is ended by a line at 17 min, and a wake stamped 12 min follows it. 6b95a2d then gives coalescable 1 (the record at 15 joins the 12-min "pre-window" wave); the truth is 0.
- This does not change the ceiling.

Fix: the combined patch, part (a), guards on `!windowStarted`. In unwindowed and `--to`-only runs `windowStarted` is true from line 1, so nothing is recorded. Predicted outcome, verified: L gives 0, and the census suite is unchanged apart from the new test.

## MINOR 4: the ceiling carries MINOR 4's `liveWindowEntries` guard, which can only push a bound down

Evidence:
- build-census.mjs:595 skips a RESULT run's entry when a later run's line wins that request in `windowById`.
- A request first seen inside a RESULT run was issued during that run. Removing that turn removes that request.
- So the guard drops tokens a hold would save. For a gate that reads "ceiling under 10 percent means NO-BUILD", a ceiling may err high but never low.
- r1 asked for this guard for bucket consistency. That reasoning fits the W1b upper and lower numbers, which describe one model's saving. It does not fit the gate's ceiling.
- Magnitude:
  - measured 0 on this host: the ceiling with and without the guard is identical in 3 windows (2609154, 1545943, 1063211);
  - on Fable it can only raise the 22.9 percent, which is already over the gate. It cannot flip that decision.
  - It matters if a later gap-read reuses these per-record sums.

Fix: the combined patch, part (c), drops the guard from the ceiling loop only. The upper and lower loops keep it. Predicted outcome, verified: fixture J2 (the new "re-used" test) gives ceiling 111 and upper 100. Lower is `{}` because the re-used request is the run's first. Host ceilings are unchanged.

## MINOR 5: the MINOR 4 guard and the "pre-window never coalesces" rule are unpinned

Mutants on 6b95a2d, full `node --test scripts/build-census*.test.mjs`:

| mutant | result |
|---|---|
| drop the guard in the upper loop (:577) | 121 pass, 0 fail |
| drop the guard on lower (:582) | 121 pass, 0 fail |
| drop the guard in the ceiling loop (:595) | 121 pass, 0 fail |
| `} else if (!rec.preWindow)` changed to `} else if (true)` (a pre-window line pushed into coalescableRecords) | 121 pass, 0 fail |
| hold filter removed (:553) | 121 pass, 0 fail |

The `else if (true)` mutant would crash on real data that has two pre-window RESULT lines within 10 min (`rec.ids` is undefined). Nothing in the suite exercises that.

Fix: the test patch below. Verified on rv2-full2-gZwW, 9 mutants of the patched code, each killed:

| mutant | failing tests |
|---|---|
| upper guard dropped | 1 |
| lower guard dropped | 1 |
| pre-window line may coalesce | 1 |
| straddle dedupe removed | 2 |
| hold filter restored | 1 |
| `!inWindowNow` restored | 1 |
| ceiling guard restored | 1 |
| ceiling = coalescableRecords | 4 |
| `>` boundary | 1 |

The same tests on unpatched 6b95a2d (rv2-testonly2-3xiQ) give 120 pass, 5 fail: the 5 new or extended tests.

---

## Patch: scripts/build-census.mjs (parts a, b, c)

(a) Current (:392-396):
```js
  // MINOR 3 (R1): a RESULT, non-Done-tick wake LINE that lands before the window starts, but
  // close enough that an in-window wake could still be within its hold window, must be able to
  // start a wave even though its own run (if any) never becomes a wakeRunRecords entry (that
  // list is windowed-runs-only). Recorded here regardless of window state; filtered to the ones
  // within WAKE_SPLIT_HOLD_MINUTES of windowStartAt once that timestamp is known, below.
```
Replacement:
```js
  // MINOR 3 (R1): a RESULT, non-Done-tick wake LINE that lands before the window starts must be
  // able to start a wave even though its own run (if any) never becomes a wakeRunRecords entry
  // (that list is windowed-runs-only). Recorded only while the window has not started, so a line
  // after a --to end is never one of them (R2).
```
Current (:489):
```js
          if (!inWindowNow && wake.kind === 'RESULT' && !wake.doneTick) {
```
Replacement:
```js
          if (!windowStarted && wake.kind === 'RESULT' && !wake.doneTick) {
```

(b) Current (:545-553):
```js
  // MINOR 3 (R1): pre-window RESULT wake lines within holdMs of windowStartAt may start a
  // wave (so an in-window RESULT less than holdMs after one is coalescable, not a wave
  // starter itself), but they are never pushed into coalescableRecords — they have no
  // in-window run of their own to attribute tokens to.
  const windowStartMsForHold = windowStartAt ? Date.parse(windowStartAt) : NaN;
  const preWindowEligible = preWindowResultAts
    .map((at) => Date.parse(at))
    .filter((atMs) => !Number.isNaN(atMs) && !Number.isNaN(windowStartMsForHold) && windowStartMsForHold - atMs < holdMs)
    .map((atMs) => ({ atMs, preWindow: true }));
```
Replacement:
```js
  // MINOR 3 (R1): pre-window RESULT wake lines may start a wave (so an in-window RESULT less
  // than holdMs after one is coalescable, not a wave starter itself), but they are never pushed
  // into coalescableRecords — they have no in-window run of their own to attribute tokens to.
  // All of them, not only the last holdMs: waves chain, so an older line decides whether a later
  // pre-window line starts a wave (R2). A line whose own run straddles the window start is that
  // run's record already (same wake-line timestamp), so it is dropped here, or the record would
  // coalesce into the wave it started itself (R2).
  const resultRecordAtMs = new Set(wakeRunRecords
    .filter((r) => r.kind === 'RESULT' && !r.doneTick && r.at)
    .map((r) => Date.parse(r.at)));
  const preWindowEligible = preWindowResultAts
    .map((at) => Date.parse(at))
    .filter((atMs) => !Number.isNaN(atMs) && !resultRecordAtMs.has(atMs))
    .map((atMs) => ({ atMs, preWindow: true }));
```

(c) Current (:593-596):
```js
  for (const rec of resultRecords) {
    for (const entry of rec.ids.values()) {
      if (!liveWindowEntries.has(entry)) continue;
      if (!resultByModel[entry.model]) resultByModel[entry.model] = newAgg();
```
Replacement:
```js
  // No liveWindowEntries guard here (R2): a request first seen in a RESULT run was issued by that
  // run, so a ceiling errs high and keeps it even when a later run's line wins it in windowById.
  for (const rec of resultRecords) {
    for (const entry of rec.ids.values()) {
      if (!resultByModel[entry.model]) resultByModel[entry.model] = newAgg();
```
Also update the comment at :571-572, which says the guard serves "this one and the ceiling's". Replace `Declared above both loops that need it (this one and the ceiling's).` with `The ceiling below deliberately does not use it (R2).`

## Patch: scripts/build-census.wake-split.test.mjs

Current (:215-217):
```js
  assert.equal(c.wakes, 0);
  assert.equal(c.wakeSplit.wakeTurns, 1);
});
```
Replacement:
```js
  assert.equal(c.wakes, 0);
  assert.equal(c.wakeSplit.wakeTurns, 1);
  assert.equal(c.wakeSplit.coalescable.turns, 0); // the straddling run never coalesces into its own wave
  assert.equal(c.wakeSplit.coalescable.resultTurns, 1);
});

test('W1b/window edge: a straddling RESULT run starts the wave an in-window RESULT joins, once', async () => {
  const c = await run([wake(-M, 1), asst(-50000, 'a'), toolResult(100), asst(5000, 'b'), wake(3 * M, 2), asst(3 * M + 1000, 'c')], { from: iso(0) });
  assert.equal(c.wakeSplit.coalescable.turns, 1);
});

test('W1b/window edge: pre-window waves chain from their own start, so the windowed count matches the whole file', async () => {
  const lines = [
    wake(-15 * M, 1), asst(-15 * M + 1000, 'a'), wake(-8 * M, 2), asst(-8 * M + 1000, 'b'),
    userPlain(-7 * M, 'x'), asst(-7 * M + 1000, 'p'), wake(M, 3), asst(M + 1000, 'c'),
  ];
  assert.equal((await run(lines)).wakeSplit.coalescable.turns, 1); // -8 joins -15's wave; +1 starts its own
  assert.equal((await run(lines, { from: iso(0) })).wakeSplit.coalescable.turns, 0);
});

test('W1b/--to: a RESULT wake after the window ends never starts a wave, even stamped inside the window', async () => {
  const c = await run([
    wake(0, 1), asst(1000, 'a'), wake(15 * M, 2), asst(15 * M + 1000, 'b'),
    userPlain(17 * M, 'x'), asst(17 * M + 1000, 'x'), wake(12 * M, 3), asst(12 * M + 1000, 'c'),
  ], { to: iso(16 * M) });
  assert.equal(c.wakeSplit.coalescable.turns, 0);
});

test('W1b/ceiling: a request a later run re-used leaves the W1b bounds but stays in the RESULT ceiling', async () => {
  const c = await run([
    wake(0, 1), assistantLine(1000, 'ra', agg(1, 0, 0, 0)),
    wake(4 * M, 2), assistantLine(4 * M + 1000, 'rd1', agg(10, 0, 0, 0)), assistantLine(4 * M + 2000, 'rd2', agg(100, 0, 0, 0)),
    userPlain(5 * M, 'x'), assistantLine(5 * M + 1000, 'rd1', agg(10, 0, 0, 0)),
  ]);
  assert.equal(c.wakeSplit.coalescable.turns, 1);
  assert.deepEqual(c.wakeSplit.coalescable.upperByModel, { [MODEL]: agg(100, 0, 0, 0) });
  assert.deepEqual(c.wakeSplit.coalescable.lowerByModel, {});
  assert.deepEqual(c.wakeSplit.coalescable.resultByModel, { [MODEL]: agg(111, 0, 0, 0) });
});
```
Predicted outcome after both patches, verified on rv2-full2-gZwW: census suite 125 pass, 0 fail; four-read suite 109 pass, 0 fail. docs/census.md needs no change: its ceiling clause stays accurate.

---

## Answers to the brief's attack points

1. **Is the ceiling a true upper bound?** Yes, with one exception: the guard in MINOR 4, which can only lower it, measures 0 on this host, and cannot flip the Fable decision. Checked and clean:
   - Straddling runs are included, in-window part only. Fixture C: a wake 11 min before the window still counts 20 of 20.
   - Records without a timestamp are included; the ceiling filter does not require `at`.
   - The Done-tick exclusion is inert for RESULT: the decisions pickup sends `NOTE_KIND = 'ASK'` (skills/decisions/scripts/decisions-pickup.mjs:27).
   - Two wake lines before one run (RESULT then ASK) tag the run by the last line. That is correct: the ASK opens that turn anyway, so holding the RESULT saves nothing.
   - note-flush delivers one envelope per post, so first-envelope classification loses nothing.
   - A wake whose tag is cleared by another user line before the run is not a live risk: on this host unwindowed wakes 36 = wakeTurns 36, and on Fable wakes 21 = wakeTurns 22 minus the one straddle, so no wake lost its run.
   - Residual, not a defect of this diff: a note delivered by the composer-typing path has no peer prefix and would count as `other`. note-flush.mjs:803 says typing is off unless the machine opts in.
2. **Can a pre-window RESULT reach coalescableRecords or the ceiling?**
   - coalescableRecords: no in code (:565), but it was unpinned (MINOR 5); now pinned.
   - The ceiling: no. It reads `wakeRunRecords` only, and a straddling run's record is a correct member.
   - The filter keyed to `windowStartAt` is wrong with or without `--from` (MINOR 2 and MINOR 3). Drop it.
3. **Partition.** It holds exactly. On this host's transcript over 7 windows (unwindowed, 4 `--from`, 1 `--to`, 1 both), on 6b95a2d and the patched copies, and on 828dc30 in 5 of them:
   - `wakeTurns + stopBlockTurns + otherTurns == leadTurns` in every window;
   - per model, wake + stopBlock + other token totals equal the window totals, with 0 mismatches;
   - every fixture's buckets sum to its window total.
   The fix round did not touch bucket assignment.
4. **Discriminating tests.**
   - The new MAJOR 1 and MINOR 5 tests from r1 discriminate (mutants killed).
   - The MINOR 2 test, the MINOR 4 guard and the pre-window exclusion did not. The patch above closes all of them, 9 of 9 mutants killed.
5. **Territory.** 6b95a2d touches exactly the three files.
