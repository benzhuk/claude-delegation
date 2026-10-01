VERDICT: EXPECTED_RED — 14 discriminating failures on actual production base fb6367392dfc1dd4db71c09d4637bb0a5125462d; 141 retained greens

# Lane 40b independent contract tests

- Test commit: `6083ba291ed5dd430469139f924ec4a39555b0e9`
- Branch/worktree: `benzhuk/census-reader-40b-tests` / `C:/Users/benzh/orca/workspaces/claude-delegation/census-reader-40b-tests`
- Run at: 2026-09-29 23:18:35 America/New_York
- Production files changed: none
- Work-record files changed: none

## Test-to-contract map

| Contract | Tests | Evidence on old source |
|---|---|---|
| LF-only framing; strip one CR; preserve blank rows and final remainder | `scripts/jsonl-lines.test.mjs` | Expected red against the committed interface stub |
| Decoded stream chunking; U+2028/U+2029 exact values; reject byte chunks | `scripts/jsonl-lines.test.mjs`; 64 KiB production boundary in `scripts/build-census.test.mjs` | Shared-reader stub red; production lead reader silently counted zero |
| Stream errors rethrow without a partial row; early consumer exit destroys source | `scripts/jsonl-lines.test.mjs` | Expected stub reds |
| Actual Codex census reader preserves literal separators and reaches following usage | `scripts/build-census.codex.contract.test.mjs` | `damaged` was `malformed JSON row`, expected `null` |
| Actual Claude lead and subagent readers count separator-bearing assistant usage | `scripts/build-census.test.mjs` | Both returned zero responses, expected one with exact usage |
| Actual token census counts separator-bearing assistant usage | `scripts/token-census.test.mjs` | `malformedLines` was 3, expected 0; exact 14-token contribution was absent |
| Completed pre-window child excluded; incomplete pre-window child remains PARTIAL; overlapping child counted | `scripts/build-census.codex.contract.test.mjs` | Completed usage and zero-usage cases red; incomplete case retained green with named reason |
| `task_complete` before benign trailing `item_completed` remains the witness in bounded and open modes | `scripts/build-census.codex.contract.test.mjs` | Bounded, overlapping, and open cases red on final-row-only source |
| Finite start permits exclusion; equality with `--from` overlaps | `scripts/build-census.codex.contract.test.mjs` | From-only exclusion red; boundary-equal PARTIAL retained green |
| Completion belongs to latest positional start; repeated same-id and invalid restart cannot borrow completion | `scripts/build-census.codex.contract.test.mjs` | All guard cases retained green on base and prevent a false-green set-membership implementation |
| Corrupt/conflicting pre-window evidence stays PARTIAL | `scripts/build-census.codex.contract.test.mjs` | Retained green with exact corruption/conflict reasons |
| `item_completed` with matching `turn_id`, and agent text saying “task complete,” are not terminal | `scripts/build-census.codex.contract.test.mjs` | Retained green with named no-end-witness reasons |

## Focused base-red gate

The nonblocking Windows mutex `Global\claude-verify` was acquired. No wait or heavy suite was used.

Exact test command:

```powershell
node --test scripts/jsonl-lines.test.mjs scripts/build-census.codex.contract.test.mjs scripts/build-census.test.mjs scripts/token-census.test.mjs
```

Exact result summary:

```text
ℹ tests 155
ℹ suites 0
ℹ pass 141
ℹ fail 14
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 927.0486
```

Exact failing test names:

1. `Codex public census API preserves literal U+2028/U+2029 JSON and counts the following usage row` — actual `damaged: "malformed JSON row"`, expected `null`.
2. `Lane40b clean completed pre-window child is excluded even when benign item_completed trails task_complete` — actual reason `child completed-pre-window has no end-bound witness for the requested window`.
3. `Lane40b completed overlapping child is counted when a benign row trails its task_complete` — actual reason `child overlapping-child has no end-bound witness for the requested window`.
4. `Lane40b task completion before a benign row is a witness in open mode and contributes usage` — actual reason `open or unbounded child open-completed-child has no end-bound witness`.
5. `Lane40b from-only window excludes a clean child that ended before its finite start` — actual reason `open or unbounded child from-only-pre-window has no end-bound witness`.
6. `Lane40b clean completed zero-usage child wholly before --from is excluded` — actual reasons `child zero-usage-pre-window has no token_usage_record rows with per-response usage; child zero-usage-pre-window has no end-bound witness for the requested window`.
7. `censusLeadFile parses a literal U+2028/U+2029 assistant row as one LF-framed JSON record` — actual response count 0, expected 1.
8. `censusSubFile counts exact usage from an assistant row containing literal U+2028/U+2029` — actual response count 0, expected 1.
9. `lfLines frames only on LF across decoded chunk boundaries and preserves JSON Unicode separators` — `Lane 40b LF reader contract not implemented`.
10. `lfLines yields a final non-LF remainder once and does not invent a row after a terminal LF` — `Lane 40b LF reader contract not implemented`.
11. `lfLines rejects byte chunks instead of silently decoding a split UTF-8 sequence` — stub error did not satisfy the required `TypeError` contract.
12. `lfLines propagates a source error without yielding its pending partial remainder` — `Lane 40b LF reader contract not implemented`.
13. `lfLines closes the source when a consumer exits early` — `Lane 40b LF reader contract not implemented`.
14. `runCensus counts a literal U+2028/U+2029 assistant row through the production token reader` — actual `malformedLines: 3`, expected 0.

## Retained-green evidence

The focused run retained all prior tests in the four files and passed the new defensive cases that must stay PARTIAL on both old and repaired source:

- incomplete pre-window child with usage and no terminal witness;
- newer distinct task after an earlier completion;
- repeated same-id restart after completion;
- invalid task restart after completion;
- child ending exactly at `--from` with zero usage;
- matching-turn `item_completed` UserMessage and task-complete-looking agent text;
- corrupted and duplicate-timestamp-conflicting pre-window children;
- existing Lane55 open zero-usage, known-id old-child, and temporal coverage contracts.

No assertion was weakened to convert an expected red into green.

Cause: `node:readline` treats literal U+2028/U+2029 as line breaks, so valid LF-framed JSON is fragmented before parsing; Codex child coverage also resets its completion witness on every later benign row and accepts only a final-row `task_complete`.

Discriminating check: separator-bearing assistant usage must contribute exact counts through `censusLeadFile`, `censusSubFile`, `censusCodexLeadFile`, and token census; a matching `task_complete` followed by benign `item_completed` must close the latest positional task, while repeated/invalid restarts, corruption, conflicts, boundary overlap, and unsupported `item_completed` shapes remain PARTIAL.

Fix location: production implementation belongs in `scripts/jsonl-lines.mjs`, the `openLines` seams in `scripts/build-census.mjs` and `scripts/token-census.mjs`, and Codex latest-start/completion plus child temporal state in `scripts/build-census.mjs`. This test lane changed none of them.

Simplification: one shared LF splitter contract covers both production readers; one positional latest-start-completed predicate covers bounded and open child modes, with a single finite-start exclusion guard before zero-usage checks.

