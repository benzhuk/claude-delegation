VERDICT: UNKNOWN — local command admission rejected every shell before execution; available evidence does not distinguish Windows sandbox admission from execpolicy/approval fallback.

# Native Codex first-use policy boundary

Observed from the unchanged run at `native-codex-first-use-run`:

- Codex CLI `0.156.1` authenticated and completed a model turn. Provider/authentication was functional.
- Invocation used `exec --ephemeral --ignore-user-config --disable hooks --sandbox read-only`; it did not use `--ignore-rules`.
- Four shell launches were rejected by `codex_core::tools::router` as `CreateProcess ... Rejected(... blocked by policy)` before command output existed.
- Rejections covered three PowerShell launches and one `cmd.exe /c type` launch.
- `Get-Location`, which does not read the requested files, was also rejected. The evidence therefore does not establish a denied repository or skill-file read.
- The model disclosed the missing reads and delivered a limited draft. Exit 0 describes the model turn, not successful source grounding.
- Hooks were disabled and no hook path participated, so this is separate from the earlier command-hook Store PowerShell launch investigation.

Local configuration evidence:

- Installed help says `--ignore-user-config` skips only `$CODEX_HOME/config.toml`; `--ignore-rules` is a separate option for user/project execpolicy files.
- The only discovered `.rules` file was `C:/Users/benzh/.codex/rules/default.rules`, SHA-256 `e401f17ffad464a4476f2288a86b918be51c6402fea816520441690dbf4928b4`.
- It contains 136 `allow` rules and zero `prompt` or `forbidden` rules.
- No rule names the actual Store-package shell path used by the rejected PowerShell launches.
- No standalone rule matches `Get-Content` or `Get-Location`; no project-local `.rules` file was found.
- This proves no explicit local `forbidden` rule was found. It does not prove whether absence of a matching `allow` prevented an unsandboxed fallback in this non-interactive run.

Official contract:

- Codex rules match exact argv prefixes; `allow` permits execution outside the sandbox, while `forbidden` blocks directly. Codex scans rules in active config layers. See [Rules](https://learn.chatgpt.com/docs/agent-configuration/rules).
- The Windows sandbox enforces filesystem/network boundaries and recommends `CODEX_HOME/.sandbox/sandbox.log` for failures. See [Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox).

Missing evidence:

- The active account home had no sandbox log for the September 24 run; its only sandbox log was dated September 22.
- The run did not capture the effective sandbox implementation, approval policy, matched-rule decision, or a sandbox admission diagnostic for the rejected argv.
- The router message is a policy rejection, not an OS error code or an executed-command filesystem error.

Conclusion:

The remaining dependency is a diagnostic that records the effective Windows sandbox mode and execpolicy/approval decision for the exact shell argv in the same invocation. Until that exists, attributing the failure to filesystem permissions, the Store PowerShell package, the SDK, or a specific rule would exceed the evidence. No retry, bypass, sandbox widening, configuration change, provider call, or denied read through another route was performed.
