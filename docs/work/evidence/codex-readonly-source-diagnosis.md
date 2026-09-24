# Native Codex first-use policy diagnosis — 2026-09-24

## Verdict

**Observed root cause:** the fixture combined `--ignore-user-config` with
`--sandbox read-only`. In Codex 0.156.1 that suppresses the configured Windows sandbox
selection, resolves the Windows backend to **Disabled**, defaults headless approval to
**Never**, and forbids an unmatched command because there is no Windows sandbox to
enforce the read-only profile. The four shell reads were rejected before process start.

This is a fixture configuration conflict. It is not evidence that the requested files
were unreadable. Existing sandbox provisioning was present, but its presence does not
select a backend after the selecting config is ignored.

## Provenance

- Work spec: repository `astra-harness-next` at
  `33041fcd953e1953befd3c698fbc511111a5775a`,
  `docs/specs/2026-09-24-useful-work-reassessment.md`.
- Native evidence:
  `C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/native-codex-first-use-run`.
- Runner:
  `C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/run-native-codex-first-use.mjs`.
- Installed package/executable: `@openai/codex` 0.156.1,
  `C:/nvm4w/nodejs/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe`.
- Official source tag `rust-v0.156.1`, dereferenced commit
  `b412ff32c417f855c2b2d1581b77058eed87c84b`, inspected read-only at
  `C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/codex-0.156.1-src`.

## Observed admission path

1. The launch was `exec --ephemeral --ignore-user-config --disable hooks
   --sandbox read-only ... --json`; it did not specify approval or Windows backend.
2. `exec/src/lib.rs:364-369` passes `ignore_user_config` independently from
   `ignore_user_and_project_exec_policy_rules`; rules therefore remained enabled.
3. `exec/src/lib.rs:563-569` sets headless `approval_policy` to
   `AskForApproval::Never`.
4. `core/src/windows_sandbox.rs:61-79` resolves absent `windows.sandbox` through feature
   defaults and returns `WindowsSandboxLevel::Disabled` when both sandbox features are
   off.
5. `features/src/lib.rs:1243-1254` sets both legacy Windows sandbox features to
   `default_enabled: false`.
6. The ignored account config's safe selected setting was
   `[windows] sandbox = "elevated"`; ignoring it therefore produced the Disabled path.
7. The exact source test `core/src/exec_policy_windows_tests.rs:113-129` asserts that
   read-only + Never + Disabled + unmatched command is `Decision::Forbidden`, because
   “there is no Windows sandbox to rely on.”
8. The integration test
   `core/tests/suite/exec_policy.rs:442-499` asserts the same disabled-Windows/read-only
   command returns `rejected: blocked by policy` without executing.
9. All four native attempts emitted that router rejection. No requested shell process
   started, matching the pinned source path exactly.

## Rules and setup checks

- Existing `$CODEX_HOME/.sandbox/setup_marker.json` is version 5, created 2026-09-22.
  Missing provisioning was not the cause.
- The only discovered safe rule file,
  `C:/Users/benzh/.codex/rules/default.rules`, has SHA-256
  `e401f17ffad464a4476f2288a86b918be51c6402fea816520441690dbf4928b4`,
  136 allow rules, and no prompt/forbidden rules.
- The official non-executing check of the exact denied `Get-Location` argv was:
  `codex execpolicy check --pretty --rules <default.rules> -- <exact argv>`.
  It returned `{"matchedRules":[]}`. The command therefore reached the pinned
  unmatched-command behavior; no rule explicitly denied it.
- No 2026-09-24 sandbox log exists because admission stopped before backend execution.

## Observed versus inferred

- **Observed:** Disabled is the deterministic 0.156.1 source result of ignored user
  config plus default-off features; Never is the hard-coded headless default; the
  no-backend read-only case is forbidden; native output matches its integration test.
- **Observed:** the requested reads never ran. Their filesystem readability remains
  untested by this native fixture.
- **Not claimed:** the Store-PowerShell OS-5 hook defect caused this run. Hooks were
  disabled and this rejection occurred in policy admission before process creation.

## Diagnostic surface and next action

The installed CLI has no non-executing command that dumps the fully resolved effective
Windows backend. `codex execpolicy check` reports rule matching only. `codex doctor
--json --summary` is a broader auth/runtime inventory and does not document an effective
backend field. `codex sandbox` runs a command, so it was not used for this inspection.

The next native fixture should keep isolation while restoring an explicit one-run
backend selection, for example adding `-c 'windows.sandbox="elevated"'` alongside
`--ignore-user-config`, `--sandbox read-only`, and explicit
`--ask-for-approval never`. That is stronger enforcement of the already requested
read-only boundary and requires no user-config mutation. A no-provider sandbox command
can validate the backend separately with the installed syntax
`codex -c 'windows.sandbox="elevated"' sandbox -- <harmless absolute command>`.
Neither operation was executed in this source-inspection lane.

Official contracts:
- https://learn.chatgpt.com/docs/agent-approvals-security
- https://learn.chatgpt.com/docs/windows/windows-sandbox
- https://learn.chatgpt.com/docs/developer-commands
