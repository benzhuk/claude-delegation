VERDICT: APPROVE fb079b53356ecc872a8f46988fe16e57e7511aa7

# Lane 38 census-completeness: review round 3 (delta on F5)

Worktree C:/Users/benzh/Code/census-completeness/wt. After fetch and pull, HEAD is fb079b5 and the tree is clean. Delta d2000ee..fb079b5 touches 6 files, all inside Lane 38's territory: docs/census.md (fields section and four-read item 4 only, not the Codex horizon paragraph), scripts/build-census.mjs, scripts/four-read.mjs, the two completeness tests, and codex-lead.jsonl.

## F5 (prior MAJOR): fixed, via option (a), counting the blocks

- **Rule.** `classifyCodexStopBlock` (build-census.mjs:246-257) takes `event_msg` records whose payload is `item_completed` with `item.type === 'HookPrompt'`. It needs a fragment whose `hookRunId` starts with `stop:` and whose `text.includes(STOP_BLOCK_REASON)`, and it returns `{ slug }` from `PEER_HEADER_RE`. It counts once per item, not once per fragment.
- **Wiring and windowing.** `censusCodexLeadFile` (:675-680) counts `total` always and `window` only when `inWindow`, the same way as wakes. `runCodexCensus` (:1202) emits `stopBlocks` and `stopBlocksTotal`, and `formatCodexText` (:1464) prints `- stopBlocks: N`.
- **Live check against every Codex rollout on this host.** I ran the committed classifier over all 340 local rollouts under `%APPDATA%/orca/codex-accounts`. Records holding the reason sentence are:
  - `item_completed/CommandExecution`: 59
  - `custom_tool_call_output`: 37
  - `message/user`: 1
  - `item_completed/HookPrompt`: 1
  - `compacted`: 1

  The classifier counts exactly **1**: 01a0df4c-2809-7520-b1d7-876cc51a87ee at 2026-09-28T03:56:33.240Z, slug `skills-a`. The paired `<hook_prompt>` user message and the `compacted` replay (which also carries the `stop:` user-message text) are not counted. There is no double count and no tool-output false positive. This agrees with the builder's live-codex-r3.md (`stopBlocks: 1`).

## Fixture vs the live shape: matches

I compared live rollout 01a0df4c lines 8377-8378 (1-based; `ordinal` 8376/8377) with the fixture:
- Line 8377 is a `response_item`/`message`/`user` whose one `input_text` is `<hook_prompt hook_run_id="stop:12:C:\...\hooks.json">`, followed by the summary, `\n\n` and the STOP_REASON.
- Line 8378, 7 ms later, is an `event_msg`/`item_completed` with `thread_id` and `turn_id` and `item: {type:"HookPrompt", id:<same msg id>, fragments:[{text, hookRunId:"stop:12:..."}]}`.
- The fixture lines at 12:30:00 and 12:30:01 reproduce this: same keys, same pairing by item id, same text layout. The only differences have no effect on the rule: the live payload carries `started_at_ms`/`completed_at_ms`, and the fixture timestamps are 1 s apart instead of 7 ms.

## Lookalikes do not count: verified by mutation on a scratch copy

The fixture negatives are:
- a `stop:` HookPrompt whose text is "Continuation accounting" (this shape really occurs live, as stop:11)
- a `userpromptsubmit:` HookPrompt that carries the reason
- a CommandExecution whose `aggregated_output` and `stop:` fragment both hold the reason
- a `custom_tool_call_output`
- an assistant message

The unit test also rejects the paired user message and `null`. I ran mutations against a `git archive` export in scratch; the reviewed tree was never written. I restored the file after each mutation and diff-confirmed it at the end.

| Mutation | Failing tests (of 20) |
|---|---|
| M1: drop the `startsWith('stop:')` check | 4 |
| M2: drop the `HookPrompt` type check | 4 |
| M3: drop the `STOP_BLOCK_REASON` check | 4 |
| M4: drop `if (inWindow)` | 1 (the 12:35 window test) |
| M5: drop `vote(stop.slug)` | 0; see N2 |

## No stale "unavailable" reason; shared reason: clean

- `git grep` at fb079b5 finds none of these strings: "no Codex rollout record", "only inside tool output", `CODEX_STOP_BLOCK_REASON`. The only `stopBlocksUnavailable` left is the negative assertion at build-census.completeness.test.mjs:198 (`'stopBlocksUnavailable' in report.lead === false`).
- four-read.mjs `computeCompletenessSuffix` has no host branch now. It gates wakes and Stop-blocks together on both being integers, so a Codex census from before this round reads "census predates wake/Stop-block counts" and never shows a wrong number.
- No Codex-specific reason exists any more, so nothing is left to import. The one shared string, `STOP_BLOCK_REASON` (build-census.mjs:158), mirrors hooks/multi-hook-core.mjs `STOP_REASON`, and build-census.completeness.test.mjs:146 pins the two together (unchanged since round 1).
- The live text of the Codex block contains that exact sentence, so the Codex Stop path emits the same reason.

## No regression since d2000ee; nothing outside the territory

- I ran the lane's four touched test files (build-census.test.mjs, four-read.test.mjs, and the two completeness tests): **203 pass, 0 fail**. The two completeness files alone: 20/20.
- The d2000ee..fb079b5 diff touches 6 files, all in the territory. The lane-wide diff against origin/main adds only the orchestrator's work record, docs/work/wr-2026-09-28-census-completeness.record.md.

## Nits (LOW, non-blocking)

- **N1: fixture path escape.** The fixture's `hookRunId` values read `"stop:1:C:\fixturehooks.json"` in the raw JSONL. JSON parses `\f` as a form feed, so the value holds U+000C, not a path. The live value is `stop:12:C:\\Users\\...\\hooks.json`. This does not affect the rule, because only the `stop:` prefix is read. Optional fix: in gen-fixture, write the path as `C:\\\\fixture\\\\hooks.json` in the JS source so the JSONL holds `C:\\fixture\\hooks.json`.
- **N2: slug vote is untested.** Nothing tests the Stop-block contribution to the slug vote (M5 survives), because wakes already decide the slug in the fixture. Optional: add a case where the only slug evidence is a Stop-block.
- **N3: stray blank line.** Removing `CODEX_STOP_BLOCK_REASON` left a blank line between the `runCensus` JSDoc and `async function runCodexCensus` (build-census.mjs:1124-1125). On main those lines are adjacent. The JSDoc was already placed above the wrong function before this lane. Patch: delete the blank line at :1125 (the line between ` */` and `async function runCodexCensus(opts, fsImpl) {`).

## C4 fields

Cause: round 2 stated that Codex Stop-blocks were unavailable because the builder had found no record of one, but it never searched the host's rollouts, where skills-a's session holds a HookPrompt Stop block.
Discriminating check: run `classifyCodexStopBlock` over all 340 local Codex rollouts. It counts exactly 1 (01a0df4c at 03:56:33.240Z) of the 99 records carrying the reason sentence. Mutations M1-M3 each fail 4 tests, and M4 fails 1.
Fix location: scripts/build-census.mjs:246-257 (classifier), :675-680 (count and window), :1202 and :1464 (emit and print); scripts/four-read.mjs:686-693; docs/census.md:227-229, :276-288 and :396; codex-lead.jsonl, plus the two completeness tests.
Simplification: the Codex-only reason constant and four-read's host branch are gone, so both hosts share one Stop-block code path in four-read.

Reviewer housekeeping: during a first mutation attempt I wrote a stray copy of build-census.mjs to /tmp/bc.orig, outside the scratch folder. It is removed now. The reviewed worktree was never written, and `git status` is clean at fb079b5.
