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
	<summary>**Which decisions are yours**</summary>
		Now: waiting on your tick \| To finish: you tick, the lead writes the classes into the decisions skill \| Est: default fires 10/3 noon
		Agents today decide on their own when to ask you. Proposal: three classes in the decisions skill, and every item for you carries a default and a time.
		- [ ] Yours: the aim and measures, money, machines, anything irreversible, anything that changes a rule you set. Lead's: lane rulings, ordering, scope inside a ruling. Automatic: anything a script checks. Default fires at the stated time unless you tick (recommended)
		- [ ] Same classes, but nothing defaults: every item waits for your tick
		- [ ] You write the classes as comment lines on this item
		Default after 2026-10-03 12:00 -04:00: the first option
		<empty-block/>
	</details>
	<details>
	<summary>**Goal card v6: the diff to apply**</summary>
		Now: v6 draft ready for your tick \| To finish: you tick, v5 replaced in `docs/GOALS.md` \| Est: one lane after your tick
		You ticked A. The draft is [GOALS-v6-draft](https://github.com/benzhuk/claude-delegation/blob/main/docs/goals/GOALS-v6-draft.md).
		Status words are replaced by Now, To finish, Est on every goal and component.
		The measures table gains a live column written by the census.
		A COMPONENTS table of ten lines, in your plan order.
		The card gains MEASURE and COMPONENTS lines, and its cap moves from 1,200 to 1,600 bytes.
		- [ ] Apply v6 as drafted (recommended)
		- [ ] Apply with changes, I write them as comment lines on this item
		No default: the card is your goal statement
		<empty-block/>
	</details>
	<details>
	<summary>**Lane 62: let six regression tests through the secret guard once**</summary>
		Now: source fixes reviewed, suites running \| To finish: tests land, one review, accept, merge \| Est: 2 h after your word
		The census fixes for lane 62 are built, but the secret guard refused the test file that proves them, a false match on synthetic test text. No agent may route around it, so the 9 AM target is missed. Lane 70 records the refused text for the guard fix.
		- [ ] Edit exception: the same scoped exception you gave lane 68b, for `scripts/census-completeness-62.test.mjs` only, one builder round
		- [ ] One-run lift: in `~/.claude/settings.json` you disable the two `secret-guard.sh` hook entries, tell skills-o, it lands the tests, then you restore the entries
		- [ ] Hold: lane 62 waits for the guard fix in lane 70
		No default: a guard change takes your word
		<empty-block/>
	</details>
	<details>
	<summary>**Janitor policy, one tick**</summary>
		Now: lane 74 builds the classes in report mode \| To finish: you tick, the classes act \| Est: default fires 10/3 noon
		You asked whether the janitor stops the 9/30 mess from recurring. It does not yet. Lane 74 builds the classes below; they act only after this tick and until then report what they would do. Roots: every git repo under `~/Code`, `<repo>/.claude/worktrees`, the session Temp scratch root, `orca/workspaces`, `/var/tmp/lane-*`. Never BTO, never dotfiles.
		- [ ] Dirty worktree with no open record, idle 24 h: commit all of it to archive/\<name\>, push, remove the worktree (recommended)
		- [ ] Unmerged local-only branch with no open record, idle 24 h: push as archive/\<name\>, delete it locally, and remove the clean worktree that holds it (recommended)
		- [ ] Merged origin branches: delete daily (recommended)
		- [ ] Deregistered worktree folders under the roots: archive if they hold changes, then remove (recommended)
		- [ ] Untracked files older than 7 days in a durable checkout: report by path only, never remove (recommended)
		- [ ] Not yet, keep report-only
		Default after 2026-10-03 12:00 -04:00: the five recommended lines
		<empty-block/>
	</details>
	<details>
	<summary>**A fifth measure for output quality**</summary>
		Now: waiting on your tick \| To finish: you tick, the reviewer scores and the census reads it \| Est: one lane after your tick
		The four measures are about the harness. Nothing scores what a build produced beyond rework within 7 days.
		- [ ] Add it: the Opus reviewer gives every accepted build a quality score against its spec, the census reads it, the card shows it (recommended)
		- [ ] Rework after acceptance is enough
		- [ ] You define quality in comment lines on this item
		No default: it changes the aim
		<empty-block/>
	</details>
	<details>
	<summary>**Release 0.20.20 and install on all four hosts**</summary>
		Now: waiting on your word \| To finish: release cut, installs on four hosts \| Est: one morning after your word
		The new-worktree guard (lane 65) and the drift-log fix are on main and installed nowhere; Netcup and Hetzner janitor timers still run 0.20.14 code.
		- [ ] Install now: cut 0.20.20 from main and install on Windows, Netcup, Hetzner and Mac tomorrow morning, timers re-registered (recommended)
		- [ ] Hold: wait for lanes 72 to 74, then one release
		No default: installs take your word per item
		<empty-block/>
	</details>
	<details>
	<summary>**The simplification lane**</summary>
		Now: waiting on your tick \| To finish: you tick, the lane opens one area at a time \| Est: days once opened
		The census has 38 lanes of patches across three scripts, the pickup 21 lanes; three hooks inject text nobody measures; six scripts run over 1,000 lines. Proposal: one lane that replaces, not patches.
		- [ ] Open it now: one census module, pickup rebuilt as a diff of the page against its last render (no rounds, pointers, rebinding), one context hook with a byte budget the census reads, six scripts split under 800 lines. Through the Workflow, one area at a time, each accepted before the next (recommended)
		- [ ] Open it after Codex DONE (lanes 62, 69) lands
		- [ ] Not now
		No default: this rewrites working parts
		<empty-block/>
	</details>
	## What is going on
	The plugin now runs the whole loop by itself: a lane goes from spec to main in one to three hours with Sonnet building and Opus reviewing, and today two lanes were led from Codex end to end, which the goal's finish line requires. Your page and the Goals page are rendered from repo files and can no longer drift. The cost still out of line is mine, and tomorrow morning's bearings check it against a 40M budget; the other open failure is stalls, two today of 3.5 and 5.3 hours, which tonight's lanes attack. Knowledge sharing between machines still does nothing and is next.
	## This session (since your tick at Thu 8:46 PM)
	- Five lanes merged today, each Opus-approved with the full suite green on Netcup and Hetzner: 66, 64, 64b, 65 and 67.
	- Lane 68 part one merged 5:58 PM: a stale-plugin warning per pane, and inboxes register only from the main session.
	- Your B landed as lane 68b at 8:30 PM; the guard narrowing becomes lane 70 when you lift the guard for one run.
	- In progress, goal card v6 (you ticked A). Now: lead drafting v6 from the component analysis \| To finish: diff on this page, you tick, v5 replaced \| Est: tonight for the diff
	- Report states landed as lane 73 at 11:33 PM: DONE, NEEDS BEN, NEEDS a peer, FAILED, plus Now, To finish, Est on open work.
	- Lanes 71, 72, 72b and 73 merged tonight. Next: 74 cleanup. Lane 62 recovery waits on your call about the secret guard.
	- [Component analysis](https://github.com/benzhuk/claude-delegation/blob/main/docs/work/evidence/2026-10-01-component-analysis.md): four islands, ten unowned mess classes, nine items to plan.
	- [Janitor evaluation](https://github.com/benzhuk/claude-delegation/blob/main/docs/work/evidence/2026-10-01-cleanup-vs-janitor.md): one class, nothing removed yet; lane 74 fixes it.
	<callout icon="✅">
		To comment, start a line with `**` anywhere on this page, then tick Done to submit; the answer appears here and the exchange is kept in that day's history file.
	</callout>
	- [ ] Done (last cleared: Oct 1, 2026, 8:51 PM America/New_York)
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
