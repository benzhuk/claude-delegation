VERDICT: NEEDS_FIXES 828dc30

# Lane 51 step 1 code review (wr-2026-09-28-fable-wave), artifact 828dc30

Diff reviewed: `git diff a6efbbe..828dc30`. The code is c150c3c: scripts/build-census.mjs, scripts/build-census.wake-split.test.mjs, two assertions in scripts/build-census.completeness.test.mjs, and one line in docs/census.md. 828dc30 adds only the build report.

All checks ran on scratch copies (`git archive` into `rv-*` under the lane-51 scratch dir). The reviewed worktree is untouched: `git status --short` shows 0 entries. Nothing below contains transcript text, only counts, ids and timestamps.

Count: 1 MAJOR, 4 MINOR, 1 NIT, plus the verified-clean areas.

Cause: W1b (build-census.mjs:537-549) counts a RESULT wake as coalescable only when another RESULT wake started a wave less than 10 minutes earlier. The ruled step-2 design saves more than that: a RESULT held next to an ASK or BLOCKED wake, or held until any other turn opens, is also saved. So the printed "upper" is not an upper bound on that design's saving, yet the NO-BUILD read treats it as one.
Discriminating check: this host's transcript has 4 RESULT wake runs, and W1b counts 0 of them as coalescable. Yet all 4 have another run opening within 10 minutes. Two have an ASK wake 1.3 and 2.6 minutes after them, and one comes 4.7 minutes after an ASK post. On the Fable read, 7 RESULT wakes at the mean wake-turn size (19.2M / 22) come to about 12.5 percent of claude-fable-5-1, which is above the 10 percent gate.
Fix location: scripts/build-census.mjs censusLeadFile, just before `return {` (line 564 at 828dc30), plus the coalescable markdown line (:1599) and the two coalescable asserts in scripts/build-census.wake-split.test.mjs (:132-143, :157-165).
Simplification: the gate needs no simulation. Only RESULT is holdable (M2), so the sum of every RESULT, non-Done-tick wake-opened turn is a true ceiling for any hold design. If that sum is under 10 percent, NO-BUILD stands whatever the release rule is.

---

## MAJOR 1: the W1b "upper bound" is not an upper bound of the design the lead ruled, and the NO-BUILD rests on it

Evidence:
- The code implements W1b exactly as M4 words it (scripts/build-census.mjs:537-549): only RESULT-to-RESULT pairs, grouped into waves measured from each wave's start. This is not a conformance defect. The problem is that the number is labelled and used as the gate's upper bound (lead ruling, choice 1; record Log 01:27:41Z: "the upper bound is 0 percent ... NO-BUILD").
- Under M2 as ruled, ASK and BLOCKED post at once and alone, and "a RESULT still held for that recipient ... The recipient's own hooks show it inside the turn the loud note opened, and N3's cursor check then retires it unposted". That saves the RESULT's whole turn. W1b never counts that case.
- Under the ruled trailing debounce, a RESULT is held when any post to the slug happened less than N minutes earlier, including an ASK or BLOCKED post. W1b does not look at those either. For a pure RESULT pair, W1b also over-counts relative to the debounce: the second RESULT is released at last post + N as its own wake. So W1b bounds neither design; it models a third design, the leading-edge hold, and only for RESULT-to-RESULT pairs.
- Measured on this host's transcript (f6c8ae21, whole file, branch reader), counts only:
  - 36 wakes, 4 of them RESULT, and W1b `coalescable.turns` 0.
  - Each RESULT wake run against its neighbours:
    | RESULT wake at (UTC) | next run's opener | minutes to it | previous wake | minutes since |
    |---|---|---|---|---|
    | 2026-09-27T03:56:23Z | ASK wake | 2.6 | ASK | 61.6 |
    | 2026-09-27T06:26:09Z | ASK wake | 124.4 | ASK | 147.2 |
    | 2026-09-27T12:24:42Z | task notification | 0.3 | ASK | 4.7 |
    | 2026-09-27T18:21:17Z | ASK wake | 1.3 | ASK | 10.9 |
  - 4 of 4 have some other run opening within 10 minutes on one side or the other.
  - So W1b says 0 where the ruled M2 path would have absorbed up to 2 (the leading-edge hold plus a loud note) and the debounce up to 1.
- Magnitude on the Fable read, estimated from the record's Log and fable-read.json:
  - 22 wake turns carry 19.2M of the 48.9M claude-fable-5-1 tokens, a mean of 0.87M per wake turn.
  - The 7 RESULT wakes at that mean come to about 6.1M, 12.5 percent. That is above the 10 percent gate.
  - The real figure depends on those 7 turns' actual sizes, which only the ceiling below measures.
  - The lead's "nearest RESULT pair 13.8 min" rules out RESULT-to-RESULT coalescing only.

Fix, in two parts:
- (a) Mechanical: print the ceiling. The patch below was applied on a scratch copy (rv-fvI8). Census tests went to 117 pass, 0 fail. The mutation `resultRecords = coalescableRecords` then failed 2 of 5 wake-split tests, so the new assertions discriminate.
- (b) Judgment, the lead's: re-read the Fable window on ben-desktop at the patched head.
  - If the ceiling is under 10.0 percent of claude-fable-5-1, NO-BUILD stands under any RESULT-only hold. Quote the ceiling in the RESULT.
  - If it is 10.0 percent or more, the "0 coalescable" does not decide the lane. The deciding read is then, for each RESULT wake, the gap to the nearest post or turn opening of any kind (previous post for the debounce, next opening for the M2 absorption). That read is `diag.mjs`/`diag3.mjs` in scratch `rv-Dt3x`: counts and timestamps only.

Patch, scripts/build-census.mjs. Current (:562-564):
```js
  }

  return {
    totalById, windowById, markerFound: windowStarted, windowStartAt, firstAt, lastAt, leadTurns, leadTurnsTotal,
```
Replacement:
```js
  }

  // The ceiling (M4 follow-up): every RESULT, non-Done-tick wake-opened turn. No RESULT-only hold can
  // save more than these turns, whatever its release rule (leading-edge wave, trailing debounce, or a
  // held RESULT surfaced by hooks inside a loud note's turn); the wave count above is one model of it.
  const resultRecords = wakeRunRecords.filter((r) => r.kind === 'RESULT' && !r.doneTick);
  const resultByModel = {};
  for (const rec of resultRecords) {
    for (const entry of rec.ids.values()) {
      if (!resultByModel[entry.model]) resultByModel[entry.model] = newAgg();
      addUsage(resultByModel[entry.model], entry.usage);
    }
  }

  return {
    totalById, windowById, markerFound: windowStarted, windowStartAt, firstAt, lastAt, leadTurns, leadTurnsTotal,
```
Current (:576):
```js
      coalescable: { holdMinutes: WAKE_SPLIT_HOLD_MINUTES, turns: coalescableRecords.length, upperByModel, lowerByModel },
```
Replacement:
```js
      coalescable: { holdMinutes: WAKE_SPLIT_HOLD_MINUTES, turns: coalescableRecords.length, upperByModel, lowerByModel, resultTurns: resultRecords.length, resultByModel },
```
Current (:1599):
```js
  md.push(`- coalescable (W1b, hold ${c.holdMinutes}m, RESULT wakes only, Done-tick excluded): turns ${c.turns}, upper ${byModelSum(c.upperByModel)}, lower ${byModelSum(c.lowerByModel)}`);
```
Replacement:
```js
  md.push(`- coalescable (W1b, hold ${c.holdMinutes}m, RESULT wakes only, Done-tick excluded): turns ${c.turns}, upper ${byModelSum(c.upperByModel)}, lower ${byModelSum(c.lowerByModel)}; ceiling (every RESULT wake turn) turns ${c.resultTurns}, ${byModelSum(c.resultByModel)}`);
```
Patch, scripts/build-census.wake-split.test.mjs. Current (:140-142):
```js
    lowerByModel: { [MODEL]: agg(80, 8, 4, 16) },
  });
```
Replacement:
```js
    lowerByModel: { [MODEL]: agg(80, 8, 4, 16) },
    resultTurns: 2,
    resultByModel: { [MODEL]: agg(270, 27, 13, 54) },
  });
```
Current (:155):
```js
  assert.deepEqual(json.lead.wakeSplit.coalescable, { holdMinutes: 10, turns: 1, upperByModel: { [MODEL]: agg(120, 12, 6, 24) }, lowerByModel: { [MODEL]: agg(80, 8, 4, 16) } });
```
Replacement:
```js
  assert.deepEqual(json.lead.wakeSplit.coalescable, { holdMinutes: 10, turns: 1, upperByModel: { [MODEL]: agg(120, 12, 6, 24) }, lowerByModel: { [MODEL]: agg(80, 8, 4, 16) }, resultTurns: 2, resultByModel: { [MODEL]: agg(270, 27, 13, 54) } });
```
Current (:163):
```js
  assert.match(text, new RegExp(`^- coalescable \\(W1b, hold 10m, RESULT wakes only, Done-tick excluded\\): turns 1, upper ${MODEL}=162, lower ${MODEL}=108$`, 'm'));
```
Replacement:
```js
  assert.match(text, new RegExp(`^- coalescable \\(W1b, hold 10m, RESULT wakes only, Done-tick excluded\\): turns 1, upper ${MODEL}=162, lower ${MODEL}=108; ceiling \\(every RESULT wake turn\\) turns 2, ${MODEL}=364$`, 'm'));
```
Predicted outcome:
- Census tests go to 117 pass (verified).
- On this host the markdown prints `ceiling (every RESULT wake turn) turns 4, claude-opus-5-5=<n>`, which is 1.2 percent of the model's tokens (verified).
- The Fable re-read then decides NO-BUILD on a number that is an upper bound in fact.

## MINOR 2: a run opened by a wake before `--from` is tagged wake-opened. This is the 22-versus-21 difference, and it is neither documented nor tested.

The code path:
- `pendingTag` is consumed only when a windowed run opens (:451-460). A run opened before the window does not clear it.
- If the window starts mid-run, the first in-window assistant line opens a windowed run (`inWindowNow && !inWindowRun`). That run inherits the pre-window wake's tag.
- `wakes` (:414) counts only in-window wake lines.
- So `wakeTurns - wakes` can be exactly +1, and only this way. Every other path makes `wakeTurns <= wakes`: each wake line is consumed by at most one run, and a non-tool-result user line resets the tag.

The lead's read fits this. fable-read.json shows `wakes 21`, `wakeTurns 22`, and `windowStartAt 2026-09-28T19:00:00.100Z`: the window began on a line 0.1 s after `--from`, inside a running turn. The lead's cross-check filters wake lines by timestamp at or after 19:00, so it lists 21.

Reproduced on a scratch fixture (rv-Dt3x/fx.mjs, "straddle"):
- a wake at T-60s, an assistant line at T-50s, a tool_result at T+0.1s, then an assistant line at T+5s;
- `--from T` gives `leadTurns 2, wakes 0, wakeTurns 1`.

Predicted confirmation on ben-desktop: `node wake-kinds.mjs <checkout> <9c61c35a transcript> 2026-09-28T18:00:00Z 2026-09-28T19:00:00Z` lists at least one wake. Its last one precedes the first 19:00Z-or-later non-tool-result user line. That wake is included in W1b's eligible list at its pre-window time, so the 0 already accounts for it.

The tagging itself is right (that run was wake-opened). Pin it and say it.

Fix:
- Add this test to scripts/build-census.wake-split.test.mjs. It was verified to pass at 828dc30. It needs `toolResult` and the helpers from the MINOR 5 block, and the same imports as that block.
```js
test('W1/--from: a run opened by a wake before --from and still running at --from is wake-opened, so wakeTurns can exceed the window wake lines by one', async () => {
  const c = await run([wake(-M, 1), asst(-50000, 'a'), toolResult(100), asst(5000, 'b')], { from: iso(0) });
  assert.equal(c.leadTurns, 1);
  assert.equal(c.wakes, 0);
  assert.equal(c.wakeSplit.wakeTurns, 1);
});
```
- The doc sentence goes into the NIT 6 patch.

## MINOR 3: a RESULT wave that starts just before the window is lost, which undercounts by at most one at the window edge

Scratch fixture "straddle2":
- a RESULT wake at T-60s whose run ends before T;
- a human line and another run, still before T;
- a RESULT wake at T+3min.

The windowed census gives `coalescable 0` and the unwindowed one gives `1`. Pre-window wakes that do not straddle never enter `wakeRunRecords`, so the in-window RESULT becomes a wave starter instead of coalescable. This does not change the Fable read, where the nearest RESULT pair is 13.8 min. It is an undercount, the direction the brief cares about.

Fix, instruction:
- In the user-line branch (:474-501), also record each out-of-window RESULT non-Done-tick wake line's timestamp in a `preWindowResultAts` list. Only the ones within `WAKE_SPLIT_HOLD_MINUTES` before the window start matter.
- Merge them into the W1b sort as wave-starter-only entries: they may start a wave and are never pushed into `coalescableRecords`.
- Test: the straddle2 shape windowed at T gives `turns: 1`.

## MINOR 4: the upper and lower bounds can count a request that a later run re-used, which then counts twice across buckets

- `rec.ids` (:510-516) is each wake run's own last-line-wins map. If the same requestId reappears after a non-tool-result user line, `windowById` gives it to the later run's bucket (last line wins). The earlier wake run's record still holds the stale entry, and `upperByModel`/`lowerByModel` sum it (:550-562).
- Scratch fixture "span": wake `in 1`, other `in 5`, window total `in 6`. The partition holds, but coalescable upper `in 2` counts a request `byModel` gives to `other`.
- On this host 1 of 1,314 requestIds spans two runs, so the effect is tiny and over-counts.

Patch, verified on scratch rv-uIW8: census tests 117 pass, and the span upper then excludes the re-used request. Current (:550-553):
```js
  const upperByModel = {};
  const lowerByModel = {};
  for (const rec of coalescableRecords) {
    for (const entry of rec.ids.values()) {
      if (!upperByModel[entry.model]) upperByModel[entry.model] = newAgg();
```
Replacement:
```js
  const upperByModel = {};
  const lowerByModel = {};
  // An id a later run re-used is counted there (last line wins in windowById), never here as well.
  const liveWindowEntries = new Set(windowById.values());
  for (const rec of coalescableRecords) {
    for (const entry of rec.ids.values()) {
      if (!liveWindowEntries.has(entry)) continue;
      if (!upperByModel[entry.model]) upperByModel[entry.model] = newAgg();
```
Current (:558):
```js
    if (firstEntry) {
```
Replacement:
```js
    if (firstEntry && liveWindowEntries.has(firstEntry)) {
```
If MAJOR 1's ceiling loop is applied, give it the same `if (!liveWindowEntries.has(entry)) continue;` guard, and move the `liveWindowEntries` declaration above both loops.

## MINOR 5: the tests do not pin the wave-start rule or the exact-N boundary; two wrong implementations pass 117 of 117

Mutations on scratch copies, full `node --test scripts/build-census*.test.mjs`:

| mutation | result | tests catch it? |
|---|---|---|
| `>= holdMs` changed to `> holdMs` (:544) | 117 pass, 0 fail | no |
| rolling wave: `waveStartMs = rec.atMs` after each coalesced push | 117 pass, 0 fail | no |
| kind filter replaced by `true` | 115 pass, 2 fail | yes |
| non-tool-result user line no longer clears `pendingTag` | 116 pass, 1 fail | yes |
| ENVELOPE_LINE_RE kind group made non-capturing again | 108 pass, 9 fail | yes |
| `firstKey` overwritten by every request | 115 pass, 2 fail | yes |
| no clear at run open | 117 pass, 0 fail | equivalent mutant (see below) |

The no-clear-at-run-open mutant is harmless. After a windowed run opens, the only way to open another is through a non-tool-result user line, which recomputes the pending tag anyway.

Fix: add the tests below to scripts/build-census.wake-split.test.mjs. Measured: 3 of 3 pass at 828dc30; the `>` mutant fails 1 and the rolling mutant fails 1. The block uses its own helpers; rename them if they collide with the file's.
```js
import { WAKE_PREFIX } from './build-census.mjs';
const M = 60000;
const envR = (n) => buildEnvelope({ from: 'skills-a', to: 'skills-o', id: `skills-a-w-${n}`, kind: 'RESULT', body: 'x', ...AT });
const wake = (ms, n) => ({ type: 'user', timestamp: iso(ms), isMeta: true, origin: { kind: 'peer', from: 'note-flush' }, message: { role: 'user', content: `${WAKE_PREFIX}\n${envR(n)}` } });
const asst = (ms, rid) => assistantLine(ms, rid, agg(1, 0, 0, 0));
const toolResult = (ms) => ({ type: 'user', timestamp: iso(ms), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } });
async function run(lines, opts = {}) {
  const dir = mkTmp('build-census-wake-edge-');
  const p = path.join(dir, 'lead.jsonl');
  fs.writeFileSync(p, lines.map((o) => JSON.stringify(o)).join('\n') + '\n');
  return censusLeadFile(p, opts);
}

test('W1b: a wave is measured from its START, not from the previous wake (0, 6, 12 min -> 1 coalescable)', async () => {
  const c = await run([wake(0, 1), asst(1000, 'a'), wake(6 * M, 2), asst(6 * M + 1000, 'b'), wake(12 * M, 3), asst(12 * M + 1000, 'c')]);
  assert.equal(c.wakeSplit.coalescable.turns, 1);
});

test('W1b: a wake exactly N minutes after the wave start starts a new wave (less than N coalesces)', async () => {
  const c = await run([wake(0, 1), asst(1000, 'a'), wake(10 * M, 2), asst(10 * M + 1000, 'b')]);
  assert.equal(c.wakeSplit.coalescable.turns, 0);
  const d = await run([wake(0, 1), asst(1000, 'a'), wake(10 * M - 1, 2), asst(10 * M + 1000, 'b')]);
  assert.equal(d.wakeSplit.coalescable.turns, 1);
});
```
Merge `WAKE_PREFIX` into the file's existing `./build-census.mjs` import rather than adding a second import line.

## NIT 6: docs/census.md:290 points "below" to a heading docs/census.md does not have, and does not mention the straddle case

Current (end of docs/census.md:290):
```
... and a W1b coalescable-hold simulation over RESULT-only wakes — see `### Wake-opened turns against the rest (window)` below.
```
Replacement:
```
... and a W1b coalescable-hold simulation over RESULT-only wakes — printed in the census markdown under `### Wake-opened turns against the rest (window)`. A run opened by a wake before the window start and still running at it counts as wake-opened, so `wakeTurns` can exceed `wakes` by one.
```
If MAJOR 1 is applied, also add after "RESULT-only wakes": `, plus the ceiling (every RESULT wake turn's tokens, the bound for any RESULT-only hold)`.

---

## Verified clean (no defect)

- **W1b sees RESULT kinds. The 0 is not a blind spot in the kind capture.**
  - Group 4 of ENVELOPE_LINE_RE (:156) is the same `kind` alternation as envelope.mjs's ENVELOPE_RE:30, and it sits in the same position. The body moved to group 5, and the Done-tick body test uses m[5] at both call sites (:195, :241).
  - Scratch fixture (rv-Dt3x/fx.mjs): two RESULT wakes 4 minutes apart, in the real transcript shape (`isMeta`, and an origin with `verifiedPeerPid`/`verifiedPeerProcStart` as on this host). Every variant gives `wakeTurns 2, coalescable 1`, with upper = the second run's two requests and lower = its first request:
    - content as a string;
    - CRLF inside the content;
    - content as two text blocks;
    - content as one text block;
    - each of those with the JSONL file written LF and CRLF (Windows).
- **Real wake shapes on this host.** Every one of the 36 user lines that opens with the peer prefix classifies:
  - 36 wakes: 30 ASK (3 of them Done-tick), 4 RESULT, 2 BLOCKED;
  - 0 prefixed lines missed;
  - one envelope-lookalike line elsewhere in a message correctly returns null.
- **The partition is exact on this host's transcript**, in four windows (unwindowed, `--from 19:00Z`, `--from 22:00Z --to 00:30Z`, and `--to` only):
  - `wakeTurns + stopBlockTurns + otherTurns == leadTurns` (195, 65, 22, 173);
  - for every model and column, wake + stopBlock + other == `windowByModel`, both from `censusLeadFile`'s `windowById` and from `runCensus`'s `lead.windowByModel`: 0 mismatches;
  - 0 windowed entries without a bucket.
  - On the lead's own read: 22 + 1 + 30 = 53 = `leadTurns`.
- **Output regressions: none.**
  - Base a6efbbe against head 828dc30 on the same window of this host's transcript, JSON: the only differences are the added `lead.wakeSplit` and `lead.wakeSplitUnavailable`. `stallNudges.ledgerDir` differs only by the working directory.
  - Markdown: 13 lines added, 0 removed.
  - four-read's `computeTopTierTokens` gives an identical value on both JSONs.
  - `node --test scripts/four-read*.test.mjs`: 109 pass, 0 fail.
  - The lead's fable-read.json parses and goes through four-read.
  - No module outside build-census imports `formatText` from it or reads `wakeSplit`.
  - Codex path: `wakeSplit: null`, `wakeSplitUnavailable: 'codex lead'`, and the fixed markdown line (tested).
- **Census suite at 828dc30**: `node --test scripts/build-census*.test.mjs` gives 117 pass, 0 fail.
- **Scope**: c150c3c touches only scripts/build-census.mjs, scripts/build-census.wake-split.test.mjs, scripts/build-census.completeness.test.mjs (the two `kind: 'ASK'` deepEqual updates, correct for their ASK fixtures) and docs/census.md (one line). 828dc30 touches only docs/specs/fable-wave-51/build-step1.md. There is no change to note-flush, note-send, four-read.mjs, hooks/ or any record.
- **The dedup and window-edge rules are otherwise sound.**
  - The `bucket` rides on the entry, and the last line wins.
  - Out-of-window entries get `bucket: null` and never reach `windowById`.
  - A `--to` cutoff opens no runs after the end.
