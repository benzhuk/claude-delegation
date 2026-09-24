# Command hooks fail with "Access is denied. (os error 5)" when selected shell is Store/MSIX PowerShell (`pwsh.exe` under `WindowsApps`)

## Environment

- `codex-cli 0.156.1`, source tag `rust-v0.156.1`, commit `b412ff32c417f855c2b2d1581b77058eed87c84b`
- Native Windows, app-server sandbox reported as `dangerFullAccess`
- Store/MSIX PowerShell present at:
  `C:\Program Files\WindowsApps\Microsoft.PowerShell_7.6.6.0_x64__8wekyb3d8bbwe\pwsh.exe`
- Host's ordinary `where pwsh` resolves this Store/MSIX executable first, ahead of the per-user WindowsApps alias

## Summary

When shell detection selects the Store/MSIX `pwsh.exe` as the outer shell, Codex command hooks are discovered and trusted, reach `hook/started`, and then fail at `hook/completed` after 1–2 ms with empty stdout/stderr and `Access is denied. (os error 5)`. The identical fixture succeeds when `PATH` is narrowed so shell detection instead selects system Windows PowerShell (`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`).

## Steps to reproduce

1. On Windows with Store/MSIX PowerShell first on `PATH`, configure any harmless trusted command hook, e.g. UserPromptSubmit running `cmd.exe /d /c exit 0`.
2. Enable hooks and start Codex App Server with a local model provider (a localhost Responses fixture is sufficient; no external provider traffic required). Start a thread and turn so UserPromptSubmit fires.
3. Observe `hook/started`, then `hook/completed` with failed status, empty stdout/stderr, and OS error 5, before the hook's own command runs.
4. Repeat with all inputs unchanged except `PATH`: place `C:\Windows\System32\WindowsPowerShell\v1.0` first and exclude the Store/WindowsApps `pwsh`.
5. Observe the same hook complete successfully.

Original evidence used sealed `HOME`, `USERPROFILE`, `AGENTS_HOME`, `CODEX_HOME`, `APPDATA`, `LOCALAPPDATA`, a dummy fixture key, and localhost only.

## Expected behavior

Command hooks complete successfully regardless of which discoverable PowerShell executable is selected as the outer shell, consistent with normal tool execution (which already has a compatibility fallback for this case — see below).

## Actual behavior

- With Store/MSIX `pwsh.exe` selected: `hook/completed` fails in 1–2 ms, empty stdout/stderr, `Access is denied. (os error 5)`.
- With system Windows PowerShell selected (`PATH` narrowed only): the same UserPromptSubmit and Stop command hooks finish successfully (719 ms and 744 ms respectively), and the same transport later passes native prompt/tool/Stop/Interrupt and installed-plugin continuation cases.
- Changing `COMSPEC` to a missing executable does not affect the Store-PowerShell failure — the hook runtime already has a nonempty selected shell program, so the `COMSPEC` fallback path is never reached.
- Same-parent, same-cwd, same job direct-launch controls all succeed: Node → `cmd.exe /d /c exit 0`; Node → the exact Store `pwsh.exe -NoProfile -Command "exit 0"`; and direct Store PowerShell launch. This rules out a blanket nested-process/job denial for this executable under this parent.

## Source-backed diagnosis

In `codex-rs/shell-command/src/shell_detect.rs`, `get_powershell_shell()` resolves `pwsh` via `which::which`, which returns the Store/MSIX executable first when it precedes the WindowsApps alias on `PATH`. This module already defines a narrow, existing repair primitive:

```rust
/// Returns a replacement only when shell_path targets Store PowerShell and
/// an elevated sandbox-compatible PowerShell executable can be discovered.
pub fn fallback_powershell_shell_for_elevated_windows_sandbox(
    shell_path: &Path,
) -> Option<DetectedShell> { ... }
```

`codex-rs/core/src/tools/runtimes/mod.rs::prepare_powershell_command_for_elevated_windows_sandbox` applies this fallback for normal tool execution when elevated-sandbox conditions apply.

However, `codex-rs/core/src/session/mod.rs::build_hooks_config` takes the turn-environment's selected shell verbatim and assigns its program/args directly to `HooksConfig.shell_program`/`shell_args`, **without** applying the existing fallback.

`codex-rs/hooks/src/engine/command_runner.rs` then uses this nonempty shell program directly: it attempts the process-tree job launch, retries with `creation_flags(0)` if needed, and on `command.spawn()` failure returns `err.to_string()` — which surfaces as the observed OS error 5. Because the shell program is nonempty, the `COMSPEC`/`cmd.exe` default is never reached.

Together with the PATH-only counterfactual, this establishes that the failure occurs at Codex's hook outer-shell spawn boundary with the selected Store/MSIX executable. Source inspection shows that `build_hooks_config` carries that selection into the hook runner without consulting the compatibility fallback already used elsewhere in the same codebase.

## Proposed root-boundary fix

At the single point where `build_hooks_config` converts the selected `TurnEnvironment` shell into the hook `program + args`, apply the existing `fallback_powershell_shell_for_elevated_windows_sandbox` detection/fallback when the hook launch uses the affected Windows sandbox context, before deriving hook shell arguments — mirroring what `prepare_powershell_command_for_elevated_windows_sandbox` already does for normal tool execution. Each hook handler's own `command`/`commandWindows` should remain unchanged; only the outer shell selection is affected.

Suggested test: a core/hooks integration test that supplies a Store-style selected PowerShell path and asserts the hook runtime receives the compatible system-PowerShell fallback while the inner hook command is preserved unchanged.

**Not proposed:** per-hook string wrappers, or disabling command hooks globally. The system-PowerShell counterfactual (same fixture, cwd, hooks, trust, provider, and sealed homes — only `PATH` narrowed) demonstrates the native command-hook transport itself works; the defect is isolated to shell selection for the outer hook process.

## Explicit unknowns

The evidence establishes failure at Codex's hook outer-shell spawn boundary for the selected Store/MSIX PowerShell, and establishes the system-PowerShell counterfactual as a working alternative. It does **not** establish the lower-level Windows mechanism by which the Rust/Tokio/job-object hook launch path rejects this executable while a direct same-parent Node launch of the identical executable succeeds. Please do not read this report as claiming a proven ACL, sandbox-token, or job-nesting cause, and please do not generalize this to a blanket nested-process denial — same-parent direct-launch controls (`cmd.exe`, the exact Store `pwsh.exe`, and direct Store PowerShell) all succeed. Additional Windows process-creation diagnostics (e.g. `CreateProcessAsUserW` tracing) would be needed to identify the underlying OS-level mechanism.

## Related reports (corroborative only)

- https://github.com/openai/codex/issues/35871 — Store/MSIX PowerShell with `CreateProcessAsUserW` error 5
- https://github.com/openai/codex/issues/34872 — WindowsApps `pwsh` failing while `cmd` works
