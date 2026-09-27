VERDICT: NEEDS_FIXES b662984d4a6433ec91d90f272f9a53ec42edf837

# O1 R8 delta review: overdue-asks-1

- **Worktree:** /home/ben/Code/wt-overdue-asks-1-O1 at `b662984d4a6433ec91d90f272f9a53ec42edf837`. I confirmed the sha with my own `git rev-parse HEAD`. The worktree was clean before and after the review.
- **Range:** `2346279..b662984` is one commit. It touches SKILL.md (+12/-6), note-flush.mjs (+89/-15) and note-flush.test.mjs (+164/-5), and no file outside O1.
- **Gate:** I re-ran `node --test skills/multi/scripts/note-flush.test.mjs` and got 148 pass, 0 fail.
- **Scratch work:** all trials ran under `<scratchpad>/r8src`, `r8a`, `r8c`, `r8d` and `r8e`. The code file in r8src was restored to HEAD and `cmp` confirms it. Nothing was deleted.

Counts: BLOCKER 0, MAJOR 1, MINOR 0, NIT 1.

## Task 1: is R8 implemented to the letter?

Yes. Each point of the ruling maps to the code as follows.

| R8 point | Code | Verdict |
|---|---|---|
| (a) any envelope from recipient to sender in the corpus | `observableAnswerSide` note-flush.mjs:1378-1385: `g.from === ask.to && g.to === ask.from`, any kind | Exact |
| (b) both slugs registered | :1384 `Boolean(inboxes[ask.from]) && Boolean(inboxes[ask.to])`. Registered is enough; a reachable cwd is not required | Exact |
| Otherwise log `overdue-cross-host [<id>] -> <to> — answer side not observable on this host`, record, and send nothing | :1537-1546. The gate runs before target selection. The id is recorded as `{ at, crossHost: true }` and the loop `continue`s | Exact. Test :2192 checks the log text, the recorded id and no retry |
| First run seeds silently, writes the file, logs one `overdue-seeded <n>` | :1483 `existsSync` runs before the read. :1498-1505 seeds every overdue id, writes atomically with mode 600, logs one line and returns before any send | Exact. Test :2240 checks the seed, mode 600 and a normal nudge on the second pass |
| A corrupt state file does not reseed | `existsSync` is true, so the read throws, and the path goes to R1 fail-closed at :1488-1494 | Exact. Test :2280 shows the corrupt file byte-identical afterwards |
| NIT 1 patch from the final review | :1583 `const recipientRepo = reachable(target) ? inboxes[target].cwd : null;` | Applied verbatim |

Test integrity:
- 16 existing tests gained `seedOverdueState`, plus a second registration or an ACK line so that R8 lets the nudge through. No assertion was weakened.
- The five tests that run unseeded (:1884, :1949, :2082, :2096, :2157) still assert `result.open`. The seed pass computes `open`, so those tests still test what they claim.

## Task 2: replay over this host's real ledger

Setup: a scratch copy of `~/.agents/notes/2026-09-2*.md` (7 files), `inboxes: { 'skills-n': { cwd: <existing> } }`, a stubbed send, and `now` = the time of the run. inboxes.json was not read.

| Scenario | Pass 1 | Pass 2 | Status |
|---|---|---|---|
| **r8a**: first run, no state file (what publishing does here) | `seeded: true, open 7, nudged 0, crossHost 0`, **0 sends**, log `overdue-seeded 7` | `open 7, nudged 7, crossHost 0`, **0 sends** | `; overdue: 7 open, 7 nudged` |
| **r8c**: state file present, same 7 ids unrecorded (how a *new* cross-host ASK is judged from now on) | `open 7, nudged 7, crossHost 0`, **7 sends**, all to skills-n | 0 sends | `7 open, 7 nudged` |
| **r8d**: r8c with the two `2026-09-25` `skills-n → skills-fable` lines removed | `open 7, nudged 0, crossHost 7`, 0 sends | 0 sends | `7 open, 0 nudged` |

- **Your expectation holds for publication (r8a).** It gives 0 nudged, with all 7 ids seeded and 0 marked cross-host.
- **The steady state does not hold (r8c).** See MAJOR 1.

## MAJOR 1: on this host, gate (a) is met forever by two old lines, so new cross-host ASKs are still falsely nudged

**Evidence.**
- `~/.agents/notes/2026-09-25.md` holds two lines from skills-n to skills-fable: `[skills-n-one-launch-1]` (ACK, 18:38) and `[skills-n-one-launch-2]` (RESULT, 19:48).
- `readLedgerCorpus` reads every `*.md` in the notes directory with no age limit. So `observableAnswerSide` (:1379-1382) returns true for every ASK from skills-fable to skills-n, for as long as that file exists.
- The replay shows it:
  - r8c sends 7 BLOCKED notes to skills-n, where r8d sends 0.
  - Every 9.26 reply from skills-n is on the other host. For example, `skills-n-linux-green-3` is in no ledger here, as the final review showed.
- So after the seed pass, every new ASK from skills-fable to skills-n that carries a by-time still wakes skills-n 15 minutes past its deadline. That happens even when skills-n answered on time. The seed removed the burst, but this steady-state case, which is what R8 was ruled for, remains.

**Why this matters.**
- The code matches R8's letter. But "any envelope, ever" proves only that a reply channel once reached this host, not that this ASK's answer would.
- This pair's traffic moved hosts between 9.25 and 9.26, which is exactly the situation R8 was written for.

**Fix: confirm with the spec author**, since this narrows R8 (a) from "any envelope" to "any envelope stamped at or after the ASK". The patch is mechanical and verified on scratch.

1. note-flush.mjs:59
   - Old:
     ```js
       NoteError, parseEnvelope, LEDGER_ONLY_KINDS, suggestSlug, DEFAULT_ZONE, zonedWallToInstant, nextCounter,
     ```
   - New:
     ```js
       NoteError, parseEnvelope, LEDGER_ONLY_KINDS, suggestSlug, DEFAULT_ZONE, zonedWallToInstant, nextCounter, envelopeInstant,
     ```

2. note-flush.mjs:1378-1382
   - Old:
     ```js
     function observableAnswerSide(ask, lines, inboxes) {
       const hasReplyLine = lines.some((line) => {
         const g = parseEnvelope(line);
         return Boolean(g) && g.from === ask.to && g.to === ask.from;
       });
     ```
   - New:
     ```js
     function observableAnswerSide(ask, lines, inboxes) {
       const askAt = envelopeInstant(ask);
       const hasReplyLine = askAt !== null && lines.some((line) => {
         const g = parseEnvelope(line);
         return Boolean(g) && g.from === ask.to && g.to === ask.from && (envelopeInstant(g) ?? -Infinity) >= askAt;
       });
     ```

3. Append to note-flush.test.mjs:
   ```js

   test('R8: a recipient-to-sender line older than the ASK does not make its answer side observable', async () => {
     const home = tmp();
     seedOverdueState(home);
     writeOverdueLedgerLine(home, '2026-09-25', 'taxonomy → astra, 9.25.26 18:38 NYC [taxonomy-older-1] ACK: Taking the earlier lane.');
     writeOverdueLedgerLine(home, '2026-09-26', askLine()); // astra -> taxonomy, 9.26.26 20:00, no reply since
     writeInbox(home, 'taxonomy', { kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: 't-older', cwd: home }, { now: DEADLINE });
     const calls = [];
     const result = await runOverdueAsks([], overdueContext(), { home, now: DEADLINE + 16 * 60_000, send: stubSend(calls) });
     assert.equal(calls.length, 0, 'a reply channel seen only before the ASK says nothing about where its answer went');
     assert.equal(result.crossHost, 1);
   });
   ```

**Measured outcome on scratch:**
- With the patch and the new test: 149 pass, 0 fail.
- With HEAD's code and the new test: 148 pass, 1 fail, so the test discriminates.
- The real-ledger steady state (r8e, same setup as r8c) goes from 7 sends to `crossHost 7`, 0 sends.
- The existing R8 tests still pass, because their reply lines (ackLine and the FYI) are stamped 20:10, after the 20:00 ASK.

**Cost of the change.** A same-host pair where the sender's inbox is gone and the recipient never replied after the ASK is now logged cross-host instead of nudged. Gate (b) still covers the live same-host case. The spec author should weigh that.

## NIT 1: SKILL.md misdescribes what the "nudged" count includes

- The paragraph at SKILL.md:148-151 says `nudged` counts asks handled once without a nudge landing: "(no inbox here, the send failed, or the answer side was not observable)".
- The code does something different:
  - `buildOverdueStatus` (:1430-1438) **excludes** cross-host ids from `nudged`. They go to `json.crossHost`, which the status line does not show.
  - Seeded ids are plain ISO strings, so they **are** counted in `nudged`. The r8a pass 2 above reads `7 nudged` with 0 sends.
- Patch, SKILL.md:150:
  - Old:
    ```
    inbox here, the send failed, or the answer side was not observable) — a nudge that lands is itself a
    ```
  - New:
    ```
    inbox here, the send failed, or seeded on the first pass; `--json` counts answer-side-not-observable ids separately as `crossHost`) — a nudge that lands is itself a
    ```
- Predicted: documentation only, 148/148.

## Task 3: regression hunt against the seven attack items

- **Nudge twice across drains or days.** Holds. A cross-host id or a seeded id is recorded, and the `Object.hasOwn` check at :1528 skips it on later passes (tests :2192 second pass and :2240).
  - `pruneOverdueState` reads `at` from both the string and the object entry shapes (`overdueEntryAt`, :1331). An object entry therefore ages out at 8 days exactly like a string entry, still outside the 7-day window.
- **Superseded ASK.** Holds. The gate is unchanged (:1395) and test :2096 still asserts `open 0`.
- **23:50 by 00:10.** Holds. `overdueDeadlineMs` is untouched, and test :1866 was only given a second registration.
- **An ASK whose `re` reply is itself an ASK.** Holds. `answered` is unchanged, and test :2128 still passes.
  - Such a reply ASK does satisfy gate (a) as a recipient-to-sender line. That is correct: it proves replies reach this host.
- **drainQuietly or piggyback path.** Holds. `drainQuietly` is unchanged, and test :2111 checks both behaviour and source.
  - The seed pass also runs only inside `runOverdueAsks`, so a piggyback drain can never seed.
- **Unbounded state file.** Holds.
  - The seed writes only the ids currently overdue, which are within the 7-day window.
  - Later writes prune both entry shapes.
  - Test :2240 checks that the seeded file is mode 600.
- **A send that fails.** Fails open. The send path is unchanged. A failed seed write throws out of `runOverdueAsks` and is caught at `main()`, after the drain's result has been printed.
  - The gate itself adds no new throw path: `parseEnvelope` returns null on bad input, and `inboxes[...]` is a plain lookup.

## C4 fields
Cause: R8 (a) accepts any recipient-to-sender envelope ever seen in an age-unbounded corpus. Two 2026-09-25 lines on this host satisfy it permanently for skills-fable → skills-n, even though every 9.26 reply went to the other host.
Discriminating check: replay on a copy of this host's ledger with an existing empty state file and skills-n registered. HEAD sends 7. With the patch: 0 sends, crossHost 7. The new test fails on HEAD (148/1) and passes with the patch (149/0).
Fix location: note-flush.mjs:59 and :1378-1382, a new test in note-flush.test.mjs, and SKILL.md:150 (NIT). R8 (a) in contracts.md needs the spec author's one-word narrowing, "at or after the ASK".
Simplification: one added comparison inside the existing `some()`. No new mechanism and no new state.
