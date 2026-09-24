# Codex native completion and cancellation proof

**VERDICT: native main-thread lifecycle behavior is proven on Codex CLI 0.156.1 with a sealed local Responses fixture. Command-hook execution is not qualified from this already nested Windows agent environment; the production command adapter should remain fail-closed until a non-nested host trial succeeds.**

## What was exercised

`native-fixture-run.mjs` starts a loopback-only Responses SSE endpoint and a loopback MCP endpoint, then drives the installed Codex app-server over its supported JSON-RPC protocol. It creates disposable `HOME`, `USERPROFILE`, `AGENTS_HOME`, `CODEX_HOME`, `APPDATA`, and `LOCALAPPDATA` directories, uses only `CODEX_FIXTURE_KEY=dummy-fixture-key`, and does not inherit real provider, authentication, messaging, or Orca variables. The custom provider uses `wire_api = "responses"` and `base_url = http://127.0.0.1:<ephemeral>/v1`.

The successful evidence run is:

- Runner: `C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/native-fixture-run.mjs`
- Sanitized summary: `C:/Users/benzh/AppData/Local/astra-native-fixtures/codex-native-completion-byclE6/summary.json`
- Raw native app-server streams: the three `*.appserver.stdout.jsonl` files beside that summary
- CLI version: `codex-cli 0.156.1`
- Provider traffic: four POSTs, all exactly `/v1/responses`, all `stream:true`, all model `fixture-model`; no real provider request
- App-server stderr: zero bytes for all three cases

The recorder is an actual trusted `mcp_tool` lifecycle hook. It receives Codex-expanded hook fields through the normal hook engine, returns the same JSON Stop decision contract as a command hook, and avoids starting a nested subprocess. This proves Codex lifecycle dispatch, correlation fields, Stop continuation, and Interrupt behavior. It does not by itself prove that this session can launch the repository's command adapter.

## Exact observations

### Normal completion

Thread/session `01a0d135-3b08-70c1-a39c-4f927d325ee4`, turn `01a0d135-3b1b-7ce3-9f6f-26d90f26b411`:

1. `UserPromptSubmit`
2. one streamed Responses request
3. `Stop` with `stop_hook_active:false`
4. native `turn/completed` with `status:"completed"`

The UserPromptSubmit and Stop payloads had the same exact `session_id` and `turn_id`. The hook `session_id` equaled the app-server thread id.

### Stop block and refire

Thread/session `01a0d135-3c89-7841-a147-b5ec9af22800`, turn `01a0d135-3cb9-7353-9a6e-4dc727623ed9`:

1. `UserPromptSubmit`
2. first streamed Responses request
3. first `Stop`: same session/turn, `stop_hook_active:false`
4. hook returned `{"decision":"block","reason":"fixture continue once"}`
5. Codex issued a second streamed Responses request
6. second `Stop`: same session/turn again, `stop_hook_active:true`
7. native `turn/completed` with `status:"completed"`

`UserPromptSubmit` did not refire for the automatic continuation. The continuation remained in the same Codex turn and session. Both Stop payloads reported model `fixture-model`, permission mode `bypassPermissions`, a transcript path, the fixture cwd, and a last assistant message.

### Controlled cancellation

Thread/session `01a0d135-3e09-7e40-9421-f3c46010c968`, turn `01a0d135-3e3e-73b1-9b73-8bf7d2fec858`:

1. `UserPromptSubmit`
2. a Responses request remained pending
3. the fixture sent app-server `turn/interrupt` with that exact thread and turn
4. app-server acknowledged the request
5. `Interrupt` fired with the same exact session/turn
6. native `turn/completed` reported `status:"interrupted"`
7. no `Stop` fired

This was a Codex control-protocol interrupt. It was not `child.kill("SIGINT")` and does not rely on Windows process termination semantics.

## Actual payload boundary

The actual main-thread payload fields observed through native template expansion were:

- Common: `session_id`, `turn_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, `permission_mode`
- `UserPromptSubmit`: common fields plus `prompt`
- `Stop`: common fields plus `stop_hook_active` and `last_assistant_message`
- `Interrupt`: common fields

The fixture persisted only identifiers, fixed fixture values, and presence/equality booleans. It did not persist prompt text, assistant text, transcript contents, auth, stdout/stderr from private sources, or environment values.

## Rejected earlier inferences

The original no-request result is invalid. It used `spawnSync` while the loopback HTTP server lived in the same Node event loop, so the child waited for a server that the blocked parent could not service.

The earlier Windows `child.kill("SIGINT")` result is also not cancellation evidence. On Windows it can terminate the child process rather than exercise Codex's control path. The app-server `turn/interrupt` result above replaces it.

## Command-hook limitation

A separate scratch run used a trusted command hook whose entire command was the harmless `C:\Windows\System32\cmd.exe /d /c exit 0`. Both UserPromptSubmit and Stop produced native `hook/completed` records with `status:"failed"`, duration 1–2 ms, and `Access is denied. (os error 5)`:

- `C:/Users/benzh/AppData/Local/astra-native-fixtures/codex-native-completion-UxrIHa/app-normal.appserver.stdout.jsonl`

The same failure occurred with quoted absolute `node.exe`, unquoted absolute `node.exe`, and bare `node`, including when the hook script was inside the fixture workspace and the thread sandbox was `dangerFullAccess`. The harmless `cmd.exe` discriminator shows the failure precedes adapter logic. Because this proof itself runs inside an existing Codex execution environment, the result is recorded as a nested Windows process-spawn barrier, not a general Codex command-hook failure. A non-nested native host run is still required before declaring the command adapter supported.

Subagent lifecycle was not exercised. Official hook documentation says subagent hooks use the parent session id, but no runtime child/parent identity claim is made here.

No source checkout, personal/managed Codex config, live hook registration, real receipt, cursor, transcript, provider endpoint, or auth file was changed.

