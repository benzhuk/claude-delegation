NEEDS_FIXES

Lane 37 codex-parity review. Artifact 0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f, reviewed detached in scratchpad/wt-review-37. Reviewer: Claude Opus 5.5 (claude-opus-5-5), subagent of skills-fable session 9c61c35a-82dd-4aef-8eca-c99bb0e72e31.

Gates run (one file at a time, no full suite):
- node --test hooks/codex-unsupported.test.mjs: 7 pass, 0 fail, exit 0.
- node --test hooks/multi-codex-hook.test.mjs: 13 pass, 0 fail.
- git diff origin/main...HEAD on hooks/hooks.json, hooks/*.js, hooks/delete-guard.mjs, hooks/agent-dispatch-guard.mjs, scripts/wiring-check.mjs: empty. Claude side is byte-stable.
- wiring-check --line --hook standalone: ~90-100 ms on this Windows host, well inside the 400 ms route budget.
- Not run: codex exec live proof (not the reviewer's step; see finding 4).

What is good: the inventory is read from the real hooks/hooks.json, the unsupported file is read for real, the in-both and in-neither cases fail with the coverage message (negative controls at hooks/codex-unsupported.test.mjs:212-220), Interrupt is allowed, the route child is killed and reaped on timeout, ack-after-flush and peer/continuation composition are preserved and tested, and the wiring line is computed from the running plugin copy (HOOK_DIR/..), so it cannot report another version's state.

## MAJOR 1. Two unsupported reasons are not true capability reasons

hooks/codex-unsupported.json:4 says the reminder "reads input.transcript_path to select a model tier" as the reason it cannot run. Codex payloads DO carry transcript_path (the wrapper test itself feeds one, hooks/codex-unsupported.test.mjs:119, and hooks/multi-codex-hook.mjs reads it). The true limit is that delegation-reminder.js:134 parses the tail as a Claude transcript for the model name, and a Codex rollout JSONL has a different shape.
hooks/codex-unsupported.json:3 says SessionStart needs "input.agent_type state absent from Codex hooks". A Claude lead's SessionStart has no agent_type either (delegation-reminder.js:377 passes it through as optional), and docs/notes/2026-09-27-delete-deny-codex-pretooluse-gap.md:65 records that Codex does send agent_type for spawned subagents. So absence is not the blocker.
Cause: reasons written from field names, not from what fails. Discriminating check: feed the reminder a Codex payload with transcript_path set; it runs and picks no tier.
Fix location: hooks/codex-unsupported.json lines 3-4. Suggested text:
- SessionStart: "Reminder's card and tier logic parses a Claude transcript; a Codex rollout JSONL yields no model, so the notice would be wrong or empty."
- UserPromptSubmit: "Tier selection parses the Claude transcript tail for the model name; Codex transcript_path points at a rollout JSONL with a different shape."
Simplification: one shared reason sentence for both rows is fine.

## MAJOR 2. Delete guard is listed as wired, but on Codex it silently passes every top-level session

hooks/codex-hooks.json:8 wires delete-guard on PreToolUse matcher Bash, and the test counts the pair as covered (hooks/codex-unsupported.test.mjs:101). delete-guard.mjs:409-411 denies only when agent_id is present. Codex sets agent_id only for spawn_agent children (gap note lines 73-84: hook_runtime.rs:199, schema.rs:282-285). A codex exec builder or a Codex lead pane, the unattended case this guard exists for, logs passed-lead and the delete runs. The spec asked whether the port denies with a reason or silently observes; for top-level Codex sessions it silently observes. The review brief item 3 required this limit to be documented; nothing in the diff says so.
Cause: the pair is recorded as binary wired/unsupported with no partial state. Discriminating check: echo {"tool_name":"Bash","tool_input":{"command":"rm -rf x"}} | node hooks/delete-guard.mjs prints nothing and exits 0.
Fix (documentation, no code): add one sentence to codex/README.md next to the hooks paragraph (around line 55): "The delete guard is wired on Codex PreToolUse (matcher Bash) but denies only spawn_agent children, which carry agent_id; a top-level Codex session, including codex exec, passes and is logged passed-lead. See docs/notes/2026-09-27-delete-deny-codex-pretooluse-gap.md." Optionally add a `"partial"` note field later; do not change the guard in this lane.

## MINOR 3. The "wired" side of the parity test is a literal map, not derived

hooks/codex-unsupported.test.mjs:92-102 hardcodes which Claude pairs are natively routed. The structural assertion at :110-116 only checks that multi-codex-hook.mjs is on that Codex event, which was already true on main for all four events. If nativeRouteForLead stopped routing, test 1 would still pass; test 2 (:117-146) catches it by behavior, so coverage exists, just not in the contract test. Fix: export the routed list from hooks/multi-codex-hook.mjs (e.g. `export const NATIVE_ROUTES = { SessionStart: ['scripts/wiring-check.mjs'], UserPromptSubmit: ['hooks/backlog-notice.js'], PostToolUse: ['hooks/backlog-notice.js'], Stop: ['hooks/backlog-notice.js'] }`), have nativeRouteForLead read it, and build the test map from it plus the multi-inbox pairs.

## MINOR 4. Acceptance evidence is not at this sha; record is stale

Spec acceptance needs `codex exec "hi"` in a scratch Codex home showing the wiring and backlog lines. docs/work/wr-2026-09-28-codex-parity.record.md says native proof is pending, `Evidence: none`, and `Artifact:` names b0e7ee1, not 0b9d020. The last Log line is the builder gate (13 and 7 pass), which is present. Required fields Lead-session, Owner, Spec-session, Spec-from, Base and Scratch are all present. Fix: root runs the live proof, updates Artifact to the merged sha and adds the evidence path before accept. Not a code defect.

## NIT 5. Backlog cadence is shared across hosts on one machine

The route reuses backlog-notice's sentinel under the same AGENTS_HOME, so a Claude and a Codex pane on one host share the 120-second cadence; one can suppress the other's line. Acceptable, but worth one line in docs/backlog-notice.md.

Checked and fine: several-matcher entries (claudePairs walks every group and hook), renamed scripts (regex takes the path from the command, so a rename shows up as a new uncovered pair), Stop copying systemMessage into additionalContext matches the wrapper's stated Codex contract (multi-codex-hook.mjs:6-7), census horizon paragraph (docs/census.md:490) is honest: it states the two-UTC-day, depth-three, canonical-home horizon, says a Claude reviewer cannot join through --tasks, and says unavailable is never zero. codex/README.md janitor addition is correct.

Fixes 1 and 2 are text-only; with them I would approve.
