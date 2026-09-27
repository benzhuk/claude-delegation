VERDICT: SCOPE RULING NEEDED — discovery/attribution premises hold; turn and four-read premises do not.

## Files and symbols
- `scripts/build-census.mjs` exists at base `c25cc70`; `codexUsage` (291) uses only response-local `usage` and correctly excludes cumulative snapshots.
- `censusCodexLeadFile` (338) requires `session_meta.session_id === id`, therefore rejects a real child whose `id` is child id and `session_id` is the lead id.
- `runCensus` (648–657) expressly rejects Codex `--tasks` and `--from/--to`; `combined` is forced `null` for Codex (816).
- Formatting still renders Codex as unsupported at 870/872/913; the lead reader supplies unknown model at 381 rather than joining `turn_context.model`.
- `scripts/build-census.test.mjs` exists; its Codex tests presently pin UNSUPPORTED, reject `--tasks` and reject `--from/--to`, so C1 must replace those assertions while retaining the Claude golden behavior.
- `docs/census.md` exists; lines 25–36 and 104 document the same unsupported Codex behavior; lines 160–176 define Claude `leadTurns` only.

## Helpers to reuse
- Reuse `openLines`, `detectLeadHost`, `codexUsage`, `mergeAggInto`, `formatText`/`formatJson`, and existing de-dup/unreadable reporting in `scripts/build-census.mjs`.
- Reuse the committed `codex-lead.jsonl` fixture and temporary-fixture helpers in `scripts/build-census.test.mjs`; no transcript prose is needed.
- `scripts/four-read.mjs:307–312` consumes `census.leadPath` and checks its basename against `Lead-session`.

## Tests that police this area
- Existing Codex tests require malformed/missing attribution to fail visibly and cumulative `turn_token_usage`/`thread_token_usage` never to be added.
- Existing window tests require both lead and subagents to honor both bounds; existing Claude fixtures establish byte-stable output.
- Existing `four-read` logic makes a live Codex rollout fail its lead-file identity check: basename `rollout-2026-09-26T15-58-25-01a0df4c-2809-7520-b1d7-876cc51a87ee` differs from `Lead-session` UUID `01a0df4c-2809-7520-b1d7-876cc51a87ee`.

## Open questions for the spec
- Live sample: 9 direct children (8 on Sep 26, 1 on Sep 27) have `thread_source=subagent`, `source.subagent.thread_spawn.parent_thread_id=lead`, ids distinct from lead, and declared depth 1. Scan Sep 26/27 finds no depth 2/3; depth 4 needs a fixture/contract decision.
- Child `turn_context` precedes every sampled usage (97 Terra, 14 Astra, 49 Terra, 9 Terra records); model join is evidenced. Lead has 246/246 Astra records. Cumulative thread total rises 18,854→47,893 early, proving it must not be summed.
- The lead has 6 `turn_context` records but 5 distinct turn ids; `event_msg.task_started` and completed `UserMessage` each have those same 5 ids. Decide whether `leadTurns` means unique `turn_context.turn_id`, `task_started`, or `UserMessage`; raw context-record count is not one-per-user-turn.
- C1 cannot alone cure four-read's rollout-basename contract. Decide whether its owner accepts a canonical session-id field or parses the rollout filename before this lane claims all four numbers.
- Child identity (all 9 direct files): metadata `id` is the child id; metadata `session_id` is the lead id; every token record's `payload.session_id` equals that lead id (545/545), never the child id.
- Therefore discovery must bind a child rollout to its metadata child id for identity/de-dup, but validate its token rows against metadata `session_id`/the discovered parent session, not against child id. The existing self-check cannot simply be relaxed to accept arbitrary IDs.
- Every sampled child usage row has numeric `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`, and `total_tokens`; none are absent across 545 rows.
- Across those 545 rows, native `total_tokens == input_tokens + output_tokens`; cache-write/read remain included in input and must be split/subtracted only for the census's additive display fields. Reasoning is not separately added.
- Authorized depth-2 probe (one Terra clock call): child metadata id `01a0e29e-c19d-7aa2-8cb4-a092c9967d6f`, `session_id`=root lead, `parent_thread_id`=depth-1 census scout `01a0e297-cf24-7fb3-828b-e3dc14ef1df3`, declared depth=2; its first usage row also names root-lead `session_id` and has response/turn ids.
- This proves traversal must retain the parent graph for eligibility/depth while treating root `session_id` as the common token-attribution namespace at depth 2 too; it cannot infer parenthood from a usage row.
