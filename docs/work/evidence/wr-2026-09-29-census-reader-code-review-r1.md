VERDICT: APPROVE dc53988d6add72fe8f0560b184c1ec900360335c

# Lane 40b census reader: independent code review r1

- Reviewed artifact: `dc53988d6add72fe8f0560b184c1ec900360335c` (the only source commit is `d40dd1b0`; later commits touch tests and docs only).
- Source territory: `scripts/jsonl-lines.mjs`, `scripts/build-census.mjs`, `scripts/token-census.mjs`.
- Tests: `jsonl-lines.test.mjs`, `build-census.codex.contract.test.mjs`, `build-census.test.mjs`, `token-census.test.mjs`.
- Reviewed tree: left untouched (`git status` clean at the end). All trial edits went to a plain-file `git archive` copy in review scratch. The copy was restored byte-identical after each mutant run.
- Mutex: `Global\claude-verify` was acquired nonblocking for every run and was never busy.
- One command was blocked. My first mutation driver copied `process.env` to redirect TMP, and the secret-guard hook rejected it. I did not retry that approach. The later drivers pass no environment and inherit the default, so test temp directories went to the OS temp path as the suite normally does.

## Blocking findings

None. Blocking findings: 0.

## Verification performed

1. **Focused green.** Ran `node --test` on the 4 in-scope test files: **157/157 pass**, 0 fail. The red run on production base `fb63673` covered 155 tests in the same 4 files. The segment addendum added 2, so 155 + 2 = 157: the green count covers every existing test plus every new one.
2. **The red receipts discriminate the old source.** The red report lists 14 named failures, each with the exact old-source symptom:
   - `damaged: malformed JSON row`;
   - 0 responses from the lead and subagent readers;
   - `malformedLines: 3`;
   - the final-row "no end-bound witness" reasons.

   I also reproduced this independently. Putting `readline.createInterface` back into both `openLines` seams (scratch copy) makes exactly the 4 production-reader Unicode tests fail:
   - Codex public API;
   - `censusLeadFile`;
   - `censusSubFile`;
   - token-census `runCensus`.
3. **Old readline error behavior matches.** On Node v24.18.0, the old `readline` async iterator also rethrows ENOENT from the input stream. Moving to `lfLines` therefore does not change the error surface for `scanMainFile`, `censusCodexLeadFile` or the Claude readers.
4. **Mutation checks** ran on the scratch copy against `build-census.codex.contract.test.mjs` and `build-census.test.mjs`:

| Mutant | Result |
|---|---|
| M1: go back to the final-row witness (`finalRowCompletesTurn && finalEvent.turnId === lastStartedTurn`) | killed, 5 fail |
| M2: broad pre-window exclusion (drop the `childEnded` requirement) | killed, 6 fail |
| M3: drop the `!state.damaged` guard | killed, 1 |
| M4: drop the `!state.timestampConflict` guard | killed, 1 |
| M5: drop the equal-time tie `&&=` | killed, 1 |
| M7: `<` becomes `<=` at the `--from` boundary | killed, 1 |
| M8: witness by `startedTurns` membership, with no clear on start | killed, 2 |
| M10: drop `!invalidTaskStarted` from `childEnded` | killed, 1 |
| M6: drop `!state.untimedStart` | **survives** (advisory A1) |
| M9: an invalid start no longer clears `openTurn` | survives. Equivalent mutant: `invalidTaskStarted` already blocks `childEnded`. |
| M11: drop `windowResponses === 0` | survives. Equivalent mutant: `latestAt < sharedFrom` already implies no in-window response. |

## Attack-surface answers

- **Reader: LF-only framing and UTF-8 chunk boundaries**
  - `jsonl-lines.mjs:9-24` splits on `\n` only and strips one CR after joining chunks, so a CR at the end of one chunk followed by LF in the next is handled (tested).
  - Decoding stays with `createReadStream({encoding:'utf8'})`, which uses a StringDecoder internally, so a multibyte character split across chunks is decoded correctly.
  - Non-string chunks throw `TypeError`.
  - The build-census Claude lead test puts the U+2028 bytes across the 65536-byte chunk boundary and asserts its own placement (`% 65536 === 65535`).
  - A lone CR in the middle of a row is no longer a row break. It was under readline, but JSON cannot contain a raw CR, so no valid row is affected.
- **Final remainder, CR, empty rows and errors**
  - A final row without LF is yielded once. No extra row is created after a trailing LF.
  - A CR-only remainder becomes `''`, and every caller skips it with `!line.trim()`.
  - A source error rethrows without yielding the pending partial row (`for await` throws before the post-loop yield).
  - An early `break`/`return` (for example `detectLeadHost` returning early) destroys the stream (tested).
- **Malformed later usage stays PARTIAL.**
  - Malformed JSON after `task_complete` sets `damaged` and breaks the loop (`build-census.mjs:833`). `childEndedBeforeWindow` then requires `!damaged` (`:1556`), so the exclusion does not apply and the reason is pushed. Tested.
  - A later usage row missing attribution throws, making the child unusable, which is PARTIAL.
  - A later usage row with non-numeric fields that falls in the window leaves the fields UNSUPPORTED.
- **Completed pre-window child vs incomplete history.** The exclusion (`:1555-1556`) requires all of:
  - a finite `sharedFrom`;
  - `latestStartCompleted`;
  - no invalid or untimed start;
  - no damage and no `timestampConflict`;
  - 0 window responses;
  - a finite `latestAt` strictly before `sharedFrom`.

  An incomplete pre-window child still gets the exact reason `child <id> has no end-bound witness for the requested window` (tested). With a finite `sharedFrom`, a row without a timestamp already makes `damaged`, so a child with an unknown end can never be excluded.
- **The witness belongs to the latest task.** `:890-904`: every `task_started` row sets `openTurn` and clears the witness, whether its id is valid, invalid or repeated. Only a `task_complete` whose usable `turn_id` equals `openTurn` sets the witness. An earlier completion cannot be reused by a newer start or by a restart with the same id (tested, and M8 is killed).
- **Missing turn ids**
  - A start with no id leaves `openTurn = null` and sets `invalidTaskStarted`, which is PARTIAL and makes `leadTurns` UNSUPPORTED (tested, including across segments).
  - A `task_complete` with no id is ignored.
  - A usage row with no id throws.
- **Duplicate files, file order and conflicting timestamps.**
  - Merging segments (`:1462-1469`) gives the same result in any order: the segment with the strictly newest start owns the witness, and equal-time owners are combined with AND. I checked the three-segment permutations mentally, and M5 is killed.
  - `invalidTaskStarted` and `untimedStart` are OR-merged.
  - Non-monotonic timestamps within a file mark it `damaged`, so the witness taken in file order and the latest start taken by timestamp cannot disagree.
- **`item_completed` is never a witness.** The only terminal check is `payload.type === 'task_complete'` with a usable `turn_id` (`:899`). A matching-id UserMessage `item_completed` and agent text saying "task complete" both stay PARTIAL (tested). No new payload shape was invented.
- **Existing public outputs and the meaning of `coverageSupported` are preserved.**
  - The `coverageSupported` formula is unchanged.
  - Lead rules are unchanged (still final-row).
  - Reason strings are unchanged.
  - `censusCodexLeadFile` only gains 2 extra fields in its return value (`latestStartCompleted`, `untimedStart`); no existing field changes.
  - The post-`--to` skip is unchanged.
  - `four-read.mjs` is untouched.
  - The Lane55 open zero-usage child still stays PARTIAL, because without a finite start there is no exclusion.
- **Other JSONL readers.** A repo-wide search for `node:readline|createInterface` finds only `scripts/test-home.test.mjs`, which reads child stdout, not a JSONL log. There is no follow-up.

## Advisory (non-blocking, not counted)

**A1: LOW. The `untimedStart` guard is live but no test pins it (mutant M6 survives).**
- Location: `build-census.mjs:1554` (`&& !state.untimedStart`).
- Why it can matter:
  - In bounded or from-mode, the guard is redundant, because an untimed row already sets `damaged`.
  - In open mode with segments it carries weight. Suppose segment A has a timed start that completed, and segment B has a *timestamp-less* `task_started` that is still open. Segment A owns the witness, so without the guard the census would report COUNTED even though B's task is still open.
- Fix: add one test in `build-census.codex.contract.test.mjs`, open mode (`from: null, to: null`):
  - Segment A: `meta('segmented-untimed', ROOT, ROOT, 1)`, `taskStarted('a-turn', '2026-09-27T12:00:00.000Z')`, `context('a-turn', MODEL, '2026-09-27T12:00:01.000Z')`, `usage('a-resp','a-turn',{output:4, at:'2026-09-27T12:00:02.000Z'})`, then `task_complete a-turn` at `12:00:03`.
  - Segment B: `meta('segmented-untimed', ROOT, ROOT, 1)`, then the literal row `{ type: 'event_msg', payload: { type: 'task_started', turn_id: 'b-turn' } }` with no timestamp.
  - Assert that the scope is incomplete, that the reason matches `/open or unbounded child segmented-untimed has no end-bound witness/`, and that `combined === null`.
  - Predicted outcome: green on dc53988 and red under M6.

**A2: LOW. The reader cost is quadratic for one very long row (readline's was linear).**
- Location: `jsonl-lines.mjs:15-21`. The code runs `rest += chunk` and then `rest.indexOf('\n', 0)` on every chunk, which flattens and rescans the whole pending row each time.
- Measured on a synthetic single row: 8 MB took 183 ms and 32 MB took 2,882 ms (about 16× the time for 4× the size). Normal Codex and Claude rows are far below this.
- Ready-to-apply patch. Current:
  ```js
      rest += chunk;
      let start = 0;
      let end;
      while ((end = rest.indexOf('\n', start)) !== -1) {
        yield stripCr(rest.slice(start, end));
        start = end + 1;
      }
      rest = rest.slice(start);
  ```
  Replacement:
  ```js
      let end = chunk.indexOf('\n');
      if (end === -1) { rest += chunk; continue; }
      yield stripCr(rest + chunk.slice(0, end));
      let start = end + 1;
      while ((end = chunk.indexOf('\n', start)) !== -1) {
        yield stripCr(chunk.slice(start, end));
        start = end + 1;
      }
      rest = chunk.slice(start);
  ```
- Predicted outcome: linear time. All 5 `jsonl-lines` tests should stay green: a CR split across chunks still becomes `'x'`, errors still skip the remainder, and an early return still destroys the stream.

## Remaining PARTIAL coverage limits (named, not defects of this lane)

1. **The lead witness is still final-row only**, as the spec pins ("Keep lead final-row behavior unchanged"). An open-mode lead whose `task_complete` is followed by a benign `item_completed` stays PARTIAL. The positional repair applies to children only.
2. **Usage after `task_complete` with no new `task_started` is treated as part of the ended child**, per the terminal ruling ("rows after it are benign"). If a child keeps writing usage after its completion, the census counts what is on disk and claims end coverage.
3. **Conflicts across segments are compared only for in-window entries** (`subWindowById`). For a pre-window child, `state.timestampConflict` can only come from a conflict inside one file, so two conflicting pre-window copies in different segment files are not seen. This does not affect window totals, and the old code had the same gap. The same pre-existing gap lets a response that is in-window in one segment and pre-window in another escape comparison. Both are outside this lane's scope.
4. **An excluded zero-usage pre-window child still contributes an `unusable child coverage ...` entry** to `lead.codex.unavailable` in JSON while the verdict is COUNTED. Text output hides `unavailable` when supported, and `four-read` checks `coverageSupported` first. This is not hiding a reason (the spec forbids that), but a JSON consumer may see a stale-looking entry.
5. **An untimed `task_started` in open mode makes the child PARTIAL** even when its position in the file is clear. This is conservative by design.

## New mechanism / symptom-compensation check

- `scripts/jsonl-lines.mjs` is the single shared splitter the contract authorized. It replaces `readline` in both callers; it is not an extra layer on top of it.
- `latestStartCompleted` fixes the actual cause: it replaces the final-row test. It is not a compensating special case.
- `untimedStart` is a small conservative guard needed for merging segments.
- No persistent state, new CLI flag, relabelling of outputs or manufactured witness was added. There is no symptom compensation.

## C4 fields

Cause: `node:readline` treats literal U+2028 and U+2029 as line breaks, so valid JSON rows were split into unparseable pieces before `JSON.parse` in both `openLines` seams. Separately, Codex child end coverage accepted only a final-row `task_complete` and reset `finalRowCompletesTurn` on every later row, so a benign trailing `item_completed` erased a real completion.

Discriminating check: reverting both `openLines` to readline on a scratch copy fails exactly the 4 production-reader Unicode tests. Reverting the child witness to the final-row rule (M1) fails 5 temporal tests. Broadening the exclusion past the witness (M2) fails 6. The damaged, conflict, tie, boundary and invalid-start guards are each killed by a dedicated test. The focused gate is 157/157 green at dc53988.

Fix location: `scripts/jsonl-lines.mjs` (`lfLines`); `openLines` in `scripts/build-census.mjs:294` and `scripts/token-census.mjs:273`; the positional start/complete tracking in `censusCodexLeadFile` (`build-census.mjs:821-904`); the child segment merge (`:1457-1469`); and the child temporal rules (`:1554-1581`).

Simplification: one shared LF splitter serves both census readers. One positional boolean per file, merged by owner of the newest start, replaces the final-row and set-lookup test. There is one guarded `continue` per mode, and no new persistent mechanism.
