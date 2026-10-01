# Plan to DONE, as of 2026-09-30 4:08 PM NY (commit a3aa244b; the header first said 12:50 PM, a clock I had not re-read)

DONE (goal card): a build goes spec to accepted through the plugin, led once from Claude and once from Codex with a mixed handoff, lead under 20 turns, mid tier builds, high tier reviews, nothing lost or stalled, and the census beats the hand-run build on all four measures.

The hand-run bar (lane 61, medians of five builds): 17.3M top-tier tokens, 4.70 h ask to accepted, 0 rework after acceptance, 1 lost or stalled.

Where the two most recent plugin builds sit against it, from their own records:
- Lane 40 (Codex lead, daily triage): about 196M top-tier tokens including cache, about 9 h, 19 native lead turns, stalls unsupported. Detached Claude executors and reviewers were outside the counted graph, so the true token number is higher.
- Lane 60 (Claude lead, secret guard): about 99M Opus tokens, 5.25 h, 59 lead turns.

So the gap is cost first (5 to 11 times the bar), hours second (1 to 2 times), and two measures the census cannot yet see (stalls on Codex-led builds, rework attribution).

## A. Instrument first: the census must see what it judges
1. Detached Claude roles in a Codex-led build are not counted. Census collects shell-launched Claude sessions by lane and adds their tokens and turns. Measure: top-tier tokens per build becomes complete. Same class as lane 40b, so it opens now.
2. Stall attribution on Codex-led builds is unsupported. Census reads Codex rollouts for idle gaps and hook wake-ups the way it reads Claude transcripts. Measure: lost or stalled.
3. Rework after acceptance is not attributed. Lane 59b was a fix to lane 59 after acceptance and the census counted it as a new lane. Census links a follow-up lane to its parent through the record and counts it as rework. Measure: rework after acceptance.
4. Cache and non-cache tokens: baseline and census must use one definition. State it in both files, recompute the baseline if the definitions differ.
5. 10/1 3:00 PM NY: bearings read of the 0.20.18 window with the repaired reader. It rules CONTINUE or RE-PLAN on the whole line.

## B. Cost: top-tier tokens per build
6. One Workflow per build from the lead pane: builders, reviewers, fix rounds and the integrator gate run inside one script, the lead reads one result per phase. Today a build costs 40 to 60 lead turns of collect and dispatch. Measure: top-tier tokens per build and hours. This is the DONE build's shape.
7. Spec rounds: lane 40 went through four spec revisions, each with an Opus red team. One red-team round, then build; later ambiguities are resolved by a ruling in the record, not a new spec. Measure: tokens, hours.
8. Review rounds: lane 60 took three red-team rounds, lane 40 three code reviews plus deltas. Mid tier runs contract tests and the focused suite before any Opus review is spawned, and a reviewer is spawned only on a green builder gate. Measure: Opus tokens per accept.
9. Suite runs: every lane ran the full 3,300-test suite two to five times per host. Fix rounds run the focused suite; the full suite runs once per host at accept. Measure: hours.
10. Lead-facing notes: lane 40 sent about thirty notes to the lead, most of them asks the spec or recipe should have pinned. Census counts notes per build; the number goes into the record as a cost line. Measure: tokens.

## C. Reliability: nothing lost or stalled
11. Windows Orca panes freeze when occluded (one 7.5 h host stall, a 15 h lane 61 hold). The plugin cannot fix Orca, but the stall census must flag a pane whose transcript stops while work is open, and the lead brief must say a PostToolUse guard report is a report, never a block.
12. Secret guard false positives: two patterns narrowed in lane 60, the denoised-prose detector still open, and briefs that say "stop on any guard message" turn a report into a stall. Measure: denials per build, read from the guard's new log.
13. Stale sessions run the plugin version they started with. The BTO session on Netcup runs 0.1.1 and has no delete guard, which is why Ben still sees delete prompts. A SessionStart check compares the running plugin version with the installed one and prints a one-line restart advisory. Measure: lost or stalled.
14. Multi inbox registration bug: subagent hook events re-register the lead's inbox under the subagent's cwd, so notes land in a probe directory. Register from main-session events only, and refuse a recipient repo that is not a git checkout.
15. Codex hook failure Ben saw this morning: cause unknown, needs the error line. Every Codex hook runs clean by hand.
16. Decisions page: the publish-without-pickup redesign, the pickup handoff flag that nothing clears, and the full-page table lint that blocked lane 40's bearings publication. The table lint is fixed (lane 63). Added 9/30: the page wedged again when Done was cleared without accounting the round and Ben then answered new items; the pickup could not account the old round (new owner input on the page, and the attestation is bound to the first lead that ever ran it) and publish could not write. Fix: clearing Done and accounting the round are one step, a round whose inputs are all quoted on origin is admitted as closed, and the owner binding follows the lead that runs the pickup. First lane on resume, with the worktree location rule.

## D. The DONE builds themselves
17. Goal card gate lane (Ben ticked): a repo with no card drafts one, the page holds it, the dispatch guard refuses spawns until it is ticked, and every record names a measure from it.
18. Claude-led DONE build through the Workflow shape, with Codex as builder or reviewer, censused against the bar.
19. Codex-led DONE build the same way, with Claude roles counted (needs item 1).

## E. Hygiene, all small, all waiting on the 0.20.19 install
20. Install 0.20.19 on all four machines after the read, janitor first run (about eleven leftover worktrees and a scratch checkout), daily triage first run (80 inbox notes), Mac retention and Mac guard when it answers, Netcup dotfiles conflict (Ben's).
21. Held items: lane 57 scanner simplification, lane 39 BOM decode and history template dash, notion.js archive verb, dotfiles skill copy removal, identity-guard false positive, the idle Hetzner pane (lane 45 silent since 9/28).

## Order
Now, before the read: items 1, 2, 3 and 4 (instrument), because the read judges with them. After the read: 6, 17, 7 to 10 as one cost lane with the Workflow shape, 11 to 14 as one reliability lane, then 18 and 19. Items 20 and 21 ride the install.
