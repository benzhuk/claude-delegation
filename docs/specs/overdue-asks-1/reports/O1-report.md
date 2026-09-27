VERDICT: PASS

# O1 report — overdue-asks-1 (skills/multi/scripts/note-flush.mjs, its test, skills/multi/SKILL.md)

GOAL served: "work lost or stalled" (docs/GOALS.md) — spec.md "Why" names two lanes stalled 3.5h each
tonight behind an unread by-time; this closes that gap. Nearest NOT avoided: "a new mechanism while an
existing one is unfed" — no new watcher process; the already-running `note-flush` timer/CLI pass gained
one comparison, per spec.md "Why" ("the missing piece is one comparison").

## Files changed
- `skills/multi/scripts/note-flush.mjs` — new pass, state file, `--status`/`--json` extension, main()
  wiring.
- `skills/multi/scripts/note-flush.test.mjs` — 17 new tests, 9 pre-existing `--status`-line assertions
  updated to include the new suffix.
- `skills/multi/SKILL.md` — sentence extension at `SKILL.md:32-33` (the sentence's only occurrence,
  confirmed by grep before editing) and one new paragraph at `SKILL.md:137-143`, placed right after the
  existing `; pickup: ...` status paragraph (`SKILL.md:129-136`), the natural neighbor scout-O1.md named.

Scout addendum (`scout-O1.md`) was not copied into this worktree (only `contracts.md`/`spec.md` were);
read from `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/briefs/scout-O1.md` instead, per the brief's
own path. Its line numbers were for a different base sha and did not match this worktree's file, so all
citations below are this worktree's own current line numbers, verified by grep after each edit.

## What was built (spec item 1-5, contracts R1-R5)

- `runOverdueAsks(argv, context, deps)` — `skills/multi/scripts/note-flush.mjs:1423-1518`. Guards
  identical to `runPostFlushPickup` (`note-flush.mjs:1203-1205`): early `null` on `help`/`status`/
  `dry-run`/`to`/`home` in argv, or when `context.result.ok !== true` (`note-flush.mjs:1424-1425`).
  Same admission budget (`PICKUP_ADMISSION_MS`, `note-flush.mjs:1432-1434`). Own kill switch
  `overdueKillSwitchPath` (`~/.agents/notes/ws-off-overdue`, `note-flush.mjs:1267`) checked beside the
  shared `ws-off` (`note-flush.mjs:1436`).
- Wired into `main()`'s standalone path right after `runPostFlushPickup`, in its own try/catch
  (`note-flush.mjs:1583`): `try { await runOverdueAsks(argv, { result, elapsedMs }); } catch { /* R4 */ }`.
  Never called from `drainQuietly` (`note-flush.mjs:1520-1531`, unchanged) — proven by
  `note-flush.test.mjs:2001` both behaviorally (a piggyback drain with an eligible overdue ASK+
  registered inbox writes no `overdue-*` log line and no state file) and by reading `drainQuietly`'s own
  source text for the string `runOverdueAsks` (absent).
- State file `~/.agents/notes/.overdue-nudged.json`, `{id: iso}` — `overdueStatePath`
  (`note-flush.mjs:1265`), mode 600 (`OVERDUE_STATE_MODE`, `note-flush.mjs:1263`), tmp+chmod+rename
  atomic write matching `transport.mjs`'s `inboxes.json` pattern (`writeOverdueState`,
  `note-flush.mjs:1337-1352`). Pruned (>8 days, `OVERDUE_PRUNE_MS`, `note-flush.mjs:1261`) on every write
  (`pruneOverdueState`, `note-flush.mjs:1327-1334`, called from `recordOverdueId`,
  `note-flush.mjs:1354-1359`, before every write). Id recorded BEFORE the send is attempted
  (`note-flush.mjs:1459`, comment "R1: written BEFORE the send is attempted"), so a throwing send is
  never retried (contracts R1).
- Corrupt/unreadable state file: caught once (`note-flush.mjs:1445-1452`), logged
  `overdue-skipped [*] -> * — state file unreadable; nudging skipped this pass` (`note-flush.mjs:1450`),
  pass returns without nudging anyone (fail closed on the nudge, per R1) — proven by
  `note-flush.test.mjs:1956`.
- Deadline math (contracts R3): `overdueDeadlineMs` (`note-flush.mjs:1285-1300`) takes the envelope's
  own `M.D.YY` + `by` `HH:MM` in `DEFAULT_ZONE`, next day when `by` < the note's own time
  (`note-flush.mjs:1291-1292`). `parseByTime` (`note-flush.mjs:1270-1277`) accepts only exactly
  `H:MM`/`HH:MM` in range; anything else (empty, "tonight", "15:00 NY") returns `null`, never throws.
  Overdue = at least `OVERDUE_GRACE_MS` (15 min, `note-flush.mjs:1256`) past deadline, and inside
  `OVERDUE_WINDOW_MS` (7 days, `note-flush.mjs:1258`) — both checked in `collectOverdueAsks`
  (`note-flush.mjs:1387-1390`).
- Answered/retired (contracts R2): `collectOverdueAsks` (`note-flush.mjs:1369-1396`) builds `answered`
  from any RESULT/BLOCKED `re`-ing the id (ACK excluded, `note-flush.mjs:1379`), and excludes
  `supersededIds(ledgerTexts)` (`note-flush.mjs:1372`, `1382`) — the same helper the existing retirement
  pass uses (`note-flush.mjs:590`).
- Topic recovery (scout-O1.md's open question): `overdueTopicFromId` (`note-flush.mjs:1303-1308`) strips
  the sender's own `<from>-` prefix, then the trailing `-<counter>`, from the id — `parseEnvelope` has no
  `topic` field, confirmed by reading `envelope.mjs:29-30`'s `ENVELOPE_RE` (no `topic` capture group)
  and `envelope.mjs:185-191`'s `parseEnvelope` (returns exactly the regex's named groups).
- The send (contracts R5): `deps.send ?? (await importer()).runNoteSend`, importer defaulting to a
  **dynamic** `import('./note-send.mjs')` (`note-flush.mjs:1408-1411`) — never a static top-level import,
  because `note-send.mjs:95` already imports `drainQuietly`/`deliverToInbox` from this file; a static
  import here would be a direct two-file cycle rather than the three-file cycle
  `runPostFlushPickup`/`decisions-pickup.mjs` already tolerates the same way
  (`note-flush.mjs:1234` uses the identical `deps.importer ?? (() => import(...))` shape). Verified live
  (not part of the suite, run once from the scratchpad and discarded — see "Autonomy calls" below): the
  real `runNoteSend` is reached, attempts a real inbox post, and on failure falls through to
  `overdue-send-failed` exactly as designed.
  Argv built at `note-flush.mjs:1465-1468`: `--from note-flush --to <target> --kind BLOCKED
  --topic <topic> --text <text> --re <id> --id <nudgeId>`. No `--no-type` (a real delivery attempt is
  made, not a queue-only send — `runNoteSend`'s own `--no-type` branch, `note-send.mjs:290`, would
  force `inboxRecord` to `null` and skip the inbox post entirely, which is the opposite of what spec item
  3 asks for: "a real note ... through the existing in-process send"). No `--recipient-repo`/
  `--sender-repo` — the raw host ledger corpus carries no repo information to pass; `runNoteSend`'s own
  fallback (`inboxRecord.cwd` if it exists, else `process.cwd()`, `note-send.mjs:381-406`) decides where
  (or whether) a repo-ledger copy lands, entirely inside `note-send.mjs`, out of this territory to
  change. **The report says which** (contracts R5's own phrase): in the live check this landed in
  whatever repo the note-flush *process's own cwd* resolved to — not necessarily the sender's or
  recipient's repo — which is `note-send.mjs`'s existing, unedited fallback behaviour, not a new branch
  added here.
  Nudge id: `note-flush-<topic>-overdue-<n>`, via `nextNudgeId` (`note-flush.mjs:1413-1419`) seeded from
  `nextCounter(ledgerTexts, prefix)` (`envelope.mjs:213`) and incremented locally within one pass so two
  same-topic nudges in one pass never collide, without re-reading disk after a stubbed send.
- `overdue-send-failed` (contracts R1, not in spec item 5's 3-verb list — R1 pins it explicitly: "A send
  that throws or returns not-ok is logged `overdue-send-failed [<id>]`"): `note-flush.mjs:1478-1480`.
  Proven by `note-flush.test.mjs:1914` (a throwing stub) — not retried on a later pass (same test,
  second call, `calls.length` stays 1).

## `--status`/`--json` (spec item 4)

`buildOverdueStatus(home, fsImpl, now)` (`note-flush.mjs:1399-1406`) is pure/read-only, sharing
`collectOverdueAsks` with the pass so the two can never disagree about "open". Folded into
`buildFlushStatus` on both branches — missing/unreadable heartbeat (`note-flush.mjs:358-368`) and the
normal branch (`note-flush.mjs:380-386`) — appended AFTER the pickup suffix, per scout-O1.md's ordering
note. 9 pre-existing exact-string assertions in `note-flush.test.mjs`, at the lines they were on before
this build (1413, 1430, 1444, 1454, 1474, 1508, 1521, 1533, 1541), were updated to include the new
suffix — the exact suffix text is quoted in "Log line and status suffix, verbatim" below.

## Log verbs (spec item 5 + contracts R1)

`overdue-nudged`, `overdue-no-inbox`, `overdue-skipped (kill switch | state file unreadable)`,
`overdue-send-failed`. All follow the file's existing `appendFlushLog` call pattern
(`note-flush.mjs:1441, 1450, 1479-1484, 1505-1509, 1513`).

## Log line and status suffix, verbatim (as required by the brief)

Successful nudge (`note-flush.mjs:1505-1509`):
```
2026-09-27T01:46:00.000Z overdue-nudged [astra-lane10-1] -> astra — posted note-flush-lane10-overdue-1, 16 min past by-time 21:30
```
No inbox anywhere (`note-flush.mjs:1479-1484`):
```
2026-09-27T01:46:00.000Z overdue-no-inbox [astra-lane10-1] -> taxonomy — neither astra nor taxonomy has a registered inbox on this host
```
Kill switch (`note-flush.mjs:1440-1441`):
```
2026-09-27T01:46:00.000Z overdue-skipped [*] -> * — kill switch
```
Corrupt state file (`note-flush.mjs:1449-1450`):
```
2026-09-27T01:46:00.000Z overdue-skipped [*] -> * — state file unreadable; nudging skipped this pass
```
Send failed (`note-flush.mjs:1512-1513`):
```
2026-09-27T01:46:00.000Z overdue-send-failed [astra-lane10-1] -> astra — inbox-error: ECONNRESET
```
`--status` suffix (`note-flush.mjs:363, 385`), exactly, once open+nudged are both zero:
```
; overdue: 0 open, 0 nudged
```
and with 2 open / 1 already-nudged (`note-flush.test.mjs:1880-1894`):
```
; overdue: 2 open, 1 nudged
```

## The eleven test cases (spec item 6), which test proves which

1. Sender registered (posted to sender, once, second drain posts nothing) —
   `note-flush.test.mjs:1741` (single test proves both halves: one send call, then a second
   `runOverdueAsks` call at a later `now` makes no new call).
2. Sender absent, recipient registered — `note-flush.test.mjs:1778`.
3. Neither registered — `note-flush.test.mjs:1790` (also checks a later pass never retries it).
4. Answered by RESULT — `note-flush.test.mjs:1811`.
5. Answered only by ACK (does not answer; still nudged) — `note-flush.test.mjs:1822`.
6. By-time before the note's own time (next-day) — `note-flush.test.mjs:1834`.
7. Not yet 15 minutes past — `note-flush.test.mjs:1852`.
8. Kill switch — `note-flush.test.mjs:1864`.
9. `--status` suffix — `note-flush.test.mjs:1880` (plus a read-only-only check at `:1896`).
10. Malformed `by` ignored — `note-flush.test.mjs:1904`.
11. Second drain posts nothing for the same id — proven inside case 1's test (`note-flush.test.mjs:1741`,
    second half), and again inside case 3's test (`:1790`, the "no-inbox" id is never retried either).

Additional tests beyond the eleven, for contracts R1/R2/R4 explicitly and the reviewer attack brief in
spec.md's Acceptance section: a throwing send (`:1914`), argv/budget/not-ok guards (`:1936`), a corrupt
state file (`:1956`), the 7-day window (`:1972`), a superseded ASK (`:1986`), and `drainQuietly` never
calling the pass (`:2001`).

## Gate

`node --test skills/multi/scripts/note-flush.test.mjs` — 134 pass, 0 fail. Log:
`docs/specs/overdue-asks-1/reports/O1-gate.log`.

## Autonomy calls made (per the brief's "check in before... or before touching a file outside this
territory's list" — none of these touch a file outside O1's three, so none needed a check-in; recorded
here per "how you resolved them")

1. **Repo-ledger destination for the nudge** (contracts R5's "the report says which"): never pass
   `--recipient-repo`/`--sender-repo`, since the host ledger corpus carries no repo information. Whatever
   `runNoteSend`'s own existing fallback resolves to is what happens; a send that can't resolve a repo at
   all throws, which lands on `overdue-send-failed` (R1's own literal handling for "a send that throws").
   Verified with one real (unstubbed) run outside the test suite — see below — then reverted; not part
   of the committed diff.
2. **"nudged" definition** for `--status`/`buildOverdueStatus` and the pass's own return value: counts
   every id already present in the state file among currently-open asks, regardless of whether the
   underlying send actually succeeded (since R1 records the id before the send is even attempted, "once
   per id ever" reads most consistently as "attempted/recorded," not "delivered"). Documented in
   `note-flush.mjs:1399-1402`'s docstring.
3. **`overdue-skipped` reused for two distinct triggers** (kill switch, corrupt state file) rather than
   inventing a fifth verb, since spec item 5 names `overdue-skipped (kill switch)` as one literal verb
   and contracts R1 only says the corrupt-state case must be "logged once per pass" without naming a
   verb — the detail text after the em dash distinguishes the two causes.
4. **Dynamic import of `note-send.mjs`** rather than a static top-level import, to avoid turning the
   existing three-file cycle (`note-flush.mjs` → `note-send.mjs` → `note-flush.mjs`, already present via
   `drainQuietly`/`deliverToInbox`) into a direct two-file one. Matches the file's own existing pattern
   at the pickup call site (`note-flush.mjs:1234`).

## An incident during verification, fully reverted

While sanity-checking the real (non-test, non-stubbed) `runNoteSend` wiring from a scratch script, the
run's cwd was this session's own working repo (`/home/ben/Code/claude-delegation`), and `runNoteSend`'s
own repo-fallback logic (its own code, unedited by this territory) appended one synthetic BLOCKED line
to that repo's own live, untracked `docs/ledger/2026-09-26.md`. Caught immediately by re-reading the
file; the one appended line was removed by hand, restoring the file to its prior content exactly (git
showed it as already-untracked before and after — no other content was touched). No file inside this
territory or the `wt-overdue-asks-1-O1` worktree was affected; the scratch script itself stays in the
scratchpad directory, not the repo. Lesson for the report only: a real (unstubbed) sanity run of code
that writes to `process.cwd()`'s repo should always be run from an isolated cwd, not the session's own
working directory — noted here rather than repeated silently.

## Deviations from the brief

None. Both territory doc edits (SKILL.md sentence + paragraph) were made; no file outside the
three-file territory list was committed to.
