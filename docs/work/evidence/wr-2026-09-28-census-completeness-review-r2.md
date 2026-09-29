VERDICT: NEEDS_FIXES d2000ee78626b069a19055081fcd74c36f78e8e2

# Lane 38 (census-completeness) re-review, round 2

Reviewed: 1c41ce7..d2000ee on build/census-completeness-1. I ran `git fetch` and `git pull` first: already up to date, HEAD d2000ee, tree clean. This was read-only. Mutations ran on a `git archive d2000ee` copy in my scratchpad and were restored afterwards (`cmp` against `git show d2000ee:` confirmed).

Result: F2, F3 and F4 are fixed, and so is the wake and stall-nudge half of F1. One MAJOR finding remains, on the other half of the lead's F1 ruling: the reason the branch gives for Codex Stop-blocks is false. This host has a live Codex rollout that records a multi-inbox Stop-hook block, and it is not tool output.

## F1: Codex wakes and Codex stall nudges. FIXED (verified on a live rollout)

- **The cited rollout exists and has the claimed shape.**
  - File: `C:/Users/benzh/AppData/Roaming/orca/codex-accounts/f8bc0bab-.../sessions/2026/09/25/rollout-2026-09-25T18-31-35-01a0dab2-065e-7a31-bff4-9aecfe1fa833.jsonl`. It has 51 lines, and its sha256 f1faefec... matches docs/reports/codex-fresh-0925/walk.md:127.
  - Line 29 is `task_started` at 22:32:53.168Z. Line 31 is `response_item` / `message` / `user` with exactly one `input_text` part: a single envelope line of 191 characters with no newline, `x1-native-claude → x1-native-codex ... [x1-native-claude-x1-live-delivery-1] ASK: ...`.
  - Line 32 is the `item_completed` `UserMessage` echo. Line 33 is the developer hook context.
  - walk.md:129 independently records that this note was sent "through the queue".
- **The branch classifier matches the live data exactly.** I ran `classifyCodexWake` over every line: it matches line 31 only (`{"to":"x1-native-codex","doneTick":false}`).
- **It holds at scale.** Over all 381 Codex rollouts on this host (`~/.codex/sessions` and every orca codex-accounts home), it counts 46 wakes across 3 files. Exactly one user message carries an envelope and does not match: a `<hook_prompt hook_run_id="stop:12:...">` message. That is a Stop-hook continuation, not a wake, so it is correctly excluded. No "shape unverified" caveat is needed for wakes.
- **Stall nudges are now computed for a Codex census.** `runCodexCensus` calls `computeStallNudges(opts, lead, fsImpl)` (build-census.mjs:1191). The Codex lead object provides `slugVotes`, `windowStartAt`, `windowLastAt` and `lastAt`.
- **The tests would catch a revert.** Each of these mutants failed at least one test:

  | Mutant | Tests failed |
  |---|---|
  | wake never counted | 4 |
  | wake unwindowed | 1 |
  | multi-part content allowed | 4 |
  | any role allowed | 1 |
  | doneTick forced false | 3 |
  | slug votes dropped | 1 |
  | Codex `stallNudges` dropped | 2 |
  | four-read reverted to "the census does not read Codex wakes or Stop-blocks" | 1 |
  | four-read printing Codex Stop-blocks as a number | 1 |

- **One mutant survived, and it is equivalent.** Removing `if (text.includes('\n')) return null;` (build-census.mjs:230) leaves 19/19 passing. `ENVELOPE_LINE_RE` has no `m` flag and ends in `(.+)$`, so a multi-line text already fails the regex. No fix needed.

## F1 (Stop-block half) / F5: MAJOR. The stated reason for Codex Stop-blocks being unavailable is false

The lead ruled: "Codex Stop-blocks stay unavailable, with the correct reason." The reason the branch ships is:

- build-census.mjs:1095 `CODEX_STOP_BLOCK_REASON = 'no Codex rollout record of a Stop-hook block is established; the Stop reason appears only inside tool output'`
- docs/census.md:227-231: "no Codex rollout record of a Stop-hook block is established, and the Stop reason sentence appears in a rollout only inside tool output, where it would also match a command that merely printed it."
- docs/census.md:384-385, and the fallback string in four-read.mjs `computeCompletenessSuffix`.

**Evidence against it, on this host, dated before round 2:**
- File: `C:/Users/benzh/AppData/Roaming/orca/codex-accounts/f22a4cc4-fb5a-4af5-aeec-4951188a536a/home/sessions/2026/09/26/rollout-2026-09-26T15-58-25-01a0df4c-2809-7520-b1d7-876cc51a87ee.jsonl`. This is skills-a's live Codex lead session, which is lane 37's lead.
- Line 8377, 2026-09-28T03:56:33.233Z: a `response_item` / `message` / `role:user` whose single `input_text` is `<hook_prompt hook_run_id="stop:12:...hooks.json">1 new peer note for skills-a (the multi skill; the ledger is the channel):\n  skills-fable → skills-a, ... [skills-fable-lane-31-3 re skills-a-lane-31-3] ASK: ...\n...\n\nHandle these before you stop: ACK what you are taking, ... say so in one line and stop.</hook_prompt>`. That text is the multi-inbox Stop block, `blockOutput` = summary + `\n\n` + STOP_REASON.
- Line 8378, 03:56:33.240Z: `event_msg` / `item_completed` / `item.type:"HookPrompt"`, whose `fragments[0].hookRunId` is `"stop:12:..."` and whose `fragments[0].text` is the same text.
- Codex Stop is wired to multi-codex-hook.mjs (hooks/codex-hooks.json, the `Stop` entry).
- The same shape also appears for a different Stop hook: `HookPrompt` with `stop:11`, text "Continuation accounting for the bound selected work: ..." (01a0daaa... line 715; 01a0df4c... line 1899). A count must therefore key on the STOP_REASON sentence, not on `stop:` alone.
- Across the 381 local rollouts, the Stop reason sentence occurs in 59 `item_completed/CommandExecution` records, 37 `custom_tool_call_output` records, 1 `compacted` record, and in the 1 user message plus 1 `HookPrompt` above. "Only inside tool output" is therefore wrong.

**Why it matters.**
- The ruling requires a correct reason. A wrong one tells the 9/29 check that the data does not exist, when lane 37's own rollout contains it.
- The spec's prediction is "reads all three numbers for every lane of this bundle without a hand count", and lane 37 is Codex-led.

**Fix. Pick one; the lead decides, and both satisfy the ruling's wording.**

(b) Minimum, and it keeps the ruling as issued: correct the reason everywhere it appears.
- build-census.mjs:1094-1095
  - Current: `/** Why a Codex lead has no Stop-block count: no rollout on record holds the Stop hook's block. */` / `export const CODEX_STOP_BLOCK_REASON = 'no Codex rollout record of a Stop-hook block is established; the Stop reason appears only inside tool output';`
  - Replacement: `/** Why a Codex lead has no Stop-block count: a rollout records the block (a HookPrompt item, hookRunId stop:*), but this census does not count it yet. */` / `export const CODEX_STOP_BLOCK_REASON = 'this census does not count Codex Stop-hook blocks yet (a rollout records one as a HookPrompt item whose hookRunId starts with stop:)';`
- four-read.mjs `computeCompletenessSuffix`: set the fallback `'no Codex rollout record of a Stop-hook block is established'` to the same new text, or import the constant.
- docs/census.md:227-231
  - Current: `its Stop-blocks are `null` with `stopBlocksUnavailable` / saying why: no Codex rollout record of a Stop-hook block is established, and the Stop reason / sentence appears in a rollout only inside tool output, where it would also match a command that / merely printed it.`
  - Replacement: `its Stop-blocks are `null` with `stopBlocksUnavailable` / saying why: a Codex rollout does record the block (a `response_item` user message `<hook_prompt / hook_run_id="stop:…">` and its `event_msg` `item_completed` `HookPrompt`, seen live in rollout / `01a0df4c-2809-7520-b1d7-876cc51a87ee` at 2026-09-28T03:56:33Z), but this census does not count it yet.`
  - Rewrap as needed.
- docs/census.md:384-385: replace the quoted `(no Codex rollout record of a Stop-hook block is established; ...)` with the new reason text.
- scripts/four-read.completeness.test.mjs: update the regex in the "a Codex census prints its wakes ..." test to the new reason.
- Predicted outcome: 19/19 in the completeness tests after the regex update. The L row for a Codex census states a true limit.

(a) Count it. This is small, and the shape is verified live above.
- In `censusCodexLeadFile`, count `event_msg` / `item_completed` records whose `item.type === 'HookPrompt'` and that have a fragment with `hookRunId` starting `stop:` and `text.includes(STOP_BLOCK_REASON)`.
- Count only that form, not the paired `<hook_prompt>` user message, or each block counts twice. Window it like the wakes. Vote the slug from `PEER_HEADER_RE` on the fragment text.
- Emit `stopBlocks`, `stopBlocksTotal`, and `stopBlocksUnavailable: null`. four-read then prints a number for Codex.
- Add to codex-lead.jsonl:
  - one matching pair (the user `<hook_prompt hook_run_id="stop:1:fixture">…STOP_REASON</hook_prompt>` line plus the `HookPrompt` item);
  - one `stop:` `HookPrompt` with other text (the "Continuation accounting" shape), as a negative.
- Expect stopBlocks 1. The existing wake count stays 2, because the hook_prompt message is multi-line.
- If the lead picks (a), census.md:227-231 and :384-385 describe the count instead of a reason.

## F2: FIXED

The Secrecy paragraph (docs/census.md:340-343) now reads exactly as the round-1 patch. It is doc-only, so no test applies.

## F3: FIXED

- The queued_command sentence is at docs/census.md:247-249. The fixture line is at lead.jsonl, 12:48:00Z.
- The test asserts that this line classifies as neither a wake nor a Stop-block.
- Mutation check: I made `classifyWake` count a `queued_command` attachment with note-flush origin. 6 tests fail.
- The I1 sentence (the dispatching note arrives before `Opened:`) is also present, at census.md:249-250.

## F4: FIXED

- The ledger fixture line `skills-fable-stall-review-1` is present, along with an explicit `ids` assertion.
- Mutation check: `STALL_NUDGE_ID_RE = /stall/` now fails 9 tests. In round 1 it failed 0.

## Regressions since 1c41ce7, territory, merge

- **Files changed** in 1c41ce7..d2000ee: docs/census.md, build-census.mjs, four-read.mjs, their two completeness tests, and three completeness fixtures. All are inside the territory.
- **The Codex horizon paragraph is untouched.** census.md hunks are at :224, :241, :321 and :364, all in the fields, Secrecy and four-read sections.
- **The merge into current origin/main is clean** (`git merge-tree --write-tree origin/main d2000ee`). Main has not touched build-census or four-read since.
- **four-read refactor.** `computeCompletenessSuffix` now gates on `Number.isInteger(lead.wakes)` alone. A Claude census emits wakes and stopBlocks together, so this does not regress. For a pre-round-2 Codex census it prints "wakes unavailable (census predates ...)" plus the Codex Stop reason, which is acceptable.
- **Tests:** the four touched and related test files (build-census.completeness, four-read.completeness, build-census, four-read) give 202 pass, 0 fail. The builder's 220 includes the codex contract file.

## Lane 32 live numbers: REPRODUCE

- I reran `build-census.mjs --lead <588290d9...jsonl> --from 2026-09-28T03:06:46Z --to 2026-09-28T10:28:19Z --ledger-dir C:/Users/benzh/Code/claude-delegation/docs/ledger --lead-slug skills-o`.
- Census result: `wakes: 1 (1 note-flush, 0 Done-tick)`, `stopBlocks: 0`, `stallNudges: 0 to skills-o`.
- I then ran `four-read.mjs --record docs/work/wr-2026-09-27-autolink-guard.record.md` against that census. Its output is byte-identical to PACK/live-four-read-r2.md and to round 1's live-four-read.md. The L row ends `wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-o`.

## C4 fields (for the F1/F5 fix round)

Cause: the round-2 builder wrote the Codex Stop-block reason from an absence of evidence ("not established") without searching this host's rollouts, where skills-a's live session holds a HookPrompt Stop block.
Discriminating check: `grep -rl "Handle these before you stop" C:/Users/benzh/AppData/Roaming/orca/codex-accounts --include=*.jsonl`, then look at 01a0df4c-2809-7520-b1d7-876cc51a87ee lines 8377-8378. The reason is correct only if no `HookPrompt` item or `<hook_prompt hook_run_id="stop:` user message carries STOP_REASON.
Fix location: build-census.mjs:1094-1095 (CODEX_STOP_BLOCK_REASON), four-read.mjs computeCompletenessSuffix (the fallback string), docs/census.md:227-231 and :384-385, and the four-read.completeness.test.mjs Codex regex. Under option (a), also censusCodexLeadFile and codex-lead.jsonl.
Simplification: have four-read import `CODEX_STOP_BLOCK_REASON` rather than restate it, so the reason lives in one constant.
