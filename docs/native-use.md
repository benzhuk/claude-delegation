# Operator guide: native and mirrored capabilities

This guide describes the 0.20 source candidate. Release and current-machine update evidence belongs in the work records; a checkout is not an installed runtime. The current Windows plain skill mirror was last verified at 0.19. Choose one hook route for a Codex host, then verify actual execution on that host.

## Choose the route

The native Codex package exposes the same nine skills as Claude Code, using `.codex-plugin/plugin.json` and the local marketplace. From a chosen release checkout:

```powershell
codex plugin marketplace add .
codex plugin add delegation@delegation
codex plugin list
```

Review and trust the installed hooks through the host's supported workflow. The native hook file registers SessionStart, UserPromptSubmit, PostToolUse, Stop and Interrupt; commands resolve the shared adapter through `PLUGIN_ROOT`. Namespaced skill discovery and actual hook execution are separate checks. The expected skills are `delegation:bearings`, `delegation:continue`, `delegation:decisions`, `delegation:delegate`, `delegation:dev-server`, `delegation:janitor`, `delegation:multi`, `delegation:notion-writing`, and `delegation:team-build`.

Use the mirror when the host needs the existing role files, note-command shims and shared documentation. It publishes eight orchestration/utility skills, excluding janitor. Preview the whole package from the selected durable release checkout:

```powershell
node scripts/mirror-shared-skills.mjs --dry-run --json
node scripts/mirror-shared-skills.mjs
```

A plain mirror run does not edit Codex configuration or hook registration. Under authorization to configure that host, the existing opt-in route is:

```powershell
node scripts/mirror-shared-skills.mjs --codex-hooks-only --dry-run --json
node scripts/mirror-shared-skills.mjs --codex-hooks-only
```

The installer merges its handlers with existing hooks and updates their trust identities. An older four-event installation needs this wiring update to gain Interrupt; merely updating adapter source does not add an event registration. Without that event, native cancellation bypasses Stop, but the stored binding is not immediately disarmed until the next prompt/session event.

Do not activate both native-package and mirrored hook routes automatically. Their shared implementation does not prevent duplicated registrations. Existing personal and namespaced skills can both be discovered; live precedence and duplicate-free coexistence need a chosen-host observation.

## Verify the native boundary

Codex 0.156.1 accepts a root Agent Plugins manifest for skills but skips its hooks. A colocated compatibility manifest is shadowed by that root. Version 0.20 therefore replaces the root manifest with `.codex-plugin/plugin.json`, alongside the separate Claude manifest, over one shared implementation. This is an observed loader requirement at that version. The older plugin-creator validator rejects fields accepted by the actual runtime; its output is not native execution evidence.

On the tested Windows host, Codex selected Store/MSIX PowerShell as its outer hook shell and failed before starting any handler with OS error 5. Changing an inner `commandWindows` string does not repair that boundary. The identical disposable fixture worked when its PATH selected system Windows PowerShell. [The diagnosis](work/evidence/codex-command-hook-diagnosis.md) identifies an existing SDK shell fallback that the hook configuration path omits. Production shell selection must be qualified; these tests did not change production PATH or repair the installed SDK.

For Claude, the existing update path is:

```powershell
claude plugin marketplace update benzhuk
claude plugin update delegation@benzhuk
claude plugin list
```

Use a fresh session after updating so previously loaded instructions do not mask the result. The reusable [native continuation test](native-continuation-testing.md) runs against an explicitly selected Claude executable, disposable configuration and a local synthetic provider. It proves native mechanics without copying authentication or using a paid model.

## Use the bounded continuation contract

The continue skill connects an explicitly authorized ongoing scope to selected existing work records. A native prompt/tool event supplies the host, session and opaque epoch needed by the bind command. Execute the documented bind in that same episode; the actual PostToolUse callback confirms it. Never substitute a guessed identity or read the newest epoch to make an old command pass.

After working, account using the current work/evidence revision. An overlooked unaccounted scope gets at most one Stop correction, shared with actionable peer delivery. A new prompt suspends the old scope; interruption disarms it where its event is registered. Explicit stop remains authoritative. Missing or malformed evidence is unknown, not success. The binding grants no new authority and does not schedule idle work.

Actual Claude Code 2.1.281 SDK/print and Codex 0.156.1 app-server tests exercised bind, accounted silence, one corrective Stop/refire and native interruption using synthetic provider responses. Claude additionally exercised replacement with direct stale-epoch rejection. Positive Codex child isolation covers both child-own-session metadata and the observed parent-session plus child-agent-ID form. Source tests, synthetic native scenarios and useful-model outcomes remain distinct evidence.

## What still requires live observation

The Windows disposable Codex probe can still read the personal skill root, so redirected-home discovery is not complete profile read isolation. Custom role discovery/use, live mirror/native precedence, other-machine installation and actual mixed-provider peer handling are not established by a package listing. Useful accepted deliverables, whole-task cost, comparative speed and later rework require real tasks and their observation windows. Track these in the existing work records instead of interpreting a passing hook as goal completion.
