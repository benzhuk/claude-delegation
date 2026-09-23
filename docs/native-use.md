# Operator guide: native and mirrored capabilities

This guide describes released `delegation` 0.18 source (main `686e778`). No persistent installation has been performed. Choose one route deliberately for each Codex host; installing both is not an automatic upgrade path.

## Choose the route

Use the **native package** when the goal is Codex plugin skill discovery. From a chosen 0.18 release checkout, a builder can add its marketplace and package, then confirm it:

```powershell
# Run from the selected 0.18 release checkout; do not run during review.
codex plugin marketplace add .
codex plugin add delegation@delegation
codex plugin list
```

Observed in disposable Codex 0.156.1 checks: this route discovers these nine namespaced skills:

`delegation:bearings`, `delegation:continue`, `delegation:decisions`, `delegation:delegate`, `delegation:dev-server`, `delegation:janitor`, `delegation:multi`, `delegation:notion-writing`, and `delegation:team-build`.

Use the **mirror** when the host also needs the existing Codex role files, note-command shims, shared documentation, and trusted mirror hook wiring. Its published plugin inventory is eight skills: `bearings`, `continue`, `decisions`, `delegate`, `dev-server`, `multi`, `notion-writing`, and `team-build`. A builder can preview and then run the whole mirror from the selected 0.18 source:

```powershell
node scripts/mirror-shared-skills.mjs --dry-run --json
node scripts/mirror-shared-skills.mjs
```

The mirror is whole-package only: do not hand-copy individual skills or edit an old cache. It does not change Codex hooks by default. Native package installation does not automatically install the mirror, and mirroring does not install the native package.

## Keep the host boundary intact

The native package has an explicit empty Codex hook declaration. Observed sealed-package checks listed zero native hooks and zero errors while retaining the Claude hook file unchanged. This prevents Codex from treating the Claude hook configuration as native hooks.

That boundary is intentional. Native package discovery currently proves skill discovery only. It does not prove installed custom roles, peer wake-up, cadence/continuation behavior, trusted hook activation, or mixed-host collaboration. Do not infer those capabilities from a package listing.

## Review a released two-host update

For the released 0.18 source, keep the Claude update and Codex mirror alignment as separate, reviewable actions:

```powershell
# Claude plugin cache update; the CLI reports that a restart is required.
claude plugin marketplace update benzhuk
claude plugin update delegation@benzhuk
claude plugin list

# Then, from the selected 0.18 source, preview the Codex mirror before applying it.
node scripts/mirror-shared-skills.mjs --dry-run --json
```

Only run the non-dry-run mirror command after the preview is accepted. Start a new Claude session after its plugin update. Start a fresh Codex session or deliberately reload skills after mirroring, since an existing session may retain prior instructions.

For native package verification, use the namespaced form `delegation:<skill>` in a prompt-input or skill listing check. A disposable coexistence check observed both an unnamespaced local `multi` and `delegation:multi`; the namespace identifies the installed native package. It does not establish which same-named personal skill wins during live execution.

## Limits to carry into a rollout

The current Windows Codex probe still read a personal skill root even with redirected disposable-home variables. It made no real configuration changes, but it means personal-mirror precedence and duplicate-free live coexistence remain unproven. Keep native and mirror installation choices separate until an authorized real-host coexistence trial resolves that question.

The current plugin-creator validator expects the older `.codex-plugin/plugin.json` layout. The portable root manifest was instead verified by actual Codex 0.156.1 marketplace installation, package listing, skill discovery, and read-only hook enumeration. Do not add a duplicate compatibility manifest solely for that validator.

An independent native Claude review approved the three-skill continuation patch at `bcbf4660e4d3c833ab549c86580e59324fc1cb18` in 66 seconds; it did not review the native packaging changes. Two bounded Sonnet attempts to author this guide returned intent concerns rather than a guide; they are non-deliveries, not content approval or rejection. This Codex-authored draft is therefore based on the recorded package, coexistence, rollout, and review evidence.
