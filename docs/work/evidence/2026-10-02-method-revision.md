# Method revision after Ben's challenge (skills-f, 10/2 afternoon America/New_York)

Written by the lead from the three second-round reports (docs/work/evidence/2026-10-02-research2-{alternatives,who-redesigns,owner-decision}.md) and the seven first-round reports. No synthesizer in between this time. Evidence grade is stated per claim; the fetch tool summarizes pages through a small model, so "read" below means via that extractor unless marked PDF.

## 1. What Ben challenged, and the verdicts

**"Rearchitecting from scratch with just the problem is a fresh roll on the same input." Correct, and the research says so.**
- No engineering source read endorses a design written by someone kept ignorant of the current system. Ousterhout's "design it twice" is the same designer weighing two designs. Google's alternatives section is written by the doc's authors. Fowler: the team that built the system decides when to sacrifice it, and a new team "hates code it didn't write" and decides worse. Spolsky: the knowledge is in the code and a rewrite throws it away; staff with experienced architects. Chesterton's fence puts the burden on the reformer to understand the old thing first. A targeted search for the blind-designer practice found nothing but clean-room reimplementation, which exists for copyright, not design quality.
- The LLM evidence agrees. Resampling the same model on open-ended prompts repeats itself, and different model families also produce "strikingly similar outputs" (Jiang et al., NeurIPS 2025, abstract). Multi-agent debate does not reliably beat single-agent baselines on answerable tasks, and nothing measures it on design. The one place diversity measurably helps is review: heterogeneous models improve debate over same-model instances (Zhang et al. 2025), and judges favor their own model's output (Panickssery et al. 2024).
- Where independence IS endorsed is review, by experts: NASA standing review boards sit outside the project chain but must be competent and current (handbook PDF, read); Rust RFCs are judged by the domain sub-team plus open comment; Google shares the doc with a wider expert audience. Independent authorship: no. Independent expert review: yes, everywhere.
- Verdict: the blank-page designer is gone. The rethink is done by the one who knows the system and its failure history. What is added is an independent expert review of that rethink, by a different model family when possible.

**"I don't have the judgment to select from two architectures." Correct, and every owner-facing practice read agrees.**
- Basecamp's betting table decides which few shaped pitches get a team for one fixed cycle. A pitch is Problem, Appetite, rough Solution, Rabbit holes, No-gos, read beforehand; the builders "resolve all the details". Amazon's leaders read one page plus a FAQ of five pages or less in silence, then ask whether the problem is real and the payback large. Cagan: leaders assign problems and outcomes, teams own the solution. Spolsky: the customer reads the user-level spec to confirm it is what they would pay for; the technical spec is the programmer's.
- Kahneman and Klein (PDF, read in full): a judgment is reliable only in an environment with valid cues and feedback on that kind of call; confidence is no guide. Ben has years of feedback on "did this failure stop" and "did this cost too much" and none on comparing architectures.
- Verdict: Ben is never asked to pick a design. He decides the bet.

**"Did the research go deep enough?" No. Round one was wide and shallow; round two is narrower and still mostly extractor-grade.**
- Round one: 34 search-only tags, 21 extractor quotes, a handful of primary reads across 860 lines; it produced names and slogans. The synthesis then built its central step from the lead's own mandate, not from the reports.
- Round two: three primary reads in full (Kahneman and Klein PDF, NASA handbook PDF, Rust README raw), the rest extractor summaries, several sources not reached (Brooks chapters, Alexander, Toyota set-based mechanics, Larson's design chapter). The pattern across sources is consistent enough to act on; the quotes are not byte-exact. Future lanes fetch raw pages with curl and quote from the text layer.

## 2. The method, revised

Four markdown files and a planning turn. Nothing is coded until a misfit shows a check is needed.

**Roles.**
- **Owner (Ben).** Owns PROBLEM.md in his words. Owns the misfit list's wording, because each misfit is a failure he has seen. Decides, per bet: is this still my problem, go or no-go, the appetite, and at the end whether the listed failures stopped. Never picks a design. May veto one.
- **Lead.** Holds the problem, the misfit log and the system's history. At each planning turn does the rethink: design it twice (Ousterhout), both designs written by the lead with the misfit log open. One is the continue design, the smallest increment on today's system. One is the simplest-core design, starting from the smallest working core that would not have the recurring classes (Gall, Parnas), with Chesterton applied: every removed part names the misfit it answered and where that misfit goes. The lead recommends one, in writing, with its trade-offs.
- **Independent reviewer.** A different session, a different model family when available (Codex for a Claude lead), expert in the system because it reads the design note, the misfit log and the code. It argues against the recommendation on three checks: wrong problem (Polya's "is the condition sufficient", the XY check), second-system effect (does the new design add anything no misfit demanded, Brooks), and Chesterton (any part removed without its misfit named). Its objections go on Ben's page unedited.
- **Builders.** Build inside a bet. Log a misfit line before any fix. Never add scope or extend the appetite.

**The pitch page for Ben** (one Notion item, toggles, read before deciding):
1. Problem, two to five lines, his words with the lead's proposed edits marked.
2. The recommendation, one paragraph, with the appetite proposed.
3. One toggle per path: what it is in plain words, what it ends (which misfit classes), what it costs (parts added and removed, time, tokens), what it risks (rabbit holes), what it will not do (no-gos). Two or three paths, never more.
4. The reviewer's objections, unedited.
5. Waiting on you now: go with the recommendation / go with another path / no-go / set a different appetite. The recommendation applies if he ticks go without choosing a path.

**The cadence.**
- A bet runs for its appetite and stops at the appetite, done or not (Shape Up's circuit breaker). Mid-bet, the only change is a kill when the reviewer or lead finds the problem statement false.
- Every bet ends with a planning turn, which produces the next pitch page. The planning turn is the RETHINK Ben asked for, and it is routine, not heroic, because the simplest-core design is written every time by someone who knows why the parts exist.
- A replacement goes in incrementally behind a seam and the old path is deleted at bet close (Fowler's strangler, Larson's migration); a bet that leaves both paths is not done.
- Ben judges a finished bet on the misfit list: which listed failures stopped, which recurred. Cost readings (tokens, hours) are recorded, not targets.

**What is retired**: the goal card as the driver, the four-measure admission rule, the bearings judge as a separate role (its three questions move into the reviewer's checks), the decisions pickup, the census scripts as decision inputs. The card stays on main until PROBLEM.md exists so sessions have something, then it goes.

## 3. What this does not fix
- The lead's theory dies with each context window. The design note and PROBLEM.md are the lead's memory; the lead rereads them first thing. Fowler: one or two people keep the design whole; here it is one role across many sessions.
- Second-system effect in the lead's own rethink. The reviewer's check is the only brake; Ben's appetite is the other.
- Review by a different model family is the untested piece. Jiang says families converge on open-ended prose; Zhang says heterogeneity helps debate. Try it, record whether the reviewer's objections ever changed a decision, and drop it if they never do.
- Host stalls and throughput are operations problems, outside this method.

## 4. The first bet, if Ben says go
Appetite proposed: two working days. Output: the first pitch page for the harness. Steps: PROBLEM.md draft from Ben's words for his edit; misfit list from the detritus census, the component analysis and the history since 9/20, one line each, worded for Ben to accept; two designs by the lead, one of which may be "stock Claude Code and Codex plus a few files, the rest deleted"; Codex review; page. No code.
