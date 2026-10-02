# How to read this page {toggle="true"}
	**The grouping.** Each group below is a component you named in your own plan, in your order, taken from what the repo record shows you asked for on 9/20 to 10/1. Inside a group, each toggle is one built part. Two groups close the page: asks that were dropped, and built parts you never named. The line "Under the revised method" quotes the 10/2 method revision, which is still a proposal on your decisions page. The history I read up to 5:42 PM on 10/2 records no go from you.
	**What the state words mean.** fed: shipped, and something consumes its output. measured: shipped, and a number is read from it. unfed: shipped, and nothing consumes it. partial: some of it shipped, a named part is not. missing: no component exists yet.
	**Generated** 10/2 5:54 PM New York time, from the repo as of the 10/2 evening history.
	<empty-block/>
# Whole package, one plugin everywhere {toggle="true"}
	<details><summary>Plugin manifest and hook registration</summary>
		**What it is for:** your 9/21 words: "fold into this one package, coordinated and working together." One plugin carries every skill, hook and role.
		**What exists today:** the plugin manifest `.claude-plugin/plugin.json`, the Claude hook list `hooks/hooks.json`, and the Codex hook list `hooks/codex-hooks.json`. The Claude list wires seven hooks to session start, each prompt, stop and tool use. The Codex list wires only the delete guard and the multi hook. A third file lists everything Codex cannot run.
		**State today:** not listed in docs/components.md, so it has no state word. The inventory read version 0.20.19 on 10/1. Version 0.20.20 was cut at 236a5fbd and installed on Windows, Netcup and Hetzner on 10/2 at 3:14 PM. The Mac was offline and its install is pending.
		**How it connects:** it registers every hook in this page, and the wiring check reads it against a list of required wiring.
		**Known problems:** installing the plugin leaves every running session on the old hooks. On 10/2 the lead's session loaded the 0.20.19 hooks, and its dispatch guard then refused to spawn agents after 0.20.20 was installed. The fix recorded is a fresh session.
		**Under the revised method:** not named in the revision.
		**Size:** the hooks folder holds 28 files and the plugin folder 2.
		<empty-block/>
	</details>
	<details><summary>Discovery and mirror</summary>
		**What it is for:** the same plugin, with the same skills and roles, on every machine and both hosts. This is the "same on every machine" half of your 9/21 package ruling.
		**What exists today:** `scripts/mirror-shared-skills.mjs` publishes the eight skills, the four roles and the note-send shim to the shared agents folder and to the Codex folder. It also rewires the Codex hooks.
		**State today:** fed. It runs at each install. On 10/1 it ran on Windows first, then on Netcup and Hetzner at 4:00 PM. The Mac did not answer on 10/1 and was offline on 10/2.
		**How it connects:** it reads the skill list of eight, and the required wiring list names it.
		**Known problems:** on 10/1 the Netcup and Hetzner checkouts stayed at 0.20.15 because a local janitor edit to a tracked drift log made the pull refuse. You asked "unstick netcup and hetzner for me" and that was done at 4:00 PM. On 10/2 the lead recorded the same edit again as blocking the mirror rewire in both 0.20.19 and 0.20.20.
		**Under the revised method:** not named in the revision.
		**Size:** the script is 1,309 lines.
		<empty-block/>
	</details>
	<details><summary>Wiring check</summary>
		**What it is for:** make sure the package is really installed and not half-installed. No quote from you.
		**What exists today:** `scripts/wiring-check.mjs` and a list of required wiring that names the hooks, the installer, the mirror, the four roles and the janitor skill.
		**State today:** fed. It runs at every session start through a Claude hook and exits with an error when a required hook, file or setting is missing or stale on that host. By 10/1 it also checks that the note flusher left a recent heartbeat.
		**How it connects:** it reads the hook list, the mirror output and the flusher heartbeat file.
		**Known problems:** none recorded in the analysis, inventory or history.
		**Under the revised method:** not named in the revision.
		**Size:** 565 lines.
		<empty-block/>
	</details>
	<empty-block/>
# Skill set, one build for every project {toggle="true"}
	Your 9/20 ticked answers: "Build everything together as one skill set." and "The skills live in the delegation plugin, for every project, machine and agent." The seven skills you listed sit with the component they serve: delegate and team-build under Lead and tiering, multi under Multi, and so on. Only dev-server has no other home.
	<details><summary>dev-server</summary>
		**What it is for:** start and stop local servers so none is lost or collides. You never named it. The build folded it in on 9/22.
		**What exists today:** `skills/dev-server/SKILL.md`, 94 lines, and nothing else. It sends the work to an outside server-manager tool.
		**State today:** unfed. The skill is installed through the mirror list, but no hook, script, test or other skill calls it.
		**How it connects:** nothing reads it and it reads nothing in the plugin.
		**Known problems:** the 10/1 inventory found zero referrers and no test. The 9/28 component map counted no measure for it.
		**Under the revised method:** not named in the revision.
		**Size:** 1 file, 94 lines.
		<empty-block/>
	</details>
	<empty-block/>
# Goal card, the five-line aim {toggle="true"}
	<details><summary>Goal card and goals file</summary>
		**What it is for:** your 9/20 ticked item: "Goals stay in context as a five-line card". On 9/22 at 5:05 PM, as recorded: "write the card and mirror it in Notion so it is easy to read".
		**What exists today:** the goals file `docs/GOALS.md`, the card `docs/goals/card.md`, and `scripts/goal-card.mjs`, which checks its form and byte cap. A hook library shows the card at session start and after tool batches. A version 6 draft sits in docs/goals.
		**State today:** fed. Hooks show it to the lead every session. No script counts whether a session saw it or whether it changed a decision.
		**How it connects:** the hook library reads the bearings state for a due notice. Every work record names one of the card's measures. The Goals page mirror reads it.
		**Known problems:** on 10/1 you wrote "we need better goal cards in general." On 10/2 at about 3:00 AM you said the card "doesn't seem to embody" the rethinking you wanted. The lead agreed it drove measure discipline, not rethinking. Version 6 stays a draft until the goal line is decided.
		**Under the revised method:** retired. The revision lists "the goal card as the driver" and "the four-measure admission rule" as retired, and says "The card stays on main until PROBLEM.md exists so sessions have something, then it goes."
		**Size:** goal-card.mjs is 640 lines and the hook library 67 lines.
		<empty-block/>
	</details>
	<details><summary>Goals page mirror</summary>
		**What it is for:** your 9/22 ask, as recorded, to mirror the card in Notion so it is easy to read.
		**What exists today:** `skills/decisions/scripts/goals-mirror.mjs` and a Goals page template under the decisions templates.
		**State today:** fed. It renders the Goals page from the repo files. Since lane 72 on 10/1 at 9:51 PM the decisions page also carries a Goal card toggle at the top.
		**How it connects:** it reads the card and goals file and writes the Goals page. The decisions renderer reuses it.
		**Known problems:** on 10/1 after lane 72 merged, every live publish failed its readback check. Lane 72b fixed it by 10:18 PM. The cause was a notion.so link that Notion stores as app.notion.com.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<empty-block/>
# Decisions skill and Notion page, your one home {toggle="true"}
	<details><summary>Decisions page</summary>
		**What it is for:** one place you read, with decisions never in chat. You wrote on 9/22 that "the decisions notion skill should make sure the goals are kept up to date!" On 10/1 you wrote: "part of the notion decisions skill is that the goals card and bearings should be mirrored on the decisions page in their own toggles, i always want immediate access."
		**What exists today:** the skill `skills/decisions/SKILL.md`, the renderer `skills/decisions/scripts/decisions-render.mjs`, read, handback, title and publish scripts, and five page templates. The page shape rule is in the skill's references.
		**State today:** fed. It is published from repo files and was last published on 10/2 at 5:40 PM at main 308734be. Goal card, Bearings and Components toggles sit at the top since 10/1.
		**How it connects:** it reads docs/components.md for the Components toggle, mirrors the goal card and bearings, and runs the page-lint check from notion-writing before it publishes.
		**Known problems:** on 10/2 the publisher refused on this host with an error saying private capture was unavailable, so skills-o published from Netcup. Also on 10/2 the renderer refused nested toggles inside a waiting item, so the pitch page's toggles came out as flat paragraphs. On 10/1 lane 72b was the twenty-second lane on the publish path.
		**Under the revised method:** not named in the revision.
		**Size:** 56 files under the skill. The skill file is 478 lines.
		<empty-block/>
	</details>
	<details><summary>Done-tick pickup</summary>
		**What it is for:** your 9/22 words: "any note from me in notion is a line prefaced with **, ... all the notes must be acted on and removed from the doc for when you next hand it to me."
		**What exists today:** `skills/decisions/scripts/decisions-pickup.mjs` and a contract test. It works through private captures, rounds, pointer files and attestation.
		**State today:** fed. Round 5 was captured when you ticked Done on 10/2 at 5:42 PM. Where the pickup is registered is per host and not in the repo.
		**How it connects:** it reads your ticks and comments from the page and feeds the history files and the lead.
		**Known problems:** 21 lanes touched it by 10/1. On 10/2 at 3:01 PM it failed with a private capture unavailable error, and skills-o read your ticks from the live page instead. The same day the janitor ticks could only be read after the page's escaped archive name was quoted.
		**Under the revised method:** retired. The revision's list of what is retired includes "the decisions pickup".
		<empty-block/>
	</details>
	<empty-block/>
# notion-writing, the page rules in the skill {toggle="true"}
	<details><summary>notion-writing and page-lint</summary>
		**What it is for:** your 10/1 words, written 8:41 PM: "part of writing the notion is that everything should be in toggles planned in an intelligent way to make it easy for me to find a section then zoom in. make that part of the skill so the notion is always written in the best way by all future sessions, not just remembering from your context."
		**What exists today:** `skills/notion-writing/SKILL.md`, `skills/notion-writing/scripts/page-lint.mjs`, and a small helper that masks fixtures. The skill carries your page rules as numbered checks.
		**State today:** fed. The decisions renderer calls the lint before every publish. It checks page shape and AI byline patterns. Lane 72 on 10/1 added the toggle-shape rule.
		**How it connects:** the decisions page runs it. Every other page is checked by hand.
		**Known problems:** the rule that the Notion author property reads Ben Zhuk has no script check. The lint does not count toggles on read-back. The mask helper has no caller outside its own test.
		**Under the revised method:** not named in the revision.
		**Size:** the skill is 186 lines in 9 files.
		<empty-block/>
	</details>
	<empty-block/>
# Bearings, the daily check {toggle="true"}
	<details><summary>bearings</summary>
		**What it is for:** your 9/23 words: "part of the plugin should be this constant check, I think once a day is a good cadence, but we need a separate and specific skill for this in my opinion". A fresh high-tier agent asks your four questions.
		**What exists today:** `skills/bearings/SKILL.md`, `skills/bearings/scripts/bearings-state.mjs`, and an evidence template. Assessments exist for 9/28, 9/29 and 10/1, and the 10/1 verdict was CONTINUE.
		**State today:** measured. A due notice reaches sessions through the goal card hook. On 10/2 the lead did not run the due check, recording that "a verdict against the superseded card would be theater".
		**How it connects:** the goal card hook reads its state. Since lane 72 the decisions page carries a Bearings toggle.
		**Known problems:** nothing reads a verdict. The 9/29 prediction check due 10/1 at 3:00 PM was not run. The card's STOP line is prose.
		**Under the revised method:** fold into the independent reviewer. The revision retires "the bearings judge as a separate role (its three questions move into the reviewer's checks)".
		**Size:** the skill is 75 lines in 4 files.
		<empty-block/>
	</details>
	<empty-block/>
# Janitor, cleaning up as we go {toggle="true"}
	<details><summary>janitor</summary>
		**What it is for:** your 9/20 words: "The janitor may apply its safe class daily and show you the table. Yes." On 9/26: "make it a key part of our plan, another component". On 9/28 at 2:50 PM: "including janitor, removing tmp files with it (and setting them up so they can be removed), cleaning up worktrees and branches as we go".
		**What exists today:** `skills/janitor/SKILL.md` and `scripts/janitor.mjs`. It reports two classes, safe and judgment, and acts only on safe.
		**State today:** partial. Version 0.20.20 was installed on 10/2 at 3:14 PM on Windows, Netcup and Hetzner with timers and your five-class policy. The Mac is pending. The first acting run is 10/3 at 6:00 AM. Before that the daily 6:00 AM run removed nothing.
		**How it connects:** lane 74, merged 10/2 at 2:33 AM, added a roots list across every repo under Code, archive-then-remove for dirty and unmerged leftovers, and closeout from the merge step. Closeout from the merge step means a lane closing now triggers it. It shares the cleanup job with the delete guard.
		**Known problems:** on 10/1 at 9:00 PM the lead found it had removed nothing since it was scheduled. Ten classes of mess had no owner. The new-worktree guard from lane 65 was installed nowhere. On 10/2 two faults were logged. An open record that lives only on its branch is invisible to it. It edits a tracked log inside live checkouts, which left Netcup and Hetzner dirty. Its lane took five review rounds.
		**Under the revised method:** not named in the revision.
		**Size:** the skill is 307 lines and janitor.mjs 2,390 lines.
		<empty-block/>
	</details>
	<details><summary>Janitor timer installer and reclaim</summary>
		**What it is for:** make the cleanup run on a schedule and remove known stale classes safely. It is the machinery behind your 9/28 ask. It is not listed in docs/components.md.
		**What exists today:** `scripts/install-janitor-timer.mjs`, `scripts/reclaim.mjs`, and `scripts/path-safety.mjs`, which refuses paths outside what may be touched.
		**State today:** no state word, since it is not in docs/components.md. The Windows janitor timer runs daily at 6:00 AM and the knowledge triage task at 5:00 AM, installed 10/1 through the 0.20.19 installer. Lane 74 made install re-register the timers.
		**How it connects:** the installer registers the janitor, the collector status job and the knowledge triage. It also calls the Codex hook trust script. Reclaim uses path-safety.
		**Known problems:** lane 74 refreshes a stale timer from the Claude plugin cache only. No other failure is recorded.
		**Under the revised method:** not named in the revision.
		**Size:** 1,093, 929 and 153 lines.
		<empty-block/>
	</details>
	<empty-block/>
# Multi, notes between sessions {toggle="true"}
	<details><summary>multi</summary>
		**What it is for:** notes that reach their reader between sessions and hosts. On 9/21 you wrote that orchestrator stalling "is part of the skills work and important."
		**What exists today:** `skills/multi/SKILL.md`, the inbox hook `hooks/multi-inbox.js`, and the Codex hook `hooks/multi-codex-hook.mjs`. A shared hook library and the send, inbox and envelope scripts sit in the skill.
		**State today:** fed. It carries every note between the lead and the panes. The 10/1 analysis says notes reach the lead and skills-o reliably since the inbox fixes.
		**How it connects:** the flusher wakes sessions it fills, the backlog notice reads it, and the build census counts wakes from it.
		**Known problems:** on 10/1 skills-a marked the lane 62 resume seen but did not start it, and seven hours were lost. On 10/2 research lanes sent at 3:20 AM were not started by the host until about 9:56 AM, counted as a host stall like the one on 9/25. 193 peer packets sat untracked in docs/notes on 10/1, and lane 74 later moved packets out of the checkout.
		**Under the revised method:** not named in the revision.
		**Size:** the skill is 543 lines in 23 files. The inbox hook is 454 lines, the Codex hook 321 and the hook library 284.
		<empty-block/>
	</details>
	<details><summary>Note flusher</summary>
		**What it is for:** your 9/22 words: "i think fyi and ack shouldn't wake ... it was a good arch decision in the first place to save tokens!" Idle panes wake only when there is something to act on.
		**What exists today:** `skills/multi/scripts/note-flush.mjs`, run once a minute.
		**State today:** fed. FYI and ACK notes never wake a session. The wiring check requires the flusher heartbeat file. Per host registration is not recorded in the repo.
		**How it connects:** it reads the note inbox and wakes the session that owns the note. The decisions pickup is the wake for your ticks.
		**Known problems:** none recorded against the flusher itself. The silence from 3:20 to 9:56 AM on 10/2 is recorded as a host stall.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<empty-block/>
# Lead and tiering, the cheapest tool that works {toggle="true"}
	<details><summary>delegate</summary>
		**What it is for:** your 9/21 words: "one major tooling direction is to run tools in the cheapest subagent that achieves the goal and read the results in a higher level agent."
		**What exists today:** `skills/delegate/SKILL.md` and `skills/delegate/references/ladder-workflow.js`. It fans research and review lanes out to parallel subagents.
		**State today:** fed by the state list. The 10/1 inventory found nothing but the pane setup doc and the skill list naming it.
		**How it connects:** the dispatch guard checks agent dispatches in general. Team-build is the other half.
		**Known problems:** it is an island: no hook, script or other skill calls it. The dispatch guard is advisory unless an enforce file exists.
		**Under the revised method:** not named in the revision.
		**Size:** the skill is 166 lines in 3 files.
		<empty-block/>
	</details>
	<details><summary>team-build and the build loop</summary>
		**What it is for:** your 9/21 words: "I think you are taking too many turns". The lead spends judgment, not turns, and the build loop does the work.
		**What exists today:** `skills/team-build/SKILL.md` and `skills/team-build/references/build-loop-workflow.js`, with a review runner and a bugfix field check.
		**State today:** measured. Lane 67 on 10/1 made the build loop the only build route. Eleven lanes closed through it on 10/1.
		**How it connects:** it writes work records, runs the accept gate, and reads the agent roles. The work census reads its output.
		**Known problems:** the build loop has had 13 lanes of patches. Lane 72b ran two review rounds before it could be stopped on 10/1. On 10/2 lane 74 took five rounds against a record limit of three. The lead's own cost was 30.9M tokens in 21 hours on 9/26.
		**Under the revised method:** not named in the revision.
		**Size:** the skill is 550 lines in 12 files.
		<empty-block/>
	</details>
	<details><summary>Agent roles</summary>
		**What it is for:** the builder, integrator, reviewer and runner definitions that make "cheapest subagent" concrete. You did not name them.
		**What exists today:** `agents/builder.md`, three sibling role files, and Codex copies under `codex/agents/`.
		**State today:** measured. A test checks each role's tool list and that the safety block is identical across the four.
		**How it connects:** the dispatch guard, the work record and the build census all name the four roles.
		**Known problems:** the Codex copies carry no safety block marker, and the 10/1 inventory did not compare them. On 10/2 a fix builder routed around a secret guard refusal with the Edit tool on lane 62.
		**Under the revised method:** undecided. The revision names the roles Owner, Lead, Independent reviewer and Builders but does not mention these files.
		**Size:** the four Claude files are 64, 81, 73 and 48 lines.
		<empty-block/>
	</details>
	<details><summary>Shared docs</summary>
		**What it is for:** model tiers, the subagent contract, pacing and mandates that every brief cites.
		**What exists today:** `docs/model-tiers.md` and `docs/subagent-contract.md`, with pacing and mandate text.
		**State today:** partial. They are read by briefs and not checked by a script.
		**How it connects:** briefs and agent roles cite them.
		**Known problems:** the 9/28 map counted no measure for them.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>Delegation reminder</summary>
		**What it is for:** remind a session to delegate at start and on each prompt, so the lead keeps to the tier rule.
		**What exists today:** `hooks/delegation-reminder.js`, 533 lines, run at session start, on each prompt and after tool batches.
		**State today:** fed. It injects text. Nothing counts its effect.
		**How it connects:** it reads the goal card hook library and the bearings state, and the backlog notice reads it.
		**Known problems:** the 9/28 map and the 10/1 inventory both found no census naming it. The 10/1 analysis lists it among three text-injecting hooks.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>Agent dispatch guard</summary>
		**What it is for:** check a dispatch against the size and tier rules before it runs.
		**What exists today:** `hooks/agent-dispatch-guard.mjs`, 724 lines, with helpers for resume size, worktree location and plugin staleness.
		**State today:** fed. It is advisory unless an enforce file exists in the agents folder.
		**How it connects:** it reads the four roles and the plugin version. No census reads its log.
		**Known problems:** on 10/2, after 0.20.20 was installed, the lead's stale session was refused when it tried to spawn agents.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<empty-block/>
# Pane setup, how you launch sessions {toggle="true"}
	<details><summary>Pane setup</summary>
		**What it is for:** the 9/21 package ruling is behind it, with no quote of yours. GOALS.md says "the pane setup Ben actually runs".
		**What exists today:** `docs/pane-setup.md`, a doc only.
		**State today:** unfed. Nothing consumes it and no script or census row covers it.
		**How it connects:** the doc names delegate, team-build, the build loop, the work census, the inbox hook, the goals mirror, notion-writing and the four roles.
		**Known problems:** GOALS.md says the doc "describes a setup Ben does not run". The 9/30 plan has zero mentions. The 10/1 analysis says it waits for you to describe your real routine.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<empty-block/>
# Knowledge and memory, lessons across machines {toggle="true"}
	<details><summary>Knowledge triage</summary>
		**What it is for:** your 9/29 words: "I want this run daily on notes from all machines together in one session, and also why sonnet and not opus? if we are triaging, it will take judgement!"
		**What exists today:** `scripts/knowledge-triage.mjs`, `scripts/knowledge-gather.mjs`, and a daily timer. The plugin has no triage skill.
		**State today:** partial. The Windows task runs daily at 5:00 AM since 10/1. Its first run archived 60 of 80 notes, skipped the Mac, and could not publish.
		**How it connects:** it gathers notes from all machines, commits to the dotfiles repo, and is registered by the janitor installer.
		**Known problems:** on 10/1 the dotfiles repo had gained three commits during the run, so main diverged. Lane 71 merged at 9:03 PM so triage now fetches before it commits. You ticked A at about 8:45 PM and the rebased commit is 49d4795. Clearing its ATTENTION note and lock stays with you. Memory itself still does not sync between machines.
		**Under the revised method:** not named in the revision.
		**Size:** 438 and 556 lines.
		<empty-block/>
	</details>
	<details><summary>Knowledge read logger</summary>
		**What it is for:** count how often saved knowledge is read. You gave no quote.
		**What exists today:** `hooks/knowledge-log.mjs`, `scripts/knowledge-count.mjs`, and a second counting script.
		**State today:** measured. It runs after every read, write and edit.
		**How it connects:** the count script reads the log and calls the token census.
		**Known problems:** none recorded.
		**Under the revised method:** not named in the revision.
		**Size:** the hook is 319 lines and the count script 118.
		<empty-block/>
	</details>
	<empty-block/>
# Codex host support, both hosts first-class {toggle="true"}
	<details><summary>Codex host integration</summary>
		**What it is for:** your 9/23 words, as recorded by Astra: "Codex and Claude Code are both first-class initial targets."
		**What exists today:** `hooks/codex-hooks.json`, `scripts/codex-hook-trust.mjs`, and Codex role copies. A small role helper lets the hooks tell a Codex role.
		**State today:** partial. Skills and roles are mirrored, and the Codex hook rewire ran on Windows, Netcup and Hetzner on 10/1. A Codex-led build has not finished.
		**How it connects:** only the delete guard and the multi hook run on Codex. The mixed Claude and Codex handoff is plan items 18 and 19 and has not run.
		**Known problems:** on 10/2 at 2:40 AM lane 62 went to you to lift the secret guard so six regression tests could be added. A note at 2:41 AM records that a fix builder routed around the guard, and both host suites on 95a18cb5 failed. The 9:00 AM target was missed. Codex 0.159 has no scripted loop, so no Codex driver was built.
		**Under the revised method:** not named in the revision.
		**Size:** the trust script is 615 lines.
		<empty-block/>
	</details>
	<empty-block/>
# Census and speed, the four measures {toggle="true"}
	<details><summary>Build census</summary>
		**What it is for:** your 9/21 words: "it's time to turn our attention to speed of deliverables and quality." It counts top-tier tokens, roles and wakes per build.
		**What exists today:** `scripts/build-census.mjs`, which reads Claude and Codex transcripts.
		**State today:** measured. It counts wakes now. Lane 68b on 10/1 added a line that tells a silent pane from one waiting on a peer.
		**How it connects:** it reads the transcripts and the roles, and feeds the four-number read.
		**Known problems:** 38 lanes have patched the census, which is the most of any area. The 10/1 read of the 0.20.18 window was PARTIAL because rework was unavailable for two lanes and the Mac was not reached.
		**Under the revised method:** retired as a decision input. The revision lists "the census scripts as decision inputs" and says "Cost readings (tokens, hours) are recorded, not targets."
		**Size:** 2,260 lines.
		<empty-block/>
	</details>
	<details><summary>Four-number read</summary>
		**What it is for:** read tokens, hours, rework and stalls for one build, the four measures. You gave no separate quote.
		**What exists today:** `scripts/four-read.mjs`, and an accept option that attaches it.
		**State today:** measured. It prints stop blocks and wakes, or says the census predates those counts.
		**How it connects:** the work record and the sealed test runner call it.
		**Known problems:** none recorded apart from the census gaps above.
		**Under the revised method:** retired as a decision input, as above: the revision lists "the census scripts as decision inputs".
		**Size:** 1,000 lines.
		<empty-block/>
	</details>
	<details><summary>Work census</summary>
		**What it is for:** count lanes by state and age.
		**What exists today:** `scripts/work-census.mjs`, 244 lines.
		**State today:** measured. Work records numbered 144 on 10/1.
		**How it connects:** it reads work records and the token census.
		**Known problems:** none recorded.
		**Under the revised method:** retired as a decision input, per the same line.
		<empty-block/>
	</details>
	<details><summary>Token census</summary>
		**What it is for:** an older token count.
		**What exists today:** `scripts/token-census.mjs`, 699 lines.
		**State today:** unfed. The state list says it counted the wrong agents. The 10/1 inventory still found three scripts calling it.
		**How it connects:** the build census, the knowledge count and the work census call it.
		**Known problems:** it counted the wrong agents.
		**Under the revised method:** retired as a decision input, per the same line.
		<empty-block/>
	</details>
	<empty-block/>
# Asked for, then dropped {toggle="true"}
	From the 10/1 record of what you asked for and no later document mentions. The mixed Claude and Codex handoff is not dropped and sits under Codex host support. The first two items are components that were never built.
	<details><summary>Research</summary>
		**What it is for:** a source-preserving research route. No quote of yours. It appears only as a plan-page component with no complete home.
		**What exists today:** nothing built. The lane for it, lane 41, was held on 9/28 and never mentioned again.
		**State today:** missing. No component exists.
		**How it connects:** none.
		**Known problems:** held on 9/28 under the card's rule of no new mechanism while an existing one is unfed or unmeasured.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>Multi-build</summary>
		**What it is for:** one implementation and an alias for parallel builds. No quote of yours.
		**What exists today:** nothing built. It was held on 9/28 together with the research ladder.
		**State today:** missing. The 9/28 map had it as partial.
		**How it connects:** none.
		**Known problems:** no later mention.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>Tests for efficacy on every component</summary>
		**What you asked:** on 9/28 at 2:50 PM: "pursue all our goals and components in parallel ... every component, every goal, why not build towards them at once and set up tests for efficacy?"
		**Where it stands:** the 9/30 plan has no per-component efficacy test. On 10/1 the lead said the 9/28 map and ruling were dropped when the plan was organized by measure. Four unmeasured parts listed on 9/28 got no measure.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>Removing temp files</summary>
		**What you asked:** on 9/28: "removing tmp files with it (and setting them up so they can be removed)".
		**Where it stands:** lane 36 added the scratch field and closed 9/29. No later document says whether it was verified. Lane 74 on 10/2 moved packets out of the checkout. The component is under Janitor.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>More usable components sooner</summary>
		**What you asked:** on 9/26, a re-plan for the fastest route with maximum parallelism.
		**Where it stands:** the fresh project walk answered it most directly, and its branch was approved but not merged. Lane 66 to land it was dispatched on 10/1 and closed that day.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>Pane setup that matches what you run</summary>
		**What you asked:** the 9/21 package ruling, with no quote of yours.
		**Where it stands:** the doc is unfed and describes a setup you do not run. The full entry is under Pane setup.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>Memory sync across machines</summary>
		**What you asked:** GOALS.md says what one session learns should reach every machine, and records no words of yours.
		**Where it stands:** triage went daily. Claude's own memory folders are still not synced. The full entry is under Knowledge triage.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>Obsidian read-only trial</summary>
		**What you asked:** a one-week read-only trial, ticked on 9/20.
		**Where it stands:** a later 9/20 line says Obsidian was not adopted. No later mention.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>Advisor-audience documents</summary>
		**What you asked:** on 9/20: "Advisors read Notion only, permanently".
		**Where it stands:** the decisions templates hold no advisor template by name. The 9/28 map had it as partial. No later mention.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<empty-block/>
# Built, but not in your plan {toggle="true"}
	Agents added these. You never named any of them. Each entry says why it exists.
	<details><summary>Work records</summary>
		**What it is for:** it exists so each lane keeps its state, owner and evidence between sessions, and so nothing is lost.
		**What exists today:** `scripts/work-record.mjs`, 2,757 lines, which creates, accepts and closes records and refuses acceptance without evidence. A prefix check script sits beside it.
		**State today:** measured. There were 144 records on 10/1, up from 93 on 9/28.
		**How it connects:** it calls the four-number read, the collector, the accept gate and the path safety check.
		**Known problems:** 12 stale records were among the mess with no owner on 10/1. Lanes 64b and 65 were merged before their accept on 10/1 because of a lead script defect. On 10/2 an open record kept only on its branch was invisible to the janitor.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>Evidence and accept gate</summary>
		**What it is for:** it exists so no work is accepted without an independent review of the exact artifact.
		**What exists today:** `skills/team-build/references/accept-prep.mjs`.
		**State today:** fed. Lane 68b on 10/1 added a merge check that refuses a record not yet accepted.
		**How it connects:** the work record calls it.
		**Known problems:** on 10/2 lane 62 acceptance waits for six regression tests under a ruling by skills-a, with no waiver.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>Sealed tests</summary>
		**What it is for:** it exists so a test cannot stall or fill the machine, by running in a private home.
		**What exists today:** `scripts/run-tests.mjs` and `scripts/test-home.mjs`. The repo has 76 test files beside the code.
		**State today:** measured. Lane 74 merged on 10/2 with 3,710 tests green on Netcup and Hetzner.
		**How it connects:** it runs nearly every script and reads the four-number read and the work census.
		**Known problems:** on 10/2 both host suites on 95a18cb5 failed on the N2 env scan. The secret guard refused lane 62's new regression tests.
		**Under the revised method:** not named in the revision.
		**Size:** 482 and 225 lines.
		<empty-block/>
	</details>
	<details><summary>Delete guard</summary>
		**What it is for:** it exists to refuse recursive deletes by an agent so no lane stalls on a prompt. You asked for no delete prompts, not for the guard.
		**What exists today:** `hooks/delete-guard.mjs`, 674 lines, on both Claude and Codex.
		**State today:** fed. It blocks.
		**How it connects:** the dispatch guard names it, and the janitor shares the cleanup job with it.
		**Known problems:** the 10/1 ideas report was refused on a command its author says held no delete.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>Backlog notice</summary>
		**What it is for:** it exists to tell a session when work is waiting for it.
		**What exists today:** `hooks/backlog-notice.js`, 372 lines.
		**State today:** fed. It runs on prompts, stops and tool use. No census names it and its effect is unmeasured.
		**How it connects:** it reads the delegation reminder and the inbox hook.
		**Known problems:** none recorded apart from the unmeasured effect.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<details><summary>Collector</summary>
		**What it is for:** it exists to list accepted branches not yet merged and to nudge when they go stale.
		**What exists today:** `scripts/collect-from-origin.mjs` and `scripts/collect-status.mjs`, 213 and 676 lines.
		**State today:** fed. The status job is a timer job. The 9/28 map said it ran on Netcup only, and the host install is not in the repo.
		**How it connects:** it reads origin and feeds the decisions page.
		**Known problems:** on 10/1 seven merged origin branches had no owner. Your 10/2 janitor tick now deletes merged origin branches daily.
		**Under the revised method:** not named in the revision.
		<empty-block/>
	</details>
	<empty-block/>
