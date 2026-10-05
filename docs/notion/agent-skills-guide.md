# Read this first {toggle="true"}
	This page is the one guide to the harness work. Everything else under it is either current (the decisions page, the open pitch) or prior (earlier plans and views, kept for the record and marked so in the Documents table above). If a page is not linked from here, it is not guiding anything.
	How a cycle runs: you own the problem statement. The lead keeps a list of every failure, grouped into families you can judge with one question, has this stopped. At a planning turn the lead writes two designs, recommends one on a pitch page, and the Codex reviewer argues against it with the code in hand. You decide go or no-go and how much to spend. A bet runs to its appetite and stops. Nothing is coded until a failure demands it.
	<empty-block/>

# The problem, in your words {toggle="true"}
	"Every complex system I have tried to build with LLM agents so far has gone the same way. I don't understand enough to make some decisions, so I defer them to Fable. I want to automate as much as possible, so I ask Fable to orchestrate other agents. I make local decisions as Fable asks. At the end of weeks and months of work, I have a massive codebase consisting almost entirely of patches, which still does not solve the actual problem and now is so complicated that it never can." (10/2)
	The aim: "a final orchestration harness that creates amazing outputs in a perfect blend of human intelligence and machine intelligence, with human input guiding at exactly the right moments and the code and architecture staying super simple, clean, and cleaned up from as-we-go messes." (10/1)
	The full draft, with the lead's reading marked for your correction, is `PROBLEM.md` at the repo root. Only you change it.
	<empty-block/>

# The method, four files and a conversation {toggle="true"}
	- `PROBLEM.md`: the problem in your words. Yours.
	- `docs/misfits.md`: every observed failure since 9/20, 290 rows today, in six families. The lead classes, you accept the wording and judge whether a family stopped.
	- `docs/bets/`: one file per bet with its appetite, what it answers, and its outcome. A bet never extends.
	- `docs/decisions/history/`: the dated record of every ruling, tick and failure.
	- The conversation: a planning turn you open, where the lead writes two designs and a pitch, the Codex reviewer objects, and you tick one item on the decisions page.
	Roles: you decide what has feedback (is this my problem, go or no-go, appetite, did it stop). The lead (Fable) plans and pitches only. The builder pane (Opus) runs a build as one Workflow turn. Sonnet writes code. Codex reviews with the code in hand and argues every pitch.
	<empty-block/>

# The components we want: your seven tools {toggle="true"}
	You named them on 10/5 when you closed bet 1: "I want a set of tools, including tools for agents to communicate with each other, to multi build, to continually revise towards removing, not adding, to rethink the architecture regularly in pursuit of the simplest path to the real goal, to communicate with me effectively (ie Notion), to store, triage, and read memories when appropriately, and to clean up as we go, not leaving piles of garbage everywhere". Each is a tool in its simplest form, revised toward removal. The plan page "The seven tools, simplest form" has one toggle per tool with what exists, what broke, the simplest form, what is removed, the test and the first build.
	- Agents talk to each other. One sender, one ledger a day, one hook that shows unread notes at the start of a turn. Test: every note lands in the reader's next turn and no false alarm fires.
	- Multi-build. One loop from brief to merged that owns its worktree from creation to removal and takes its bounds as arguments. Test: a lane leaves zero worktrees and branches behind, lead under 20 turns.
	- Continual revision toward removing. Three rules in the method file: every bet names a removal, every addition names its failure and what it replaces, every pitch shows two falling numbers. Test: tracked files and hook lines fall across bets.
	- Rethink the architecture regularly. A planning turn at every bet close: one recommendation, the simplest alternative considered, Codex objections unedited, your tick. Test: no bet runs past its appetite.
	- Communicate with you through Notion. The page published from repo files, your ticks read from the page each turn, the item file deleted when the answer is recorded. Test: you never answer the same question twice.
	- Store, triage and read memories. One synced knowledge folder, a daily Opus triage, and a rule that every planning turn and brief cites what applies. Test: a triaged lesson is cited each week and the inbox stays under ten.
	- Clean up as we go. Whoever creates removes; the loop closes its worktree; tests use the system temp; the janitor shrinks to a daily sweep of what still leaks. Test: zero stray worktrees and fewer than ten untracked files at every planning turn.
	Not components, but properties the whole must keep: one plugin that Claude and Codex both read, the skills shared through the mirror, secrets used and never seen, nothing applied to a machine without your word.
	<empty-block/>

# Your thirteen components of 9/28, and where each went {toggle="true"}
	- Whole package, one plugin everywhere: a property of the whole, kept.
	- Skill set, one build for every project: the build.
	- Goal card: replaced by the problem statement and the failure list.
	- Decisions page: your page.
	- notion-writing: the mechanism behind your page, kept as is.
	- Bearings: folded into the planning turn's appetite and the did-it-stop question.
	- Janitor: folded into the build, which removes what it created.
	- Multi, notes between sessions: removed in the recommended design; the host component replaces it with panes you launch and record files.
	- Lead and tiering: roles in the method.
	- Pane setup: the host.
	- Knowledge and memory: memory.
	- Codex host support: the independent check, plus the shared-skills property.
	- Census and speed: the two numbers.
	<empty-block/>

# Where we are now {toggle="true"}
	Bet 1 runs to Tuesday 10/6 at 5:00 PM New York: the first planning turn, no code. Done: problem draft, failure list in six families, two designs, pitch page. Pending: Astra's objections, then one decision item on your page recommending the simplest core design with a one-week appetite.
	Lane 70, the narrowed secret guard, is merged and live on this machine on your word. Lane 62 may resume. Every other lane is parked until the design decision.
	What is open for you: nothing to tick. One thing only you can do: confirm the Astra pane is running, or its review will not land by tonight.
	<empty-block/>

# Current pages {toggle="true"}
	- Skills decisions page: the one place you tick. Regenerated on every publish.
	- The seven tools, simplest form: the bet 3 plan, one toggle per tool you named on 10/5. Read it before you tick.
	- Pitch: shrink the harness to its core (bet 1): closed on your no-go of 10/5, kept for the record.
	<empty-block/>

# Prior pages, kept for the record {toggle="true"}
	- Harness Plan: Lead's View 10/2: superseded by this page and the pitch.
	- Harness Components by Ben's Plan 10/2: the inventory of built parts under your thirteen; superseded by the seven components above, useful for what each part does.
	- Working smarter: goals ladder, research ladder, decisions (9/21), with the Goals page, the 9/22 audit and Astra's 9/23 page under it: the goal card era, superseded.
	- Brief to Astra: independent method review: sent 10/4, in progress.
	<empty-block/>
