VERDICT: FACTS_SUPPORT_KNOWN_ID_MODE_WITH_A_NEW_TREE_WALK

## Native metadata facts
- Lead `01a0df4c...` is syntactically complete through `2026-09-29T02:38:23.303Z`: 15,308 valid JSON rows, zero parse failures. Its `event_msg.payload.type` counts are `task_started` 50, `task_complete` 48, `item_completed` 4,306, `token_count` 2,037, `thread_settings_applied` 16.
- Every observed lead `task_started` has `turn_id` and outer `timestamp`; every observed `task_complete` has both. The lead tail is ordinary reasoning/item output, not a terminal event, so task-complete count cannot certify the still-active lead is closed.
- Lane52 builder/tests/scout/probe child files each have zero parse failures; all their `task_started` and `task_complete` rows carry `turn_id` and timestamp, and every child’s final row is `task_complete`.
- Latest valid child timestamps: builder `02:11:31.968Z`; tests `02:20:19.130Z`; scout `02:26:51.587Z`; probe `01:51:28.620Z` (all 2026-09-29). There is no `task_completed` spelling in these files.
- Child event payload types are limited to `task_started`, `task_complete`, `item_completed`, `token_count`, plus scout `thread_settings_applied`; terminal task_complete is usable per-child EOF evidence, not evidence that no undiscovered child exists.

## Source boundaries
- `censusCodexLeadFile` throws on every malformed JSON row at `scripts/build-census.mjs:804-807`; this policy is Codex-local, so a tail-only malformed-row PARTIAL/salvage rule can remain confined to Codex code.
- `listCodexJsonl` (`:1171-1177`) enumerates only one supplied leaf directory. `utcDays`/`discoverCodexChildren` (`:1156-1195`) supply merely lead day+next day; no existing helper walks `sessions/<year>/<month>/<day>`.
- Canonical home presently has year `2026`, months `03,04,05,09`; exhaustive known-id discovery needs a new bounded three-level canonical tree walk, with unreadable intermediate directories recorded as incomplete.

## Contract consequences
- Known-id mode may scan every existing canonical session file, verify first-line metadata, root namespace and parent graph depth<=3, and select no candidate by filename/date. Duplicate logical ids with non-identical bytes still fail closed.
- Do not make unrelated malformed/unreadable files global coverage failures: record them as excluded-unrelated only after their readable metadata proves a different root. An unreadable/malformed candidate whose relation cannot be determined must remain PARTIAL/incomplete.
- Completeness at `--to` needs: full scan completed, no indeterminate candidate, selected in-window descendants terminal by `task_complete` at EOF (or otherwise PARTIAL), and no open lead assertion. This is sufficient for a historical closed window, not an active root.

## Full-home first-line metadata census
- Canonical `sessions/<year>/<month>/<day>` forest: 183 JSONL files; 0 unreadable, 0 malformed first lines, 0 non-`session_meta` first rows, 0 missing `id`, and 0 missing `session_id`.
- Exactly 49 metadata rows carry requested root `session_id` `01a0df4c...`; 134 carry another root. Thus unrelated readable metadata can be excluded without poisoning coverage.
- No legacy `id`-only metadata exists in this forest, so it does not make known-id full-home scanning inherently PARTIAL today. Future id-only rows with parent=root remain indeterminate and must fail closed; a non-root parent can be excluded.
- Per root rule: a selected file has a complete requested window when it has a valid row after `--to`, or its final valid row is `task_complete`; do not reject the lead merely for continuing after the historical window.
