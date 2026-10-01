VERDICT: PASS b662984d4a6433ec91d90f272f9a53ec42edf837

# O1 fix round: contracts.md R8 (cross-host observability + silent seed)

Worktree: `/home/ben/Code/wt-overdue-asks-1-O1`, branch `build/overdue-asks-1-O1`.
Starting HEAD verified as `23462793afb7b5fdb217339dba666770dd44b8b0` (matches the brief) before any
edit. Final HEAD after this round's commit: `b662984d4a6433ec91d90f272f9a53ec42edf837`.

## Gate

`node --test skills/multi/scripts/note-flush.test.mjs` → **148 pass, 0 fail** (was 143/143 before this
round; +5 new tests, 0 removed). Full log:
`/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/reports/O1-r8-gate.log`.

## Changes by file:line (final HEAD)

### `skills/multi/scripts/note-flush.mjs`

- `overdueEntryAt` / `isCrossHostEntry` (new, ~line 1327-1333): a state entry is either the plain ISO
  string R1 always wrote, or `{ at: iso, crossHost: true }` for an id gated by R8's observability check.
  Both shapes carry `at` for pruning.
- `pruneOverdueState` (~1335-1342): reads `at` through `overdueEntryAt` so both entry shapes prune the
  same way; entries otherwise round-trip unchanged.
- `recordOverdueId` (~1360-1367): new `opts.crossHost` parameter — when set, writes the object shape
  instead of the bare ISO string, so buildOverdueStatus/runOverdueAsks can tell "recorded" apart from
  "nudged" later.
- `observableAnswerSide` (new, ~1369-1381): R8's gate. `(a)` any parsed envelope in the corpus lines
  with `from === ask.to && to === ask.from`, of any kind; `(b)` `Boolean(inboxes[ask.from]) &&
  Boolean(inboxes[ask.to])`.
- `buildOverdueStatus` (~1462-1476): now splits the state-entries-for-open-asks loop into `nudged`
  (recorded, not cross-host) and a new `crossHost` count; the returned `json.overdue` gained the
  `crossHost` field. The status **line** text (`; overdue: <n> open, <m> nudged`) is unchanged.
- `runOverdueAsks` (~1524-1660):
  - `stateFileExisted = fsImpl.existsSync(overdueStatePath(home))`, computed *before* the
    `readOverdueState` try/catch, so "missing" and "corrupt/unreadable" can never be confused.
  - If `!stateFileExisted`: the silent-seed branch. Every currently-overdue id (from
    `collectOverdueAsks`) is written to a fresh state object via `writeOverdueState` (same atomic
    tmp+chmod+rename, mode 600), one `overdue-seeded <n>` line is logged, and the pass returns
    `{ ok: true, ran: true, seeded: true, open, nudged: 0, crossHost: 0 }` without sending anything or
    even reaching target selection.
  - In the main per-ask loop: an already-recorded id now increments `nudgedCount` or `crossHostCount`
    depending on `isCrossHostEntry(state[id])`. A fresh id first runs `observableAnswerSide`; if false,
    it logs `overdue-cross-host [<id>] -> <to> — answer side not observable on this host`, calls
    `recordOverdueId(..., { crossHost: true })`, increments `crossHostCount`, and `continue`s *before*
    any target (sender/recipient/reachable) is ever chosen. Only an observable ask reaches the existing
    sender-then-recipient target selection, `overdue-no-inbox`, and send logic, which are otherwise
    unchanged.
  - Final review NIT 1 applied: `recipientRepo` is now `reachable(target) ? inboxes[target].cwd :
    null` — reuses the `reachable()` closure already computed for target selection, rather than
    re-deriving cwd-existence from the raw inbox record a second time.
  - Return value gained `crossHost: crossHostCount`; the early budget/kill-switch returns also carry
    `crossHost: 0` for shape consistency.

### `skills/multi/scripts/note-flush.test.mjs`

- New `seedOverdueState(home, state = {})` helper (next to `writeOverdueLedgerLine`): writes an empty
  (or given) `.overdue-nudged.json` up front, mode 600, so a test exercises the *ordinary* nudge logic
  rather than the new first-run seed branch.
- Every pre-existing overdue test that expects an actual send, `overdue-no-inbox`, or
  `overdue-send-failed` outcome now calls `seedOverdueState(home)` first. Where the test's original
  setup registered only one of the two slugs and had no reply line (so it would now fail R8's gate and
  divert to `overdue-cross-host`), I added the second slug's registration (without a `cwd`, so target
  selection and the reachable/unreachable assertions are unaffected) or reused an existing reply line
  already present in the ledger (e.g. the ACK/re-ASK tests were already observable via their own reply
  line). Tests that don't depend on send/log outcome (pruning-by-key, kill-switch, budget/argv guards,
  the pre-existing corrupt-state test, superseded/window/malformed-open=0 cases) were left unchanged —
  their assertions hold under either branch.
- `assert.deepEqual` calls against `buildOverdueStatus`'s/`buildFlushStatus`'s JSON gained
  `crossHost: 0` where a bare `{ open, nudged }` object was previously asserted.
- 5 new tests appended at the end of the file, all under a new "R8" heading:
  - cross-host: sender unregistered, no reply line → `overdue-cross-host` logged, `crossHost: 1`,
    nothing sent, and a second pass doesn't retry it either.
  - observable via a recipient-to-sender **FYI** line → a nudge is sent (FYI doesn't answer the ask
    per R2, but does make the reply side observable per R8).
  - observable via **both parties registered**, with no reply line at all → a nudge is sent.
  - first run seeds silently (no state file at all) → no send, `overdue-seeded 1` logged, the id
    recorded, mode 600 verified; a **second** pass with a newly-overdue ASK nudges it normally
    (`calls.length === 1`, the correct `--re` flag).
  - a corrupt state file (`'not json{{{'`) does not reseed: `result.seeded` stays `undefined`, no
    `overdue-seeded` line ever appears, and the file on disk is untouched — the pre-existing R1
    fail-closed behaviour, unchanged.

### `skills/multi/SKILL.md`

- One clause added to the overdue paragraph (around the existing "(neither registered logs it and
  moves on)" sentence): a nudge only fires when the answer side is observable on this host (a reply of
  any kind already in the corpus, or both slugs registered here) — otherwise it's logged and recorded
  without a send, since a cross-host ledger is only half the conversation. And the first pass ever on a
  machine seeds its state file silently (records every already-overdue id, sends nothing), so
  publishing this feature doesn't fire a burst of BLOCKED notes for asks that were merely old.
- The trailing sentence about what the `; overdue: <n> open, <m> nudged` count covers now also
  mentions "the answer side was not observable" among the reasons a recorded id never got a nudge.

## Answers to point 2 and point 3

**Point 2 — missing vs. corrupt/unreadable.** These are kept as two entirely different codepaths.
`stateFileExisted` is computed with a plain `fsImpl.existsSync(overdueStatePath(home))` *before*
`readOverdueState` is ever called. `readOverdueState` itself still treats `ENOENT` as "empty" (`{}`,
not a throw) for backward compatibility, but that return value is never consulted for the
missing-vs-corrupt decision — only `stateFileExisted` is. So: file truly absent →
`stateFileExisted === false` → the silent-seed branch runs (writes a fresh, real file). File present but
unparsable/unreadable (garbage bytes, `EACCES`, etc.) → `stateFileExisted === true` →
`readOverdueState` throws → the existing R1 fail-closed catch fires (`overdue-skipped [*] -> * — state
file unreadable; nudging skipped this pass`, `reason: 'state-error'`), and the seed branch is never
reached — nothing is written, the corrupt file is left exactly as it was. The new test "a corrupt state
file does not reseed" pins both halves of this: `result.seeded` is `undefined`, no `overdue-seeded` log
line ever appears, and the on-disk bytes are byte-for-byte unchanged after the pass.

**Point 3 — `--status`/`--json` coherence.** The pre-existing `nudged` counter already conflated
"recorded" with "actually sent" for anything encountered on a *later* pass (an already-recorded
no-inbox or failed-send id was already counted as `nudged` the moment `Object.hasOwn(state, id)` was
true, regardless of whether a send had ever succeeded for it) — that ambiguity predates this round and
I left it as-is rather than reinterpreting `nudged`'s existing meaning under other builders' tests.
What R8 needs is narrower and additive: a cross-host id must never be folded into that same "recorded"
bucket without a way to tell it apart. The existing `{ open, nudged }` shape had no field for that, so I
added the smallest one: **`crossHost`**, on both `runOverdueAsks`'s return value and
`buildOverdueStatus`'s `json.overdue` (and therefore `buildFlushStatus`'s `--json` output, which embeds
it unchanged). `nudged` keeps counting every recorded-and-not-cross-host id, exactly as before; a
cross-host id increments `crossHost` instead, on both the pass that first records it and any later pass
that finds it already recorded. The human-readable `--status` **line** text
(`; overdue: <n> open, <m> nudged`) is intentionally left unchanged — only the JSON gained the field —
so no operator-facing string format needed to change for this.

## Deviations / assumptions

- R8's condition (b) is implemented literally as "both slugs are registered" (key presence in
  `inboxes`), independent of whether either registration's `cwd` still resolves on disk. A registered
  slug whose `cwd` is gone still counts toward observability, since the ruling's wording is about
  *registration*, not reachability; reachability is a separate, later check (target selection / "no
  repo resolvable") that R8 does not touch.
- Several pre-existing tests needed more than "seed the state file" to keep passing: where a test's
  ledger/registration setup would now genuinely fail R8's observability gate (only one slug registered,
  no reply line), I added the minimal second registration (no `cwd`, so it can't affect which target is
  chosen) rather than changing the test's asserted outcome. This is called out per-test above.
- Left `NOT_AN_ATTEMPT`-style semantics elsewhere in the file untouched; R8 only touches
  `runOverdueAsks`, `buildOverdueStatus`, and the small state-shape helpers it needed.

## Scratch

No scratch files were left behind; a throwaway debug script used to diagnose one test's initial
`nudged` miscount was written to and removed from
`/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/`
during this session.

## Goal line

Serves GOAL "work lost or stalled" (a missed by-time still wakes someone, but never on a false
premise). Nearest NOT: "a symptom fix" — R8 is the lead's ruling closing the actual cause (a host-local
ledger is only half a cross-host conversation), not a patch to the visible symptom alone.
