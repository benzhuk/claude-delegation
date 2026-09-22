# Goals

Ben's goals for the delegation plugin, in his words. Quoted lines are his, with the date he said them. Lines marked *(mine)* are the lead's wording where Ben has not stated one; edit or strike them. Status changes only in a release commit, with evidence. Status values: MET, PARTIAL (mechanism exists, measure not passed), NONE (no mechanism), UNKNOWN (never measured).

The five-line card in `docs/goals/card.md` is the summary that every session sees. This file is its source. The card and this file are mirrored to the Notion Goals page; comments there (lines starting `**`) are acted on and removed by the lead.

## Tokens, speed and quality

> "They work great but are too expensive in tokens. We want to significantly improve token use while maintaining or increasing all the benefits." (2026-09-21)

> "i don't want to gate work, just optimize token use for maximum quality output." (2026-09-20)

> "we are doing a lot of work to cut tokens, which is good, but it's time to turn our attention to speed of deliverables and quality." (2026-09-21)

Measure: token census per build (lead, orchestrator, executors by model), wall clock from spec to accepted, rework (fix-after-feat, recurring failure classes), before and after each change.
Status: PARTIAL. The ladder runs (Fable spec, Opus loop, Sonnet builders). Savings unmeasured against quality: the census counted the wrong agents, and no wake or Stop-block count exists. (lane A, lane B, 2026-09-22)

## The lead takes few turns; tools run in the cheapest agent

> "I think you are taking too many turns, at least from what I can see! Think about our plan and how to fix this." (2026-09-21)

> "one major tooling direction is to run tools in the cheapest subagent that achieves the goal and read the results in a higher level agent." (2026-09-21)

Measure: lead turns per build; share of tool output read by the top tier.
Status: PARTIAL. 19 and 67 orchestrator turns on the two loop builds against 152 hand-run. Lead dispatch latency was 29 percent of one build's wall clock. (census 2026-09-22)

## Simplest architecture, no house of cards

> Two weeks "lost to house of cards patch style castles." (2026-09-20)

> "as always, do research with subagents, don't just jump to conclusions!" (2026-09-21)

Measure *(mine)*: consecutive releases on one surface is the drift warning; every change names the goal it serves.
Status: PARTIAL. The goal-card hook has shipped since 0.8.0 but the card was first written on 2026-09-22. Releases 0.3 to 0.5 and 0.12 to 0.13 all went to the notes surface. (lane E)

## One package, the same on every machine, tested everywhere at once

> All building skills "fold into this one package, coordinated and working together," including what pane setup Ben runs. (2026-09-21)

> "canary not worth a week of bad work! We need to maximize our chances of quality. Plus I do very different work on the diff machines so it's a bad test... So let's implement our best plan and test it everywhere." (2026-09-21)

Measure: wiring check one line per machine that can actually fail; a pane setup backed by the census; every rule mechanical or a stated goal.
Status: PARTIAL. 0.13.0 on four machines. Wiring check cannot go red (7 of 9 rows info-only); two hooks lack a kill switch; pane-setup.md describes a setup Ben does not run. (lane C)

## Nothing stalls silently

> Solving orchestrator stalling "is part of the skills work and important." (2026-09-21)

> "i think fyi and ack shouldn't wake, i don't think we have enough evidence to change this. it was a good arch decision in the first place to save tokens!" (2026-09-22)

Measure: delivery outcomes per machine per week; asks answered vs open; wakes per build.
Status: PARTIAL. Delivery works but send-time deliveries log nothing, so the log cannot show it. Two RESULT notes waited 6h54m and 57m unread. Subagent hook events consume the lead's notes (no agent_id gate). (lane B)

## Decisions have one home and are kept current

> "any note from me in notion is a line prefaced with **, this should be in our skill already, and all the notes must be acted on and removed from the doc for when you next hand it to me." (2026-09-22)

> "the decisions notion skill should make sure the goals are kept up to date!" (2026-09-22)

Measure: the decisions reader reports zero unacted comments and a current goals mirror before any hand-back; zero decisions handed back in chat.
Status: NONE. The reader exists but nothing runs it; the skill says "state in chat too"; items were written outside its shape; the Done line was ticked with items open. (reader run 2026-09-22 16:55 NY)

## Learning reaches every machine

Statement *(mine)*: what one session learns reaches every machine, and stale lessons stop governing.
Measure: sessions that open a topic file; inbox notes pending; a lesson that replaces another links to what it replaces.
Status: NONE. Memory never syncs; knowledge inboxes untriaged since 07-28; topic files opened 0 times by either lead session. (lane D)

## Cleanup has an owner

> "The janitor may apply its safe class daily and show you the table. Yes." (2026-09-20)

Measure: the safe-class run scheduled daily, its table shown.
Status: PARTIAL. Janitor reports (48 SAFE, 5 JUDGMENT on 2026-09-22) but is unscheduled and has never acted.
