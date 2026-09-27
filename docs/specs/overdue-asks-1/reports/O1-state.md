# O1 state — overdue-asks-1

## Territory
`skills/multi/scripts/note-flush.mjs`, `skills/multi/scripts/note-flush.test.mjs`,
`skills/multi/SKILL.md`. Serves GOAL "work lost or stalled" (spec.md "Why": two lanes stalled 3.5h
each behind an unread by-time). NOT: a new watcher process — the already-running flusher notices.

## Contracts I rely on
contracts.md R1-R8 (state file shape/window/prune/mode, R2 answers/retirement, R3 deadline math, R4
call site/guards/budget/kill switch, R5 reuse `runNoteSend`, R6 territory/gate, R7 integration gate,
R8 cross-host observability + silent first-run seed — the lead's 2026-09-26 23:56 NY ruling on
O1-final-review.md MAJOR 1).

## Done
R8 fix round (this round), against contracts.md R8 and O1-final-review.md's MAJOR 1 + NIT 1:
- **Observability gate** (`observableAnswerSide`, `note-flush.mjs`): before any target is chosen, an
  overdue ASK is nudged only if the corpus already holds a reply of any kind from `ask.to` to
  `ask.from`, or both slugs are registered in this host's inbox registry. Otherwise: log
  `overdue-cross-host [<id>] -> <to> — answer side not observable on this host`, record the id
  (`recordOverdueId(..., { crossHost: true })`), send nothing.
- **Silent seed**: when `.overdue-nudged.json` does not exist at pass start (checked via `existsSync`,
  *before* `readOverdueState`, so it is never confused with a corrupt file), every currently-overdue id
  is recorded without sending, the file is written (same atomic write, mode 600), and one
  `overdue-seeded <n>` line is logged. A corrupt/unreadable file keeps R1's original fail-closed
  behaviour untouched (logged, nothing sent, nothing reseeded) — verified by a dedicated test.
- **Counters**: a cross-host id is "recorded, not nudged." The existing `nudged` field could not
  express that (it already conflated "recorded" with "sent" for repeat passes), so the smallest
  addition is a new `crossHost` count, returned alongside `open`/`nudged` from `runOverdueAsks` and
  from `buildOverdueStatus`'s `json.overdue` (the `; overdue: <n> open, <m> nudged` status LINE text is
  unchanged — only the JSON gained a field).
- **NIT 1** applied verbatim: `recipientRepo` now reuses the already-computed `reachable(target)`
  instead of re-deriving cwd-existence from the raw inbox record.
- **SKILL.md**: one clause in the overdue paragraph — nudges only fire when the answer side is
  observable on this host, and the first pass on a machine seeds silently instead of bursting BLOCKEDs.
- **Tests**: every pre-existing overdue test that expects an actual send/no-inbox/send-failed behaviour
  now calls a new `seedOverdueState(home)` helper first (writes an empty state file), and — where it
  didn't already have one — a reply line or a second registered slug, so it stays observable rather than
  falling into the new cross-host gate. 5 new tests added: cross-host (nothing observable, nothing
  sent), observable via a recipient-to-sender FYI line, observable via both parties registered with no
  reply, first-run seed (silent, then a second pass nudges a newly-overdue ask normally), and a corrupt
  file that does not reseed. Gate: 148/148 (was 143/143 before this round).

Round 3 (prior): the "twin" fix in target selection (a reachable recipient is never skipped for a
sender whose registered `cwd` is gone). Round 1/2: `--recipient-repo` pre-check, SKILL.md kill-switch
paths, `--needs none`, prune+mode-600 tests. All still in place, untouched this round except where R8's
gate needed the observability/seed additions described above.

## Next
Nothing outstanding for O1 that stays in-territory. Part B of R8 (a remote send also appending to the
sending host's own ledger) is explicitly lane fifteen, not this one.

## Open questions
None O1 can resolve alone.

## How to run my gate
`cd /home/ben/Code/wt-overdue-asks-1-O1 && node --test skills/multi/scripts/note-flush.test.mjs`
Last run: 148/148 pass, 0 fail. Log: `docs/specs/overdue-asks-1/reports/O1-r8-gate.log`.
