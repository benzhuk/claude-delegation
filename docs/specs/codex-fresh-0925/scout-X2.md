# Scout X2 — Codex hook/mirror territory (base `fbd7cf6`)

## Files and symbols
- `hooks/multi-codex-hook.mjs` exists. `runCodexHook` (122) classifies authentic children, registers a lead inbox, delivers notes, composes continuation, then appends advisory card/bearings context; main prints then acks.
- `hooks/codex-hooks.json` exists with the five intended events: SessionStart, UserPromptSubmit, PostToolUse, Stop, Interrupt; handler is `${PLUGIN_ROOT}/hooks/multi-codex-hook.mjs` and timeouts are 30/30/30/60/3.
- `scripts/mirror-shared-skills.mjs` exists. It mirrors skills/docs/agents, writes hooks/trust via `mergeHooksJson`, `trustEntriesForPlacements`, and `upsertHooksState`; Windows uses copy plus `.cmd` and extensionless shims.
- `.codex-plugin/plugin.json` exists at base and is the release-version carrier (0.20.9). `mirror-shared-skills.mjs` reads `.claude-plugin/plugin.json`, so plugin-version source is intentionally Claude manifest rather than Codex manifest; confirm parity before changing it.
- `scripts/codex-hook-trust.mjs:466-533` is the reusable hook JSON/trust implementation; do not duplicate canonical hash/TOML logic.
- Installed state differs: active `~/.codex/hooks.json` targets `C:/Users/benzh/Code/claude-delegation`, and manifest 0.20.9 names that source; this checkout has no working-tree `.codex-plugin` due to staleness, although it exists at base.

## Helpers to reuse
- `hooks/multi-hook-core.mjs:157-221` owns JSON flushing, continuation/peer composition, and hook-event delivery.
- `scripts/codex-hook-trust.mjs` owns event normalization, merged config, trusted hashes and multiple Codex homes.
- `scripts/mirror-prereq.test.mjs` and `scripts/wiring-check.test.mjs` cover mirror prerequisites/wiring beyond the nearest tests.
- `skills/multi/scripts/transport.mjs` owns bindings, inbox registration and durable ledger paths; X2 should use it through existing adapters.

## Tests that police this area
- `hooks/multi-codex-hook.test.mjs` mechanically guards output-before-ack, bounded events, child exclusion, inbox/continuation preservation, card and bearings injection.
- `scripts/mirror-shared-skills.test.mjs` guards managed manifests, Windows copy/shims, source paths, hook installation and downgrade behavior.
- `scripts/codex-hook-trust.test.mjs` guards canonical hooks JSON, trust hashes and TOML update/pruning.
- `scripts/native-package.test.mjs`, `scripts/wiring-check.test.mjs`, and `scripts/mirror-prereq.test.mjs` constrain package/mirror assumptions.
- `scripts/run-tests.mjs` runs the sealed suite; there is no source-level suite mutex located, so obey the spec’s machine-level serialization manually.

## Open questions for the spec
- If X1 finds stale installed source/config, is that an operator-doc correction only, or is X2 authorized to alter mirror behavior that intentionally preserves an installed tree?
- Does “plugin version hooks report” mean manifest version, an explicit hook payload, or `codex exec` context text? No version-report symbol appears in the mapped hook config.
- Is `.codex-plugin/**` a required runtime integration or release metadata only? The tree shows manifest metadata, while mirror installation uses `.claude-plugin/plugin.json`.
