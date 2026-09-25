# Scout X1 — fresh Codex walk (base `fbd7cf6`)

## Files and symbols
- `docs/native-use.md` exists; its “Current fresh-project route” is the walk’s source, but it is outside X1’s edit scope. It describes mirror, hook trust, goal card, bearings, multi, and census probes.
- `docs/GOALS.md` and `docs/goals/card.md` exist; the card declares Codex/Claude two-host baseline PARTIAL because no Codex-led end-to-end build had run.
- `hooks/multi-codex-hook.mjs:65-84` injects card context on `SessionStart`/`UserPromptSubmit`; rejected cards yield only a SessionStart `systemMessage`. Bearings is appended unless `ws-off-bearings` is active.
- `hooks/lib/goal-context.mjs:9-41` supplies `cardResult`, `rejectionNotice`, `bearingsNotice`, and the lead-id hint; use its exact outputs for the walk evidence.
- `scripts/build-census.mjs:311-388` parses Codex JSONL leads; inaccessible/malformed source produces an explicit incomplete report rather than an invented census.
- Native CLI feasibility: installed `codex --version` is `0.156.1`, newer than the hook’s documented 0.154 spike. `~/.codex/hooks.json` has trusted SessionStart/UserPromptSubmit/PostToolUse/Stop/Interrupt entries, so `codex exec "hi"` is feasible; no fresh-project run was performed by this scout.
- Installed/source boundary: `~/.agents/skills/.mirror-manifest.json` says 0.20.9 from `C:/Users/benzh/Code/claude-delegation`; active hooks target that tree, not this checkout. Do not treat installed behavior as branch proof.

## Helpers to reuse
- `scripts/goal-card.mjs` plus `hooks/lib/goal-context.mjs` are the shared card/rejection/bearings implementation.
- `skills/bearings/scripts/bearings-state.mjs check --repo <repo>` is the prescribed due/unknown source.
- `skills/multi/scripts/note-inbox.mjs` implements `--me <slug> --ack`; `hooks/multi-codex-hook.mjs` invokes it per event.
- `scripts/build-census.mjs --lead <file>` and `scripts/build-census.fixtures/codex-lead.jsonl` give the Codex lead path/schema fixture.
- Work records are line fields plus `Log:` events; `scripts/work-record.mjs:72-181` parses/validates, while `:723-1036` checks acceptance and census attachment.

## Tests that police this area
- `hooks/lib/goal-context.test.mjs` fixes card/rejection/bearings text and switch behavior.
- `hooks/multi-codex-hook.test.mjs` constrains lead-only events, child isolation, and hook output composition.
- `scripts/build-census.test.mjs` constrains Codex JSONL parsing and incomplete reasons.
- `scripts/work-record.test.mjs` constrains record fields/status/log and acceptance/census evidence.
- `scripts/run-tests.mjs` is the sealed suite launcher; spec’s one-suite-at-a-time rule is operational, not a mutex found in source.

## Open questions for the spec
- Does the fresh repo receive a plugin-independent `docs/GOALS.md` fixture, or should the walk create the minimum valid card and record that command?
- Which real Codex session JSONL path should be passed to census on this Windows install, and what exact unreadable reason is accepted if Codex does not expose one?
- The installed hooks source differs from branch source: should X1 reinstall/rewire before the live walk, or only report the mismatch as a gap?
