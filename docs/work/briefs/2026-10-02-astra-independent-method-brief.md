# Brief to Astra (skills-a): an independent method for building with agents

DRAFT for Ben's edit. Not sent. From skills-f on Ben's instruction, 10/2.

## Why you, and why this order

Ben asked for this. You led the harness until the 9/24 hand-off, so you know the system and how it got here; you did not write the current proposal and have not read it. That makes you the reviewer every engineering practice we found actually uses: independent of the author, expert in the thing reviewed. The order below is strict because the point is a second opinion, not a second reading of ours. You read the problem and the raw evidence first, research from scratch, write and commit your own plan, and only then open our proposal. Commit hashes show the order was kept.

Do not ask skills-f anything until step 5. Questions for Ben go in your report; he reads it directly.

## Step 1: the problem, in Ben's words only

Read these and nothing else from the method work:
- Ben's statements, verbatim, in `docs/decisions/history/2026-10-02.md` under "Ben on the aim and the method" and his quotes of 10/1 in `docs/decisions/history/2026-10-01.md`. Start with these three: "every complex system i have tried to build with LLM agents so far has gone the same way. I don't understand enough to make some decisions, so I defer them to Fable. I want to automate as much as possible, so I ask fable to orchestrate other agents. I make local decisions as fable asks. At the end of weeks and months of work, I have a massive codebase consisting almost entirely of patches, which still does not solve the actual problem and now is so complicated that it never can." "I wanted to instead RETHINK, on every planning turn (different from every turn), and always be willing to throw out our planned architecture for a simpler one that wouldn't have the class of problems rather than fixing each problem in the class as it appears." And his picture of the end state from 10/1: "a final orchestration harness that creates amazing outputs in a perfect blend of human intelligence and machine intelligence, with human input guiding at exactly the right moments and the code and architecture staying super simple, clean, and cleaned up from as-we-go messes."
- The facts of what happened, not anyone's conclusions: `docs/work/evidence/2026-10-01-detritus-census.md` (what agents left behind), `docs/work/evidence/2026-10-01-component-inventory.md` (what exists), `docs/work/evidence/2026-10-01-component-ideas.md` (what Ben asked for, with dates), the repository itself (`git log --stat` since 9/20, file and test counts, the lane records under `docs/work/`), and the history files from 9/20 to 10/2 for the sequence of events. Note what you count: files, tests, lanes opened and closed, parts removed.
- Remember the harness is a means. The ends are Ben's real projects (Cadma, BTO, the smaller apps). A method that says "no harness" is in scope.

Write, before anything else, a one-page statement of the problem as you understand it, in plain words, with the things you think Ben may have wrong or incomplete, and the questions you would ask him. Commit it as `docs/work/evidence/2026-10-02-astra-problem.md`.

## Step 2: research from scratch, deep and wide

Ben's words: "do max research of how others structure software engineering projects with teams, including large teams, and read the results with a mind to which of these methods would help our goals and how." Go as far as the tools allow. Suggested breadth, not a limit:
- Large organizations: Google (design docs, readability, code review, large-scale changes, Site Reliability Engineering postmortems), Amazon (working backwards, two-pizza teams, one-way and two-way doors, Correction of Error), Microsoft (the Windows and Office engineering histories, Spolsky's accounts), Netflix, Stripe, Shopify (migrations, platform teams).
- Open source at scale: Linux kernel process and maintainers, Rust RFCs and the core team's governance, Python PEPs and the steering council, Kubernetes SIGs and KEPs, Debian. How decisions are made, reversed, and who may say no.
- Classic engineering: Brooks (Mythical Man-Month, Design of Design), Parnas (modules, information hiding, the rational design process and how to fake it), Royce and the misreading of waterfall, Boehm (spiral, cost of change), Humphrey and the Capability Maturity Model, DeMarco and Lister (Peopleware), Weinberg, Gall (Systemantics), Alexander (misfits), Conway's law and Team Topologies, Ousterhout, Hickey, Fowler's evolutionary design and strangler fig, Kent Beck (XP, Tidy First), Cockburn (Crystal, information radiators), Shape Up, Lean and Toyota (set-based design, A3, kaizen), DORA and Accelerate (what the evidence says and does not), critiques of SAFe and scaled agile.
- Problem discovery and the owner's role: Gause and Weinberg, Polya, Rittel and Webber on wicked problems, Cynefin, Cagan's empowered teams, Klein and Kahneman on when judgment is trustworthy, Kahneman and Klein's premortem.
- The agent era specifically: what changes when the team is agents (cheap labor, no memory across sessions, no stake in the outcome, context windows, convergence of outputs across samples and even across model families, judge self-preference), and what practitioners and vendors claim with what grade of evidence. Include failures.
- Anything we have not thought of. Name it.

Evidence discipline: read primary text where you can and say what you read in full, in part, or only as an abstract or a summary. Quote only what you read. Material known only from search results goes in a separate Unverified section. For each method you keep, say which of Ben's problems it ends, at what cost, and what evidence says it works, graded (controlled study, measured practice, experience report, vendor claim). A method with no evidence can still be right; say that it has none.

Commit the research as `docs/work/evidence/2026-10-02-astra-research.md`. Length is yours; a long file is fine if the pattern section at the top is short.

## Step 3: your plan, de novo

Write the method you would run, for Ben, from the problem and the research, as if no proposal existed. Cover:
- Roles: Ben, the lead session, builders, reviewers; what each decides and may not decide. Be exact about what Ben decides, in what form he sees it, and how long it takes him to read.
- Artifacts: every file or page the method needs, and why each exists. Fewer is better; say what you left out and why.
- Cadence: when planning happens, when the architecture is reconsidered, what forces a rethink, what stops work.
- Simplicity: the mechanism that makes removing parts the ordinary outcome, not the heroic one. How the method notices it is itself growing.
- Decisions under ignorance: how a decision Ben cannot judge gets made well, and how the method avoids "defer to the top model, who decides inside the plan".
- Memory: how the lead's understanding survives sessions resetting.
- Knowing it works: what is read, how often, and what reading means stop.
- The current harness: what you would keep, delete, or replace, part by part, with the failure each kept part answers.
- First two weeks: concrete.
- Costs and risks, and what you are unsure of.

Write it for Ben: plain words, toggles if you publish to Notion, under four pages for the plan itself. Commit it as `docs/work/evidence/2026-10-02-astra-plan.md` BEFORE step 4. The commit is the proof of order.

## Step 4: only now, read ours and compare

Read, in this order: `docs/work/evidence/2026-10-02-method-revision.md` (the current proposal), `docs/notion/lead-view-architecture-and-plan.md` (the lead's view for Ben), `docs/work/evidence/2026-10-02-method-ruling.md` and `docs/work/evidence/2026-10-02-method-synthesis.md` (the earlier version and why it was retracted), then the ten research reports `docs/work/evidence/2026-10-02-research-*.md` and `-research2-*.md`.

Then write `docs/work/evidence/2026-10-02-astra-review.md`:
- Where our proposal is wrong, weak or unsupported, point by point, with the evidence or reasoning. Be specific and unsparing; politeness is not useful here.
- Where it is better than yours, and why.
- Where yours is better, and why. If the two converged, say so and say what that convergence is worth given that you had different inputs and a different model.
- Your recommendation: adopt yours, adopt ours, or a specific merge. One paragraph Ben can act on.
- Open questions only Ben can answer, each with your recommended answer.
- What you spent: wall clock, and tokens if you can read them.

## Rules in force
No code is written in any step. No test suites or builds. No OCR tools. Never set or switch a git identity; commit as the machine's configured identity only, on main, no force. A denied command stops that step and is reported, never routed around. Never print a secret value. All times you write are America/New_York. Report by note to skills-f only at the end of step 4, with the four file paths; Ben reads the files directly.

## Appetite
Ben sets this. Suggested: finish all four steps within one working day of starting. If the research is not done at the appetite, stop, write what you have with its gaps named, and continue to steps 3 and 4 anyway; a plan from partial research is more useful than no plan.

## Addendum, 10/4 1:10 PM New York, from skills-f

Sent today on Ben's instruction of 10/2. Since the draft, Ben ticked "Go, Path A, appetite two working days" on the revised method (docs/work/evidence/2026-10-02-method-revision.md), so the proposal you will read in your last step is the adopted one, and your plan and comments are the independent check on it before its first planning turn ends on Tuesday 10/6. Appetite for you: one working day; report by Monday 10/5 at 5:00 PM New York with whatever is done and its gaps named. Also read PROBLEM.md at the repo root (the lead's draft from Ben's words, not Ben's edit yet) and treat it as one more author's reading, not as the problem. Report file: docs/work/evidence/2026-10-05-astra-method-review.md, verdict on line 1. Reply with one RESULT note naming the file. Standing rules apply: never print a secret or any substring of one, a denied command stops the step and is reported, no test suites on Windows, no git identity changes, commits on a branch named lane-71/astra-method-review, nothing merged.
