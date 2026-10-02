# Goals v6, the diff against v5 (draft, skills-f, 10/1 9:20 PM America/New_York)

Ben ticked option A on 10/1: "`docs/GOALS.md` gains COMPONENTS, one line each: what it does for the goal, its measure, its state word, refreshed by script at every release and shown in the Components toggle. The hook card adds one line naming them, and each measure line shows its value against the hand-run bar". He also wrote, on report states: "we need another column for a super brief summary of exactly where we are and what needs to happen to actually get to a finished state, and estimate of much longer we will need to finish".

This file is the diff. Nothing in v5 is removed except the status words. When Ben ticks it, v5 becomes v6 in `docs/GOALS.md` and `docs/goals/card.md`, and the Goals page and the Components toggle render from it.

## Change 1: status words go, three fields come

v5 ends every goal with `Status: MET | PARTIAL | NONE | UNKNOWN`. v6 ends every goal, and every component line, with the same three fields Ben asked for:

- `Now:` where it stands, one line, with the date of the evidence.
- `To finish:` what must still happen for it to be done, one line.
- `Est:` how much longer, as a duration or a date.

The release script refuses a GOALS.md whose goal or component lacks any of the three, or whose `Now:` evidence date is older than the last release.

## Change 2: the measures table gets a live column

| Measure | Hand-run bar | Latest read | Read from |
|---|---|---|---|
| Top-tier tokens per build | 17.3M | pending the 10/2 census of today's seven lanes | four-number read per closed record |
| Hours ask to accepted | 4.70 h | 1 to 3 h per lane on 10/1 (seven lanes, skills-o records) | records |
| Rework after acceptance | 0 | 0 on the seven 10/1 lanes so far; 7-day window open | git log, records |
| Work lost or stalled | 1 | 2 on 10/1 (lane 62 idle 7 h, pane silent 5.3 h) | flush log, ledger, records |

The census writes the "Latest read" column at every release; a hand edit of that column is refused.

## Change 3: COMPONENTS section, new

One line per component. The order is the order of Ben's plan: aim, Ben's channel, the check, the work, the measurement, the cleanup, the learning, the hosts.

| Component | What it does for the goal | Measure it serves | Now (10/1) | To finish | Est |
|---|---|---|---|---|---|
| Goal card | Keeps the aim and the brake in every session | all four | v5 shown at session start and in long stretches since 9/24 | v6 with components and live values, refreshed by script | v6 tonight, script 10/3 |
| Decisions page (with notion-writing) | Ben's one home: decisions, goals, bearings, what is going on | work lost or stalled | rendered from repo files, round trip works, published by skills-o | card, bearings and components toggles (72), page-shape rule (72), three fields (73), routing rule with defaults | 72 and 73 by 10/2 3 PM, routing 10/4 |
| Bearings | A fresh high-tier agent answers Ben's four questions daily | all four, the STOP line | independent run 10/1, CONTINUE | prediction check scheduled, second RE-PLAN enforced at accept, verdict on the page | 10/4 |
| Build loop (team-build) | Spec to accepted in one Workflow, mid tier builds, high tier reviews | tokens, hours | the only build route since lane 67, seven lanes on 10/1 at 1 to 3 h each | one Codex-led run, lead turns read by the census | 10/3 (lanes 62, 69) |
| Delegate | Research, review and audit fan-out, cheapest agent runs the tools | tokens | used for every audit, four lanes on 10/1 | nothing new, ladder measured at the next census | fed |
| Multi | Peer notes between panes, action items wake, FYI and ACK do not | work lost or stalled | notes deliver, inboxes register from the main session | packets out of docs/notes, a silent pane reported within 30 min | 10/4 |
| Census | Reads the four measures from records and transcripts | all four | four-number read per record, three scripts, 38 lanes of patches | one module, per-component effect, lead cost read | Ben's simplification tick, then 3 days |
| Janitor | Cleanup as we go: worktrees, branches, temp, packets, records | work lost or stalled, hours | daily safe sweep, 0 removed on 10/1, 10 classes without an owner | owners for every class, closeout calls it, prevention checked against the 9/30 cleanup | 10/3 (lane 74) |
| Knowledge | What one session learns reaches every machine | rework | daily triage timer, Windows run blocked on ATTENTION, memory does not sync | triage as a skill, store synced through dotfiles, memory writes to it | 10/5 |
| Hosts (Codex, Claude, pane setup) | Same skills on every host, thin host layer, the panes Ben really runs | all four | skills and roles mirrored, two Codex hooks, a Codex-led build has never finished | Codex-led DONE build, pane setup matched to Ben's routine | 10/4 |

Refresh rule: the release script rewrites `Now`, `To finish` and `Est` from each component's record line in `docs/components.md` (lane 72 creates it) and refuses a release when a component line is older than seven days.

## Change 4: the card

v5 card plus two lines. The byte cap moves from 1,200 to 1,600 so the two lines fit; the hook reads the same file.

```
GOAL: Agent work gets cheaper, faster and more reliable at equal or better quality, on any agent host, Codex and Claude Code first. Change only what improves one of these and worsens none: top-tier tokens per build, hours ask to accepted, rework after acceptance, work lost or stalled. Each change names the measure it will move; the next census checks it.
MEASURE (bar / latest): tokens 17.3M / pending 10/2 census; hours 4.70 / 1 to 3 per lane; rework 0 / 0; lost or stalled 1 / 2.
COMPONENTS: goal card, decisions page, bearings, build loop, delegate, multi, census, janitor, knowledge, hosts. Now, To finish and Est for each: docs/GOALS.md and the Components toggle on Ben's page.
NOT: waiting to be asked. NOT: more parts than the simplest design; a symptom fix. NOT: a new mechanism while an existing one is unfed or unmeasured. NOT: a rule no script checks. NOT: top-tier execution. NOT: a host-specific primitive as the shared contract.
DONE: a build goes spec to accepted through the plugin, led once from Claude and once from Codex with a mixed handoff: lead under 20 turns, mid tier builds, high tier reviews, nothing lost or stalled, census beats the hand-run build on all four measures.
STOP: bearings says RE-PLAN twice in a row or CUT: stop that lane, put it on Ben's page, work another.
SOURCE: docs/GOALS.md
```

## Change 5: two goals reworded, none removed

- "Cleanup has an owner" becomes "Cleanup happens as we go": the janitor owns every class of leftover an agent can create, a lane's closeout removes its own, and the main checkout of every durable host is clean after every lane. In Ben's words (9/28): "including janitor, removing tmp files with it (and setting them up so they can be removed), cleaning up worktrees and branches as we go".
- "Decisions and goals have one home that Ben reads" adds Ben's two sentences from 10/1 on toggles and immediate access, and the Done box's place at the end of Waiting on you now.

## Not in this diff, on Ben's page as separate items

- Decision routing classes and defaults (which decisions are Ben's, the lead's, automatic).
- The simplification lane (one census module, pickup as a page diff, one context hook, six scripts split).
- A fifth measure for output quality.
