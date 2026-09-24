# Codex native command-hook diagnosis

Recorded 2026-09-23 10:29 PM America/New_York. Runtime: `codex-cli 0.156.1` on native Windows.

## Result

The failing command-hook transport is not a general nested-process failure and is not caused by a missing `COMSPEC`. Codex 0.156.1 selects the first PowerShell executable on `PATH` as the local turn shell, injects that exact executable into the hook runtime, and the hook runner receives Windows error 5 when that selection is the Store/MSIX PowerShell at:

`C:\Program Files\WindowsApps\Microsoft.PowerShell_7.6.6.0_x64__8wekyb3d8bbwe\pwsh.exe`

The identical app-server fixture and hook definitions complete successfully when the sealed child `PATH` is changed so shell discovery selects:

`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`

This proves that native Codex command hooks are supported and reachable in the fixture. It also narrows the local failure to Codex's selected Store PowerShell at its command-hook spawn boundary. The lower-level Windows reason that `tokio::process::Command::spawn` rejects this executable in the hook runner while direct Node launch accepts it is not exposed by Codex diagnostics; that remaining distinction is explicitly unknown.

## Native evidence

- Default sealed-path run: `C:\Users\benzh\AppData\Local\astra-native-fixtures\codex-native-completion-UxrIHa`. `UserPromptSubmit`, `Stop`, and `Interrupt` command handlers all reach `hook/started`, then `hook/completed` reports `status:"failed"`, empty stdout/stderr, and `Access is denied. (os error 5)` after 1–2 ms.
- Missing-`COMSPEC` discriminator: `C:\Users\benzh\AppData\Local\astra-native-fixtures\codex-native-completion-hEaLdV`. Setting the child `COMSPEC` to `C:\missing-fixture-shell\cmd.exe` leaves the exact OS-5 result unchanged. Therefore the app-server hook path supplies a nonempty shell program and does not use the hook runner's default `COMSPEC` fallback.
- Shell-selection discriminator: `C:\Users\benzh\AppData\Local\astra-native-fixtures\codex-native-completion-IZcJFj`. Keeping the same app-server protocol, hooks, cwd, provider, trust bypass, and sealed homes, but narrowing only `PATH` so Codex discovers system Windows PowerShell, makes `UserPromptSubmit` and `Stop` finish with `status:"completed"` and no output entries (719 ms and 744 ms in `app-normal.appserver.stdout.jsonl`). The interrupt case also uses the same working transport.
- The host's ordinary `where pwsh` order is Store PowerShell first, then the per-user WindowsApps alias. The fixture inherits that order unless `FIXTURE_PATH` overrides it.
- Controls launched from the same tool job and cwd succeed: Node -> `cmd.exe /d /c exit 0`, Node -> the exact Store `pwsh.exe -NoProfile -Command "exit 0"`, and direct Store PowerShell all exit 0. This disproves the earlier broad claim that nested process creation itself is denied.
- The fixture repo exists and is readable by `CodexSandboxUsers`; `cmd.exe` and `node.exe` have execute ACLs. App-server stderr is empty. Thread start reports `sandbox.type:"dangerFullAccess"`.

## Source chain at the installed tag

OpenAI source tag `rust-v0.156.1` (`b412ff32c417f855c2b2d1581b77058eed87c84b`) establishes the path:

1. `codex-rs/shell-command/src/shell_detect.rs` makes Windows `default_user_shell()` prefer PowerShell and `get_shell_path()` returns the first `pwsh` found by `which`.
2. `codex-rs/core/src/session/mod.rs::build_hooks_config` derives `program + args` from the selected turn environment shell. For PowerShell, `derive_exec_args` produces the exact shell path plus `-NoProfile -Command`; `build_hooks_config` removes only the empty command operand and passes the remaining shell program/args to `HooksConfig`.
3. `codex-rs/hooks/src/engine/command_runner.rs` uses that nonempty program instead of its `COMSPEC` fallback, sets session cwd and piped stdio, and returns `err.to_string()` immediately when `command.spawn()` fails. The native record therefore proves a pre-handler process-spawn failure.
4. The same release source explicitly identifies Store PowerShell as potentially inaccessible to the elevated sandbox account and provides `fallback_powershell_shell_for_elevated_windows_sandbox`. Normal tool execution calls that fallback from `core/src/tools/runtimes/mod.rs`; `build_hooks_config` does not apply it before constructing the command-hook runtime.

The official hooks documentation confirms that `commandWindows` changes the Windows hook command string and that commands use the session cwd. It does not configure the outer shell executable. See [Hooks](https://learn.chatgpt.com/docs/hooks) and the [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Related upstream reports are consistent with this boundary: [openai/codex#35871](https://github.com/openai/codex/issues/35871) reports Store/MSIX PowerShell resolving to `CreateProcessAsUserW` error 5, and [openai/codex#34872](https://github.com/openai/codex/issues/34872) reports WindowsApps `pwsh` failing while `cmd` works. They are corroboration, not the basis of this fixture conclusion.

## Root-cause repair proposal

Repair shell selection once, where the selected local `TurnEnvironment` shell is converted into `HooksConfig`. On native Windows, apply the existing Store/WindowsApps detection and compatible-PowerShell fallback before deriving the hook shell program. This keeps every hook handler on the same corrected command transport and avoids handler-specific string wrappers. Add a core/hooks integration test whose local selected shell is a Store-style PowerShell path and whose compatible fallback is system PowerShell; assert the hook runtime receives the fallback program while the inner `commandWindows` remains unchanged.

Do not disable Codex command hooks globally based on this machine. The successful system-PowerShell run proves the transport works. Until Codex applies the shared shell-selection repair, production qualification must account for the selected shell path; `commandWindows` alone cannot bypass a failing outer shell.

## Next discriminator if upstream needs the final Windows mechanism

Run the same unmodified default-PATH fixture once from an ordinary user terminal outside the current agent-owned process tree while recording Windows process-creation diagnostics. If it succeeds there, the remaining condition is the current host/job token interacting with Store package launch; if it still fails, the condition is intrinsic to Codex's hook runner launch of the Store/MSIX executable. No provider request or personal config is needed.
