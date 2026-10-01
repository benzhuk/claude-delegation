# Native Codex sanitized fixture provenance

These are typed, whitelist-only captures from the configured account's native Codex rollout files; they are not synthetic fixtures.

| fixture | source filename | selected native model |
|---|---|---|
| `lead.jsonl` | `rollout-2026-09-26T15-58-25-01a0df4c-2809-7520-b1d7-876cc51a87ee.jsonl` | `gpt-6-astra` |
| `child-1.jsonl` | `rollout-2026-09-26T16-01-40-01a0df4f-22fb-7470-8fa3-4c65985f778b.jsonl` | `gpt-5.6-terra` |
| `child-2.jsonl` | `rollout-2026-09-26T16-01-59-01a0df4f-6df1-79e2-bb8b-fb9b45a91596.jsonl` | `gpt-6-astra` |

Each file contains one initial `session_meta`; its payload keeps exactly `id`, `session_id`, and `thread_source`, plus for children only `source.subagent.thread_spawn.parent_thread_id`, `depth`, `agent_path`, and `agent_nickname`.

The remaining whitelisted record types and payload fields are exact: `event_msg` only `type=task_started` and `turn_id`; `turn_context` only `model` and `turn_id`; `token_usage_record` only `session_id`, `response_id`, `turn_id`, `usage`, `turn_token_usage`, and `thread_token_usage`. Each of those three numeric usage objects keeps exactly `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`, and `total_tokens`.

Original timestamps are preserved. No `message`, prompt, user, assistant, tool, `base_instructions`, `cwd`, full metadata source, or other transcript content is included.
