# Goal card {toggle="true"}
	main at 14174e81
	GOAL: Agent work gets cheaper, faster and more reliable at equal or better quality, on any agent host, Codex and Claude Code first. Change only what improves one of these and worsens none: top-tier tokens per build, hours ask to accepted, rework after acceptance, work lost or stalled. Each change names the measure it will move; the next census checks it.
	NOT: waiting to be asked. NOT: more parts than the simplest design; a symptom fix. NOT: a new mechanism while an existing one is unfed or unmeasured. NOT: a rule no script checks. NOT: top-tier execution. NOT: a host-specific primitive as the shared contract.
	DONE: a build goes spec to accepted through the plugin, led once from Claude and once from Codex with a mixed handoff: lead under 20 turns, mid tier builds, high tier reviews, nothing lost or stalled, census beats the hand-run build on all four measures.
	STOP: bearings says RE-PLAN twice in a row or CUT: stop that lane, put it on Ben's page, work another.
	SOURCE: `docs/GOALS.md`
	<empty-block/>
# Bearings {toggle="true"}
	Decision: CONTINUE (2026-10-01).
	Condition: if by 10/2 3:00 PM no census read of the 0.20.18 window and no spec for item 6 exists on origin, the next bearings should return RE-PLAN on the cost line.
	Next action: run the 9/29 prediction check at 3:00 PM today with the existing `build-census.mjs` (a Sonnet runner, report to disk); it does not need lane 62. Then spec plan item 6.
	Prediction, check 10/2 3:00 PM: origin main holds the window read with the lead's Fable total, the item 6 spec or its opened record, and lanes 64 and 65 merged with both suite results in their records. If the read or the spec is missing, the cost line gets RE-PLAN.
	Links: [Goals page](https://app.notion.com/p/3e3da11277a1813cb326c42ed97a1d5d), [assessment](https://github.com/benzhuk/claude-delegation/blob/main/docs/work/evidence/2026-10-01-bearings-assessment.md), [response](https://github.com/benzhuk/claude-delegation/blob/main/docs/work/evidence/2026-10-01-bearings-response.md).
	<empty-block/>
# Components {toggle="true"}
	- Goal card and goals file (fed): Puts the goal and its four measures in front of every session
	- Goals page mirror (fed): Shows Ben the goal, its state and the card where he reads
	- Work records (measured): Keep each lane's state, owner and evidence so nothing is lost between sessions
	- Evidence and accept gate (fed): Refuses to accept work without an independent review of the exact artifact
	- Sealed tests (measured): Run suites in a private home so a test cannot stall or fill the machine
	- delegate (fed): Fans research and review lanes out to parallel subagents
	- team-build and the build loop (measured): The only route a build takes from spec to accepted
	- multi (fed): Notes and a ledger between sessions and hosts, so asks are not lost
	- Note flusher (fed): Wakes a session that has a waiting note, once a minute
	- Decisions page (fed): Puts what only Ben can decide, and the goal, bearings and components, where he reads
	- Done-tick pickup (fed): Picks up Ben's ticks and comments so his answers are acted on
	- bearings (measured): Checks progress toward the goal and returns CONTINUE, RE-PLAN or CUT with a dated prediction
	- janitor (partial): Reports stale worktrees and branches and removes only the safe ones
	- notion-writing and page-lint (fed): Keep Notion pages in the shape Ben reads and check them by script
	- dev-server (unfed): Starts and stops local servers so none is lost or collides
	- Agent roles (measured): Builder, integrator, reviewer and runner definitions for each host
	- Shared docs (partial): Model tiers, subagent contract, pacing and mandates that briefs cite
	- Pane setup (unfed): A pane layout for running many sessions at once
	- Delegation reminder (fed): Reminds a session to delegate at start and on each prompt
	- Agent dispatch guard (fed): Checks a dispatch against the size and tier rules
	- Delete guard (fed): Refuses recursive deletes by an agent so no lane stalls on a prompt
	- Backlog notice (fed): Tells a session when work is waiting for it
	- Knowledge read logger (measured): Counts how often saved knowledge is read
	- Wiring check (fed): Fails when a required hook, file or setting is missing or stale on a host
	- Discovery and mirror (fed): Installs the plugin and mirrors shared skills to each host
	- Build census (measured): Counts top-tier tokens, hours and wakes per build
	- Four-number read (measured): Reads tokens, hours, rework and stalls for one build
	- Work census (measured): Counts lanes by state and age
	- Token census (unfed): An older token count that counted the wrong agents
	- Collector (fed): Lists accepted branches not yet merged and nudges when they go stale
	- Knowledge triage (partial): Sorts new knowledge notes into the knowledge store
	- Codex host integration (partial): Runs the same build loop from Codex
	- Research (missing): A source-preserving research route
	- Multi-build (missing): One implementation and an alias for parallel builds
	<empty-block/>
# Waiting on you now {toggle="true"}
	<details>
	<summary>**Adopt the revised method**</summary>
		Now: revised after your two objections, waiting on your word \| To finish: you decide go or no-go and appetite, the first bet runs \| Est: two working days if you go
		Revised 10/2 after your two objections. Both were right and the research agrees with you: no engineering source has an outsider write the new design, and no owner-facing practice asks the owner to choose between architectures. Links: [revision](https://github.com/benzhuk/claude-delegation/blob/main/docs/work/evidence/2026-10-02-method-revision.md); deeper reports [alternatives](https://github.com/benzhuk/claude-delegation/blob/main/docs/work/evidence/2026-10-02-research2-alternatives.md), [owner decision](https://github.com/benzhuk/claude-delegation/blob/main/docs/work/evidence/2026-10-02-research2-owner-decision.md), [who redesigns](https://github.com/benzhuk/claude-delegation/blob/main/docs/work/evidence/2026-10-02-research2-who-redesigns.md).
		Problem, in your words: Every complex system built with agents became a pile of patches that never solved the problem. You deferred decisions to Fable, asked for orchestration, and made only the local decisions you were asked. You want to rethink at every planning turn and throw out the architecture for a simpler one without the class of problem, using the learnings from the complexity. Nobody held the problem when you deferred.
		Recommendation: Adopt the revised method and run the first bet, appetite two working days, output one pitch page for the harness and no code. You own a one-page `PROBLEM.md` and the wording of a list of failures you have seen. The lead, who knows the system and its failure history, writes two designs every planning turn, a continue design and a simplest-core design, and recommends one with trade-offs. A Codex reviewer who has read the code argues against it on three checks: wrong problem, added parts no failure demanded, removed parts with no failure named. You read one page with toggles like this one and decide go, no-go and appetite. You never pick a design. A bet stops at its appetite. You judge it on which listed failures stopped.
		Path A, the revised method (recommended): Ends the two classes behind the patch pile: decisions made inside the plan, and no one holding the problem. Costs: four markdown files, one planning turn per bet, a Codex review per turn, nothing built as code. Removes: the goal card as driver, the four-measure rule, bearings as a separate role, the pickup, the census as a decision input. Risks: the lead's own rethink may over-reach (Brooks's second system) and the reviewer is the only brake; a different-model reviewer is untested. Will not do: automate the planning turn.
		Path B, keep the current plan: Card v5, lanes, census, bearings. Ends nothing that caused the pile; twelve lanes on 10/1 moved measures and removed no part. Costs nothing new. Risk: the pattern you described continues.
		Path C, lead decides alone, you judge outcomes only: Same as A but no pitch page; you see only the finished bet and its failure list. Cheapest for you. Risk: the one decision the sources all give the owner, appetite and go or no-go, is gone, and the lead's turns again want to end in a merge.
		Reviewer's objections: None yet, this item was written by the lead alone. The first bet's page will carry Codex's objections unedited.
		- [ ] Go, Path A, appetite two working days (recommended)
		- [ ] Go, Path A, different appetite, write it in a comment
		- [ ] Path C
		- [ ] No-go, comment below
		No default.
		<empty-block/>
	</details>
	<details>
	<summary>**Lift the secret guard for one run (lane 70)**</summary>
		Now: lane 70 and lane 62 parked \| To finish: you pick, lane 70 edits the guard pattern, lane 62 lands its tests \| Est: lane 70 half a day after your word
		Your Hold tick on the guard item says fix the guard first in lane 70. Lane 70 cannot edit the guard's own pattern while the guard is on, which is why it stalled on 10/1: the guard refused the builder's edits to itself. Lane 62 waits behind it.
		- [ ] Lift the secret guard for one supervised run of lane 70 on this host, builder reports the diff before merge (recommended)
		- [ ] I will edit the guard pattern myself, send me the proposed change
		- [ ] Leave both lanes parked
		Default after 2026-10-03 12:00 -04:00: none, both lanes stay parked
		<empty-block/>
	</details>
	## What is going on
	The plugin now runs the whole loop by itself: a lane goes from spec to main in one to three hours with Sonnet building and Opus reviewing, and today two lanes were led from Codex end to end, which the goal's finish line requires. Your page and the Goals page are rendered from repo files and can no longer drift. The cost still out of line is mine, and tomorrow morning's bearings check it against a 40M budget; the other open failure is stalls, two today of 3.5 and 5.3 hours, which tonight's lanes attack. Knowledge sharing between machines still does nothing and is next.
	## This session (since your tick at Fri 5:37 PM)
	- Your two objections checked against the research and upheld; the blank-page designer is retracted.
	- The revised method is on this page in the new pitch format, first under Waiting.
	- Janitor 0.20.20 install in progress on all four machines, your five classes on.
	- [Lead's view of the harness plan](https://github.com/benzhuk/claude-delegation/blob/main/docs/notion/lead-view-architecture-and-plan.md): also a Notion page beside this one.
	<callout icon="✅">
		To comment, start a line with `**` anywhere on this page, then tick Done to submit; the answer appears here and the exchange is kept in that day's history file.
	</callout>
	- [ ] Done (last cleared: Oct 2, 2026, 5:40 PM America/New_York)
	<empty-block/>
# History {toggle="true"}
	- [Oct 2](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/2026-10-02.md) — lane 74 merged to main, and lane 62 went NEEDS BEN on the secret guard.
	- [Oct 1](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/2026-10-01.md) — Ben ended the pause; the lead is now the pane skills-f, and lanes 62, 64, 65 and 66 were dispatched.
	- [Sep 30](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/2026-09-30.md) — Daily knowledge triage is accepted with a repaired census and a live proof that archived all60 selected notes; scheduled installation follows the next release.
	- [Sep 29](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/2026-09-29.md) — Lane56 made Codex advisory-route tests deterministic while retaining real-clock deadline coverage, and Lane55 restored COUNTED historical Codex token and lead-turn rows.
	- [Sep 28](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/2026-09-28.md) — the collector follow-ups landed, so a reinstall keeps --stale-hours and a closed lane stays closed.
	- [Sep 27](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/2026-09-27.md) — lanes merged all day, including the delete guard, the knowledge count, the Windows janitor task and this page's renderer, and a second RE-PLAN reached your page.
	- [Sep 26](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/2026-09-26.md) — eleven lanes merged, including the four-number read and the merge-on-acceptance rule.
	- [Sep 25](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/2026-09-25.md) — four build lanes launched across four hosts, and a review flagged an uncounted stall.
	- [Sep 24](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/2026-09-24.md) — harness ownership passed to this lead, and a launch defect was reported upstream.
	- [Sep 23](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/2026-09-23.md) — the daily bearings check was chosen, and Done's meaning was settled as your submit button.
	- [Sep 22](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/2026-09-22.md) — three releases shipped from the build loop's first live runs.
	- [Sep 21](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/2026-09-21.md) — the overnight merge grant shipped three releases in one night.
	- [Sep 20](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/history/2026-09-20.md) — the decisions page and its reader were built, and guards were wired everywhere.
	- Everything before today's rewrite is kept, byte for byte, in the [Sep 27 archive](https://github.com/benzhuk/claude-delegation/blob/main/docs/decisions/archive/decisions-page-2026-09-27.md).
	<empty-block/>
