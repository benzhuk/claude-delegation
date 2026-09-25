VERDICT: NEEDS_FIXES (17)

# Codex parity spec red-team (skills-o, Claude high-tier)

September 25, 2026, 1:24 PM America/New_York. Read-only review of `C:/Users/benzh/orca/workspaces/claude-delegation/astra-codex-parity` at `7f188b0` (base `8cebeda` plus the pinned spec, contracts, scouts and records). I read the packet, the spec, `territories.md`, `contracts.md`, the three scouts, and the real code: `hooks/delegation-reminder.js`, `hooks/multi-codex-hook.mjs`, `hooks/multi-hook-core.mjs`, `hooks/continuation-native.mjs`, `scripts/goal-card.mjs`, `skills/bearings/scripts/bearings-state.mjs`, `skills/decisions/scripts/project-config.mjs`, and the census/record head. I edited nothing, ran no suite and changed no git state.

`contracts.md` already settles several of the packet's attack points: the switch spelling, lead/child/unknown, keeping the peer systemMessage, and no PostToolUse/Stop/Interrupt effects. Those are marked verified below. What remains are gaps the contract does not close, plus places where the spec text and the contract still disagree. A builder who reads only the spec would build the wrong thing.

## MAJOR

### M1. "Exactly what the Claude hook injects" on UserPromptSubmit contradicts the Claude hook, and per-prompt injection repeats a problem Claude already measured and removed
- Evidence: spec `:17` puts the card and bearings notice on UserPromptSubmit "exactly [as] the Claude hook injects". The Claude hook injects neither there. `delegation-reminder.js:375-379` returns only the routing line: "The card is deliberately NOT here. Every-prompt injection is what made the last standing text wallpaper". The header at `:6-16` records the measured cost, and `PROMPT_LINE_MAX_BYTES = 400` (`:80`, enforced `:533`) caps the per-prompt payload. The card alone is up to `RENDER_MAX_BYTES = 1200` (`goal-card.mjs:53`). `contracts.md:13-15` accepts per-prompt injection ("Shared CONTENT is parity, not identical event schedules") but never states the cost.
- Why it matters on Codex in particular: in a mixed build, note-flush types peer nudges into an idle Codex pane, and each nudge is a UserPromptSubmit. The lead would get about 1.2 KB of card plus about 150 B of bearings text on every peer message. A due notice repeated on every prompt also pushes the lead to start a bearings run in the middle of a build. That is an extra turn Ben did not ask for.
- Fix (judgment, needs Fable's or the lead's ruling before P1 codes). Choose one and write it into `contracts.md`:
  - (a) Recommended: reuse the existing Claude time floor rather than add state. On Codex SessionStart, call the same `markFired`. On Codex UserPromptSubmit, inject card and bearings only when `Date.now() - mtime(firedFileFor(session_id)) >= REINJECT_MAX_MS` (goal-card.mjs `:71`, `:417`), then `markFired`. This is the same file, key scheme and 30-minute constant Claude's PostToolBatch uses, so there is no new store, timer or event. Predicted result: at most one prompt injection every 30 minutes, not one per nudge.
  - (b) Accept per-prompt explicitly. Fix the spec's word "exactly", add a contract line stating the per-prompt byte cost, and have P3 state it. The contract's "no new state" must then also say the Codex path never touches `ws/goal-card` tally or fired files.

### M2. "Confirmed lead only" may never fire at SessionStart, and this is unverified
- Evidence: `classifyCodexRole` (`continuation-native.mjs:43-73`) returns `lead` only if `transcript_path` is present, its first line is a `session_meta` row, `payload.id === session_id`, and `payload.source` is `cli` or `vscode` (`:72`). The only live lead confirmation on file is a UserPromptSubmit callback (`docs/work/evidence/codex-native-child-proof.md:13`). No evidence file records the role at a SessionStart with `source: startup`. If Codex has not written the rollout's first row when SessionStart fires, or passes a null `transcript_path`, the role is `unknown`, and under `contracts.md:9` the spec's main visible deliverable (the SessionStart pane notice) never appears on a fresh session. Separately, `exec` and app-server sessions whose source is not `cli`/`vscode` are always `unknown`. Ben's receipted Windows route is app-server (`windows-installed-codex-hooks.md:5`).
- Fix: before P1 is accepted, do one of these.
  - (a) Get a metadata-only readback from an existing private receipt or a fresh probe that records `hook_event_name`, `source`, whether `transcript_path` exists, and the `classifyCodexRole` result for a startup SessionStart on the cli and app-server routes. Put it in a dated evidence file.
  - (b) If that is not possible in this build, P1 tests pin both outcomes (lead gets the notice; unknown gets unchanged peer output and no new context), and P3 states that delivery at SessionStart startup is unverified and depends on the transcript's metadata being present when the hook runs.
  - Discriminating check: the role value on a real startup SessionStart.

### M3. Goal/bearings I/O shares one timeout with peer delivery, so a slow card can erase the notes
- Evidence: `main()` races the whole of `runCodexHook` against `BUDGET_MS = 2500` (`multi-codex-hook.mjs:145-148`, `multi-hook-core.mjs:26`). When the race times out the result is `null`, so nothing is printed and no continuation flush runs (`:152`). The new work adds two dynamic ESM imports, `loadProjectConfig`, `realpathSync`, card validation, and a bearings `check()` that reads and hashes `reportPath` and `leadResponsePath` with an unbounded `readFileSync` (`bearings-state.mjs:112-115`). Claude keeps this work inside its own 500 ms process guard (`delegation-reminder.js:91,515`). On Codex it would compete with the inbox read. This is exactly the "without changing inbox or continuation output" attack point.
- Fix: compute the goal context in parallel with the peer and continuation work, under its own bound: reuse the file's existing `withBudget(goalWork, 500)`, which is not a new timer. On timeout or throw, drop only the goal part. Test: inject a goal helper that never resolves (or takes 3 s) into a SessionStart with one peer note. The output must deep-equal the baseline peer output, `ackIds` must be unchanged, and the call must finish in under 2500 ms. Predicted result: peer delivery is byte-identical whatever the card does.

### M4. The merge contract does not cover the no-slug lead or where the card goes relative to the continuation merge
- Evidence: when `$NOTE_SLUG` and the pane binding are both absent (`codexSlug`, `:56-62`), `peer` is null (`:117-120`). When there is also no continuation, `composeContinuationResult` returns null (`multi-hook-core.mjs:170-173`) and the hook returns null (`:132`). That is the common fresh-project Codex session with no Orca, which is the case P3.2 documents. A builder who puts the card inside the existing `result` path delivers nothing to it. A builder who instead passes the card in as a synthetic `peer` changes `composeContinuationResult`'s branches: `continuationAfterFlush` then gets attached where it was dropped before (`:173`). That flush is what sets continuation's `emitted` flag (`scripts/continuation.mjs:182-189`), so continuation output changes.
- Fix: add to `contracts.md:13`:
  - Goal context is merged after `composeContinuationResult`, never passed into it.
  - With a result: append the goal text to `hookSpecificOutput.additionalContext` with `"\n\n"`. On SessionStart only, append the goal systemMessage to any existing `systemMessage` with `"\n"`. `ackIds`, `ack`, `suppressOutput` and `continuationAfterFlush` stay untouched.
  - With no result: return `{ output: { suppressOutput: true, hookSpecificOutput: { hookEventName: event, additionalContext }, ...(sessionStart && msg ? { systemMessage: msg } : {}) }, ackIds: [] }`.
  - Tests: (i) a lead with no slug gets the card; (ii) with peer and continuation present, the output's peer and continuation prefix is byte-identical to baseline; (iii) PostToolUse, Stop and Interrupt deep-equal baseline while bearings is due; (iv) with `ws-off` present, peer output is unchanged, because the master switch gates only the new context.

### M5. Codex builder sessions are confirmed leads, so every builder worktree will be told bearings is due
- Evidence: a Codex builder in its own Orca worktree is a top-level cli session. Its metadata classifies as `lead`, not child. `findProjectRoot` stops at the worktree's `.git` file (`project-config.mjs:11-18`), so `receiptLocation` hashes the worktree path (`bearings-state.mjs:58-59`). Every builder worktree therefore has "no completion receipt" and reports `due` (`:95`). The card is committed (`docs/goals/card.md`), so `goalLocation` is `ok`. Each P1/P2/P3 builder would see "Bearings are due. Run `/delegation:bearings`…" in the pane at start and in context on every prompt. Obeying it is out of scope and ends in a Notion publication, which the spec's "Not in scope" forbids. Claude avoids this in practice only because its builders are subagents with an `agent_id` (`delegation-reminder.js:396`).
- Fix (judgment): do not change the receipt key, which the contract says stays authoritative. Instead:
  - (a) Each builder mandate states: "A bearings notice in this session is not your task; do not run bearings."
  - (b) P3 states that the receipt is per checkout, so a linked worktree reports due on its own.
  - (c) Record the question for Fable: should bearings be suppressed in non-lead work sessions? It is not fixable in P1 without a way to tell a builder session from a lead session, which does not exist.

### M6. Twin of `1fdd51b`: new code and tests will read the real `~/.agents` unless the injected env is honoured
- Evidence: existing tests call `runCodexHook` with `deps.env` that has no `AGENTS_HOME` (`multi-codex-hook.test.mjs:45,60,82,120`). The helpers fall back to the real home: `delegation-reminder.js:160-162` reads `process.env`, `goal-card.mjs:106-109` reads `env.AGENTS_HOME` or `homedir()`, and `bearings-state.mjs:16` does the same. A focused test on Ben's machine would then read his real switches and real bearings receipts. A real `ws-off` makes every kill-switch assertion pass without testing anything; the same failure was already noted in `wr-2026-09-21-next-build-t4-review.md:29`. This is the bug class fixed in `1fdd51b` ("honour an injected home over ambient AGENTS_HOME").
- Fix:
  - The shared helper takes `env` explicitly. The Codex adapter passes `deps.env ?? process.env`. The Claude adapter passes `process.env`.
  - Every new test sets `AGENTS_HOME` to a scratch directory in `deps.env`.
  - Each kill-switch test includes a positive control on the same fixture that shows the part appears without the switch.
  - One test sets an ambient `process.env.AGENTS_HOME` that contains `ws-off` and shows that a scratch `deps.env.AGENTS_HOME` still wins.

### M7. P2: the existing reader already reports a Codex rollout as a measured zero, and nothing in the spec requires it to refuse
- Evidence: `--lead` accepts any `.jsonl` (`build-census.mjs:331`). The lead reader counts only `type: assistant` rows, and Codex rollouts have none (`session_meta`, `response_item`, `event_msg`). The default subagent directory `<dir>/<id>/subagents` does not exist, which counts as "normal … contributes zero" (`:48-49,340`). Line 1 then reads `VERDICT: COUNTED 0 lead requests (leadTurns 0), 0 subagent files` (`:635`), and work-record accepts on the `VERDICT: COUNTED ` prefix (`work-record.mjs:561`). This is the packet's "Claude-only census as Codex zero" failure, and it happens with today's code.
- Fix:
  - P2 detects the host from the first row (`type === "session_meta"` means Codex) before any Claude parsing.
  - When unsupported, line 1 must not begin `VERDICT: COUNTED`. Use for example `VERDICT: UNSUPPORTED leadHost codex (<reason>)`, so `accept --census` refuses it and the lead has to use `--no-census "<reason>"`. Contract `:21` says "flat summary lines copied by work-record", which is ambiguous on exactly this point.
  - Test: a synthetic Codex-shaped fixture (metadata only) must produce no `COUNTED` line and no numeric lead or subagent table. A Claude fixture's output stays byte-identical.
  - Record rule: `leadHost` must match the host that actually led. Running the Claude census on a Claude reviewer's transcript (skills-o) is not this build's lead census.

### M8. P2: counting cumulative totals as the build's usage, and not counting builders and reviewers at all
- Evidence: the spec (`:24`) and contract (`:21`) never say what "per build" means for a Codex session. Codex usage events may carry running totals for the whole session. Verify this; do not assume it. A resumed or long-lived lead session spans several builds. Separately, in this build model the builders are separate Codex top-level sessions and the reviewers are separate Claude sessions. None of them sit in the lead's child tree, so even a correct lead reader prints "0 subagent files" for a build that ran three builders and several reviews.
- Fix: add to `contracts.md` P2:
  - If a reader is added, the build's tokens are the change across the marker window: the last cumulative value inside the window minus the last value before it. Alternatively sum per-request values, de-duplicated by the verified event id. Never report a session total as the build's total.
  - The census states `builders/reviewers: unattributed (separate top-level sessions)` and never gives a zero count for them.
  - The input is an explicit `--lead` path only. Never glob across Codex homes: Orca keeps one `CODEX_HOME` per account (see `docs/specs/2026-09-23-first-useful-harness.md:11`), so a glob can pick up another account's session.
  - Test: a two-build fixture where the window delta differs from the session total.

## MINOR

### m1. The switch spelling in the spec is wrong, and only the contract corrects it
The real name is `ws-off-goalcard`: `goal-card.mjs:26-27` (`SWITCH_NAME = "goalcard"`), `delegation-reminder.js:184`, `bearings-state.mjs:78`, `README.md:140`. Spec `:17` says `ws-off-goal-card`. `contracts.md:11` fixes it, but the spec is the "Scope" file every record cites first. Patch for the spec (lead-owned):
- current: `Same kill switches as the Claude side (\`ws-off\`, \`ws-off-goal-card\`, \`ws-off-bearings\` under \`$AGENTS_HOME\`, fail open, never block).`
- replacement: `Same kill switches as the Claude side (\`ws-off\`, \`ws-off-goalcard\`, \`ws-off-bearings\` under \`$AGENTS_HOME\`, fail open, never block). (Errata: the switch has no hyphen in "goalcard"; see contracts.md.)`

Also add one P1 test: a file named `ws-off-goal-card` changes nothing, so no alias gets added quietly.

### m2. Spec P1.5 says a missing card gets rejection text. A missing card gets nothing.
`goalCardResult` returns `absent` for a missing file (`goal-card.mjs:355`). The Claude hook emits `rejectionNotice` only for `rejected` (`delegation-reminder.js:389-393`), and bearings needs `cardUsable` (`:396`). Fix the test list:
- absent: no card, no bearings, no systemMessage.
- rejected: SessionStart `systemMessage === rejectionNotice(path, reason)` exactly, no bearings; UserPromptSubmit gets nothing new.
- blind (import failure): nothing.

### m3. The lead-id hint is part of Claude's SessionStart output but is missing from the contract's helper API
`delegation-reminder.js:413-415` appends `--lead-id <session_id>` guidance whenever bearings is due. `bearings-state complete` requires `--lead-id` (`:152`), and `SKILL.md:48,52` points the lead to that notice for its id. `contracts.md:7` lists only `cardResult`, `rejectionNotice` and `bearingsNotice`. Fix: move `leadIdHint(sessionId)` into the helper verbatim and emit it on Codex SessionStart for a confirmed lead using Codex's `session_id`. Or rule it out, in which case P3 states that a Codex lead gets no id hint.

### m4. The notice names a Claude slash command
Both notices say "Run `/delegation:bearings`" (`delegation-reminder.js:344-347`). Nothing on file verifies how Codex invokes the plugin skill. Keep the text verbatim, since that is what prevents drift. P3 names the Codex invocation route only where evidence exists, and otherwise says it is unverified.

### m5. Codex fires SessionStart again on every `exec resume`, so the pane notice repeats
`multi-codex-hook.mjs:18-19` says SessionStart "fires again on every `exec resume`". `contracts.md:13` keeps only the compact suppression, "where native input actually supplies it". A lead driven through `exec resume` would get the pane notice on every turn. Fix: P1 pins in a test which `source` values allow the systemMessage, and P3 documents the repeat. A new suppression would need a ruling.

### m6. Moving code into the ESM helper must keep Claude's lazy import boundary and paths
`delegation-reminder.js:154-158,303-306,332-334`: the hot path (UserPromptSubmit, and PostToolBatch below the threshold) must not import ESM. After the move, `hooks/lib/goal-context.mjs` must resolve `../../scripts/goal-card.mjs` and `../../skills/bearings/scripts/bearings-state.mjs`, not the old `..` paths. Fix: the helper is imported only inside the branches that already imported `goalCard()`/`bearingsState()`. Add one test asserting that Claude UserPromptSubmit output is byte-identical to its current output.

### m7. P3 owns only the changelog, so stale README body lines become contradictions
- `README.md:62` says "Codex cadence … remain pending".
- `README.md:139` says the card is injected "never on every prompt", which is false for Codex if M1(b) is chosen.
- `README.md:140-141` says `ws-off-goalcard` is "(card only)". It is already inaccurate: it also silences bearings (`delegation-reminder.js:373`, `bearings-state.mjs:78`).

Fix: add those three README lines to P3's owned paths, or record them as known stale in the work record.

### m8. The "next patch version" is ambiguous
Both manifests say `0.20.7`, but the README changelog already has an unreleased `0.20.8` entry at the top (`README.md:241`). The lead names the target now, either append to 0.20.8 or add 0.20.9, so that P3 and integration do not disagree.

### m9. P3 runs in parallel with P1 but must describe P1's reviewed behaviour, and its spec wording overclaims
P3 has a 5-minute ETA (`territories.md:12`), so it describes behaviour before P1 is reviewed. Spec P3.1 says "what Codex now gets", and P3.2 puts the Codex goal card into the install guide for 0.20.6 hosts. That code is not in 0.20.6 and has never been observed live. Fix:
- P3 re-verifies against P1's final reviewed SHA before integration.
- Every Codex goal/bearings sentence carries one of three labels: implemented in source at `<sha>`; not in any installed version (0.20.6 on four hosts, `four-host-0206-and-live-pickup.md`); not observed live. Contract `:27` states this. The spec text should not be followed literally where it says otherwise.

## Verified: no defect found (checked against code)
- Child exclusion: `runCodexHook` returns null for a confirmed child before slug, registration or inbox work (`multi-codex-hook.mjs:85`). A child already gets nothing, and the new context inherits that as long as it is added after line 85. An inherited pane handle is never used to classify (`:39-42`). Unknown keeps the existing peer path, and `contracts.md:9` gives it no new context. That is consistent with continuation, which also requires `role === "lead"` (`scripts/continuation.mjs:196`). The remaining risk is M2, not the classifier.
- Peer systemMessage on other events: `contextOutput` sets `systemMessage: humanSummary(...)` on SessionStart, UserPromptSubmit and PostToolUse (`multi-hook-core.mjs:124-134`), and `blockOutput` does the same on Stop (`:136-142`). `contracts.md:13` ("Preserve pre-existing inbox systemMessage and context on EVERY event, concatenating without replacing") correctly confines "no systemMessage on other events" to the new bearings notice. M4 adds the exact merge.
- No extra idle turns from the hook itself: additionalContext and systemMessage do not start a turn. Stop is the only turn-extending path (`decision: block`), and the contract excludes Stop and Interrupt. The only idle-turn risk is behavioural (M1, M5).
- Switch coupling in the contract matches the code: master off means nothing; `goalcard` off means card and bearings off; `bearings` off means bearings only, with unreadable switches failing toward off (`delegation-reminder.js:171-190,370-373`, `bearings-state.mjs:77-83`). The contract's "master suppresses all new context" correctly leaves inbox delivery alone. Inbox has no `ws-off` gate today; continuation has its own (`continuation.mjs:42`).
- Authority and counters: the contract keeps goal-card exports and the bearings receipt authoritative, adds no receipt store, and leaves the ack slice (`shown()`, `multi-hook-core.mjs:235-237`) untouched provided M4's rule holds. If M1(a) is chosen, it reuses the existing `ws/goal-card` fired file and does not create a counter.
- Territory overlap: P1's extra paths (`delegation-reminder.js` and its tests, `hooks/lib/`) are disjoint from P2 and P3. `hooks/lib/*.test.mjs` is picked up by the recursive test walk (`scripts/run-tests.mjs:32-38`). The whole tree ships in the native package (`.codex-plugin/plugin.json`), and the mirror points at the repo's hook path (`mirror-shared-skills.mjs:70-75`), so a new `hooks/lib/` module is reachable on both routes. The only ownership gap is m7.
- The census-base findings C1 and C2 are correctly left upstream (`contracts.md:23`). Nothing in P2's scope requires touching them.

## C4 fields
Cause: the spec copies Claude's content and gives it Codex's event schedule. It never states the per-prompt cost, the identity signal available at SessionStart, the shared timeout, the no-slug merge path, or how a Codex usage source is detected. Two literal claims are wrong in the code: the switch name, and "missing card gets rejection text".
Discriminating check: the `classifyCodexRole` result on a real startup SessionStart (M2), and `build-census.mjs --lead <codex-shaped .jsonl>` printing `VERDICT: COUNTED 0` (M7).
Fix location: `docs/specs/codex-parity-1/contracts.md` (P1 lines 7-15, P2 line 21), then `hooks/multi-codex-hook.mjs` after line 131 and `scripts/build-census.mjs` at the `--lead` intake (`:331`).
Simplification: add the goal context after the existing composition under its own bound, reuse the existing time-floor file rather than inventing cadence, and have P2 refuse a Codex rollout with an explicit UNSUPPORTED line 1 rather than build a reader first.
