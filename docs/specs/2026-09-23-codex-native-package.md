# Native Codex discovery without importing Claude hooks

Goal: one shared package usable by Codex and Claude Code. Source scout and actual local Codex 0.156.1 probes establish a concrete native packaging gap. Build independently of the failed Claude runner and pending persistent installation. Parent's 0.17.1 continuation release proceeds independently.

Contract evidence: C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/codex-package-contract.md. The exact root portable manifest, local catalog and explicit empty OpenAI hook override were ingested by the actual CLI; debug prompt-input discovered the skill and hooks/list was empty. Without the override, Codex auto-discovers 11 untrusted Claude hooks. No hook was executed in the probes.

## Territory

Builder owns new plugin.json, .agents/plugins/marketplace.json, hooks/codex-hooks.json, scripts/native-package.test.mjs, codex/README.md, and YAML frontmatter-only corrections in skills/dev-server/SKILL.md and skills/janitor/SKILL.md. Parent owns both .claude-plugin manifests, top-level README, integration/release metadata and docs/work. No existing runtime hook or mirror implementation changes.

Use ONE additional root portable plugin.json with schema https://agent-plugins.org/schemas/1.0.0/plugin.schema.json, name delegation, version matching the current Claude manifest, a truthful short description, and extensions.com.openai.hooks set to ./hooks/codex-hooks.json. Add hooks/codex-hooks.json with exactly an empty hooks object. This is an explicit host boundary, not missing functionality to fill with the Claude hooks.

Catalog .agents/plugins/marketplace.json names delegation and exposes delegation from local ./, policy installation AVAILABLE/authentication ON_INSTALL, category Productivity. Confirm against the actual CLI's marketplace root interpretation. Retain all existing Claude manifests and hook content. Root portable manifest takes precedence for Codex; old plugin-creator validator's .codex-plugin-only requirement is stale against proven current ingestion. Do not add a duplicate manifest merely to satisfy that validator; record its limitation alongside native validation.

Correct invalid YAML quoting in dev-server and janitor descriptions without changing their behavior. Validate every bundled skill, not only a sample. Test manifest-to-catalog and hook-file path resolution and package version consistency as integration invariants; avoid tests merely echoing documentation. The native CLI discovery check is required live evidence even if it is not a mandatory dependency of the Node unit suite. No extra controller/installer or new dependency.

## Native proof and compatibility

Use the existing sealed-home helper and a disposable full-package copy. Run marketplace add, plugin add/list, debug prompt-input and read-only app-server hooks/list with the proven probe. Require every intended bundled skill to be discoverable and zero Codex plugin hooks. No model call, hook trust, real home edits or network installation. Preserve the existing mirror as a separately installed host integration; native discovery does not prove role loading, hook activation, mixed-peer messaging or duplicate-free coexistence with a previously mirrored installation.

Check Claude package validation/discovery metadata through supported non-model CLI where available, preserving exact existing Claude hook bytes. Record what was and was not verified. Document both native and mirror routes without directing automatic simultaneous installation or asserting parity. Existing scripts remain shipped and callable; no capability is silently marked active.

Builder reports exact SHA, focused checks, skill validation and actual native observations. Fresh high-tier reviewer independently attacks hook auto-discovery, catalog paths, full-skill coverage, version drift and coexistence claims. Parent integrates, runs applicable sealed suite once and ships when approved. No installation approval is needed for disposable trials; real rollout remains its existing scoped choice.
