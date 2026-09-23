<callout icon="🎯" color="gray_background">
	**Mirror of `docs/GOALS.md` and `docs/goals/card.md` in the plugin repo, main at test.** To comment, add a line starting with ** anywhere on this page. The lead acts on every such line, changes the repo, then uses a fresh targeted attended update and readback. Surrounding human content is preserved.
</callout>
<callout icon="🃏" color="blue_background">
	**The card every session sees** (five lines, injected at session start and every 40 tool batches)
	GOAL: My agents do the work I have already authorized, well and fast, with little from me, at far fewer top-tier tokens than today. Every benefit of the current setup stays or grows.
	NOT: patching symptoms into a house of cards. NOT: a second engine. NOT: waiting a week to test; the best plan goes to every machine at once.
	DONE: one package on every machine; a build runs through it with few lead turns and tools in the cheapest agent; nothing stalls silently; decisions and goals live where I read them; tokens, time and rework beat the hand-run build.
	KILL: a third fix release in a row on one surface, or two weeks on a goal with no mechanism: stop and rethink from the aim. Budget: the Fable bar.
	SOURCE: docs/GOALS.md (mirrored to the Notion Goals page)
	GOAL and NOT are your words. DONE and KILL are mine, for your edit. The card is capped at 800 bytes by a constant in the plugin; say so if you want it longer.
</callout>
Quoted lines below are yours, with the date you said them. Lines marked *(mine)* are the lead's wording where you have not stated one. Status changes only in a release commit: MET, PARTIAL (mechanism exists, measure not passed), NONE (no mechanism), UNKNOWN (never measured).

# The aim {toggle="true"}
	My agents do the work I have already authorized, well and fast, with little from me, at far fewer top-tier tokens than today. Every benefit of the current setup stays or grows. When something breaks, go back to this aim and find the simplest design that serves it.
	<span color="red">**UNKNOWN**</span>
	<empty-block/>
# Cut token cost hard, lose no benefit {toggle="true"}
	The agents already work well. What is wrong is the price: top-tier tokens spent on wakes, re-read context and execution work a cheaper model could do. Cut that cost a lot, keep every hook, wake and unblocked piece of work that earns its place, and never slow or gate work because a meter is high.
	In Ben's words: "They work great but are too expensive in tokens. We want to significantly improve token use while maintaining or increasing all the benefits." (9-21) "i don't want to gate work, just optimize token use for maximum quality output." (9-20)
	Measure: token census per build by model and role, before and after each change; wakes and Stop-blocks per build.
	<span color="orange">**PARTIAL**</span> The ladder runs (Fable spec, Opus loop, Sonnet builders). Savings unmeasured against quality: the census counted the wrong agents, and wakes are not counted.
	<empty-block/>
# Speed and quality count as much as tokens {toggle="true"}
	Deliverables should arrive faster and better, not just cheaper. Measure the time from ask to accepted result and the rework after it with the same rigor as tokens, and stop a token saving that costs either.
	In Ben's words: "we are doing a lot of work to cut tokens, which is good, but it's time to turn our attention to speed of deliverables and quality." (9-21) "We need to maximize our chances of quality." (9-21)
	Measure: wall clock spec to accepted, dispatch latency per handoff, review rounds, fix-after-feat rate, recurring failure classes, per build.
	<span color="orange">**PARTIAL**</span> One speed census: the lead's dispatch latency was 29 percent of a build's wall clock. No per-build tracking; the trailer failure class recurred uncounted.
	<empty-block/>
# The lead spends judgment, not turns {toggle="true"}
	The top-tier lead plans, adjudicates and synthesizes. Tools run in the cheapest agent that can do the job and their results are read one tier up. The lead takes few, large turns and never a turn per subagent completion.
	In Ben's words: "I think you are taking too many turns, at least from what I can see! Think about our plan and how to fix this." (9-21) "one major tooling direction is to run tools in the cheapest subagent that achieves the goal and read the results in a higher level agent." (9-21)
	Measure: lead turns per build; share of tool output read by the top tier.
	<span color="orange">**PARTIAL**</span> 19 and 67 orchestrator turns on the two loop builds against 152 hand-run.
	<empty-block/>
# Simplest architecture, rethought from the aim {toggle="true"}
	When something breaks, do not patch the symptom, add a watcher to a watcher, or build a second engine. Go back to the aim, research what others do, and pick the simplest design that serves it. The goal stays in view over long autonomous stretches.
	In Ben's words: two weeks "lost to house of cards patch style castles." (9-20) "as always, do research with subagents, don't just jump to conclusions!" (9-21)
	Measure: the goal card in every session; consecutive releases on one surface is the drift warning; every change names the goal it serves.
	<span color="orange">**PARTIAL**</span> The card hook shipped in 0.8.0; the card was first written 9-22. Five of eleven releases went to one surface before that.
	<empty-block/>
# One package, the same on every machine, tested everywhere at once {toggle="true"}
	Every building skill lives in this one plugin and works as one system: delegate, team-build, multi, decisions, janitor, notion-writing, and the pane setup Ben actually runs. A change goes to every machine at once with hooks on; no canary week. Every rule is mechanical or a stated goal, every hook has a kill switch and fails open.
	In Ben's words: all building skills "fold into this one package, coordinated and working together." (9-21) "canary not worth a week of bad work! ... Plus I do very different work on the diff machines so it's a bad test. So let's implement our best plan and test it everywhere." (9-21)
	Measure: a wiring check per machine that can actually fail; a pane setup backed by the census; zero prose-only rules.
	<span color="orange">**PARTIAL**</span> 0.13.0 on four machines. Wiring check cannot go red; two hooks lack a kill switch; pane-setup.md describes a setup Ben does not run.
	<empty-block/>
# Nothing stalls silently {toggle="true"}
	No session waits unnoticed and no piece of work is lost. Peer notes reach their reader, asks get answered, an orchestrator that stops gets moved. Idle panes are woken only when there is something to act on: FYI and ACK are read from the ledger, never a wake.
	In Ben's words: solving orchestrator stalling "is part of the skills work and important." (9-21) "i think fyi and ack shouldn't wake ... it was a good arch decision in the first place to save tokens!" (9-22)
	Measure: delivery outcomes per machine per week; asks answered vs open; wakes per build.
	<span color="orange">**PARTIAL**</span> Delivery works but is not logged on the direct path; two results waited hours unread; subagent hook events consume the lead's notes.
	<empty-block/>
# Decisions and goals have one home that Ben reads {toggle="true"}
	Ben's decisions live on one Notion page, in a shape the reader checks, never handed back in chat. His notes there (lines starting `**`) are acted on and closed, or answered in place and archived. The goals are kept current on their own page from this file, at every release.
	In Ben's words: "any note from me in notion is a line prefaced with **, this should be in our skill already, and all the notes must be acted on and removed from the doc for when you next hand it to me." (9-22) "the decisions notion skill should make sure the goals are kept up to date!" (9-22)
	Measure: the hand-back check passes (zero unanswered notes, zero page warnings, goals mirror at the current commit) before any link is given; zero decisions in chat.
	<span color="red">**NONE**</span> The reader exists but nothing ran it; the page was repaired by hand on 9-22; the mechanism is specced
	<empty-block/>
# What one session learns reaches every machine {toggle="true"}
	A lesson learned on one machine is available on all of them without hand-carrying, and a lesson that is superseded stops governing. Corrections over volume.
	In Ben's words: none yet; this is the lead's statement of his intent from the 09-20 plan. Edit it.
	Measure: sessions that open a topic file; inbox notes pending; superseded lessons linked to their replacement.
	<span color="red">**NONE**</span> Memory never syncs; knowledge inboxes untriaged since 07-28; topic files opened 0 times by either lead session.
	<empty-block/>
# Cleanup has an owner {toggle="true"}
	Stale worktrees, branches and leftovers are removed by a mechanical janitor that acts only on the provably safe class, daily, and shows Ben the table.
	In Ben's words: "The janitor may apply its safe class daily and show you the table. Yes." (9-20)
	Measure: the safe-class run scheduled daily, its table shown.
	<span color="orange">**PARTIAL**</span> Janitor reports (48 SAFE, 5 JUDGMENT on 9-22) but is unscheduled and has never acted.
	<empty-block/>
