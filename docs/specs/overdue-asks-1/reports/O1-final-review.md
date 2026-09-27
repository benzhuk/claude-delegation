VERDICT: NEEDS_FIXES 23462793afb7b5fdb217339dba666770dd44b8b0

# O1 final review: overdue-asks-1

Reviewed: worktree /home/ben/Code/wt-overdue-asks-1-O1 at `23462793afb7b5fdb217339dba666770dd44b8b0`. I confirmed the sha with my own `git rev-parse HEAD`. The worktree was clean before and after the review. Written 2026-09-26 23:53 New York.

**Gate, re-run by me.** `node --test skills/multi/scripts/note-flush.test.mjs` gives 143 pass, 0 fail.

**Mutations.** I ran these only on a `git archive HEAD` copy at `<scratchpad>/final`, never in the tree. I restored the copy afterwards and `cmp` confirmed it matches HEAD. I did not delete it.

| Mutation | Result |
|---|---|
| Recipient-first preference | the new test fails (0/1) |
| `supersededIds` replaced by an empty set | 142/1 |
| Any kind with `re` counts as an answer (ACK and re-ASK included) | 141/2 |
| The once-per-id state check removed | 140/3 |

Counts: BLOCKER 0, MAJOR 1 (it needs a lead ruling, not a builder round), MINOR 0, NIT 1.

---

## Task 1: the delta a97c0fd..2346279

- The delta is one commit, 2346279. It adds 13 lines at note-flush.test.mjs:2127-2139 and changes no other file.
- The test is character for character the MINOR 2 patch from O1-review-3.md.
- With HEAD's code it passes. Under the round-3 mutation M2 (recipient first at :1483) it fails. **MINOR 2 is closed.**

## Task 2: MAJOR 1 of round 3 against the 23:55 amendment

The amendment says: log `overdue-send-failed ... no repo resolvable`, record the id, send nothing. The code does exactly that.

- **The id is recorded.** `recordOverdueId` at note-flush.mjs:1497 runs before the guard.
- **The drop is logged.** The line at :1510-1517 is `overdue-send-failed [<id>] -> <target> — no repo resolvable for <target>'s registered inbox; not sent`.
- **Nothing is sent.** `continue` at :1518 comes before the send at :1528.
- The tests pin it:
  - :1963 checks the gone cwd: `calls.length === 0`, the log regex, and the id in the state file.
  - :1978 covers a registered inbox with no cwd.

  Both pass. **MAJOR 1 of round 3 is closed by the amendment.**

## Task 3: the attack brief, re-verified from scratch

| Attack | Verdict | Evidence |
|---|---|---|
| Nudge twice across drains | Holds | The state is read at :1437. The check is `Object.hasOwn(state, id)` at :1476, and the id is recorded before any send (:1492, :1497). Test :1741 runs a second drain and gets no send. The state-check mutation fails 3 tests. |
| Nudge twice across days | Holds | The recorded iso is the nudge time, which is at least the deadline plus 15 min. An entry is pruned only at `now - at > 8 d` (:1331). At that point `now - deadline > 8 d`, beyond the 7-day window at :1387, so a pruned id can never return. A nudge that lands is also a BLOCKED `re <id>`, which closes the ask through R2 (:1378). |
| Two concurrent standalone runs | Accepted residual, unchanged since round 1 NIT 7 | The Windows task is `IgnoreNew`, systemd runs a oneshot and launchd one label, so an overlap needs a manual bare `note-flush` during a timer pass. |
| Superseded ASK | Holds | `retired.has(id)` at :1383 uses `supersededIds`. Test :2054 pins it: the empty-set mutation fails it (open 1 instead of 0). |
| Sent 23:50, by 00:10 | Holds | `dayOffset` is set at :1291 and passed as `day + 1` into `zonedWallToInstant`, whose `Date.UTC` normalises month and year overflow. Probed on scratch: 9.30.26 23:50/00:10 is not due at 10.1 00:24 and is nudged at 00:25; 12.31.26 23:50/00:10 is nudged at 1.1.27 00:25. Test :1836 pins the 9.26 case. |
| ASK whose `re` reply is itself an ASK | Holds | Only RESULT or BLOCKED with `re` answers (:1378). Test :2086 pins it, and the kind mutation fails it. The reply ASK is judged on its own by-time. |
| Pass on the drainQuietly or piggyback path | Holds | `drainQuietly` (:1549-1559) calls only `runNoteFlush`. `runOverdueAsks` has one call site, `main()` :1612, after `runPostFlushPickup`, under the same five-flag guard and the same `ok` and budget checks. Test :2069 asserts both the behaviour and the source. The nudge's own `runNoteSend` does run a piggyback drain, but in that direction, not the reverse. |
| Unbounded state file | Holds | The bound is a prune by age, 8 days, applied on each write (:1325-1333, :1356). No write means no growth. |
| A send that fails | Fails open | A throw or not-ok result is logged `overdue-send-failed` and not retried (:1529-1545). Any other throw (state write, importer) leaves `runOverdueAsks` and is caught at `main()` :1612. By then the drain result is printed and `main` returns 0. Probed with the real `runNoteSend` in dry-run on scratch, using a 200-character topic: the over-cap envelope was rejected, logged `overdue-send-failed`, recorded, and the pass completed. Deliveries inside `runNoteSend` carry their own timeouts (note-flush.mjs:544-546), so a hang cannot stall the oneshot. |

**Real-send argv check.** I ran the pass's exact argv through the real `runNoteSend --dry-run`, in scratch. It passes `parseArgs`, `validateKindNeeds('BLOCKED', 'none')`, `validateId` and `buildEnvelope`, and resolves ok. The stubbed tests alone could not show that.

**Real corpus.** Run read-only against a scratch copy of this host's `~/.agents/notes/2026-09-2*.md`, the pass parses real lines (`buildOverdueStatus` reports `; overdue: 7 open, 0 nudged`). That run is what exposed MAJOR 1.

---

## MAJOR 1: on a cross-host pair, the host ledger holds the ASK but never its answer, so answered ASKs are nudged

**Evidence, measured on this host (Netcup, `v2202608391056492408`) today.**
- `~/.agents/notes/2026-09-26.md` has 11 lines `skills-fable → skills-n` and **zero** lines `skills-n → skills-fable`.
- skills-n did write notes today. The repo ledger has `[skills-fable-linux-green-3 re skills-n-linux-green-3]`, yet `skills-n-linux-green-3` is in no ledger on this host:
  - `grep -l "\[skills-n-linux-green-3" ~/.agents/notes/*.md /home/ben/Code/*/docs/ledger/*.md` finds nothing.
- The cause is SKILL.md:300: "A peer on another machine: run note-send ON that machine over ssh". skills-fable's ASKs to skills-n therefore land here, and skills-n's RESULTs land on skills-fable's host.

**Impact, simulated on a scratch copy of this host's ledger**, with `inboxes: { 'skills-n': { cwd: <existing> } }` and a stubbed send:
- The first pass reports `{ open: 7, nudged: 7 }`. That is seven BLOCKED notes to skills-n, each saying "... with no RESULT or BLOCKED".
- The seven asks are skills-fable-collect-from-origin-1 and -3, one-launch-fix-1, merge-on-acceptance-1, withdraw-status-1, linux-green-1 and linux-green-2.
- Lanes six, seven, eight and ten among them are already accepted and merged (for example `b7ddf11` and `3bd6ef6` in `git log`).
- If the lane lead's inbox is registered here, as the spec's "Claude lane lead on Netcup" implies, that burst reaches it within a minute of this code being published.
- After that, **every** cross-host ASK that carries a by-time produces one BLOCKED to its recipient 15 minutes past the deadline, even when it was answered on time. The text of that BLOCKED is then false.

**Why this is a finding although the code matches the letter.**
- note-flush.mjs:1370-1379 implements R2 exactly: answered means a RESULT or BLOCKED `re` in the corpus, and the corpus is `notesDir(home)`.
- The spec's premise is the gap. "Why" says the flusher "already reads the whole host ledger", and the budget line expects that "a lead that is fine answers with one RESULT it owed anyway".
- For a cross-host pair, the host ledger is half the conversation, and the RESULT was already paid on the other host. That worsens the spec's own "Must not worsen: top-tier tokens per build", and it lands on the lane's own dominant traffic pattern.

**Fix: a lead ruling is needed before merge. A builder round cannot choose between these.**

- **(a) Accept it by amendment (recommended as the minimum).** Amend R2: the corpus is this host's ledger, and a cross-host ASK is nudged at its by-time whether or not it was answered elsewhere. Then make the line honest, so it no longer asserts what this host cannot know. The patch is exact and mechanical:
  - note-flush.mjs:1522. Old: `      + \`${ask.by} with no RESULT or BLOCKED\`;` New: `      + \`${ask.by} with no RESULT or BLOCKED in this host's ledger\`;`
  - note-flush.test.mjs:1762. Old: `    'ASK [astra-lane10-1] from astra to taxonomy is 16 min past its by-time 21:30 with no RESULT or BLOCKED',` New: `    'ASK [astra-lane10-1] from astra to taxonomy is 16 min past its by-time 21:30 with no RESULT or BLOCKED in this host\'s ledger',`
  - skills/multi/SKILL.md:140. Old: `host (neither registered logs it and moves on). BLOCKED, not FYI or ACK, because the multi skill` New: `host (neither registered logs it and moves on). A RESULT sent over ssh lands in the other host's ledger, so an ASK you already answered across hosts can still be nudged once; it needs nothing back. BLOCKED, not FYI or ACK, because the multi skill`

  Predicted outcome: 143/143. The line stays under 700 characters. Line 1762 is the only test that pins the full text.
  This departs from the spec's exact item-3 wording, which is why it needs the lead's amendment.
- **(a′) Optional: suppress the deployment burst.** When `.overdue-nudged.json` does not exist yet, seed it with every id currently in `overdue`, send nothing, and log `overdue-seeded [*] -> * — <n> ids`. Predicted outcome: the first pass after publish sends 0 notes here instead of 7. Later ASKs behave as before.
  - This is a judgment call: it also silences an ASK that is genuinely overdue at deploy time. So it is an instruction, not a patch.
- **(b) Do not nudge a recipient that this host cannot judge.** Route to the recipient only when the sender is not registered here AND the corpus holds a line from `ask.to` to `ask.from` stamped after the ASK. Otherwise log and record.
  - Do **not** take (b) without the spec author. It would also suppress the true positive in the lane's own motivating case: lane ten, sender remote, recipient here and stalled.

## NIT 1 (task 4): the ~300 lines are mostly the spec's own surface; one removable duplication

**Measurement.** The spec's "one comparison" undercounts what the spec itself asks for: a state file, atomic mode-600 writes, prune, window, kill switch, target selection, the status suffix and json, and three log verbs.

- note-flush.mjs is +312/-5. The new block at :1250-1547 is 298 lines: 77 comment, 24 blank, about 197 code.
- Every function maps to a spec item or a ruling.

**Removable duplication, none of it hiding a defect.**
- In territory: :1508-1509 re-derives `reachable(target)`, which was already computed at :1481.
  - Old:
    ```js
        const inboxRecord = inboxes[target];
        const recipientRepo = inboxRecord?.cwd && fsImpl.existsSync(inboxRecord.cwd) ? inboxRecord.cwd : null;
    ```
  - New:
    ```js
        const recipientRepo = reachable(target) ? inboxes[target].cwd : null;
    ```
  - Predicted: behaviour is identical, since `reachable` is `Boolean(cwd) && existsSync(cwd)`, and the result stays 143/143.
- Not removable in this lane:
  - `writeOverdueState` (:1336-1350) is a third copy of transport.mjs `writeInboxesFile` (:1343-1361). A shared `writeJsonAtomic` belongs in transport.mjs, outside O1, so it is a follow-up only.
  - `overdueDeadlineMs` overlaps `envelopeInstant`'s regexes (envelope.mjs:308-316). It cannot reuse it, because the next-day case must go through `zonedWallToInstant` with `day + 1`. Adding 24 h in milliseconds would be off by an hour on DST days.
- The review-history narrative comments at :1475-1480 and :1499-1507 could shrink to one line each. Taste only.

## Verified absences (first-class)

- **No out-of-territory change.** `3bd6ef6..HEAD` touches only the three O1 files, plus the lead's docs/work record and specs.
- **Line endings.** A line ending in `\r` is ignored (probed), which matches the drain's own corpus split at :601. Every writer appends `\n`.
- **Malformed and unusual by-times.** `by 24:00` is ignored. `9:05` (H:MM) is accepted, as R3 requires. `by` equal to the note's time gives a same-day deadline.
- **Kill switches.** `ws-off` and `ws-off-overdue` are checked after the budget and before any read. The pass logs once and returns (tests :1866 and :1882).
- **Status.** `--status` and `--json` carry the suffix and the `overdue` object on both the heartbeat branch and the missing-heartbeat branch (:359-368, :381-385).

## C4 fields
Cause: the "answered" predicate reads only this host's `~/.agents/notes`. A cross-host RESULT is written over ssh into the asker's host ledger, so the recipient's host sees the ASK and never the answer.
Discriminating check: run `runOverdueAsks` on a copy of this host's `2026-09-2*.md` with `skills-n` registered and a stubbed send. Today it gives `{ open: 7, nudged: 7 }`, including four lanes already merged. After (a′) the first pass gives nudged 0. After (a) the text ends "in this host's ledger".
Fix location: a lead amendment to contracts.md R2. For (a), note-flush.mjs:1522, note-flush.test.mjs:1762 and SKILL.md:140. (a′) goes in `runOverdueAsks` at the state read, note-flush.mjs:1435-1443.
Simplification: (a) is a three-line text change and adds no mechanism. NIT 1 removes one line of duplicated reachability logic.

## Goal line
Serves "work lost or stalled" (a missed by-time now wakes someone). MAJOR 1 is where it risks worsening "top-tier tokens per build". The nearest NOT is "a symptom fix": the host-ledger-only premise misses the cross-host half of the conversation.
