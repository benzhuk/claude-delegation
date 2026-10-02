# Components: Ben's plan against what is built (skills-f, 10/1 9:10 PM America/New_York)

Ben asked: "analyze my components ideas vs what we have and what we've built. how integrated are they? how well do all the parts work together? do we have all the components we need for a great workflow in the future written and planned? ... what is left to plan to make this utopia our reality?"

Sources, all on main: the three reports written tonight from the repo record, `2026-10-01-component-ideas.md` (what Ben asked for, with his quotes), `2026-10-01-component-inventory.md` (what exists and what calls what), `2026-10-01-detritus-census.md` (the mess and who owns it); the 9/28 component map; docs/GOALS.md v5. Judgments below are mine.

## 1. The short answer

The spine Ben asked for exists and works: a lane goes spec to main through one Workflow with Sonnet building and Opus reviewing, the record refuses acceptance without evidence, the decisions page and the Goals page are rendered from repo files, and peer notes carry coordination between panes. Seven lanes landed through it today in about eight hours. That is the first time the whole chain has run end to end without hand steps.

Around that spine, four of Ben's components are built but not joined to it, and the joints are where his utopia is missing:

| Component Ben named | Built | Joined to the loop | What is missing |
|---|---|---|---|
| Goal card | yes | shown every session | no script knows whether it changed any decision |
| Decisions page and notion-writing | yes | lead quotes, skills-o publishes | card, bearings and components on it (lane 72); page shape as a rule (lane 72); Now/To finish/Est (lane 73) |
| Bearings | yes | writes a verdict daily | nothing reads the verdict: the 9/29 prediction check never ran, STOP is prose, no toggle on the page |
| Janitor | yes | runs daily, removed 0 today | nothing calls it when a lane closes; 10 classes of mess have no owner |
| Multi | yes | carries every note | 193 packets lie untracked in docs/notes; stalls still happen (lane 62, 7 h today) |
| Lead and tiering | yes | the Workflow is the only route | the lead's own cost is still the largest line (30.9M in 21 h on 9/26) |
| Census and speed | yes, three scripts | reads closed records | 38 lanes of patches; no per-component effect measured |
| Knowledge and memory | half | daily triage timer | no skill, memory never syncs, Ben's 9/29 words still the only ones |
| Codex host | half | mirrored skills and roles | a Codex-led build has never finished; lane 62 is the one running |
| Pane setup | doc only | none | describes a setup Ben does not run |

## 2. How integrated are the parts

Well joined: team-build, work records, the Workflow, accept, merge, the decisions renderer and the goals mirror form one chain, each step checked by a script and refusing when the previous step is missing. Multi notes reach the lead and skills-o reliably since the inbox fixes.

Islands (built, nothing calls them): bearings (only a due notice reaches a session), janitor (only its timer), delegate (only the docs), dev-server (nothing at all).

One-way seams (one part writes, no part reads): bearings predictions, dispatch-guard log, reminder and backlog text, card exposure, the Notion Author property rule. Every one of these is a "rule no script checks" in the card's own words.

Oversize parts that violate "many small files": work-record 2,757 lines, janitor 2,390, build-census 2,260, mirror 1,309, install-janitor-timer 1,093, four-read 1,000. Six scripts hold half the plugin's logic.

Castles of patches, by lanes that touched the same area: census 38, decisions pickup 21, build loop 13, inbox 7. The pickup's design (private captures, rounds, pointers, attestation, rebinding) exists so that an agent can read a tick on a page. Four unmerged branch names and a 7-hour stall belong to the census lane alone.

## 3. What happened to the component plan

Ben ruled on 9/28: "pursue all our goals and components in parallel ... every component, every goal, why not build towards them at once and set up tests for efficacy?" The lead and reviewer that day deferred to the card's "no new mechanism while an existing one is unmeasured" and held two lanes. The 9/30 plan was then written by measure (instrument, cost, reliability, DONE builds, hygiene) and never uses the word component. So the plan lost its index by component, and with it the efficacy test per component. The 9/28 map was the last document organized the way Ben thinks. Tonight's card v6 puts that index back where every session sees it.

## 4. Is the utopia planned

Ben's words tonight: "a perfect blend of human intelligence and machine intelligence, with human input guiding at exactly the right moments and the code and architecture staying super simple, clean, and cleaned up from as-we-go messes".

Taking that as four requirements:

**Human input at exactly the right moments.** Half planned. The decisions page is the right channel and the Done tick works. What is missing is a written rule for which decisions are Ben's, which are the lead's, and which are automatic, with a default that fires if Ben has not answered by a time. One item tonight already carries "default after 10/3 noon"; nothing makes that universal. Without the rule, agents decide when to ask, and today they asked Ben about report vocabulary while a 7-hour stall went unreported.

**Machine does the rest.** Mostly built. The build loop, accept and merge run alone. Not yet: cleanup on close, bearings consequences, knowledge sync. Each exists as a part; none runs as a consequence of another part's result.

**Super simple, clean architecture.** Not planned. There is no lane whose goal is fewer parts. Three census scripts should be one; the pickup should be a diff of the page against its last render; three text-injecting hooks should be one with one measured byte budget; six scripts need splitting. The card forbids castles; nothing schedules their demolition.

**Cleaned up as we go.** Planned once (9/28), built as a daily sweep of the safe class. Lane closeout removes its own worktree, branch and scratch when run, but the mess tonight is of other kinds: 193 peer packets, 7 pointer files, 11 ledger files, 12 stale records, an empty worktree dir, 7 merged origin branches, 109 MB of rollout backups and 1,428 handoff files in the home directory. None has an owner.

## 5. What is left to plan

In the order I would run them. Each names the measure. Items marked Ben need his tick because they change the aim or the architecture; the rest sit inside standing authority.

1. **Card v6 with COMPONENTS and the three fields** (Ben ticked A; draft tonight at `docs/goals/GOALS-v6-draft.md`). Measure: every component has Now, To finish, Est in every session.
2. **Decision routing rule in the decisions skill.** Three classes: Ben's (aim, measures, money, machines, anything irreversible), lead's (lane rulings, ordering), automatic (everything a script checks). Every Ben item carries a default and a time; the lead's chat answers are quoted to history the same as ticks. Measure: items waiting on Ben per week and median wait. Lead spec; Ben ticks the class list.
3. **Bearings closes its loop.** The prediction check is a scheduled job; a second RE-PLAN marks the lane's record and accept refuses it; the verdict shows in the Bearings toggle (lane 72). Measure: predictions checked on time. Standing authority.
4. **Hygiene owners for every class found tonight** (lane 74, opened now). Peer packets move out of docs/notes to the agents home and age out; pointer and ledger files tracked or deleted by rule; stale records get a Status; lane closeout calls the janitor; home-directory backup and handoff folders get a retention rule. Measure: untracked files in the main checkout, janitor removals per week. Standing authority under the 9/28 ruling.
5. **Simplification lane, Ben.** One census module replacing three scripts; the pickup rebuilt as a page diff with no rounds, pointers or rebinding; one context hook replacing reminder, backlog and card injection, with a byte budget the census reads; the six oversize scripts split. Measure: files and lines in the plugin, lanes per area after the change. This is a RE-PLAN of the measurement and pickup areas and needs Ben's tick because it rewrites working parts.
6. **Knowledge that travels.** Triage becomes a skill; the knowledge store syncs through the dotfiles repo like the env file; a session's memory writes to the synced store. Measure: topic reads per host per week. Lead spec; standing authority.
7. **Codex to DONE.** Lane 62 recovery, then 69. Measure: the DONE line itself. Running.
8. **Output quality as a measure, Ben.** The four measures are about the harness; nothing measures whether what a build produced is good beyond rework within 7 days. If Ben wants "amazing outputs" counted, the fifth measure is a reviewer quality score per accepted build, read by the census. Ben's call; it changes the aim.
9. **Pane setup as Ben runs it.** Either the doc matches what he does, or the launch is a script he runs. Measure: a pane setup backed by the census. Lead spec after Ben describes his real routine in one message.

Not planned and should stay unplanned: new hosts beyond Codex and Claude, new Notion sections, any new guard.

## 6. The honest verdict

Integration is real along one path and absent across the rest. The components Ben named are all present as files; four are islands and ten classes of mess have no owner. The gap is not missing components. It is that the plan stopped being indexed by component on 9/30, so no one asked of each part "what does it feed and who reads it". Card v6 and lanes 72 to 74 restore the index and the joints. The architecture item (5) and the quality measure (8) are Ben's decisions and are on his page tonight.
