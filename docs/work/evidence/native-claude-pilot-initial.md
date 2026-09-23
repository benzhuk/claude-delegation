VERDICT: PARTIAL

# Native Claude pilot report

Historical initial report. Subsequent recovery corrected the unavailable-JSON claim and qualified the global-state finding. See `native-claude-pilot-response.md` for the current result. The native file write remains unsuccessful.

Status: **PARTIAL / BLOCKED**. The native Claude session resolved the supplied plugin and read the requested inputs, but it was denied its one permitted write. No assessment artifact was produced. This trial proves session-local native plugin loading only; it does not prove an assessment, installed persistence, hooks, cross-host parity, peer transport, publication, or completion.

## Boundaries and timing

- Source SHA: `667200b690263af5d39c86d759aa75dc8738f365` (main, source and clone).
- Disposable clone: `C:\Users\benzh\AppData\Local\Temp\delegation-native-claude-20260923-181752-52ce24828d5e4c94b62f9a46bcf0665e`.
- State directory: `C:\Users\benzh\AppData\Local\Temp\delegation-native-claude-state-20260923-181752-de7b0f1587f54fbf8cd23b01502f0467`.
- Native run began at 6:18:14 PM America/New_York and ended at 6:19:42 PM America/New_York (about 88 seconds; within the 240-second deadline).
- Child `AGENTS_HOME` was the isolated state `agents` directory containing `ws-off`. `ORCA_*`, `NOTE_SLUG`, and inherited Claude messaging socket/token variables were removed for the child. No installation, plugin sync command, peer send, delegate, or publication was invoked.

## Sanitized invocation

`C:\Users\benzh\.local\bin\claude.exe --print --plugin-dir <disposable-clone> --no-session-persistence --model opus --permission-mode acceptEdits --permission-prompts none --tools Read,Write --allowed-tools Read,Write --output-format json --debug-file <state>\claude-plugin-debug.raw.log --setting-sources "" --settings {"disableAllHooks":true} --strict-mcp-config "/delegation:bearings Read the four specified local goal/baseline/current-record files; write only docs/work/evidence/native-claude-bearings.md; no network, publication, delegates, peer messages, or outside edits."`

The installed CLI help confirmed every used option. `--max-turns` was intentionally omitted because local help does not support it.

## Native-loading evidence

Sanitized debug evidence records that the clone was recognized as one plugin because `.claude-plugin` was at its top level, then records `Loaded inline plugin from path: delegation`, `Loaded 1 directory-loaded plugins`, `Loaded 4 agents from plugin delegation default directory`, and `Loaded 9 skills from plugin delegation default directory`. Read tool calls completed successfully. The slash request was sent with the required space form: `/delegation:bearings `.

## Result and blocker

- Required artifact path: `<clone>\docs\work\evidence\native-claude-bearings.md`.
- Artifact: absent; therefore no artifact hash and no artifact diff exist. `git status --short` was empty.
- Debug evidence records `Write tool permission denied` at 6:19:30 PM America/New_York, followed by normal turn end at 6:19:42 PM America/New_York.
- The direct runner's outer capture was cut off by its 30-second host command window while the independently running native process continued. Consequently the process exit code and JSON response are unavailable; the debug log verifies a completed turn but cannot establish the JSON result. Raw debug/stderr/result paths are retained only in the state directory and are not copied here.

## Persistent-side-effect finding

Despite the session-only plugin argument, empty setting sources, disabled hooks setting, strict MCP mode, and isolated `AGENTS_HOME`, the sanitized debug log records an atomic write to `C:\Users\benzh\.claude.json` during the run. That is a persistent configuration side effect outside the approved trial boundary. No attempt was made to inspect, copy, or restore that private file. This is an explicit blocker for repeating the same command; a future trial must isolate the home/config environment while preserving the provider authentication path safely.

Publication remains **PENDING: disposable native-host trial**. No bearings receipt was completed.
