# Lane 69: goal card gate, Codex-led DONE build (10/1 5:45 PM NY)

Ruling behind this: docs/decisions/history/2026-10-01.md, 5:40 PM. Evidence: docs/work/evidence/2026-10-01-codex-loop-options.md. Lane 40 cost 196M tokens because the Codex lead ran the build loop in its own thread (906 responses, 114M cache re-read). This lane does not.

## The shape
You are the lead: spec, one red-team round at most, rulings in the record, acceptance. You do not spawn builders or reviewers. You hand the build to skills-o by one ASK with the spec as the packet; skills-o runs it through the build-loop Workflow (lane 67 shape) and sends one RESULT when it is on main; you verify from origin and accept. Target: your own turn count under 20 for the whole lane, including this packet. Record both session ids (yours as Lead-session, skills-o's as orchestrator) in the work record so lane 62's census attributes both to this lane.

## Scope, pinned (plan item 17, Ben's tick)
1. A repo with no goal card gets one drafted from its README, GOALS or recent records, written to docs/goals/card.md with Status: draft, and put on the decisions page as a waiting item for Ben's tick.
2. The dispatch guard refuses team-build and delegate spawns in a repo whose card is missing or still draft, with a message naming the file and the page.
3. Every work record names a measure from the card (the `Measure:` line lane 67 added); accept refuses a record whose measure is not one of the card's four.
4. Tests for 1 to 3. Prove 2 and 3 live in a scratch repo under the session scratchpad, never in Code.
Not in scope: changing this repo's card, the bearings skill, any page section but the waiting item.

## Gates
Opus review on record, full suite once on Netcup and once on Hetzner, merge under the 9/26 grant. Worktrees only under <repo>/.claude/worktrees/. A denied command stops the step and is reported, never routed around.

Start only after lane 62 is on main. Say so in your ACK if 62 slips past 10/2 9:00 AM.

## Received / acted
- 2026-10-01 17:19 America/New_York, skills-a: read and acknowledged ownership conditional on lane 62 merging. Fresh origin/main is fc32c522; origin/build/census-completeness-62 is not its ancestor and the lane 62 record remains owned. Lane 69 has not started. Lead session 01a0f8fc-c09f-7e90-bee7-ca5a79141f97 received this request; count this intake in the lead-turn budget. After the prerequisite, the lead writes the spec and rulings, sends one ASK to skills-o for the plugin Workflow, then verifies its RESULT from origin before accepting. Preserve the orchestrator session identity and census attribution in the work record; no driver or direct builder/reviewer spawning by this lead.
- Added 10/1 8:25 PM NY by skills-f (before the lane started): scope item 5, the decisions page header carries the card's one-line GOAL and a link to the Goals page (3e3da11277a1813cb326c42ed97a1d5d), rendered by the decisions renderer from docs/goals/card.md, so Ben sees the card where he reads his decisions. Ben asked for this tonight.
- 8:50 PM NY, skills-f: the 8:25 PM scope item 5 (header link) is SUPERSEDED by lane 72, which puts the full card, the bearings and the components in toggles on the decisions page. Lane 69 scope is back to items 1 to 4.
