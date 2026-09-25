# P1 scout — Codex hook

## Files and symbols
- `hooks/multi-codex-hook.mjs` exists: `runCodexHook` excludes only `isConfirmedCodexChild(input, fs)` before inbox registration; missing/corrupt/mismatched/oversize metadata remains lead-like.
- It currently combines peer inbox and continuation only through `composeContinuationResult`; no goal-card or bearings import/call exists.
- `hooks/multi-hook-core.mjs:169-199` is the existing safe merge: it appends continuation text to `hookSpecificOutput.additionalContext`, preserving peer output/ACK; P1 must use an equivalent merge for injected context.
- `hooks/delegation-reminder.js:304-349,381-416` is the Claude reference: lazy `goal-card.mjs` import; `bearings-state.mjs.check({repo: cwd})`; specific due/unknown wording; SessionStart-only pane message (except Claude's compact source guard).
- The spec's switch spelling drifts: actual Claude `activeSwitch()` uses `$AGENTS_HOME/ws-off`, `ws-off-goalcard` (no hyphen), and `ws-off-bearings`; it treats either feature switch as bearings-off.
- `hooks/multi-codex-hook.test.mjs` exists and directly calls `runCodexHook` with scratch homes/transcript metadata. It already proves child suppression and unknown metadata's existing lead path.

## Helpers to reuse
- `scripts/goal-card.mjs` exports the authoritative card read/render/switch helpers; do not duplicate renderer or its rejection wording.
- `skills/bearings/scripts/bearings-state.mjs` exports `check`; `delegation-reminder.js` owns the current notice text/lead-id hint logic to extract or share.
- `hooks/multi-hook-core.mjs` has `contextOutput` and merge behavior for existing `additionalContext`/`systemMessage` payloads.
- `hooks/continuation-native.mjs` supplies the positive child classifier used by the current adapter.

## Tests that police this area
- `hooks/multi-codex-hook.test.mjs` requires child metadata to return null without inbox read/registration; unqualified metadata must retain current delivery.
- `hooks/delegation-reminder.test.mjs` constrains Claude switch/read/rejection/notice behavior; extraction must preserve those assertions.
- `scripts/goal-card.test.mjs` (if modifying shared adapter) constrains card validation and fail-open outcomes.

## Open questions for the spec
- Should a rejected card's existing human rejection `systemMessage` coexist with a bearings notice, or retain Claude's mutual-exclusion precedence?
- Does “confirmed lead” mean all non-child/unknown records (the current safe behavior), or require new positive lead proof? The latter conflicts with the established fail-open classifier.
- Is Codex `SessionStart` compact/re-entry distinguishable like Claude's `source === 'compact'`; if not, what prevents repeated human notices?
