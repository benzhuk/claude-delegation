VERDICT: QUALIFIED — Codex CLI 0.156.1 natively discovers both personal `~/.codex/agents/*.toml` and project `.codex/agents/*.toml`, advertises their `name` values through `multi_agent_v1.spawn_agent.agent_type`, and applies a selected project role's model, reasoning effort, role identity, and developer instructions to the child.

## Contract and loader route

Official OpenAI documentation now explicitly defines the route that the earlier report could not establish: personal roles live under `~/.codex/agents/`, project roles under `.codex/agents/`; each TOML requires `name`, `description`, and `developer_instructions`; `name` is the selection identity; and role model/reasoning settings take precedence for spawned sessions. Source: https://learn.chatgpt.com/docs/agent-configuration/subagents

The installed npm package is `@openai/codex` 0.156.1 and contains a JavaScript launcher plus the native `codex.exe`, not readable Rust source. I therefore inspected the actual runtime-generated tool schema and executed the native app-server path rather than treating CLI help or `features list` as evidence.

## Native fixture

Runner: `C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/codex-custom-role-native-probe.mjs`, copied from the original `codex-child-depth-probe.mjs` and modified only outside the checkout.

Evidence root: `C:/Users/benzh/AppData/Local/astra-native-fixtures/codex-native-completion-R9iF2r`.

The fixture used sealed HOME/USERPROFILE/CODEX_HOME/AGENTS_HOME/APPDATA/LOCALAPPDATA, a dummy key, and a localhost Responses SSE server. It made no external provider call, copied no authentication, wrote no live configuration, and did not change the repository. It created:

- personal role `CODEX_HOME/agents/global_scout.toml` with description/model/instruction sentinels;
- project role `repo/.codex/agents/project_reviewer.toml` with different sentinels and model `fixture-project-model`;
- a native app-server turn whose synthetic provider returned `multi_agent_v1.spawn_agent` arguments containing `agent_type:"project_reviewer"`.

## Discriminating observations

1. The real first provider request's `multi_agent_v1.spawn_agent` schema gained an `agent_type` string property. Its generated description listed both `global_scout` and `project_reviewer`, included each exact TOML description sentinel, and reported their pinned models/reasoning efforts. Earlier no-role evidence lacked this property, so discovery is dynamic rather than a static CLI claim.
2. The native collab tool completed successfully and reported receiver role `project_reviewer`, model `fixture-project-model`, and reasoning effort `low` in app-server stdout and the parent rollout.
3. The child provider request used model `fixture-project-model`.
4. The child rollout `home/sessions/2026/09/23/rollout-2026-09-23T23-10-10-01a0d164-5e09-7ed3-86c5-e468b19ede84.jsonl` records `agent_role:"project_reviewer"` in session metadata and a developer message whose first content item is exactly `PROJECT_INSTRUCTION_SENTINEL`. It does not contain `GLOBAL_INSTRUCTION_SENTINEL`.
5. The app server warned that project-local config, hooks, and exec policies were disabled because the scratch project was untrusted, yet it still advertised and applied the project custom agent. This distinguishes custom-agent discovery from those trust-gated surfaces. The lead turn and selected child both completed; three localhost provider requests occurred: initial lead, lead after tool output, and child.

## Qualification and limits

The earlier UNVERIFIED conclusion based on absent `--agent` and `features list` output is superseded. Those surfaces are irrelevant to role selection; the native model-facing selector is the dynamically generated `spawn_agent.agent_type` field.

Both placement modes are proven discoverable in 0.156.1. For this repository, the existing `codex/agents/*.toml` files need installation/mirroring into `~/.codex/agents/` or copying into a project's `.codex/agents/` directory; leaving them only under `codex/agents/` is not a documented discovery path. No new role framework or installer is needed.

The fixture selected and fully verified the project role. The personal role was independently present in the actual tool schema with its exact description/model metadata, but was not spawned in this single bounded run. Sandbox default application was not claimed because app-server live turn overrides can supersede a role file's sandbox setting; model, reasoning effort, identity, and developer instructions were directly observed.

