# Read this first {toggle="true"}
	You said no to pausing the harness, and you said what you want: a set of tools. Agents that talk to each other. Multi-build. Continual revision toward removing, not adding. Regular rethinking for the simplest path. Communication with you through Notion. Memories stored, triaged and read. Cleanup as we go. This page takes those seven as the components, one toggle each, and for each says what you asked for, what exists, what it broke, the simplest form that does the job, what gets removed, the test you can read, and the first build. A last toggle lists what is built but not on your list, which goes unless you keep it.
	Read the seven toggles and the removals toggle, then tick the one item on your decisions page. The builds run in parallel, each a short bet with a Codex check, removal first.
	<empty-block/>

# Agents talk to each other {toggle="true"}
	You asked, 9/21: orchestrator stalling "is part of the skills work and important." 9/22: "fyi and ack shouldn't wake", which was "a good arch decision to save tokens".
	Today: the multi skill, 23 files and 543 lines of skill text, three hooks of 454, 321 and 284 lines, a once-a-minute flusher, cross-host packet pointers, overdue alarms. Notes between the lead and the panes do arrive. It broke: nine lost notes in the record, overdue alarms firing on answered asks three times today, 44 lead turns in one day opened by note wakes, "delivered to null" on every send, a stale session that marked a note seen and did nothing for seven hours.
	Simplest form: one sender, one ledger file per day, one hook that shows unread notes at the start of a turn. FYI and ACK never wake anyone, as you decided. A note that needs an answer carries a by-time, and the reader's next turn sees it; no alarm process guesses whether it was answered.
	Removed: the overdue alarm, the cross-host pointer packets, the backlog notice hook, the pane handle that prints null. The envelope's safe-text rule stays.
	Test: every note sent lands in the reader's next turn, and no false alarm fires for a week.
	First build: delete the alarm and the backlog notice, fix the delivery line, two days.
	<empty-block/>

# Multi-build {toggle="true"}
	You asked, 9/21 to 9/28: builders write, reviewers verify, an integrator runs the gates; Sonnet builds, Opus reviews, the lead stays under 20 turns; every component gets a lane at once.
	Today: the team-build skill at 550 lines and the build loop Workflow, run from the Opus pane. One lane goes brief to main in one to three hours. The run of 9/22: 15 agents, 50 minutes, 19 lead turns. It broke: each lane opens a worktree the loop does not close, so 60 worktrees and 84 branches piled up on one machine; the acceptance step spawns the record and census helpers; a dispatch guard of 724 lines polices model tiers by refusing spawns; review loops ran five rounds past their limit because the bound lived in a note.
	Simplest form: the loop owns its worktree from creation to removal, archives dirty work to a branch before removing, and takes its round bound and model tiers as arguments. Several loops run at once from one or more Opus panes, one per component bet.
	Removed: the dispatch guard, the census call inside acceptance, the worktree-location hook, the half of the skill text that describes machinery no longer there.
	Test: one lane brief to merged leaves zero worktrees and zero branches behind, and the lead spends under 20 turns.
	First build: the loop closes its own worktree and drops the census call, three days.
	<empty-block/>

# Continual revision toward removing, not adding {toggle="true"}
	You asked, 10/2: "always be willing to throw out our planned architecture for a simpler one"; 10/5: "continually revise towards removing, not adding".
	Today: the goal card admitted any change that moved a measure, and in six weeks one component was retired. The failure list and the bet files exist since 10/4.
	Simplest form: three rules in the method file, no script. Every bet names what it removes. A build that adds a part names the failure that demanded it and the part it replaces. Every pitch shows two numbers: tracked files and hook lines, falling.
	Removed: the goal card as the admission rule, and the hook that injected it into every prompt, 533 lines and about 50,000 tokens per long session.
	Test: the two numbers fall across bets, on every pitch page.
	First build: the rules written into the method file this week, by the lead, no code.
	<empty-block/>

# Rethink the architecture regularly for the simplest path {toggle="true"}
	You asked, 10/2: rethink "on every planning turn (different from every turn)"; and that you do not have the judgment to pick between two architectures each time.
	Today: a daily bearings check with a skill, a state file and a receipt, which returned RE-PLAN five times and changed nothing; the first planning turn ran this weekend as bet 1.
	Simplest form: a planning turn at every bet close. The lead writes one recommendation and names the simplest alternative it considered and why not. Codex, with the code in hand, writes its objections unedited. You tick go or no-go and the appetite. Nothing is coded between planning turns that a failure did not demand.
	Removed: the bearings skill, its state file and receipt, and the reminder that nags for it.
	Test: every pitch has a "what we considered removing" section and a Codex objections section, and no bet runs past its appetite.
	First build: already the method; the bearings parts are deleted in the removals bet.
	<empty-block/>

# Communicate with you effectively, through Notion {toggle="true"}
	You asked, many times since 8/17: one page, toggles, checkboxes to tick, Done at the end, your comments as lines starting with two stars, never ask the same thing twice, everything for you in Notion with a link.
	Today: the notion-writing skill with the one-request publisher and the page lint, which work and you answered on without complaint. The decisions page is rendered by 56 files behind 21 lanes with a pickup daemon, rounds and receipts. It broke: the page asked you the same question three times this week because closing an item is a hand step in a second place; the pickup failed on this host and ticks were read by hand, which worked first time; the renderer refused nested toggles you asked for.
	Simplest form: the page is published from files in the repo by the publisher, as now. Your ticks and comments are read from the page by the lead at every turn with the reader, as happened today, and the item file is deleted in the same commit that records the answer. No pickup daemon, rounds or receipts.
	Removed: the pickup, handback, receipt and round scripts and their fixtures; the pointer files in the checkout.
	Test: you never answer the same question twice, and every tick is recorded within one turn of your Done.
	First build: delete the pickup path and write the read-the-page step into the decisions skill, two days.
	<empty-block/>

# Store, triage and read memories {toggle="true"}
	You asked, 9/29: "I want this run daily on notes from all machines together in one session", with Opus because "triaging takes judgement"; and that memory should sync between machines.
	Today: a knowledge inbox of files, an index, a daily triage script of about 1,000 lines on a 5:00 AM timer that archived 60 of 80 notes on its first run and could not publish, a hook of 319 lines that logs every read so a counter can report reads, and a per-project memory folder that never syncs. It broke: 27 inbox notes pending, zero reads in seven days, a lock and a note left for your hands.
	Simplest form: one store, the knowledge folder synced by the dotfiles like everything else. Writing is a rule at the moment of learning, as now. Triage is the daily Opus pass you asked for, fetching before it commits. Reading is a rule: the first step of every planning turn and every build brief is to read the index and cite what applies.
	Removed: the read-logging hook and its two counting scripts; the per-project memory folder as a second store.
	Test: each week at least one triaged lesson is cited in a pitch or a brief, and the inbox holds fewer than ten notes.
	First build: delete the read logger, make the knowledge folder the one store, two days.
	<empty-block/>

# Clean up as we go {toggle="true"}
	You asked, 9/28: "removing tmp files with it, cleaning up worktrees and branches as we go"; 9/30: the project "became a mess of worktrees in places I never wanted, with temp files and uncommitted code all over".
	Today: a janitor of 2,390 lines, a 307-line skill, a 1,093-line timer installer, a 929-line reclaim script, and timers on three machines. It removed nothing until 10/3. It broke: it dirtied a tracked file in live checkouts and blocked two installs; it missed ten classes of mess; the cleanup of 9/30 took a day of Ben's hands, 170 worktrees across projects, 4 million inodes on one host, 1,743 leaked test homes.
	Simplest form: whoever creates removes. The build loop removes its worktree and branch at the end of its run, archiving dirty work first. Test runs use the system temp folder and remove their homes. Scratch files live in the session scratchpad, which needs no deletion. The janitor shrinks to a daily sweep of the known classes that still leak, acting under your once-ticked policy, writing nothing into a checkout.
	Removed: the reclaim script and the installer's extra jobs; the janitor's record-mode and drift-file writes; the new-worktree guard, since the loop owns worktrees.
	Test: at every planning turn, zero worktrees and branches outside running loops, and fewer than ten untracked files in the main checkout.
	First build: the loop closes its own worktree (shared with multi-build), then the janitor sweep shrinks to what still leaks, three days.
	<empty-block/>

# Built, but not on your list: goes unless you keep it {toggle="true"}
	- The goal card and the hook that injected it into every prompt. Admitted every patch; 50,000 tokens per long session.
	- Bearings: skill, state file, receipt, reminder. Five RE-PLAN verdicts that changed nothing; the planning turn replaces it.
	- Census: three scripts, the four-number read, the collector, the token and stall counters. 24 rows of numbers nobody trusted; two hand-read numbers replace it.
	- The dispatch guard, 724 lines, refusing spawns by model name. Tiering becomes arguments to the loop.
	- The delete guard, 674 lines, matching command text for deletes. Refused report writes that quoted a command; Claude's own permission prompts already ask before a delete. Keep it if you want a second belt; it is the one safety item here.
	- The backlog notice hook and the knowledge read logger. Nobody acted on either.
	- The dev-server skill and the resume-size and worktree-location hooks. Called by nothing except their own docs.
	- The record under docs/specs and docs/work, about 2,500 files, moves to an archive branch and tag, fetchable, off main.
	The secret guard is not on this list: bet 2 is rebuilding it today to refuse sight and allow use, on your word.
	<empty-block/>

# How the builds run {toggle="true"}
	Seven bets, two to three days each, in parallel from the builder pane, each with a Sonnet builder, an Opus reviewer and a Codex check on the removal list. Order by your pain: cleanup and multi-build share the first bet, then Notion, then notes, then memory, then the removals bet; the two method tools are files the lead writes this week. Each bet ends at its appetite with a line on your page: shipped, what it removed, the two numbers. Nothing applies to your machines without your word per item.
	What it costs you: one tick now, one tick per bet when it lands, and your word on each install.
	<empty-block/>
