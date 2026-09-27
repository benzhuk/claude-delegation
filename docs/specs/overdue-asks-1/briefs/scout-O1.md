# Scout — O1 (skills/multi/scripts/note-flush.mjs, its test, skills/multi/SKILL.md)

Read at base d5d769f8c5a026a20d06a0e8eee3b4bccd9da9ba.

## Files and symbols
- `skills/multi/scripts/note-flush.mjs` (1319 lines) exists. `main()` at line 1286: `--help` and
  `--status` handled first, then the standalone path calls `runNoteFlush(argv)` (1302) and, in its own
  try/catch, `runPostFlushPickup(argv, { result, elapsedMs })` (1305). This is exactly where item 1's
  `runOverdueAsks` call goes — same try/catch pattern, same guard list.
- `runPostFlushPickup(argv, context, deps)` (1196) is the guard template: it early-returns on
  `['help','status','dry-run','to','home'].some(hasArg)` (1197) and on `context?.result?.ok !== true`
  (1198) before doing anything. `hasArg` (1153) is a small exact/`--name=` matcher, already exported
  in-file (not exported to other modules — re-implement or export if O1 needs it elsewhere).
- `drainQuietly` (1243) calls only `runNoteFlush(argv, { mode: 'piggyback', ...deps })` — it never
  touches `runPostFlushPickup` or any new overdue pass. A test should assert this by grepping
  `drainQuietly`'s body/call graph, not just its name.
- `switchActive(file, fsImpl)` (1164) is the existing kill-switch check (`ws-off` etc.) — reuse it
  verbatim for `ws-off` / `ws-off-overdue`, same lstat-based semantics (ENOENT/ENOTDIR = absent).
- `buildFlushStatus` (345) builds the `--status` line/json; the pickup suffix is appended by
  `buildPickupStatus` (315) after the base line. The spec's `; overdue: <n> open, <m> nudged` suffix
  should be appended the same way, after the pickup suffix, on both the "no heartbeat" branch (357-364)
  and the normal branch (375-379) — both currently build a `json` object the overdue field must extend.
- `readLedgerCorpus([notesDir(home)], fsImpl)` (transport.mjs:869, used at note-flush.mjs:589) is
  already how the retirement pass reads the whole ledger corpus. `notesDir(home)` — confirm helper
  location (transport.mjs) — is the single source of ledger dirs; do not invent a second.
- No `runOverdueAsks`, `.overdue-nudged.json`, `DEFAULT_ZONE`-based deadline math, or `ws-off-overdue`
  exists yet anywhere in the file. This is new code, not an edit to something drifted.
- `skills/multi/scripts/note-flush.test.mjs` (1691 lines) already has `tmp`, `writeInbox`, and a
  `deps.deliverToInbox` stub pattern (per contracts R6) — read a nearby existing test using
  `deliverToInbox` stubbing to match its exact deps shape before writing new tests.
- `skills/multi/SKILL.md`: the "How a note reaches you" section (starts line 95) is the delivery
  section item 7 means — the `note-flush --status` paragraph around lines 115-121 (describing the
  pickup suffix) is the natural neighbor for the new one-paragraph rule + kill switch. The sentence "A
  peer that says nothing is working, not stuck" is at line 32, inside the "Receipts, not heartbeats"
  bullet — append there, not elsewhere (only one occurrence in the file).

## Helpers to reuse
- `envelope.mjs`: `parseEnvelope(line)` (185) returns `{from,to,date,time,tz,id,re,sup,kind,body,goal,
  details,needs,by}` or null. `DEFAULT_ZONE = 'America/New_York'` (line ~25). `nextCounter(texts,
  prefix)` / `highestCounter` (200-213) derive the next `<from>-<topic>-<n>` id — use with prefix
  `note-flush-<topic>` for the BLOCKED note's id (never collide with the ASK id, per R5).
- `transport.mjs`: `readLedgerCorpus(dirs, fsImpl)` (869), `supersededIds(texts)` (1136, matches
  ` supersedes <id>` anywhere) — R2 says a superseded ASK is never nudged; call this the same way the
  existing retirement pass does at note-flush.mjs:590.
- The in-process send the pickup uses is `runNoteSend` from `skills/multi/scripts/note-send.mjs`
  (imported and called by `skills/decisions/scripts/decisions-pickup.mjs` at its own call site, argv
  built with `--from`, `--to`, `--kind`, `--topic`, `--text`, `--details`, `--needs`,
  `--recipient-repo`, `--sender-repo`, `--id`, `--no-type`) — R5 says reuse this, never
  `deliverToInbox` directly and never a second send path. `parseArgs`'s `STRING_FLAGS` (note-send.mjs
  ~118-121) includes `re`, `by`, `needs`, `recipient-repo`, `sender-repo`, `id` — all the flags item 3
  needs are already supported; no flag work required.
- `runNoteSend` already handles "ledger only when no repo is given" (no `--recipient-repo` flag ⇒ host
  ledger only) — confirm this from its own body before assuming; do not add a parallel branch for it.

## Tests that police this area
- `note-flush.test.mjs` almost certainly already asserts `drainQuietly`'s exact behavior (piggyback
  argv shape, catch-and-fallback) — do not change its existing assertions; add new ones for "never
  calls the overdue pass."
- Any existing `--status` / `--json` snapshot-style test that checks the full status string or JSON
  shape will need the new `; overdue: …` suffix and `overdue` field folded in without breaking the
  pickup suffix's own existing assertions (order matters: pickup suffix, then overdue suffix, per the
  spec's `--status` line: "gains `; overdue: <n> open, <m> nudged` after the pickup suffix").
- `envelope.test.mjs` (not in this territory) polices `parseEnvelope`/`ENVELOPE_RE` — do not touch it;
  treat its return shape as given.

## Open questions for the spec
- Contract R5 names the send as "the in-process send the pickup uses" — confirmed as `runNoteSend`,
  but the spec itself never names the function; worth the builder double-checking decisions-pickup's
  exact call site before wiring it, since that file is out of territory and must not be edited.
- Neither the spec nor contracts state whether the BLOCKED note's `--topic` should be the original
  ASK's own topic value verbatim (spec item 3 says "topic the ASK's topic" — so: yes, copy `body`'s...
  actually the envelope's `topic` is not a captured named group in `ENVELOPE_RE` at all — `parseEnvelope`
  exposes no `topic` field. The topic lives only in the outbox/id convention (`<from>-<topic>-<n>`),
  not in the wire envelope. Builder must resolve how to recover "the ASK's topic" from a ledger line
  alone (likely: the id's own middle segment, `<from>-<topic>-<n>`, stripped of `from` and the trailing
  counter) — the spec assumes a field that does not exist on `parseEnvelope`'s output.
