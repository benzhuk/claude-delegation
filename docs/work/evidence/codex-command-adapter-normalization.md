# Native Codex command-adapter qualification

Recorded 2026-09-23 America/New_York. Runtime `codex-cli 0.156.1`; adapter source checkout `astra-harness-next` at `0cef0f073aea3364fc5c4f1c23f45d43c054c0cd`. This is fixture evidence only; it does not enable the production Codex profile.

## Fixture

- Runner: `C:\Users\benzh\AppData\Local\Temp\astra-followthrough-0923\native-fixture-run.mjs`
- Thin native-stdin bridge: `C:\Users\benzh\AppData\Local\Temp\astra-followthrough-0923\codex-command-adapter-hook.mjs`
- Evidence root: `C:\Users\benzh\AppData\Local\astra-native-fixtures\codex-native-completion-Per8Bo`
- Structured callback record: `adapter-events.jsonl`
- App-server records: `app-*.appserver.stdout.jsonl`

The fixture imports the repository's actual `runCodexHook`, passes every unmodified command-hook stdin object into it, and sets only the dependency gate `codexContinuationSupported:true`. Its injected continuation handler records the adapter's normalized event. For the `APP_BLOCK_ONCE` synthetic prompt it returns one Stop reason only while `stopHookActive` is false. A local Responses SSE provider uses a dummy key and no external model/provider.

The app-server process used a sealed HOME/USERPROFILE/AGENTS_HOME/CODEX_HOME and a fixture-only `PATH` that selects system Windows PowerShell. This is required by the separately proven Store-PowerShell hook-launch defect in `codex-command-hook-diagnosis.md`; it does not change live configuration.

## Results

All assertions below are observed from native app-server callbacks, not constructed adapter inputs.

### Normal completion

- Thread `01a0d144-26f5-7151-b912-4ec45ca78d0f`, turn `01a0d144-2709-7601-a705-4fef03ead081`.
- `UserPromptSubmit` and `Stop` reached the command adapter with the same exact session and turn IDs.
- Stop had `stop_hook_active:false`; one fixture-provider request completed the turn with terminal status `completed`.
- Both native command hooks completed successfully and app-server stderr remained empty.

### Native tool / bind marker

- Thread `01a0d144-2fbe-7c02-9277-0119d16bc9ed`, turn `01a0d144-2fea-7d51-8cb0-65d31d91f736`.
- The local Responses stream emitted a real `exec_command` function call. Codex executed it and emitted a native `PostToolUse` command callback before the second provider request.
- Actual callback `tool_name` is `Bash`, despite the Responses tool name being `exec_command`. `tool_input` has the single key `command`; actual `tool_response` is accepted by the repository marker parser.
- The repository adapter normalized the real callback to `event:'PostToolUse'`, the same session/turn episode, profile `codex-0.156.1-turn-v1`, and `bindRequestId:'fixture-request'`.
- The turn used two provider requests and completed normally.

### Stop block and re-fire

- Thread `01a0d144-4087-7182-b399-0da417bfb85c`, turn `01a0d144-40b7-7e50-bafa-1ab15442637c`.
- First Stop callback: same exact session/turn, `stop_hook_active:false`. The repository adapter composed the fixture continuation reason into a native `{decision:'block'}` output.
- Codex made a second provider request in the same turn and fired Stop again with the same exact session/turn and `stop_hook_active:true`.
- The second callback returned no block; terminal status was `completed`. Request count was exactly 2.

### Controlled interruption

- Thread `01a0d144-4cd1-79a0-b34e-cf9a12e10054`, turn `01a0d144-4d06-7293-8124-bd5f9df233bc`.
- App-server `turn/interrupt` was acknowledged while the local response was pending.
- `Interrupt` reached the command adapter with the same exact session and turn IDs. Normalization set `cancellation:true`, `cancellationVerified:true`, and profile `codex-0.156.1-turn-v1`.
- Terminal status was `interrupted`; no Stop callback occurred.

## Exact native callback shapes

- `UserPromptSubmit`: `cwd`, `hook_event_name`, `model`, `permission_mode`, `prompt`, `session_id`, `transcript_path`, `turn_id`.
- `PostToolUse`: `cwd`, `hook_event_name`, `model`, `permission_mode`, `session_id`, `tool_input`, `tool_name`, `tool_response`, `tool_use_id`, `transcript_path`, `turn_id`.
- `Stop`: `cwd`, `hook_event_name`, `last_assistant_message`, `model`, `permission_mode`, `session_id`, `stop_hook_active`, `transcript_path`, `turn_id`.
- `Interrupt`: `cwd`, `hook_event_name`, `model`, `permission_mode`, `session_id`, `transcript_path`, `turn_id`.

For every event in a turn, native `session_id` and `turn_id` are stable. The adapter's episode key is the exact turn ID; its event key is `<Event>:<turn_id>`.

## Session metadata finding

The first transcript row is structurally:

`{type:'session_meta', payload:{session_id:S, id:S, originator:'native-fixture', cli_version:'0.156.1', source:'vscode', model_provider:'fixture', ...}}`

`payload.id`, `payload.session_id`, and the hook's `session_id` are exactly equal. The authentic App Server lead source is the string `vscode`, not `cli`. Consequently the current repository `classifyCodexRole` returns `unknown`, and every normalized record above has `role:'unknown'`. The fixture continuation handler intentionally recorded these normalized records and produced the one test block without imposing the production handler's lead-role gate.

Production must not enable this profile until the classifier recognizes the evidenced App Server lead origin with an appropriately narrow structural rule. Expanding acceptance to arbitrary strings or object-shaped sources would weaken the child boundary. Actual native subagent metadata remains a separate unproven fixture.

## Hook environment finding

This run loaded hooks from the sealed user `$CODEX_HOME/hooks.json`. `PLUGIN_ROOT`, `PLUGIN_DATA`, `CLAUDE_PLUGIN_ROOT`, and `CLAUDE_PLUGIN_DATA` were all absent in every native callback process. That is the correct observation for a user-config hook and does not contradict the documented variables for plugin-bundled hooks. Plugin-bundled command loading and those environment values were not qualified here.

## Qualification ruling

The native command callback profile itself is now proven on 0.156.1 for prompt, real tool use and bind extraction, normal Stop, Stop re-fire, and acknowledged interruption. The repository adapter preserves the native session/turn identity and maps cancellation semantics correctly when invoked with `codexContinuationSupported:true`.

Production enablement still has two explicit gates:

1. accept the evidenced App Server lead metadata source (`vscode`) without weakening native child detection;
2. qualify the installed plugin-bundled hook path and its root/data environment, or keep using the separately installed user hook contract with an explicit absolute adapter path.

The Store-PowerShell SDK defect must also be handled at Codex's shared hook-shell selection boundary; command-specific wrapper strings cannot repair an outer shell that fails before the handler starts.
