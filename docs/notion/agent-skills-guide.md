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

# The components we want, seven, each with its test {toggle="true"}
	These are the components the problem demands, not the parts that were built. Each has a purpose, the test you can read, and where it stands today. Your 9/28 list of thirteen maps onto them in the next toggle.
	- Your page. One Notion page you read and tick, holding only decisions that are yours. Test: every tick read within the next planning turn, none lost, nothing on it that is not yours to decide. Today: rendered by 56 files behind 21 lanes; it asked you the same question three times this week.
	- The planning turn. Problem, failure list, two designs, pitch, bet with appetite, Codex objection, your tick. Test: every bet ends at its appetite with families marked stopped or not, and the codebase smaller or flat. Today: running its first turn, bet 1, pitch published, objections pending.
	- The build. A brief goes to merged in one Workflow turn, builder then reviewer then integrator, and the turn removes what it created. Test: under 20 lead turns per build, zero leftovers at the next planning turn, one real task from one of your projects through it. Today: the loop exists and ran well once on 9/22; it sits inside worktree, janitor and notes machinery that produced 45 rows of mess.
	- The independent check. Codex, with the code in hand, argues three checks on every pitch (wrong problem, part added without a failure, part removed without a failure) and reviews every build. Test: an unedited objections section on every pitch page and a second provider on every build review. Today: Astra holds the first brief and has not acknowledged since yesterday 1:10 PM.
	- Memory. History, the knowledge inbox and index, the failure list, read at the start of every planning turn. Test: each inbox note is cited at the next planning turn or triaged out. Today: 27 inbox notes pending, none read in seven days.
	- The host. One machine runs agents; you launch two panes with one command each; secrets are never in an agent session; one install per release. Test: installs per release, one; no guard false positives because there is nothing for a text guard to catch. Today: four hosts, three text guards, 136 rows between them.
	- The two numbers. Top-tier tokens per bet and hours from brief to merged, read by hand onto every pitch page. Test: both numbers on every pitch. Today: a census with three scripts and 24 rows of numbers nobody trusted.
	Not components, but properties the whole must keep: one plugin that Claude and Codex both read, the skills shared through the mirror, code in small files.
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
	- Pitch: shrink the harness to its core (bet 1): the open pitch, objections pending.
	<empty-block/>

# Prior pages, kept for the record {toggle="true"}
	- Harness Plan: Lead's View 10/2: superseded by this page and the pitch.
	- Harness Components by Ben's Plan 10/2: the inventory of built parts under your thirteen; superseded by the seven components above, useful for what each part does.
	- Working smarter: goals ladder, research ladder, decisions (9/21), with the Goals page, the 9/22 audit and Astra's 9/23 page under it: the goal card era, superseded.
	- Brief to Astra: independent method review: sent 10/4, in progress.
	<empty-block/>
