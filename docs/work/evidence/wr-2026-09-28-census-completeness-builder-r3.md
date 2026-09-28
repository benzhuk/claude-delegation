VERDICT: DONE fb079b53356ecc872a8f46988fe16e57e7511aa7

Lane 38 round 3 (F5), branch build/census-completeness-1, pushed. Serves the GOAL line "work lost or stalled"; nearest NOT: "a host-specific primitive as the shared contract" (all three counts now read on both hosts).

## F5: Codex Stop-blocks are counted, not excused
- `classifyCodexStopBlock(obj)` (build-census.mjs, exported): an `event_msg` / `item_completed` whose `item.type === 'HookPrompt'` with a fragment whose `hookRunId` starts `stop:` and whose text includes `STOP_BLOCK_REASON`. Windowed like the wakes; slug voted from the fragment text (`PEER_HEADER_RE`). The paired `<hook_prompt hook_run_id="stop:...">` user message is deliberately not counted (it would double each block).
- `censusCodexLeadFile` emits `stopBlocks` / `stopBlocksTotal`; `runCodexCensus` puts them under `lead`; the markdown prints `- stopBlocks: N`.
- Removed everywhere: `CODEX_STOP_BLOCK_REASON`, `stopBlocksUnavailable`, the four-read fallback string. No Codex field is unavailable now, so there is no constant to import. four-read gates wakes and Stop-blocks on both being integers, so a Codex census built before this round says "census predates wake/Stop-block counts" rather than printing a wrong number.
- docs/census.md: the "Codex not read for Stop-blocks" sentence (was :227-231) replaced ("No Codex field is unavailable"); new paragraph after the `stopBlocks` marker describes the HookPrompt shape, the `stop:` plus reason-sentence rule, the non-counted paired user message, the tool-output and other-hook negatives, and names the live rollout verified; four-read item 4 (was :384-385) says a Codex census prints all three like a Claude one.
- Live shape verified by me: rollout `01a0df4c-2809-7520-b1d7-876cc51a87ee` lines 8377 (response_item user message, `<hook_prompt hook_run_id="stop:12:...">`) and 8378 (`item_completed` `HookPrompt`, `fragments[0].hookRunId` `stop:12:...`), 2026-09-28T03:56:33Z.

## Tests
- codex-lead.jsonl (regenerated): one matching pair (counted once), one `stop:` HookPrompt with other text ("Continuation accounting"), a `userpromptsubmit:` HookPrompt carrying the reason, a CommandExecution item with the reason and a `stop:` fragment, a `custom_tool_call_output`, an assistant message. Expected: stopBlocks 1, wakes still 2.
- New test `classifyCodexStopBlock` positives and negatives; Codex count and window tests extended (from 12:10 keeps the block, from 12:35 gives 0 with total 1); four-read Codex row now `Stop-blocks 1`.
- Touched files: 221 pass, 0 fail. Full `node scripts/run-tests.mjs`: 2677 tests, 2665 pass, 0 fail, 12 skipped (full-r3.log).

## Live
- The real skills-a Codex rollout above: `wakes 20 (20 note-flush, 0 Done-tick); stopBlocks 1; stallNudges 0 to skills-a` (live-codex-r3.md). The single Stop-block matches the reviewer's finding (one HookPrompt among 4 sentence occurrences).
- Lane 32 rerun is byte-identical to round 2: `wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-o`.

## Caveat
Stall nudges count only the ledger given; nudges to a lead on another host sit in that host's ledger.
