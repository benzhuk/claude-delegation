# Read this first {toggle="true"}
	This is the first pitch under the method you adopted today, 10/4. It is for you to read, not to work: read "The problem, in your words" and "What I recommend". The two designs are here in full if you want them, and you do not have to pick between them. The Codex reviewer (Astra) reads the same files and writes its objections into this page on Tuesday; your decision item goes on the decisions page after that, with one recommended option to tick.
	Where things come from: the problem draft is `PROBLEM.md` at the repo root, the 282-row failure list is `docs/misfits.md`, the two designs are in `docs/work/evidence/` dated 10/4, and the bet record is `docs/bets/2026-10-04-bet-1-harness-method.md`.
	<empty-block/>

# The problem, in your words {toggle="true"}
	"Every complex system I have tried to build with LLM agents so far has gone the same way. I don't understand enough to make some decisions, so I defer them to Fable. I want to automate as much as possible, so I ask Fable to orchestrate other agents. I make local decisions as Fable asks. At the end of weeks and months of work, I have a massive codebase consisting almost entirely of patches, which still does not solve the actual problem and now is so complicated that it never can." (10/2)
	"I wanted to instead RETHINK, on every planning turn, and always be willing to throw out our planned architecture for a simpler one that wouldn't have the class of problems rather than fixing each problem in the class as it appears." (10/2)
	The draft adds my reading of the mechanism, marked as mine and to be corrected: when you defer, nobody holds the problem, only the plan. The options brought to you assume the architecture, so you steer inside it and are asked to judge designs instead of failures. Every agent turn wants to end with a merge, and rules that admit anything that moves a measure let every patch in. The reason a part exists dies with each session, so the next session adds instead of removes.
	What solved looks like, in the draft: you can say for each failure whether it stopped. The codebase gets smaller or stays flat while the problem gets more solved. You decide only what you have feedback on: is this my problem, go or no-go, how much to spend, did it stop. The method stays four files and a conversation.
	<empty-block/>

# Edits I propose to the problem statement {toggle="true"}
	Scope: the pattern across every agent-built project, this harness first, and "no harness at all" counts as an answer. If you disagree, the scope line is the one to change.
	The end state line from 10/1 ("a perfect blend of human intelligence and machine intelligence, with human input guiding at exactly the right moments") is kept as the aim. The harness is a means to your real projects.
	Everything in the draft that is not inside quotation marks is my reading, and it is the first thing to correct. Tell me in a comment line or edit the file.
	<empty-block/>

# What the record shows {toggle="true"}
	A runner compiled every failure, stall, mess, refusal and lost input recorded since 9/20: 282 rows, each with its date and source. I grouped them into six families. Four of the six, 218 rows, are produced by the shape of the system rather than by bugs inside it.
	- Agents leave a mess, 45 rows. Every lane opens a worktree, pane or test home and nothing that opened it closes it; the cleaner added for this became a source of failures itself.
	- Guards and checks cry wolf, or prove less than they claim, 69 rows. Guards and tests judge the text of a command, not what it does; they refuse their own fixes and hang unwatched builders.
	- Four hosts, many panes, one plugin to install everywhere, 67 rows. Work spread over four machines and panes that talk by notes; every release must reach every host and session, and every gap stalls work unseen.
	- Your page and your input, 37 rows. The page you read is produced by a renderer and a pickup script with 22 lanes behind them, and it still loses or misreads your input.
	- Numbers nobody can trust, 24 rows. The census was built to score the goal card; two of four measures never had an instrument and the bounds were set by feel.
	- The project grows instead of shrinking, 40 rows. Every turn wants to end with a merge; the lead's own turns are the largest cost; the rules that should stop growth live in prose.
	Sixteen of the rows are dated today, 10/4, in the same families as 9/20. The rate has not fallen.
	<empty-block/>

# What I recommend {toggle="true"}
	Run the simplest core design: one host runs agents, one checkout, two panes you launch, a hand-published decisions page, builds as one Workflow turn that cleans up after itself, no secrets in agent sessions so no text guards, no census, no janitor, no notes transport. The plugin goes from about 3,000 tracked files to under 100. Nothing is destroyed: the record moves to an archive tag and branch.
	Why this and not continuing: the continue design can lower the rate of four families but cannot end them, because the parts that produce them stay. It is the path your problem statement names. The simplest core removes the parts, and each removal names the failures it answers.
	Appetite I propose for the next bet: one working week, Tuesday 10/6 to Monday 10/12 at 5:00 PM New York, with a circuit breaker: at the end, the pitch page shows what is done and what is not, and nothing extends.
	What you would see at the end of that week: the repo under 100 files, one host running agents, one real task from one of your projects taken brief to merged through the loop with a Codex review, your decisions page published from a file, and each of the six families marked stopped or not with the rows that recurred.
	What it costs you: one tick on the decision, about an hour to stop panes on three machines and confirm Netcup as the agent host, one tick on the first build's result.
	<empty-block/>

# The continue design {toggle="true"}
	Keep everything on main and run one lane per family: widen the janitor, finish the guard narrowing and add a switch, install on every host with a loud check, fix the pickup, build the two missing census instruments, and run the adopted method on top.
	What it ends: nothing by itself; each lane ends rows when it lands. The record of this approach since 9/20 is 38 lanes on the census, 21 on the pickup, 13 on the build loop and 7 on the inbox, with rows still arriving at the same rate.
	Costs: six lanes at 6 to 11 times the hand-run token bar each, one to two days each, every one a release to install on four hosts and every running session. The repo grows. You lift the guard for every guard lane and provide Mac access for every install.
	Risks: it is the pattern the problem statement describes. The mess family depends on a cleaner that produced seven failures of its own. Guard lanes edit the thing that refuses edits to itself.
	The honest case for it: sunk cost and known behavior. The parts work most of the time, you know the page, the panes are set up. Those are real and they are not failures.
	<empty-block/>

# The simplest core design {toggle="true"}
	What stays: the notion-writing skill with the one-request publisher and the page lint, the build loop Workflow with its mandate template and subagent contract, the delegate skill as prose, the mirror to Codex, the knowledge inbox as files, and the four method files.
	What goes, each with the failures it names: three of four agent hosts (28 rows on unreachable machines, installs, hand steps and host faults); the notes transport and its hooks (18 rows on lost notes and undetected stalls, plus 44 lead turns in one day opened by note wakes); the decisions renderer and pickup (23 rows on your page and input); the census, bearings and goal card injection (24 rows on numbers, 50,000 tokens per long session); the dispatch, delete and secret guards as agent controls (55 rows on false positives, gaps, lifts and hung builders); the janitor (7 rows of its own and the 23 it never reached); about 3,400 tests (22 rows on flaky tests and checks that prove less); and 2,544 record files off main onto an archive.
	No-gos for the shrink bet: no new hook, daemon, timer or guard; no rewrite of the loop; nothing deleted from the record, only archived; no change to your own machine's policy, the guard in your dotfiles is yours.
	<empty-block/>

# Your components in the simplest core {toggle="true"}
	- Whole package: one plugin, installed on one host; Codex reads the mirrored skills. Test: installs per release, one.
	- Skill set: notion-writing, the build loop, delegate prose. Test: a real project task goes brief to merged through the loop.
	- Goal card: replaced by the problem statement and the failure list. Test: you can say per family whether it stopped.
	- Decisions page: one page published from a markdown file in the repo, linted, your ticks read back with the reader. No pickup daemon. Test: every tick read within the next planning turn.
	- notion-writing: unchanged. Test: lint clean on every publish.
	- Bearings: replaced by the bet's appetite and circuit breaker. Test: no bet runs past its appetite without a decision.
	- Janitor: removed; the loop removes what it created, and the planning turn lists leftovers. Test: zero worktrees and branches outside running loops at a planning turn.
	- Multi notes: removed; two panes on one host, the build pane launched per build with a brief path, results in a record file. Test: no lane state read from notes.
	- Lead and tiering: Fable plans at turns you open, Opus runs the loop in one turn, Sonnet builds, Codex reviews with the code in hand. Test: under 20 lead turns per build.
	- Pane setup: two panes, one host, launched by you. Test: the doc matches what you run.
	- Knowledge: inbox and index as files, synced with the dotfiles. Test: read at the start of every planning turn.
	- Codex support: Codex is the reviewer on every pitch and may lead a build with its own agents. Test: one build led from Codex through the same record shape.
	- Census: two numbers read by hand at a planning turn, top-tier tokens for the bet and hours brief to merged. Test: both on every pitch page.
	<empty-block/>

# Risks of the simplest core {toggle="true"}
	- Netcup alone is a single point; the record shows it as the most reliable of the four hosts. Failure if wrong: host unreliable.
	- You launch the build pane per build, one command with a brief path; it replaces the idle-pane stall seen eight times. Failure if wrong: work waits on your hands.
	- Removing the tests removes the check that a loop change still works; the loop is one script and its check is one real build. Failure if wrong: a check proves less than it claims.
	- The hand-published page can overwrite your edits like any page; the read-before-write rules and backups already cover this. Failure if wrong: a whole-page write over your edits.
	- Keys out of agent sessions means only the lead pane publishes to Notion; builders never needed to. Failure if wrong: a part added to let agents publish.
	<empty-block/>

# The reviewer's objections {toggle="true"}
	Pending. Astra (Codex, skills-a) reads the problem, the failure list, both designs and the code, and argues three checks: is this the wrong problem, which part added has no failure demanding it, which part removed has no failure named. Due Tuesday 10/6 by 5:00 PM New York, placed here unedited.
	<empty-block/>

# Your decision {toggle="true"}
	Nothing to tick yet. After the reviewer's section lands, one item goes on the decisions page: go on the recommendation with the proposed appetite (recommended), go with a different appetite, run the continue design instead, or no-go and say what is missing.
	<empty-block/>
