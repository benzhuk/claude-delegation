# Goals

What Ben wants from the delegation plugin, written as decision rules an agent can apply. The aim and its four measures come first; each goal below has the statement, Ben's own words that set it (with the date), the measure, and a status. Status changes only in a release commit, with evidence: MET, PARTIAL (mechanism exists, measure not passed), NONE (no mechanism), UNKNOWN (never measured).

The five-line card in `docs/goals/card.md` is the summary every session sees at start and during long stretches. This file is its source. Both are mirrored to the Notion Goals page, where Ben comments with lines starting `**`; the lead acts on or answers every one.

## The aim

Agent work gets cheaper, faster and more reliable at equal or better quality, on any agent host, Codex and Claude Code first. Nothing here is about waiting for Ben to spec work by hand: agents find and do valuable work on their own; the harness exists so that this costs less, finishes sooner and loses nothing.

A change to the harness is made only if it improves one of these four measures and worsens none. Each change names the measure it will move, and the next census checks it: that is how the project learns. Each measure has a definition, a baseline and a place it is read, so an agent can check a proposal against it:

| Measure | Definition | Baseline (2026-09-22) | Read from |
|---|---|---|---|
| Top-tier tokens per build | Fable and Opus tokens spent from spec to accepted, all roles | hand-run next-build: lead 152 turns; loop package-build: 19 orchestrator turns | build-census (per Workflow run id) |
| Hours ask to accepted | wall clock from Ben's go to integrator PASS accepted | package-build 50 min through the loop; rename-build 3 h 40 with 29 percent lead dispatch latency | docs/work records |
| Rework after acceptance | fix commits and review rounds on a shipped territory within 7 days; recurrence of a named failure class | Co-Authored-By trailer class recurred across 87 commits | git log, records |
| Work lost or stalled | admitted work ids without a result; loud notes unread over 30 min; orchestrators idle awaiting a nudge | two RESULT notes waited 6 h 54 and 57 min; 3 of 7 loud notes logged no-inbox | flush log, ledger, records |

How the card's lines are applied:
- NOT waiting to be asked: an agent that sees a change passing the four-measure test proposes and builds it; Ben's word is needed only to merge to main or touch a machine, never to start.
- NOT more parts than the simplest design: when two designs meet the requirement, the one with fewer files, states and steps wins; a proposal names the aim it serves before its design.
- NOT a fix aimed at a symptom: when something breaks, name the aim the broken thing serves and redesign for that; never add a retry, watcher or guard on top of the failing part.
- NOT a new mechanism while an existing one is unfed or unmeasured: before building, check whether a shipped mechanism only lacks its input file, its schedule or its measure; feed it first.
- NOT a rule no script checks: a rule enters a skill only with the script, test or guard that checks it, or it is a stated goal here.
- NOT top-tier execution: Fable and Opus plan, adjudicate and review; Sonnet and Haiku run tools, pulls, censuses, builds and Notion writes.
- NOT a host-specific primitive as the shared contract: goals, work records, skills, memory and notes are the same for every host; only the thin host integration (hooks, discovery, wake-up) differs, and an unsupported capability is stated, never faked.
- DONE is a test with numbers, run once from a Claude lead and once from a Codex lead with a mixed handoff between them.
- STOP is the agent's brake, not Ben's: when the bearings check returns RE-PLAN twice in a row or CUT, the agent stops that lane, puts it on Ben's decisions page as options, and works another lane. Killing a direction after two weeks without progress is Ben's call, made by him.

## Cut token cost hard, lose no benefit

The agents already work well. What is wrong is the price: top-tier tokens spent on wakes, re-read context and execution work a cheaper model could do. Cut that cost a lot, keep every hook, wake and unblocked piece of work that earns its place, and never slow or gate work because a meter is high.

In Ben's words: "They work great but are too expensive in tokens. We want to significantly improve token use while maintaining or increasing all the benefits." (9-21) "i don't want to gate work, just optimize token use for maximum quality output." (9-20)

Measure: token census per build by model and role, before and after each change; wakes and Stop-blocks per build.
Status: PARTIAL. The ladder runs (Fable spec, Opus loop, Sonnet builders). Savings unmeasured against quality: the census counted the wrong agents, and wakes are not counted. (2026-09-22 audit)

## Speed and quality count as much as tokens

Deliverables should arrive faster and better, not just cheaper. Measure the time from ask to accepted result and the rework after it with the same rigor as tokens, and stop a token saving that costs either.

In Ben's words: "we are doing a lot of work to cut tokens, which is good, but it's time to turn our attention to speed of deliverables and quality." (9-21) "We need to maximize our chances of quality." (9-21)

Measure: wall clock spec to accepted, dispatch latency per handoff, review rounds, fix-after-feat rate, recurring failure classes, per build.
Status: PARTIAL. One speed census: the lead's dispatch latency was 29 percent of a build's wall clock. No per-build tracking; the trailer failure class recurred uncounted.

## The lead spends judgment, not turns

The top-tier lead plans, adjudicates and synthesizes. Tools run in the cheapest agent that can do the job and their results are read one tier up. The lead takes few, large turns and never a turn per subagent completion.

In Ben's words: "I think you are taking too many turns, at least from what I can see! Think about our plan and how to fix this." (9-21) "one major tooling direction is to run tools in the cheapest subagent that achieves the goal and read the results in a higher level agent." (9-21)

Measure: lead turns per build; share of tool output read by the top tier.
Status: PARTIAL. 19 and 67 orchestrator turns on the two loop builds against 152 hand-run.

## Simplest architecture, rethought from the aim

When something breaks, do not patch the symptom, add a watcher to a watcher, or build a second engine. Go back to the aim, research what others do, and pick the simplest design that serves it. The goal stays in view over long autonomous stretches.

In Ben's words: two weeks "lost to house of cards patch style castles." (9-20) "as always, do research with subagents, don't just jump to conclusions!" (9-21)

Measure: the goal card in every session; the bearings check's verdict; every change names the goal it serves.
Status: PARTIAL. The card hook shipped in 0.8.0; the card was first written 2026-09-22. Seven releases went to main on 2026-09-23 with no bearings verdict between them.

## Progress is checked by a fresh agent, not by the one doing the work

Once a day, and at every release, a fresh high-tier agent with no session context reads the goals, the card and the day's evidence and answers Ben's four questions. Its verdict is CONTINUE, RE-PLAN or CUT, written as a dated entry on Ben's decisions page. The lead answers it in its own words. This is the standing test of the project; its ranked failures pick the next build.

In Ben's words: "have we made significant progress towards the goal? have we gotten sidelined on some too-specific sub-project? have we spent time on a castle of patches instead of going back to the architecture and simplifying? are we still building towards the simplest possible solution that solves our actual core problem? part of the plugin should be this constant check, I think once a day is a good cadence, but we need a separate and specific skill for this in my opinion." (9-23)

Measure: bearings entries on the decisions page per week; RE-PLAN verdicts that changed the plan; lanes stopped by CUT.
Status: PARTIAL. The bearings skill shipped in 0.16.0 and one baseline ran on 2026-09-23; the 2026-09-24 bearings returned RE-PLAN but was run by the lead, so it does not count as independent, and the STOP line's count of RE-PLAN verdicts starts over from the next independent run; the due-notice reaches the model instead of Ben.

## Any agent host, Codex and Claude Code first

The plugin gives work-management skills to every LLM agent and lets different agents collaborate. Codex and Claude Code are both first-class from the start; complete coverage of those two is the baseline, not the boundary. Goals, work records, skills, memory and notes are host-independent; host integrations are thin and verified.

In Ben's words, as recorded by Astra on 9-23: "a plugin that gives work-management skills to all LLM agents and lets different agents collaborate. Codex and Claude Code are both first-class initial targets."

Measure: the DONE build run from each host; mixed handoffs that pass the same hand-back check; capabilities marked unsupported per host.
Status: PARTIAL. Skills, roles and hooks mirror to Codex; a Codex-led build through the plugin has not been run end to end.

## One package, the same on every machine, tested everywhere at once

Every building skill lives in this one plugin and works as one system: delegate, team-build, multi, decisions, bearings, janitor, notion-writing, and the pane setup Ben actually runs. A change goes to every machine at once with hooks on; no canary week. Every rule is mechanical or a stated goal, every hook has a kill switch and fails open.

In Ben's words: all building skills "fold into this one package, coordinated and working together." (9-21) "canary not worth a week of bad work! ... Plus I do very different work on the diff machines so it's a bad test. So let's implement our best plan and test it everywhere." (9-21)

Measure: a wiring check per machine that can actually fail; a pane setup backed by the census; zero prose-only rules.
Status: PARTIAL. Windows, Mac, Hetzner and Netcup installed the 0.20.6 release on 2026-09-24 through their existing Claude marketplace/plugin route and Codex shared mirror (docs/work/evidence/four-host-0206-and-live-pickup.md); the 0.20.7 card-cap change is installed nowhere yet as of this writing. Wiring check cannot go red; pane-setup.md describes a setup Ben does not run.

## Nothing stalls silently

No session waits unnoticed and no piece of work is lost. Peer notes reach their reader, asks get answered, an orchestrator that stops gets moved. Idle panes are woken only when there is something to act on: FYI and ACK are read from the ledger, never a wake.

In Ben's words: solving orchestrator stalling "is part of the skills work and important." (9-21) "i think fyi and ack shouldn't wake ... it was a good arch decision in the first place to save tokens!" (9-22)

Measure: delivery outcomes per machine per week; asks answered vs open; wakes per build.
Status: PARTIAL. On 2026-09-23 three notes to the Codex lead were marked seen without reaching it, and a blocked deploy was never reported; the launcher and cursor defects were fixed in 0.18.1.

## Decisions and goals have one home that Ben reads

Ben's decisions live on one Notion page, in a shape the reader checks, never handed back in chat. His notes there (lines starting `**`) are acted on and closed, or answered in place and archived. The Done box is Ben's submit button: he ticks it when he has finished answering and commenting, the owning agent picks that up, accounts for every input, and clears it with the time. The goals are kept current on their own page from this file, at every release.

In Ben's words: "any note from me in notion is a line prefaced with **, this should be in our skill already, and all the notes must be acted on and removed from the doc for when you next hand it to me." (9-22) "the decisions notion skill should make sure the goals are kept up to date!" (9-22) A "Done (timestamp when last cleared)" checkbox "to let the agent know that the builder is done answering questions and adding comments." (9-23, to Astra)

Measure: the hand-back check passes (zero unanswered notes, zero page warnings, goals mirror at the current commit) before any link is given; zero decisions in chat.
Status: PARTIAL. The reader, hand-back check and pickup shipped in 0.14.0 to 0.17.0; the scheduled pickup ran unattended at 8:25 AM on 2026-09-24 and returned PICKUP_NO_ACTION with Done false (docs/work/evidence/four-host-0206-and-live-pickup.md); a checked-Done handback has still never happened.

## What one session learns reaches every machine

A lesson learned on one machine is available on all of them without hand-carrying, and a lesson that is superseded stops governing. Corrections over volume.

In Ben's words: none yet; this is the lead's statement of his intent from the 09-20 plan. Edit it.

Measure: sessions that open a topic file; inbox notes pending; superseded lessons linked to their replacement.
Status: NONE. Memory never syncs; 44 knowledge notes pending in the inbox on 2026-09-24; topic files opened 0 times by either lead session.

## Cleanup has an owner

Stale worktrees, branches and leftovers are removed by a mechanical janitor that acts only on the provably safe class, daily, and shows Ben the table.

In Ben's words: "The janitor may apply its safe class daily and show you the table. Yes." (9-20)

Measure: the safe-class run scheduled daily, its table shown.
Status: PARTIAL. Janitor reports (48 SAFE, 5 JUDGMENT on 2026-09-22) but is unscheduled and has never acted.
