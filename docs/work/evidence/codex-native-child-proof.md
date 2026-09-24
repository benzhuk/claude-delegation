# Native Codex child identity proof

Recorded September 23, 2026 (America/New_York). Runtime: `codex-cli 0.156.1`. Candidate classifier: `519da165f2c8716994c62e6b98a8c1595fc9eb23`.

## Method

The fixture used a sealed `HOME`, `USERPROFILE`, `AGENTS_HOME`, `CODEX_HOME`, `APPDATA`, and `LOCALAPPDATA`; a dummy fixture key; an HTTP Responses SSE provider bound to localhost; and the installed CLI's native `multi_agent_v1.spawn_agent` function tool. It made no external provider call and changed no personal configuration.

Runner: `C:\Users\benzh\AppData\Local\Temp\astra-followthrough-0923\codex-child-depth-probe.mjs`. The command hook recorded only identity fields and the structural first `session_meta` row. Fresh evidence: `C:\Users\benzh\AppData\Local\astra-native-fixtures\codex-native-completion-L6uesp\adapter-events.jsonl`.

## Observed depth-one identity

The lead thread/session was `01a0d149-6240-74f0-bbef-dae3a272ce9a`. Its own UserPromptSubmit callback had no `agent_id`; its transcript metadata had `payload.id === payload.session_id === hook.session_id` and `payload.source === "vscode"`.

The authentic child regular UserPromptSubmit callback carried:

- `hook.session_id`: `01a0d149-6240-74f0-bbef-dae3a272ce9a` (the parent)
- `hook.turn_id`: `01a0d149-6904-7e93-8651-dd96230ece83` (the child turn)
- `hook.agent_id`: `01a0d149-68dc-7511-b3de-d8b9a474b9e4`
- `hook.agent_type`: `default`
- child transcript `session_meta.payload.id`: `01a0d149-68dc-7511-b3de-d8b9a474b9e4`
- child transcript `session_meta.payload.session_id`: `01a0d149-6240-74f0-bbef-dae3a272ce9a`
- `source.subagent.thread_spawn.parent_thread_id`: `01a0d149-6240-74f0-bbef-dae3a272ce9a`
- `source.subagent.thread_spawn.depth`: `1`

Thus `hook.agent_id === child transcript payload.id`, while the hook session ID and transcript `payload.session_id` both identify the parent. A guard requiring `payload.id === hook.session_id` misclassifies this authentic child as unknown.

The App Server exposed the child thread and child turn through native `thread/status/changed`, `turn/started`, hook start/completion, and `turn/completed` notifications. The observed child regular hook was UserPromptSubmit. The parent separately received its own Stop. No SubagentStart or SubagentStop event was fabricated or used as evidence.

Codex source at tag `rust-v0.156.1` agrees with the persisted shape: `thread_spawn_source` stores the immediate `parent_thread_id` and supplied depth in `SessionSource::SubAgent(SubAgentSource::ThreadSpawn)`, while `next_thread_spawn_depth` increments the current thread-spawn depth. That supports retaining structured ancestry and depth while correlating the callback positively through `agent_id === payload.id`; it does not justify requiring the recorded immediate parent to equal the hook session at every depth.

## Limit

A bounded nested fixture attempt did not produce an observable depth-two callback, so this report does not claim runtime depth-two field values. The accepted classifier avoids the depth-one-only parent-equality assumption and requires the independently observed positive child identity: valid structured spawn metadata, `payload.id === input.agent_id`, distinct child and hook-session IDs, and self-consistent session metadata. Historical inbox consumption by a misclassified child was not inspected and is not claimed.
