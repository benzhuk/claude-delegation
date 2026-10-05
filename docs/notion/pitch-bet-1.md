# Read this first {toggle="true"}
	Revised 10/5 after the Codex review. Read "What I recommend now" and "The reviewer's objections", then tick the one item on your decisions page. The two designs from 10/4 stay below with their corrections, and you do not have to read them.
	What changed since 10/4: Astra reviewed the problem, the failure list, both designs and the code, with its own research and plan committed before it read ours. It found three errors in my design that I accept, and it named a third option neither design had. The recommendation below is that third option.
	Where things come from: `PROBLEM.md` at the repo root, `docs/misfits.md`, the two design files and Astra's report under `docs/work/evidence/`, the bet record under `docs/bets/`.
	<empty-block/>

# The problem, in your words {toggle="true"}
	"Every complex system I have tried to build with LLM agents so far has gone the same way. I don't understand enough to make some decisions, so I defer them to Fable. I want to automate as much as possible, so I ask Fable to orchestrate other agents. I make local decisions as Fable asks. At the end of weeks and months of work, I have a massive codebase consisting almost entirely of patches, which still does not solve the actual problem and now is so complicated that it never can." (10/2)
	"This whole project seems to have been a massive timesink with no benefit and only useless costs." (10/5)
	The draft adds my reading of the mechanism, marked as mine and to be corrected: when you defer, nobody holds the problem, only the plan. The options brought to you assume the architecture, so you steer inside it. Every agent turn wants to end with a merge. The reason a part exists dies with each session, so the next session adds instead of removes.
	<empty-block/>

# What I recommend now {toggle="true"}
	Stop building the harness for its own sake. Freeze optional harness development. Run one task you already want, in one of your real projects, through the tools as they are today. Change only the boundary that gets in the way of that task, the way bet 2 is narrowing the secret guard this morning because it blocked a real task. Measure the task's success, your active minutes, and the four raw numbers honestly, with their gaps named. Then decide what to extract or remove from the harness with that evidence, not with a count of failure rows.
	Why not the shrink I proposed yesterday: the review showed I had not priced it. The build loop depends on helpers I planned to delete, "no secrets in the environment" is not "no access to secrets" while the env file sits on disk, and Cadma's visual QA needs your desktop browser, so the machines cannot all stop running agents. The shrink stays as the direction, corrected, and comes back with the trial's evidence.
	Why not continuing as before: six repair lanes on the same parts, each a release to install everywhere, each growing the repo. That is the pattern your problem statement names.
	Appetite I propose: one working week from your tick, with a circuit breaker. At the end you see the task's result, your minutes spent, and one recommendation: keep, extract or remove each boundary the task touched.
	What it costs you: one tick, the task's own acceptance when it ships, and a short log of your interruptions during the week, which the lead keeps from the record.
	<empty-block/>

# The task candidate {toggle="true"}
	A runner read your projects' open issues, backlog files and recent commits so the candidate comes from your backlog, not from a harness demonstration. The candidate and its alternatives are on the decision item on your page; this toggle holds the reasoning.
	The rule for picking: the highest-priority task you already want, with a result you can see yourself, small enough to finish inside the week, in a project where the tools have run before.
	<empty-block/>

# The reviewer's objections, unedited {toggle="true"}
	From Astra's report of 10/5, section "Objections for the pitch, unedited", carried verbatim.
	1. The two designs do not yet compare credible ways to deliver the same useful task. Continue assumes six more repair lanes; simplest-core omits migration, dependencies and recurring owner work. Include the existing-tools trial before asking for a bet.
	2. The claimed removal of 218 of 282 failures is unsupported. The four named families sum to 197, and rows mix repeats, aggregates, caught review findings and unrelated product defects. Use demonstrated failure mechanisms, not that percentage.
	3. The retained loop depends on acceptance, work-record and census helpers proposed for removal. It delegates cleanup to the lead. A no-code shrink cannot preserve that behavior as specified.
	4. No environment credential is not the same as no access to credentials or dangerous actions. The publishing lead remains privileged. Specify and demonstrate the replacement authority boundary before removing a guard.
	5. Preserve tests for retained contracts and failure paths. One successful real build cannot replace checks for stale reviews, interrupted work or concurrent edits.
	6. Fewer machines and no wakeups move work to Ben and may remove required desktop capabilities. Price those losses and preserve a recovery path; do not call the failure families ended.
	7. Keep the adopted problem-led direction, but measure actual task success and owner effort. A quiet interval, a smaller repository or agreement between models is not evidence that the problem is solved.
	<empty-block/>

# What the record shows, corrected {toggle="true"}
	292 rows of recorded failures since 9/20 after the review's corrections: two product defects from other projects moved out, one duplicate id fixed, one row reclassed because the check it describes was correct. Six families: agents leave a mess, guards and checks cry wolf or prove less than they claim, four hosts and many panes, your page and your input, numbers nobody can trust, the project grows instead of shrinking.
	What the list is for: a record of what happened, with dates and sources, so that a planning turn can ask of a few named mechanisms whether they still occur. What it is not: a count that a design can promise to remove. The review was right that rows repeat, aggregate and overlap.
	<empty-block/>

# The simplest core design, 10/4, with corrections {toggle="true"}
	The idea: one host, one checkout, two panes you launch, a hand-published decisions page, builds as one Workflow turn that cleans up after itself, no census, janitor or notes transport, the record archived not deleted.
	Corrections after review: the failure percentage is withdrawn. The loop is not one script; its acceptance step spawns the record and census helpers, and cleanup is the lead's. "No secrets, so no guard" has no replacement boundary yet; a small guard on display verbs plus the output detector is the line for now. The desktop stays for browser-bound work. Tests for retained contracts stay. Status: the direction, revisited with the trial's evidence.
	<empty-block/>

# The continue design, 10/4, with corrections {toggle="true"}
	Keep everything and run one repair lane per family: widen the janitor, finish the guard, install everywhere with a loud check, fix the pickup, build the missing census instruments.
	Corrections after review: "no new mechanism" was not true of these lanes, and the per-lane cost was taken from two unfavorable cases, not from comparable work. Status: not recommended.
	<empty-block/>

# Your decision {toggle="true"}
	One item on your decisions page: go on the trial with the named task and a one-week appetite (recommended), go with a different task you name, or no-go and say what is missing. Bet 1 ends when you tick.
	<empty-block/>
