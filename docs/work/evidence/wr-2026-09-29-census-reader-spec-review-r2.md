VERDICT: APPROVE f73954130164134649cd534ee9048b348e288c33

# Lane 40b spec/contract delta re-review, round 2a

Reviewed SHA: f73954130164134649cd534ee9048b348e288c33 (worktree HEAD verified).

Scope: this is a delta review against r1 (NEEDS_FIXES (8) at fb63673). I read:
- implementation-contract.md, including the "Opus spec findings resolved" section at :21-34
- spec.md (diff fb63673..f739541)
- terminal-ruling.md
- scripts/jsonl-lines.mjs (the stub diff)
- scripts/build-census.mjs: :810-900 (Codex parser), :1434-1566 (segment merge and child temporal rule), :1920-1929 (verdict gate)

I did not read tests, live logs or config, and I ran no suites. The only file I wrote is this report.

## Judgment

A builder who follows the revised contract has no path I can find to a false COUNTED.

The Codex verdict is still gated only by `temporalReasons` (build-census.mjs:1926-1928 → :1563). Every route into that gate is now pinned:
- **Positional witness:** tied to the latest start in file order, and invalid starts clear it (item 1).
- **Pre-window exclusion:** has an exhaustive guard set, sits after :1547 and before :1549, uses strict `<`, and applies only when `sharedFrom` is finite (items 2 and 4).
- **Segment merge:** conservative. A tie, or an invalid later start, gives no witness, and unknown association stays PARTIAL (item 1).

The regression tests for the defect classes have to be red on base:
- trailing benign rows (item 3)
- separator rows through all four production readers with exact counts (item 6)
- the decoding mutant (item 5)

The tests that stay green on base are correctly labelled as retention (item 3).

I found no new blocking gap. Two non-blocking clarifications follow (N1, N2). The builder or code reviewer can apply them without another spec round.

## Prior findings: verification

| # | r1 finding | Resolved at | Status |
|---|---|---|---|
| 1 | Completion predicate borrows via Set membership | contract :25 | **Resolved.** The witness is per latest start in file order, including invalid starts. Every start clears it. Only a later `task_complete` with a matching usable id sets it. No start means no witness. `completedTurns` reuse is explicitly forbidden. Segment rule: the owner of the newest start supplies the witness; a tie or an invalid later start gives none; unknown association stays PARTIAL. |
| 2 | Exclusion guards unpinned and unordered | contract :26 | **Resolved.** Guards are finite `sharedFrom`, the witness, `!invalidTaskStarted`, `!damaged`, `!timestampConflict`, `windowResponses === 0`, and finite `latestAt` strictly `<` `sharedFrom`. The exclusion precedes the zero-usage check, and :1547 is unchanged. I checked this against :1549-1552: the only reasons it bypasses are `tokenRecordCount === 0` (intended) and end-bound (already satisfied by the witness). Corrupt and conflict reasons cannot be skipped. |
| 3 | Child tests pass on base | contract :27 | **Resolved.** Each fixture needs a benign row after `task_complete` and no row after `--to`. Pre-window cases cover both zero-usage and usage-bearing. The incomplete case asserts the exact reason. Traced on base: all three "completed" cases fail :1552 because `finalRowCompletesTurn` is false, so they are red. The incomplete case is correctly retention (green on base). |
| 4 | Open, from-only and marker modes | contract :28 | **Resolved.** The witness applies in both branches. Exclusion applies only when `sharedFrom` is finite. The lead keeps final-row behavior. The Lane55 open zero-usage child stays PARTIAL, because with no `sharedFrom` there is no exclusion and the :1559 reason remains. |
| 5 | Framing test passes with lossy decoding | contract :17, :29; stub :6-7 | **Resolved.** Non-string chunks raise `TypeError`, tests compare exact objects and assert no U+FFFD, a real file straddles the 65536-byte boundary, and a mutant removes the utf8 encoding. With the `TypeError` rule, that mutant turns every production-path test red. |
| 6 | Census-level tests must assert counts | contract :30 | **Resolved.** Codex: `damaged === null` plus exact `tokenRecordCount`. Claude lead and sub readers: separator characters inside usage rows, with exact totals. token-census: `malformedLines === 0` and exact turns. Old source fails each of these: Codex breaks at :829, Claude readers skip with `catch continue`, and token-census counts the row as malformed. |
| 7 | `lfLines` error and early-exit semantics | contract :17, :31; stub :6-7 | **Resolved.** On error: yield the complete row, then rethrow the same error without flushing the remainder. Early `break` destroys the stream via for-await. CR is stripped after joining chunks. At EOF, yield a remainder that was nonempty before stripping. |
| 8 | Item_completed deferral | contract :19, :32; spec.md:12; terminal-ruling.md | **Resolved** by the author's ruling: only `task_complete` is a terminal witness. Negative tests cover a matching-id UserMessage `item_completed` and assistant text. |

## Non-blocking clarifications (0 blocking)

### N1 (LOW): the segment borrow and ordering cases rest on prose; name them in the tests and check them in code review

Evidence: contract :25 pins the segment rule and ends "Pin details in source report and independent tests". The explicit test list in :27 does not name:
- repeated-id restart (`start A, complete A, start A, usage`)
- a restart with a missing or unusable id
- the segment cases:
  - (i) an invalid start in segment B, where B has no valid timed start, merged with segment A holding a true witness
  - (ii) equal `lastStartedAt` across segments where the witnesses differ

All of these are green on base, because the final-row rule keeps them PARTIAL. So they are retention and mutant-kill tests, not red-on-base tests. Their value is to catch a `completedTurns.has(...)` implementation, or a merge that keeps the strict `>` from :1449 while ignoring ties and invalid starts.

Case (i) is the aggregate-ordering risk the brief asked about. `lastStartedAt` updates only on valid, timed starts (:886-887), so an untimed or invalid start in segment B can never own the merge, and segment A's witness would survive. The contract's "never let an invalid later start … preserve an older true witness" forbids this. But a builder has no timestamp to decide "later", so the only faithful reading is the conservative one. Pin it in one clause, and no new mechanism is needed:

Fix: in the merged child state, the witness is `ownerSegment.latestStartCompleted && !tie && !state.invalidTaskStarted`. Any invalid start in any segment of the child then gives no witness, using the `invalidTaskStarted` OR already at :1448. Predicted outcome:
- Case (i) stays PARTIAL.
- A single-file child with an early invalid start and a later completed valid start now goes PARTIAL. That is only an extra PARTIAL, and it is already the exclusion outcome under item 2.
- No other test changes.

Code review should check that the tests author named these four cases.

### N2 (LOW): contract :13 still carries the superseded `item_completed` clause

Evidence: implementation-contract.md:13 says "including task_complete or an item_completed carrying the task's completion". This is superseded by :19, :32, terminal-ruling.md and spec.md:12. The item-8 negative test covers only the UserMessage shape, so a builder who guesses some other `item_completed` payload would not be caught by any test.

Fix (doc edit, optional): at :13, replace "a terminal event for that task may occur anywhere, including task_complete or an item_completed carrying the task's completion" with "task_complete for that task may occur anywhere (terminal-ruling.md); item_completed is never a witness". Code review must reject any `item_completed` witness branch in the source.

## Verified absences

- **Verdict backstop:** the Codex text verdict remains `scope.complete` only (build-census.mjs:1926-1928). No other route to COUNTED is opened by the contract.
- **Post-window skip:** the skip at :1547 is untouched, as pinned.
- **Pre-existing, out of scope:** in open mode, rows without timestamps are not damaged (:832 applies only when from or to is set). A segment whose only start lacks a timestamp therefore cannot own the merge. This hole predates the lane: today's final-row merge at :1456-1458 has it too, and the contract does not widen it. The contract's "unknown association stays PARTIAL" covers it if the builder applies N1's conservative clause.
- **Coverage weakening:** none found. The Lane55 zero-usage and known-id tests and the no-end-bound assertions are pinned byte-identical (contract :34). The `unavailable` annotation may not manufacture discovery evidence.

## C4 fields

Cause: `readline` frames rows on U+2028/U+2029 (build-census.mjs:296, token-census.mjs:275), and the child end rule accepts only a final-row `task_complete` (:831, :1552, :1559). The r1 contract gaps are now pinned: the positional witness, the exclusion guards, the segment merge, and tests that observe the counts.
Discriminating check: three kinds of test must be red on base:
- Completed pre-window children (with and without usage) and a completed overlapping child, each with a trailing benign row.
- Separator rows through `censusCodexLeadFile`, `censusLeadFile`, `censusSubFile` and token-census, asserting exact counts.
- The no-utf8 mutant.

These must stay PARTIAL with the exact reason (retention):
- the incomplete child
- the repeated-id and invalid-restart cases
- the segment tie and invalid-later-start cases (N1)
- the UserMessage `item_completed` case
Fix location: scripts/jsonl-lines.mjs `lfLines`; `openLines` at build-census.mjs:294-297 and token-census.mjs:273-276; the `censusCodexLeadFile` loop at :884-895; the segment merge at :1446-1458; the child rule at :1547-1560.
Simplification: one positional witness boolean per segment, merged conservatively (owner of the newest start; a tie or any invalid start gives false), and one guarded `continue` after :1547. No new mechanism.
