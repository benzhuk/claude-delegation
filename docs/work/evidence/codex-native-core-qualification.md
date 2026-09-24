# Native Codex installed-package continuation qualification

Recorded September 23, 2026 (America/New_York). Runtime: `codex-cli 0.156.1`. Exact source candidate: `519da165f2c8716994c62e6b98a8c1595fc9eb23`.

## Installed package

The final fixture used a disposable Codex home and ran the supported native registration commands against the candidate checkout: marketplace add, plugin add, plugin list, and `debug prompt-input`. Codex installed `delegation` version `0.20.0` under the disposable versioned cache and exposed all nine expected namespaced skills:

`bearings`, `continue`, `decisions`, `delegate`, `dev-server`, `janitor`, `multi`, `notion-writing`, and `team-build`.

`hooks/list` found SessionStart, UserPromptSubmit, PostToolUse, Stop, and Interrupt from plugin `delegation@delegation`. Each command expanded `${PLUGIN_ROOT}` to the versioned cache root and targeted its real `hooks/multi-codex-hook.mjs`; every lifecycle notification subsequently reported `source:"plugin"` and that cached `hooks/codex-hooks.json` source path.

Fresh evidence root: `C:\Users\benzh\AppData\Local\astra-native-fixtures\codex-native-core-m9JoLS`. The complete structured result is `summary.json`; native App Server streams are `*.appserver.stdout.jsonl`.

Installed hooks were initially reported as untrusted and did not execute. The fixture copied the five exact `currentHash` values returned by `hooks/list` into the disposable home's trust table. A new App Server then reported all five as trusted and executed them. No personal Codex configuration or trust state changed.

## Real core results

The local provider read the epoch, host, and session that the real UserPromptSubmit hook placed in model-visible additional context. It then emitted an actual native `exec_command` call to the installed package's `scripts/continuation.mjs bind`. The real PostToolUse callback passed the command result to the installed `multi-codex-hook.mjs`, which invoked its normal `runCodexHook` and `handleContinuationEvent`; the fixture supplied no continuation handler, role, bind marker, or state override.

- **Unaccounted:** three provider requests. Native SessionStart, UserPromptSubmit, PostToolUse, and two Stop executions ran from the plugin. The first Stop emitted the correction and persisted `attempted:true` and `emitted:true`; Codex continued the same turn and re-fired Stop once. Final state remained active with the exact selected-work revision and no accounted revision.
- **Accounted:** three provider requests. Native bind and account commands produced two PostToolUse callbacks. The final Stop was silent because `accountedRevision` exactly matched the selected snapshot; state remained active with `attempted:false`.
- **Interrupted:** native bind and PostToolUse activated the episode, then App Server `turn/interrupt` was acknowledged while the second local response was pending. Interrupt ran from the plugin, terminal status was `interrupted`, no Stop ran, and persisted state was `phase:"stopped"` with no binding.

The prior direct command-path evidence at `C:\Users\benzh\AppData\Local\astra-native-fixtures\codex-native-core-Ouw2Lh` independently records callback outputs, including the first Stop's native block object and `stop_hook_active:true` re-fire. The installed-package run establishes that the same core behavior works through native package discovery and the root-relative cached hook rather than an explicit source hook.

## Environment and limits

All runs sealed `HOME`, `USERPROFILE`, `AGENTS_HOME`, `CODEX_HOME`, `APPDATA`, and `LOCALAPPDATA`, used a dummy fixture key, and contacted only a localhost Responses endpoint. They made no paid or external provider calls.

The fixture-only `PATH` selected `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`. With the ordinary host PATH, Codex 0.156.1 chooses the first Store/MSIX `pwsh.exe` for hook execution and the hook runner fails at spawn with OS error 5; selecting system Windows PowerShell makes the identical command transport pass. That counterfactual and the source-level selection path are preserved in `codex-command-hook-diagnosis.md`. No live PATH or SDK configuration changed.

The local SSE responses establish native mechanics, identity, state transitions, and installed package resolution. They do not establish model judgment on real work. Plugin installation and hash trust were disposable; this is not evidence of persistent installation on the user's active Codex home.
