# Operator guide: native and mirrored capabilities

This guide describes the current source route. The last four-host installation evidence is release 0.20.6 at `faccdd6389ff6eb6527b3d11da5ed118b80ebf67`: Windows, Mac, Hetzner, and Netcup used their existing Claude marketplace/plugin route and Codex shared mirror, with registered Codex lifecycle events. That is installation evidence, not proof that a later source change is installed or that every event executed on every host. A checkout is not an installed runtime; choose one Codex hook route and verify actual execution on that host. See [four-host rollout evidence](work/evidence/four-host-0206-and-live-pickup.md).

## Everyday work on a project

Open the target project in Codex or Claude Code after choosing the installed route below. A useful starting request on either host is:

> Deliver [outcome] in this project. Success means [observable acceptance evidence]. You may [authorized actions]; stay within [constraints and any budget]. Use the installed harness skills and existing project conventions. Keep independent ready work moving in parallel, diagnose causes, and simplify the design. Continue useful work within this scope without waiting for me; record decisions only I can make and advance other work while those wait. Finish with evidence of the outcome, or the specific external dependencies that prevent further useful work.

The agent reads the project's current goal and work records, states how this task advances the goal, and selects the applicable skills. If the project has none, capture the stated outcome, acceptance evidence and authority in a small goal document and open only the work records needed for the admitted task; clarify a missing user objective instead of inventing one. `delegate` handles independent research/review; `team-build` handles substantial builds with separate builders, independent review and one integration gate. Small changes do not need an invented team. Agree shared interfaces and file ownership before parallel work; a consumer waits for its exact prerequisite while independent lanes proceed.

The orchestrator owns `docs/work/<work-id>.record.md`; builders and reviewers return reports rather than editing that record. Reuse the project's goal and evidence conventions. A software deliverable may need tests and exact-artifact review; a document or research task needs its own attributable sources and acceptance evidence. Preserve failed checks and unknowns, and measure important hypotheses against the outcome rather than activity counts. See [work records](work-record.md).

Use `continue` at a pause or workstream closeout to select finite ready work. Use `bearings` when evidence challenges the direction. `decisions` maintains the owner's choices and comments in the designated document; `multi` handles authorized equal-session communication. An unresolved choice blocks its dependent work only. These skills neither grant new authority nor create unattended scheduling.

Honor an explicit user stop or pause. Otherwise, before closing, check the actual result against the requested outcome. Continue useful authorized work that remains. Close when the outcome has evidence or all remaining useful actions have concrete external dependencies; report those dependencies and the resumable work identity. Use the native binding/accounting commands below only when current hook context is available. Missing hooks do not prevent ordinary useful work, but automatic correction must remain unclaimed.

The [original native Codex authoring trial](work/evidence/native-codex-first-use-proof.md) produced a draft but its file reads were policy-blocked. The later [root-cause diagnosis and corrected read-only trial](work/evidence/codex-readonly-fixture-correction.md) showed that ignoring user configuration had also disabled selection of the provisioned Windows sandbox backend. Explicitly selecting that backend for the isolated invocation preserved read-only enforcement and let the native agent read the source and mirrored skills. Its review found the missing explicit-stop instruction above. This proves source-grounded native review, not hook execution, comparative delivery improvement, or completion of the project's goals.

## Choose the route

The native Codex package exposes the same nine skills as Claude Code, using `.codex-plugin/plugin.json` and the local marketplace. From a chosen release checkout:

```powershell
codex plugin marketplace add .
codex plugin add delegation@delegation
codex plugin list
```

Review and trust the installed hooks through the host's supported workflow. The native hook file registers SessionStart, UserPromptSubmit, PostToolUse, Stop and Interrupt; commands resolve the shared adapter through `PLUGIN_ROOT`. Namespaced skill discovery and actual hook execution are separate checks. The expected skills are `delegation:bearings`, `delegation:continue`, `delegation:decisions`, `delegation:delegate`, `delegation:dev-server`, `delegation:janitor`, `delegation:multi`, `delegation:notion-writing`, and `delegation:team-build`.

Use the mirror when the host needs the existing role files, note-command shims and shared documentation. It publishes eight bundled orchestration/utility skills, excluding janitor, plus the optional knowledge, triage and learn sources from `~/.claude/skills` when present. Unusable optional sources are reported in the installer's `actions`; that does not establish whether a destination skill is already installed. Preview the whole package from the selected durable release checkout:

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

For a Codex lead on the configured mirrored-hook route, the source adapter adds the project's goal card and a due/unknown bearings advisory on SessionStart and UserPromptSubmit. The SessionStart advisory can also appear in the pane. It applies only when native metadata positively classifies the session as a lead: confirmed children receive no new card or bearings effects, while unknown identity retains its existing inbox and continuation behavior without the new advisory. The switches are `~/.agents/ws-off`, `~/.agents/ws-off-goalcard`, and `~/.agents/ws-off-bearings`; all fail safely. Goal and bearings context is not reinjected on PostToolUse, Stop, or Interrupt. This describes source capability; it does not claim that this version is installed or that an observed host has exercised it.

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

The Windows disposable Codex probe can still read the personal skill root, so redirected-home discovery is not complete profile read isolation. Both personal and project custom roles were discovered in the actual native selector, and a selected project role applied its model, effort, identity and developer instructions; sandbox enforcement and every shipped role remain separate claims. See [role evidence](work/evidence/codex-custom-role-native-review.md). Live mirror/native precedence, other-machine installation and actual mixed-provider peer handling are not established by a package listing. Useful accepted deliverables, whole-task cost, comparative speed and later rework require real tasks and their observation windows. Track these in the existing work records instead of interpreting a passing hook as goal completion.
