# Scout: Lane 37 Codex parity (base 8b8c2f0)

## Files and symbols
- `hooks/codex-hooks.json` exists: `multi-codex-hook.mjs` is already registered for SessionStart, UserPromptSubmit, PostToolUse, Stop, and Codex-only Interrupt.
- `scripts/codex-hook-trust.mjs`: `CODEX_EVENTS` is one script-path list; `mergeHooksJson()` can merge another script only when its caller supplies that path. The excluded installer is the caller, so do not use this for wiring/backlog; route them inside `runCodexHook()`.
- `hooks/multi-codex-hook.mjs`: `appendGoalContext()` already merges model context without replacing peer/continuation output. It is the smallest allowed route seam.
- `hooks/delete-guard.mjs` and `scripts/codex-hook-trust.mjs`: delete guard is already installer/trust wired as `PreToolUse`, matcher `Bash`, via `CODEX_DELETE_GUARD_EVENTS`; `runCli()` emits native `permissionDecision: 'deny'`.
- `codex/README.md` exists and presently lists eight mirrored skills; add `janitor` only.
- `docs/census.md` already says Codex read counting is unsupported because hook payloads lack a file path; it documents census default discovery as lead UTC folder plus next day, verified ancestry depth <=3, plus explicit `--tasks`.

## Helpers to reuse
- `hooks/multi-hook-core.mjs:contextOutput()` and `appendGoalContext()` provide the native `hookSpecificOutput.additionalContext` envelope/merge.
- `scripts/wiring-check.mjs:checkWiring()` is reusable; its CLI `--line --hook` only prints plaintext, so it cannot itself supply native context.
- `hooks/backlog-notice.js:outputFor()` already returns native context for UserPromptSubmit/PostToolUse and `systemMessage` for Stop, but the direct script is Claude-wired; call/extract its logic only if importability is made explicit.
- `hooks/delete-guard.test.mjs`, `scripts/codex-hook-trust.test.mjs`, and the gap note are existing deny/trust evidence; live top-level coverage remains intentionally narrower than child `agent_id` coverage.

## Tests that police this area
- `scripts/codex-hook-trust.test.mjs` checks five normal events, trust hashes/placements, and PreToolUse delete-guard merge/matcher; it does not inventory Claude parity.
- `hooks/multi-codex-hook.test.mjs` asserts synthetic native context delivery, merge preservation, child exclusion, and event handling.
- `hooks/backlog-notice.test.mjs` directly proves its prompt/post native context and Stop systemMessage; `scripts/wiring-check.test.mjs` proves its line registration, not Codex context.
- `scripts/build-census.codex.contract.test.mjs` tests discovery/partial coverage, but cannot prove a host's actual transcript horizon.

## Minimal unsupported schema and open questions
- Suggested `hooks/codex-unsupported.json`: `{ "version": 1, "unsupported": [{"script":"hooks/knowledge-log.mjs","event":"PostToolUse","reason":"Codex payload has no file path"}] }`; require nonempty strings and unique `(script,event)` keys.
- The parity test should parse actual `hooks/hooks.json` pairs, require exactly one of: native-map entry or unsupported entry, reject overlap/missing, and exempt Codex-only Interrupt from the Claude inventory. This tests declared coverage against source inventory, never a self-declared count.
- Native-map entries should identify `nativeEvent` plus route (e.g. `multi-codex-hook`); fixtures must assert the resulting Codex output includes the wiring and backlog text. `codex exec` in a scratch trusted home then verifies real context, not JSON/config presence alone.
- Confirm whether dispatch guard is unsupported (no current Codex installer entry) and whether direct import of CommonJS backlog logic is acceptable; do not claim equivalent routing until the isolated fixture and scratch-home command both observe it.
