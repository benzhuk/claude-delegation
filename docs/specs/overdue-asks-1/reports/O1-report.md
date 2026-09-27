VERDICT: PASS

# O1 report — overdue-asks-1 (skills/multi/scripts/note-flush.mjs, its test, skills/multi/SKILL.md)

## Round 2 (fixes applied against `docs/specs/overdue-asks-1/reports/O1-review-1.md`)

Reviewed sha: `e1bd2d5059f5991bb97f10ec821c5900f1566558`. Every finding the review verified (MAJOR 1,
MAJOR 2, MINOR 3, MINOR 4, MINOR 5) is fixed below; NIT 6/7 and the "observations for the lead" section
are left as the review itself framed them — not builder defects, no fix requested.

1. **MAJOR 1** (R5's host-ledger-only fallback): the review offered the lead two options; option (a)
   touches `note-send.mjs`, outside this territory's file list, and no lead ruling reached this round, so
   option (b) is what's implemented — `note-flush.mjs:1489-1506`. Before a send is attempted, the target's
   registered inbox `cwd` is checked (`inboxes[target].cwd && fsImpl.existsSync(...)`); when it resolves,
   `--recipient-repo <cwd>` is passed explicitly instead of relying on `runNoteSend`'s own fallback; when
   it does not (missing `cwd`, or a `cwd` that no longer exists on disk), nothing is sent at all — logged
   `overdue-send-failed [<id>] -> <target> — no repo resolvable for <target>'s registered inbox; not
   sent`, and the id stays recorded (never retried), per R1. This is weaker than option (a) exactly as the
   review said (a stale/absent cwd now drops the nudge instead of landing it), and that tradeoff is a lead
   call the review deferred — flagged here rather than decided silently. Tests:
   `note-flush.test.mjs:1951` (cwd exists → `--recipient-repo` present, sent), `:1964` (cwd recorded but
   gone → no send, `no repo resolvable` logged, id still recorded), `:1979` (no `cwd` at all → no send).
   Every pre-existing test that expected a send now registers its inbox with a `cwd: home` (an
   already-existing tmp directory) so the stub is still reached — a mechanical, in-territory test change,
   not a behavior change for those cases.
2. **MAJOR 2** (SKILL.md kill-switch paths wrong): `SKILL.md:142` corrected from
   `~/.agents/notes/ws-off-overdue`/`~/.agents/notes/ws-off` to `~/.agents/ws-off-overdue`/
   `~/.agents/ws-off`, matching the code (`note-flush.mjs:1267`, `:1440`). This report's own line 30
   (below) is corrected the same way.
3. **MINOR 3** (`Needs: none` missing): `--needs`, `'none'` added to the send argv
   (`note-flush.mjs:1512`). Test: `note-flush.test.mjs:1755` (`flag('needs') === 'none'`, in the same test
   the review named).
4. **MINOR 4** (untested behaviors): all three test blocks from the review added verbatim, adapted only
   to register a `cwd` on the inbox so the send under test still fires (see MAJOR 1 above) —
   `note-flush.test.mjs:2071` (ASK `re`-ing an ASK does not answer it, R2), `:2084` (a mixed corpus of
   malformed `by`s never stops the one well-formed ASK), `:2096` (prune-by-age plus mode 600, seeded at
   0o644 so the assertion proves the write, not a pre-existing file). A fourth line was also added per the
   review's "also add" note: `note-flush.test.mjs:1882`, the shared `ws-off` switch alone skipping the
   pass (previously only `ws-off-overdue` was exercised).
5. **MINOR 5** (the `nudged` count's meaning): `SKILL.md:143-144` reworded to say what the count actually
   is — ids already recorded among the still-open asks, not "already nudged" in the delivered sense —
   exactly the review's replacement text. Autonomy call 2 below is updated to match.

Gate after all fixes: `node --test skills/multi/scripts/note-flush.test.mjs` — 141 pass, 0 fail (was 134;
+7 new tests: 3 from MAJOR 1, 3 from MINOR 4, 1 from MINOR 4's kill-switch addendum). Log:
`docs/specs/overdue-asks-1/reports/O1-gate.log`.

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
  `overdueKillSwitchPath` (`~/.agents/ws-off-overdue`, `note-flush.mjs:1267`) checked beside the
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
  Argv built at `note-flush.mjs:1514-1518`: `--from note-flush --to <target> --kind BLOCKED
  --topic <topic> --text <text> --needs none --re <id> --id <nudgeId> --recipient-repo <cwd>`. No
  `--no-type` (a real delivery attempt is made, not a queue-only send — `runNoteSend`'s own `--no-type`
  branch, `note-send.mjs:290`, would force `inboxRecord` to `null` and skip the inbox post entirely, which
  is the opposite of what spec item 3 asks for: "a real note ... through the existing in-process send").
  **Round 2** (review MAJOR 1): `--recipient-repo` is now always passed explicitly rather than left to
  `runNoteSend`'s own fallback — `note-flush.mjs:1489-1506` reads `inboxes[target].cwd`, and only when
  `fsImpl.existsSync(cwd)` is true does the send happen at all, with that `cwd` as `--recipient-repo`.
  When the target's inbox has no `cwd`, or one that no longer resolves on disk, nothing is sent: logged
  `overdue-send-failed [<id>] -> <target> — no repo resolvable for <target>'s registered inbox; not
  sent`, id already recorded so never retried. This replaces round 1's choice to let `runNoteSend`'s own
  `process.cwd()` fallback decide (`note-send.mjs:381-406`), which the review found could append a repo
  ledger under the flusher's own cwd — never the recipient's repo — violating R5. See "Round 2" above for
  the full writeup and the lead-ruling question this leaves open (option (a), touching `note-send.mjs`,
  was not taken).
  Nudge id: `note-flush-<topic>-overdue-<n>`, via `nextNudgeId` (`note-flush.mjs:1462-1468`) seeded from
  `nextCounter(ledgerTexts, prefix)` (`envelope.mjs:213`) and incremented locally within one pass so two
  same-topic nudges in one pass never collide, without re-reading disk after a stubbed send.
- `overdue-send-failed` (contracts R1, not in spec item 5's 3-verb list — R1 pins it explicitly: "A send
  that throws or returns not-ok is logged `overdue-send-failed [<id>]`"): `note-flush.mjs:1531-1532`
  (send throws or returns not-ok) and `note-flush.mjs:1500-1505` (round 2: no repo resolvable, so nothing
  is even attempted). Proven by `note-flush.test.mjs:1929` (a throwing stub, not retried on a later pass)
  and `:1964`/`:1979` (no resolvable repo, round 2).

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
`overdue-send-failed (send threw/not-ok | round 2: no repo resolvable)`. All follow the file's existing
`appendFlushLog` call pattern (`note-flush.mjs:1441, 1450, 1479-1484, 1500-1505, 1524-1528, 1531-1532`).

## Log line and status suffix, verbatim (as required by the brief)

Successful nudge (`note-flush.mjs:1524-1528`):
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
Send failed, a throw/not-ok result (`note-flush.mjs:1531-1532`):
```
2026-09-27T01:46:00.000Z overdue-send-failed [astra-lane10-1] -> astra — inbox-error: ECONNRESET
```
Send failed, round 2: no repo resolvable at all (`note-flush.mjs:1500-1505`):
```
2026-09-27T01:46:00.000Z overdue-send-failed [astra-lane10-1] -> astra — no repo resolvable for astra's registered inbox; not sent
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
2. Sender absent, recipient registered — `note-flush.test.mjs:1780`.
3. Neither registered — `note-flush.test.mjs:1792` (also checks a later pass never retries it).
4. Answered by RESULT — `note-flush.test.mjs:1813`.
5. Answered only by ACK (does not answer; still nudged) — `note-flush.test.mjs:1824`.
6. By-time before the note's own time (next-day) — `note-flush.test.mjs:1836`.
7. Not yet 15 minutes past — `note-flush.test.mjs:1854`.
8. Kill switch — `note-flush.test.mjs:1866` (plus round 2's `:1882`, the shared `ws-off` switch alone).
9. `--status` suffix — `note-flush.test.mjs:1895` (plus a read-only-only check at `:1911`).
10. Malformed `by` ignored — `note-flush.test.mjs:1919`.
11. Second drain posts nothing for the same id — proven inside case 1's test (`note-flush.test.mjs:1741`,
    second half), and again inside case 3's test (`:1792`, the "no-inbox" id is never retried either).

Additional tests beyond the eleven, for contracts R1/R2/R4 explicitly and the reviewer attack brief in
spec.md's Acceptance section: a throwing send (`:1929`), round 2's three MAJOR 1 tests — cwd exists
(`:1951`), cwd recorded but gone (`:1964`), no cwd at all (`:1979`) — argv/budget/not-ok guards
(`:1989`), a corrupt state file (`:2009`), the 7-day window (`:2025`), a superseded ASK (`:2039`),
`drainQuietly` never calling the pass (`:2054`), and round 2's three MINOR 4 tests — an ASK `re`-ing an
ASK does not answer it (`:2071`), a mixed corpus of malformed `by`s (`:2084`), and prune-by-age plus
mode 600 (`:2096`).

## Gate

`node --test skills/multi/scripts/note-flush.test.mjs` — 141 pass, 0 fail (round 1 was 134; round 2 adds
7). Log: `docs/specs/overdue-asks-1/reports/O1-gate.log`.

## Autonomy calls made (per the brief's "check in before... or before touching a file outside this
territory's list" — none of these touch a file outside O1's three, so none needed a check-in; recorded
here per "how you resolved them")

1. **Repo-ledger destination for the nudge** (contracts R5's "the report says which") —
   **superseded in round 2**. Round 1's call (never pass `--recipient-repo`, let `runNoteSend`'s own
   fallback decide) is what the review's MAJOR 1 found: that fallback can append a repo ledger under the
   flusher's own cwd, never the recipient's, which violates R5. Round 2 replaces it with the review's
   option (b) — pre-check `inboxes[target].cwd` on disk, pass `--recipient-repo` explicitly when it
   resolves, otherwise send nothing at all (logged, id still recorded, never retried). Option (a), a
   `note-send.mjs` change, was left to the lead per the review's own framing; this round did not touch
   that file. See "Round 2" at the top of this report.
2. **"nudged" definition** for `--status`/`buildOverdueStatus` and the pass's own return value: counts
   every id already present in the state file among currently-open asks, regardless of whether the
   underlying send actually succeeded (since R1 records the id before the send is even attempted, "once
   per id ever" reads most consistently as "attempted/recorded," not "delivered"). Documented in
   `note-flush.mjs:1399-1402`'s docstring. **Round 2** (review MINOR 5): the code and this definition are
   unchanged — the review confirmed the code matches R2 — but `SKILL.md:143-144`'s prose was wrong about
   what the count means (it read as "already nudged" in the delivered sense) and is now reworded to match
   this call exactly.
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

None in round 1. Both territory doc edits (SKILL.md sentence + paragraph) were made; no file outside the
three-file territory list was committed to.

Round 2: none either — the fix for MAJOR 1 is entirely inside `note-flush.mjs`/its test/`SKILL.md`.
Flagging for the lead, not a deviation: the review's option (b), implemented here, means a registered
inbox with a missing or stale `cwd` now gets no nudge at all rather than a possibly-misrouted one. If
`cwd` is commonly absent on this host's real inboxes (the review's own "observations for the lead" notes
several `10:15 NYC`/`09:00 NYC` by-times and a real 7-open/0-nudged burst, but doesn't say whether their
inboxes carry a `cwd`), this could mean fewer real nudges land than round 1's version would have sent —
correctly routed or not. Worth a lead decision on option (a) (a `note-send.mjs` flag) if that turns out
to matter in practice.
