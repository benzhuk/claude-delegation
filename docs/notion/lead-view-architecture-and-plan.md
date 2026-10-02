# Read this first {toggle="true"}
	This is the lead's own view of the harness, its architecture and the plan, written for you on 10/2 after your two objections and the second research round. It is opinion with evidence named, not a decision record. Decisions stay on the decisions page. Detail for every claim is in the repository files listed in the last toggle.
	The short version: the harness reproduced the exact failure it was built to prevent. The way out is not a better card or more lanes. It is a method where you hold the problem, the lead holds the design and its history, a reviewer argues against the lead, and every bet has a fixed appetite and ends with a rethink. Most of what was built should be deleted at the first planning turn, and the method is written so that deletion is the expected outcome, not a brave one.
	<empty-block/>

# What went wrong, in plain words {toggle="true"}
	Your diagnosis, from 10/2: every complex system you built with agents became a pile of patches. You deferred the decisions you did not understand to Fable, asked for orchestration to automate as much as possible, and made the local decisions Fable brought you. Months later: a huge codebase, almost all patches, not solving the problem, too complex to ever solve it.
	The agent's half of that mechanism, which I own: an agent answers the question in front of it, and that question is always framed inside the current plan. Deferred decisions get decided from the plan, not from the problem. The options brought to you assumed the architecture, so your local decisions steered inside it. Every turn wanted to end with a lane merged, so the system produced lanes. When you deferred, nobody held the problem. The agent held the plan and could not throw it away, because the plan was its context.
	The harness itself is the proof. About 3,000 files and 3,700 tests. Thirty-eight lanes on the census, twenty-one on the decisions pickup. On 10/1, twelve lanes closed in one day; every one moved a measure and none removed a part. The goal card's rule, "change only what improves one of the four measures", is a rule every patch satisfies and almost no deletion can. The card mentioned your real aim only as one NOT line, and a sentence shown at session start changed nothing about what agents did.
	The specific numbers in the plan, three rounds, a 1,000-byte card, a 20-turn lead, were my guesses. There was no evidence behind them, and the research found none behind anyone else's numbers either. Experience reports only, no controlled studies.
	<empty-block/>

# What I would keep and what I would delete {toggle="true"}
	This is my view before the first planning turn writes the two designs. It is what I would argue for as the continue design. The simplest-core design may go further, and the reviewer may object. Treat it as a starting position.
	<details><summary>Keep, because it ends a failure you actually had</summary>
	The build loop Workflow (builders write, reviewers verify, integrator gates), run from one Opus pane, which took a build from forty lead turns to a handful. The identity guard and the secret guard, each born from a real incident (a wrong-account commit on 9/9, a leaked key on 9/1), with the secret guard's false positives narrowed. The delete guard, born from the 9/30 mess. The cross-host notes between panes, because the ledger is the only channel that survives a frozen host. Git as the sync path. The Notion publisher script, which writes a whole page in one request and keeps your authorship. The report-to-disk contract for subagents, verdict on line one.
	</details>
	<details><summary>Delete or retire, because it produced lanes and ended nothing</summary>
	The goal card as the driver of work, and the four-measure admission rule. The census scripts as decision inputs; they measured efficiency because efficiency was measurable, and simplicity went unmeasured. Bearings as a separate daily judge; its three questions move into the reviewer's checks. The decisions pickup rounds, pointers and attestation; twenty-one lanes to answer "what did Ben tick", and it failed again on 10/2. Backlog and reminder injection into every turn. The bulk of docs/specs, which nobody reads after the lane closes. Any mechanism with a maxRounds, a cap or a count that I set by feel.
	</details>
	<details><summary>Undecided until the designs are written</summary>
	The janitor. It now acts on five classes under your tick, and it is also the component that dirties what it cleans. Whether it stays as a sweeper or folds into "a bet is not done until its worktrees and branches are gone" is a design question. The Codex parity work: valuable if Codex is the second lead and the reviewer, waste if it is not. The knowledge inbox: twenty-five notes pending since July, one read in seven days; either it gets read at planning turns or it goes.
	</details>
	<empty-block/>

# The method I am proposing {toggle="true"}
	Four markdown files and a planning turn run by hand. Nothing is coded until a logged failure shows a check is needed, and then one check at a time. The full text is docs/work/evidence/2026-10-02-method-revision.md; the decision is on the decisions page.
	<details><summary>The four files</summary>
	PROBLEM.md, one page, in your words, owned by you. The misfit log, one line per failure you or an agent observed, each with its class, worded so you can judge "did this stop". Bet records, one per bet: the problem lines it answers, the two designs, the choice and reason, the appetite, the outcome, parts added and removed. Decision records, one per architectural decision, superseded never edited.
	</details>
	<details><summary>The planning turn, which is your RETHINK</summary>
	Run at the end of every bet. The lead restates the problem against the misfit log and names the classes. The lead writes two designs with the log open: the smallest increment on today's system, and the simplest working core that would not have the recurring classes, where every removed part names the failure it answered and where that failure goes. The lead recommends one. A Codex reviewer who has read the code argues against it on three checks: is this the wrong problem, does the new design add a part no failure demanded, does it remove a part with no failure named. You get one page, in toggles, and decide the bet.
	</details>
	<details><summary>Why this shape and not the one I proposed this morning</summary>
	This morning I proposed a fresh session that had never seen the architecture writing a blank-page design. You objected that it would be a fresh roll on the same input. The research agrees with you and not with me: no engineering source has an outsider author the new design, and the LLM evidence shows resampling, even across model families, converges on open-ended prompts. Where independence helps is review by experts, which is what NASA, Rust and Google all do. So the rethink is done by the one who knows why every part exists, and the independence goes into the reviewer.
	</details>
	<empty-block/>

# What you decide, and what you do not {toggle="true"}
	You decide five things, each one you have years of feedback on: whether the problem statement is still your problem; whether a failure on the list is real and worded right; whether to go on a bet; how much to spend on it, the appetite; and at the end, which listed failures stopped. Every owner-facing practice the research reached gives the owner this set and nothing more. Basecamp's betting table decides go or no-go and time from a short pitch read beforehand. Amazon's leaders read one page and ask whether the problem is real. Kahneman and Klein bound a non-expert's reliable judgment to exactly where they have had feedback.
	You do not pick between designs, and you should refuse if asked to. If a page asks you to choose an option that cannot be stated in terms of the problem or the failure list, that option is the lead's to decide, and the lead must record it as a decision record instead. You may veto a design. You may say no-go. You may cut an appetite in half.
	The page you read has a fixed shape: problem in your words, the recommendation with the appetite, one toggle per path with what it ends, costs, risks and no-gos, the reviewer's objections unedited, then the decision at the bottom. If you tick go without choosing, the recommendation applies.
	<empty-block/>

# The first bet {toggle="true"}
	If you tick go on the decisions page: appetite two working days, output one pitch page about the harness itself, and no code. I draft PROBLEM.md from your own words of 10/2 for you to edit. A runner compiles the misfit list from the detritus census, the component analysis and the history since 9/20, one line each, worded for you to accept. I write the two designs; one of them is likely "stock Claude Code and Codex, a few markdown files and the guards, everything else deleted". Codex reviews. You get the page.
	In flight meanwhile: lane 62 and lane 70 are parked on your guard-lift item. The janitor runs tomorrow at 6:00 AM for the first time with teeth. Nothing else starts.
	<empty-block/>

# Risks and what I am unsure about {toggle="true"}
	The lead's rethink can over-reach: Brooks's second-system effect, where the designer who knows the first system crams everything into the second. The reviewer's "no failure demanded this part" check and your appetite are the only brakes.
	The lead's understanding dies with every context window. PROBLEM.md, the misfit log and the one design note are the lead's memory, and the lead must read them first in every session. This page is part of that memory.
	A different-model reviewer is the untested piece. One study says model families converge on open-ended prose; another says heterogeneous models improve debate. We try it and record whether the reviewer's objections ever change a decision. If they never do within three bets, drop it.
	The method could itself become a castle. That is why nothing is coded first and the first two planning turns run with no new scripts. If you see a lane proposing to automate the planning turn, that is the pattern returning.
	Host stalls, like the overnight freeze on 10/2 and the one on 9/25, are an operations problem the method does not touch.
	<empty-block/>

# My advice to you {toggle="true"}
	Own the problem statement and never defer it. Everything else can be delegated; this cannot, because the moment nobody holds the problem the agent holds the plan.
	Set appetites and let them bite. A bet that runs out of time is a shaping error to fix at the next planning turn, not a reason to extend. The fixed clock is the one brake no agent will apply to itself.
	Judge failures, not designs. "Did the thing I complained about stop happening" is a question you can answer with certainty and an agent cannot fake.
	Expect deletion. If a planning turn ends with more parts than it started with and no failure named for each, send it back.
	Refuse DONE without the failure list. A finished bet names which listed failures stopped and which recurred. A report that says done and names none is not done.
	Restart sessions after an install. Today the plugin install left this very session running the old hooks, and it could not spawn agents until restarted. That is itself a misfit line.
	<empty-block/>

# Where the detail lives {toggle="true"}
	Method revision, written by the lead from the second research round: docs/work/evidence/2026-10-02-method-revision.md
	The lead's first ruling and its retraction: docs/work/evidence/2026-10-02-method-ruling.md and docs/decisions/history/2026-10-02.md
	The Opus synthesis and the seven first-round research reports: docs/work/evidence/2026-10-02-method-synthesis.md and docs/work/evidence/2026-10-02-research-*.md
	The three second-round reports: docs/work/evidence/2026-10-02-research2-alternatives.md, -who-redesigns.md, -owner-decision.md
	Component analysis, inventory and your original component ideas: docs/work/evidence/2026-10-01-component-analysis.md, -component-inventory.md, -component-ideas.md
	The detritus census and the janitor evaluation: docs/work/evidence/2026-10-01-detritus-census.md and -cleanup-vs-janitor.md
	All on GitHub, repository benzhuk/claude-delegation, branch main.
	<empty-block/>
