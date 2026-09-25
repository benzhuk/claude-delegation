# Codex rollout usage-schema observation

Observed 2026-09-25 from the only authorized rollout transcript path, whose filename date is 2026-09-21. The session metadata reports Codex CLI version `0.155.1`. Streaming read only; no rows, prompt content, instructions, tool arguments, secrets, or identifier values are reproduced here.

## Aggregate structure

- 18,326 parsed JSONL rows; 0 parse errors in the first streaming pass.
- Row-type counts: `event_msg` 7,875; `response_item` 7,350; `token_usage_record` 2,144 in the first pass; `turn_context` 51; `session_meta` 1; `inter_agent_communication_metadata` 685; `compacted` 20; `world_state` 200.
- A second targeted token-usage pass observed 2,146 records. This two-record difference shows the live rollout file was still receiving rows during inspection; counts are observations, not a closed-session census.
- `event_msg.payload.type=token_count` occurred 2,463 times, alongside 5,296 `item_completed`, 31 `task_started`, 30 `task_complete`, and 55 `thread_settings_applied` event messages.

## Usage fields and arithmetic (targeted second pass, 2,146 records)

- Each record exposed three parallel usage objects: `payload.thread_token_usage`, `payload.turn_token_usage`, and `payload.usage`.
- Each exposed numeric `input_tokens`, `output_tokens`, `total_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, and `reasoning_output_tokens`; `ordinal` was also present.
- All 2,146 records had the three core counters; all satisfied `input_tokens + output_tokens == total_tokens`.
- All 2,146 had cached and cache-write counters; all satisfied `cached_input_tokens + cache_write_input_tokens <= input_tokens`.
- `reasoning_output_tokens` was present in all 2,146 records.

## Attribution coverage and limits

- `payload.turn_id` was the observed attribution-id field on all 2,146 targeted usage records.
- 51 `turn_context` rows exposed turn-id metadata. In-memory comparison found 31 distinct context turn IDs and 31 matching distinct usage turn IDs. No identifier values were printed or retained in this report.
- No top-level `task_start` rows appeared; `event_msg.payload.type=task_started` appeared 31 times. This probe did not infer that those event messages carry a usable turn-id attribution.
- The matching-ID count demonstrates only that 31 observed identifiers coexist across these two row classes. It does not establish complete conversational-run attribution, complete lead usage, token ownership, or a valid `leadTurns` total.
