VERDICT: NEEDS_FIXES (8) fb6367392dfc1dd4db71c09d4637bb0a5125462d

# Lane 40b spec/contract red-team, round 1

Reviewed SHA: fb6367392dfc1dd4db71c09d4637bb0a5125462d (worktree HEAD verified).
Read: spec.md, implementation-contract.md, scout.md, prior-diagnosis-review.md, scripts/jsonl-lines.mjs (stub), scripts/build-census.mjs (:63, :192, :294-297, :350-410, :747-975, :985-1000, :1167-1222, :1386-1600, :1921-1929), scripts/token-census.mjs (:24, :268-300, :378-392), and the existing Codex temporal and fsImpl tests (build-census.codex.contract.test.mjs :60-71, :380-420, :578-612; build-census.test.mjs :535-580). No live logs, no suites, and no writes other than this report.

## Judgment

The proposed interpretation narrows the packet safely in its direction. Using task_complete only, requiring the latest started turn, and keeping PARTIAL for damaged or conflicting children all push toward PARTIAL rather than toward COUNTED. Keeping `damaged` children PARTIAL even before the window is also correct on the evidence, not only cautious. `build-census.mjs:829` `break`s on the first malformed row, so the "timestamp of its last row" (spec §2) is unknown for a damaged child. Non-monotonic timestamps (:833) likewise make last-row time untrustworthy. Spec §3 ("kept as is") wins over the absolute wording in §2 for these cases.

The contract still leaves room for false COUNTED, and the required tests can pass without looking. The key fact: the Codex text verdict is `temporalComplete ? COUNTED : PARTIAL` (`build-census.mjs:1927-1929`), and `temporalComplete` is only `temporalReasons.length === 0` (:1563). The new exclusion `continue` in the child loop (:1545-1553) is therefore the whole gate. Anything it lets through becomes a confident COUNTED. Neither `unavailable` (:1471) nor the `leadTurns` field (:1522, not in `requiredFields` :1566) backstops it.

The contract must pin findings 1-2 before a builder starts. Findings 3-6 pin the tests. Findings 7-8 are low.

## Findings

### 1. HIGH: the completion predicate is unpinned, so set membership admits a borrowed completion (false COUNTED)

Evidence: implementation-contract.md:19 says only "Completion must belong to the latest started task". The data a builder has is `completedTurns` (a Set, :888/:893) and `lastStartedTurn` (:888, chosen by timestamp and updated only on a *valid* task_started that has a timestamp). The obvious implementation is `completedTurns.has(lastStartedTurn)`, which is wrong in two cases:
- (a) **Repeated turn id:** `task_started A` → `task_complete A` → `task_started A` → (usage, no completion). The Set still holds A, so the child counts as ended and is excluded while its latest run is open.
- (b) **Invalid restart:** `task_started A` → `task_complete A` → `task_started` with no or unusable turn_id. `invalidTaskStarted` is set (:885), but `lastStartedTurn` stays A, so the child counts as ended. `invalidTaskStarted` feeds only the `leadTurns` field (:1522), which is not a required field (:1566). The census prints COUNTED.

The final-row rule used today (:831 reset every row) hid both cases. Moving to an any-position witness exposes them.

Fix (pin in the contract, mechanical in source): witness = a `task_complete` whose `turn_id` equals the most recent task_started **in file order**, occurring after it, with no task_started of any kind (valid or invalid) in between. Sketch for `censusCodexLeadFile`:

```js
// with the other state (near :818)
let openTurn = null;            // turn id of the most recent task_started in file order; null if invalid
let latestStartCompleted = false;
// replace nothing; add beside :884-895
if (nativeEvent && nativeEvent.type === 'task_started') { openTurn = started; latestStartCompleted = false; }
if (completedPayload && completedPayload.type === 'task_complete' && isUsableCodexString(completedPayload.turn_id)
    && openTurn !== null && completedPayload.turn_id === openTurn) latestStartCompleted = true;
// return: latestStartCompleted
```

When child segments are merged (:1446-1458), take `latestStartCompleted` from the segment that owns `state.lastStartedAt` (the same strict `>` as :1449). A child with no task_started at all is never "ended". Predicted outcome: (a) and (b) stay PARTIAL, and the 01a0eb03 shape (task_complete at row 174, then a benign item_completed) is ended.

### 2. HIGH: the exclusion guard set is not exhaustive or ordered; pin it before the zero-usage check

Evidence: implementation-contract.md:19 names "corruption and conflicting evidence" but not which state fields. The scout (scout.md:17) flags the placement ambiguity. Today the window-skip at :1547 comes *before* every guard, so post-window children skip `damaged` checks entirely. A builder copying that pattern for pre-window children would skip :1549-1550 as well.

Fix: pin the exclusion, placed immediately after :1547 and before :1549, as exactly:

```js
if (Number.isFinite(fromMs) && state.latestStartCompleted && !state.invalidTaskStarted && !state.damaged
    && !state.timestampConflict && state.windowResponses === 0
    && state.latestAt && Date.parse(state.latestAt) < fromMs) continue;   // strict <
```

Here `fromMs = Date.parse(sharedFrom)` (:1438). The guard must use strict `<`: `codexInWindow` (:772-778) treats `value >= fromMs` as in-window, so `latestAt === from` overlaps and is counted. `windowResponses === 0` is a free second guard against a mis-read timestamp. Unreadable children stay PARTIAL through `unusableChildren` (:1537), which already sits outside the loop. The Lane55 response_id-conflict throw (:1478, :1482) is unaffected. Do not change :1547 (out of scope). Predicted outcome: a clean completed pre-window zero-usage child is excluded. Damaged, conflicting, invalid-start and boundary-equal children still produce a reason.

### 3. MEDIUM: the three required child tests pass on base unless each carries a trailing benign row

Evidence: spec.md:16 requires three tests. On base:
- A pre-window child with a **final-row** witness and usage rows already yields no reason (:1549-1552 all false).
- An overlapping child with a final-row witness already passes :1552.
- An incomplete child fails for any of three reasons.

Tests built from the existing helpers (`leadRows`/child rows at codex.contract.test.mjs:65, :71 end with task_complete) would be green before the fix. The contract also never says that :1552 itself must accept a non-final witness. The builder could add only the pre-window `continue`, and the "completed overlapping child is counted" test would stay green only because its fixture ends on the witness.

Fix (contract text for the test author):
- Every "completed" fixture places the task_complete **before** at least one benign row (for example an item_completed UserMessage), with no row after `--to`.
- The pre-window cases include both a zero-usage variant and a usage-bearing variant.
- The incomplete case has usage rows, and its test asserts the specific `/child <id> has no end-bound witness/` reason, not just PARTIAL.
- Each new test must be recorded red on base (the red receipt).

Pin the source change at :1552 as `!state.hasRowAfterTo && !(state.latestStartCompleted && !state.invalidTaskStarted)`. Predicted outcome: all three are red on base and green after the change.

### 4. MEDIUM: scope for open, from-only and marker windows is unresolved

Evidence: the child rule has two branches, `if (opts.to)` (:1543) and the open/unbounded `else` (:1555-1561), which still requires `finalRowCompletesTurn`. Spec §2 defines "ended" generally and speaks of "window start". `sharedFrom` exists for `--from` without `--to` and for `--marker` (:1438). Existing retention: "Lane55 R1 relevant zero-usage logical child" (codex.contract.test.mjs:582-593) is open mode (from/to null) and must stay PARTIAL.

Fix: the lead must choose one and write it in the contract. Recommended: apply the positional predicate from finding 1 in both branches (it is spec §2's definition of "ended"). Apply the pre-window exclusion only when `sharedFrom` parses to a finite time. With no window start there is no exclusion, which keeps the Lane55 R1 test green. The lead is untouched (:1544, :1555): spec §2 is child-only, and the lead's final-row rule can only err toward PARTIAL.

### 5. MEDIUM: the framing test as written ("row count + JSON.parse every row") passes with broken decoding

Evidence: spec.md:10 and contract :21 only ask for row count plus parse. U+2028 is E2 80 A8. If chunks arrive as Buffers (a dropped `{encoding:'utf8'}` in `openLines` :295, or a test fsImpl returning Buffers; the seam is build-census.test.mjs:538-577), a `rest += chunk` implementation decodes each chunk alone. A separator split across a chunk boundary becomes U+FFFD, which is legal inside a JSON string. Row count and parse still pass.

Fix:
- (i) `lfLines` throws `TypeError` on a non-string chunk (one line: `if (typeof chunk !== 'string') throw new TypeError('lfLines expects utf8-decoded string chunks');`).
- (ii) Tests `deepStrictEqual` the parsed objects to the source objects and assert no `�`.
- (iii) One test goes through the production `openLines` path: a real temp file where the U+2028 bytes straddle the 65536-byte default `highWaterMark`.
- (iv) Mutant check: removing `encoding:'utf8'` must turn a test red.

### 6. MEDIUM: census-level regression must assert counts, because the Claude and sub readers silently drop malformed rows

Evidence: `censusLeadFile` (:405-410) and `censusSubFile` (:993-997) do `catch { continue; }`. Token-census (:293, :383) counts `malformedLines` and continues. A test that runs these functions and asserts "no throw" or "no damaged" is green on base, because the only effect is a silent undercount. That is the unknown-as-number failure this lane exists to remove. Only the Codex path (:829) marks the row as damaged.

Fix (contract text): regression tests run the production functions, not only `lfLines`:
- `censusCodexLeadFile`: the U+2028/U+2029 row is followed by a token_usage_record. Assert `damaged === null` and exact `tokenRecordCount`.
- `censusLeadFile` and `censusSubFile`: the separator characters sit **inside an assistant usage row**. Assert that response's usage is counted (exact turn and token totals).
- token-census: assert `malformedLines === 0` and the exact turn count.

Each must be red on base.

### 7. LOW: error and early-exit semantics of `lfLines` need one more line of contract

Evidence: measured on this host's Node: readline propagates source errors (`readline threw boom n=1`; a missing file throws `ENOENT`). The stub says only "propagate source errors". Codex callers `break` early (:829), and `detectLeadHost` returns early (:762).

Fix: pin these behaviors:
- On a source error, rethrow without yielding the pending partial remainder. A yielded fragment would make the Codex parser `break` as malformed, and the generator's `return()` would then swallow the real I/O error.
- Implement with `for await (const chunk of stream)` so an early consumer `break` destroys the stream. Otherwise a Windows file handle is held.
- Strip the one CR after joining chunks, so a `\r` at the end of one chunk and `\n` at the start of the next still works.
- At EOF, yield the remainder with its CR stripped if the remainder was non-empty before stripping.

Tests: `"a\npar"` followed by an error yields exactly `["a"]` and then rejects with that error. After `break`, `stream.destroyed === true`. CR/LF across the chunk split yields `"x"`.

### 8. LOW: the item_completed deferral deviates from verbatim spec §2 and needs a recorded fallback plus a pointed negative test

Evidence: spec.md:12 names "an item_completed that carries the task's completion". No such shape exists in source or fixtures (scout.md:22). The deferral is safe: it only produces extra PARTIAL results. But the real item_completed UserMessage shape **carries a `turn_id`** (scout.md:22). A naive "item_completed whose turn_id is the latest started turn" witness would fire on every user message.

Fix:
- Record the deferral as an open ASK in the contract, with this fallback: if no author shape arrives by the deadline, ship task_complete-only and say so in the report.
- Add a negative test: `task_started T` → usage → `item_completed {item:{type:'UserMessage',…}, turn_id:T}` as the last pre-window row stays PARTIAL with the no-end-bound-witness reason.
- Also test agent-message text such as "task complete": it is never a witness.

## Verified absences

- **Other readers:** readers reachable from the census are LF-correct: `codexFirstMeta` (:1213 `split(/\r?\n/)`), `readJournal` (:1176 `split('\n')`) and :192. They read whole files, which predates this lane and is not a framing defect. `four-read.mjs` reads JSONL only through readFileSync plus `split(/\r?\n/)` (scout.md:7). No change is needed there, and the contract's "four-read stays untouched" is correct.
- **readline call sites:** all four readline uses in build-census go through the single seam `openLines` (:294-297), and token-census has an identical seam (:273-276). Both call sites only use `for await`. Swapping in an async generator is drop-in, and `async openLines` returning a generator object is awaited correctly.
- **Unreadable children:** they stay PARTIAL independently of the exclusion (`unusableChildren` → :1537).

## Coverage-weakening watch

- Do not edit or relax:
  - Lane55 R1 zero-usage open child (:582-593).
  - Lane55 known-id old child (:382-407, final-row witness, counted).
  - The no-end-bound-witness assertions at :470 and :549.

  These must stay byte-identical, apart from adding new tests.
- **Excluded children in `unavailable`:** an excluded zero-usage child still pushes "unusable child coverage" into `unavailable` (:1471). It is harmless for the verdict (four-read shows `unavailable` only when not COUNTED, four-read.mjs:69-70), but it is misleading output. Do not "fix" this by adding the child to `discovery.excluded`, because its reason is not whitelisted (:1492) and would add a new `unavailable` entry. If it is cleaned up at all, mark the excluded child on its `perFile` entry.

## C4 fields

Cause: `readline` frames on U+2028/U+2029 (build-census.mjs:296, token-census.mjs:275), and the child end rule accepts only a final-row task_complete (:831 reset, :1552). The proposed any-position witness is not pinned to file order or guarded, so as written it can borrow a stale completion (findings 1-2).
Discriminating check: a pre-window child with `task_started A, task_complete A, task_started A` (repeated id), or with a turn-id-less restart, must yield `child <id> has no end-bound witness`. `task_complete A` followed by a benign item_completed must be excluded. The separator-in-usage-row fixtures must count exact tokens through `censusLeadFile`, `censusCodexLeadFile`, `censusSubFile` and token-census. All of these are red on base.
Fix location: scripts/jsonl-lines.mjs `lfLines`; the `openLines` bodies at build-census.mjs:294-297 and token-census.mjs:273-276; the `censusCodexLeadFile` parse loop at :884-895 (add `openTurn`/`latestStartCompleted`); the child-state merge at :1446-1458; the child temporal rule at :1547-1552 (and :1557-1560 per finding 4).
Simplification: one positional boolean (`latestStartCompleted`), computed in the parser and merged by the existing lastStartedAt rule, replaces both the final-row test and any Set lookup. One guarded `continue` after :1547 expresses the whole pre-window rule, with no new mechanism.
