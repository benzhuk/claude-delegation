# P3 scout — Documentation

## Files and symbols
- `skills/bearings/SKILL.md` exists; its final paragraph currently says Claude receives SessionStart/PostToolBatch advisory and “Codex cadence is explicitly unsupported.” This is the exact paragraph to narrow after P1's reviewed contract lands.
- `docs/native-use.md` exists but opens with stale “source release 0.20.4,” frozen SHA and 1,396 tests. It separately documents native package (`codex plugin …`) and mirror (`mirror-shared-skills.mjs`, then optional `--codex-hooks-only`) routes.
- `README.md` exists; its 0.20.8 changelog says 0.20.6 was installed on Windows/Mac/Hetzner/Netcup. It still says Codex cadence/installed-host parity are pending in the bearings description and old 0.16.0 entry.
- `docs/work/evidence/four-host-0206-and-live-pickup.md` verifies 0.20.6 at `faccdd…`, four-host installation, Codex shared mirror and registered lifecycle events; it explicitly says this is installation evidence, not fresh event execution on every host.
- `docs/work/evidence/windows-installed-codex-hooks.md` verifies useful Windows app-server hook execution (SessionStart/UserPromptSubmit/PostToolUse/Stop) at source `eedf895`; it does not prove this new goal/bearings injection.

## Helpers to reuse
- Preserve the current route commands and qualification language in `docs/native-use.md`; update facts from `four-host-0206-and-live-pickup.md`, not inferred current installation state.
- Use P1's finalized exact behavior and switch names as the source for the bearings/README wording; no independent behavior claim belongs in docs.
- README changelog is chronological with newest entry first; add a next-patch entry without changing manifest/version files.

## Tests that police this area
- No documentation-specific test was found in the mapped files; source tests cannot establish installation or event behavior.
- `hooks/multi-codex-hook.test.mjs` will police P3’s prospective claims about child exclusion and event delivery only after P1 adds the planned cases.
- Evidence documents constrain wording: four-host installation must not be rewritten as live parity; Windows event execution is one observed route.

## Open questions for the spec
- What next patch number is authoritative at integration time? The tree’s newest README entry is 0.20.8, while source docs describe 0.20.4 and rollout evidence is 0.20.6.
- Does the fresh-project route require both native-package installation and mirror, or are they alternatives for the goal/bearings hook; P1’s actual import/deployment path decides this.
- Should docs state child work remains unsupported, or only that positive child identification suppresses injection while unknown metadata retains lead-safe behavior?
