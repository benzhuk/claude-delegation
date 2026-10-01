VERDICT: PASS

# Lane 51 step 1 build report (wr-2026-09-28-fable-wave)

GOAL served: top-tier tokens per build (the Fable lead's share). Nearest NOT: "a rule no
script checks" — this step is the measurement only; it changes no behaviour, and step 2
(if built) is gated on what this step reads.

Territory: `scripts/build-census.mjs` (the wake split only) and its tests,
`docs/census.md` (one line). No touch to note-flush, note-send, four-read.mjs, hooks/ or
any record.

Base: a6efbbe. Head: `c150c3c` on `build/fable-wave-1` (pushed).

## What was built, with file:line

- `ENVELOPE_LINE_RE` (`scripts/build-census.mjs:156-159`) now captures the envelope's own
  kind as a group (`(ASK|ACK|RESULT|BLOCKED|FYI)`), not a non-capturing alternation, so a
  wake can be told apart by kind.
- `WAKE_SPLIT_HOLD_MINUTES = 10` (`:159`), exported — the fixed hold W1b simulates.
- `classifyWake` (`:183-198`) and `classifyCodexWake` (`:231-246`) both now return
  `{ to, kind, doneTick }` — `kind` is new, everything else unchanged. (Two existing
  `deepEqual` assertions in `scripts/build-census.completeness.test.mjs` that compared the
  whole returned object were updated to include `kind: 'ASK'`, matching their fixtures;
  every other existing assertion reads `.to`/`.doneTick` and needed no change.)
- `resolveAndStore` (`:299-329`) now returns the canonical key it resolved to (additive;
  every existing caller ignored the return value already) — used to find a wake-opened
  run's first deduped request.
- `censusLeadFile` (`scripts/build-census.mjs:346-590` roughly):
  - m2's run-tagging: a wake line sets `pendingTag = 'wake'` (plus its own timestamp,
    kind, doneTick, `:482-488`); a Stop-block feedback line (`classifyStopBlock` form
    `feedback`) sets `pendingTag = 'stopBlock'`; any other qualifying top-level user line
    clears it (`:474-501`, inside the existing `else if (obj.type === 'user')` branch, so
    a plain human message between a wake and the next run makes that run `other`, not
    wake-opened — tested explicitly). The next windowed run to open (`:440-473`, inside
    the existing `if (obj.type === 'assistant')` / `!inWindowRun` branch) consumes
    `pendingTag` into `currentRunTag` at `:456`, incrementing `wakeTurns`/
    `stopBlockTurns`/`otherTurns` accordingly, so their sum is `leadTurns` by
    construction.
  - Each windowed dedup entry is tagged `entry.bucket` with its run's tag (`:504-509`,
    where the entry object is built).
  - A wake-opened run additionally keeps its own deduped id map
    (`currentRunWakeRecord.ids`, built via the same `resolveAndStore`, `:510-516`) plus
    its `firstKey` — the canonical id of the run's first deduped request — pushed into
    `wakeRunRecords` when the run opens (`:457-465`).
  - After the main loop (`:522-579`): `windowById` is partitioned into
    `wakeById`/`stopBlockById`/`otherById` by `entry.bucket` (`:522-529`), aggregated by
    model (`aggByModel`) into `wakeSplit.byModel` (`:530`). Then W1b (M4):
    `wakeRunRecords` is filtered to `kind === 'RESULT' && !doneTick`, sorted by wake-line
    timestamp (`:537-540`); a wave starts at its first wake and absorbs every later one
    arriving under `WAKE_SPLIT_HOLD_MINUTES` after the wave's own start (`:541-549`); the
    absorbed (coalescable) turns' full usage sums into `upperByModel`, and each one's
    first deduped request alone sums into `lowerByModel` (`:550-562`).
  - Returned as `wakeSplit: { wakeTurns, stopBlockTurns, otherTurns, byModel: { wake,
    stopBlock, other }, coalescable: { holdMinutes, turns, upperByModel, lowerByModel } }`
    (`:573-577`).
- `runCensus` (Claude path, `scripts/build-census.mjs:1499-1520` roughly): builds
  `shareByModel` (`shareByModelFor`, `:1622-1636`) and `cacheCreationPerTurn`
  (`cacheCreationPerTurnFor`, `:1639-1647`) from `lead.wakeSplit.byModel` and
  `leadWindowByModel`, and adds `wakeSplit`/`wakeSplitUnavailable: null` to the returned
  `lead` object.
- `runCodexCensus` (`:1327`): adds `wakeSplit: null, wakeSplitUnavailable: 'codex lead'`.
- Markdown: `formatCodexText` prints `- wakeSplit: unavailable (codex lead)` (`:1663`).
  `formatText` prints a `- wakeSplit: wake N, stopBlock N, other N (coalescable N at hold
  10m — see "Wake-opened turns" below)` summary line, plus a new
  `### Wake-opened turns against the rest (window)` block (`formatWakeSplitSection`,
  `:1577-1601`, called from `formatText` at the point the window token table ends) with a
  `wakeTurns`/`stopBlockTurns`/`otherTurns` line, a `| bucket | model | input |
  cache_creation | cache_read | output | sum | share |` table, the M6
  `cache_creation per turn` line, and the W1b `coalescable` line.
- `docs/census.md`: one physical line naming `wakeSplit` (W1/m2/M4/M6, the Codex-null
  case, and a pointer to the markdown block), placed beside the existing "Wakes,
  Stop-blocks, stall nudges" prose.

## Exact JSON shape (`lead.wakeSplit`)

```json
{
  "wakeTurns": 1,
  "stopBlockTurns": 0,
  "otherTurns": 0,
  "byModel": {
    "wake": { "claude-fable-5-1": { "input_tokens": 100, "cache_creation_input_tokens": 10, "cache_read_input_tokens": 5, "output_tokens": 20 } },
    "stopBlock": {},
    "other": {}
  },
  "shareByModel": {
    "claude-fable-5-1": { "wake": 100, "stopBlock": 0, "other": 0 }
  },
  "cacheCreationPerTurn": {
    "wake": { "claude-fable-5-1": 10 },
    "other": {}
  },
  "coalescable": {
    "holdMinutes": 10,
    "turns": 0,
    "upperByModel": {},
    "lowerByModel": {}
  }
}
```
(Above is a one-wake minimal example, generated live from the code.) For a Codex lead:
`lead.wakeSplit: null`, `lead.wakeSplitUnavailable: "codex lead"`.

## Red/green proof (W2)

Test file: `scripts/build-census.wake-split.test.mjs` (new). Fixture: 5 runs —
`A` (wake RESULT, T0), `D` (wake RESULT, T0+4min — M4's required third wake, "a third,
RESULT wake 4 minutes after the first"), `B` (plain human message, other, T0+5min), `C`
(wake ASK, T0+8min, excluded from coalescing by kind), `E` (Stop-block feedback,
T0+9min). `leadTurns = 5 = wakeTurns(3) + stopBlockTurns(1) + otherTurns(1)`. Only `A`
and `D` are eligible for W1b; `D` arrives 4 minutes after `A` (under the 10-minute hold),
so `D` alone is coalescable, and its own two deduped requests give upper (120/12/6/24)
a different total from lower (80/8/4/16) — pinning that the two bounds are computed
separately, not from the same number.

Red at base: archived `a6efbbe` via `git archive` into scratch, copied the new test file
in, ran it there:

```
$ node --test scripts/build-census.wake-split.test.mjs
SyntaxError: The requested module './build-census.mjs' does not provide an export named 'WAKE_SPLIT_HOLD_MINUTES'
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

Green at head (`c150c3c`):

```
$ node --test scripts/build-census.wake-split.test.mjs
✔ W1/m2: wakeTurns/stopBlockTurns/otherTurns partition leadTurns, and byModel sums back to windowByModel
✔ W1b/M4: only RESULT, non-Done-tick wakes coalesce; D (4 minutes after A) is the one coalescable turn, with distinct upper/lower bounds
✔ runCensus/formatJson: shareByModel sums to 100.0 per model, cacheCreationPerTurn is exact, wakeSplitUnavailable is null for a Claude lead
✔ a Codex lead reports wakeSplit unavailable and prints the fixed sentence
✔ a wake line whose next run starts after an intervening plain human message opens as `other`, not `wake` (last qualifying line wins)
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

Two pre-existing `deepEqual` assertions on `classifyWake`/`classifyCodexWake`'s full
return value (in `scripts/build-census.completeness.test.mjs`) were updated to include
the new `kind` field; every other pre-existing test in `build-census*.test.mjs` needed no
change and stayed green throughout.

## Gate numbers

`node --test scripts/build-census*.test.mjs`: **117 pass, 0 fail** (was 112 before this
step; +5 new tests, 0 regressions).

`node scripts/run-tests.mjs` (full suite): **2907 pass, 0 fail, 5 skipped** (2912 total).
`leak check: 0 new temp entries`.

## Smoke test (this session's own transcript)

```
node scripts/build-census.mjs --lead ~/.claude/projects/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e.jsonl --from 2026-09-28T19:00:00Z --out <scratch>/smoke.md
```

New block's counts only (no transcript content):

```
- wakeTurns: 9, stopBlockTurns: 0, otherTurns: 55
| wake  | claude-opus-5-5 | input 166  | cache_creation 127838  | cache_read 12615414 | output 69355  | sum 12812773 | share 16.4% |
| other | claude-opus-5-5 | input 732  | cache_creation 686775  | cache_read 64238631 | output 239324 | sum 65165462 | share 83.6% |
- cache_creation per turn (M6) — wake: claude-opus-5-5=14204.2; other: claude-opus-5-5=12486.8
- coalescable (W1b, hold 10m, RESULT wakes only, Done-tick excluded): turns 0, upper (none), lower (none)
```

9 + 55 = 64 leadTurns in the window (matches `leadTurns` elsewhere in the same report);
`stopBlockTurns: 0` and `coalescable turns: 0` are both correct for this window — no
Stop-block and no RESULT wake has landed in it yet.

## Deviations / assumptions

- W3 ("docs/census.md gets one line naming the split") is taken literally: one physical
  line, not a full prose subsection like the existing "Wakes, Stop-blocks, stall nudges"
  section gets. A fuller write-up, if wanted later, is a documentation-only follow-up.
- `WAKE_SPLIT_HOLD_MINUTES` is a fixed constant (10), not a CLI flag — M4's fix text says
  "simulate a hold of N = 10 minutes", which reads as the lead's own fixed choice for this
  read, not a general-purpose parameter. Exported so a test (or a future flag) can pin it
  without a magic number.
- `cacheCreationPerTurn` (M6) is computed only for the wake and other sides, not
  `stopBlock` — M6's own fix text names only "the wake side and the other side"; a
  Stop-block turn is note-driven but explicitly untouched by any hold (m2), so M6's cost
  concern does not apply to it.
- The wake/stopBlock/other split and W1b's coalescable simulation are windowed exactly
  like `leadTurns`/`windowById` already are (`--marker`, `--from`/`--to`, else the whole
  file) — no new windowing concept was introduced.

Denied commands: none.
