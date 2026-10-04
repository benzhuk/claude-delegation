# Design two: the simplest core. One host, one checkout, four files and a conversation

Written 2026-10-04 by the lead (skills-f) for bet 1, with the misfit list open (docs/misfits.md). The other design is docs/work/evidence/2026-10-04-design-continue.md. Ben does not pick between them; the lead recommends in the pitch page and Ben decides go or no-go and the appetite.

## The idea in one paragraph

Four of the six families (218 of 282 rows) are produced by the shape of the system, not by bugs in it: work spread over four hosts and several panes that talk by notes, guards that read the text of commands, a rendered page with a pickup daemon, and a census built to score a card. This design removes the shape. Agents run on one host in one checkout. Ben talks to one lead pane and reads one hand-published Notion page. Builds run as one Workflow from one Opus pane, which creates and removes its own worktrees. Secrets are not in any agent's environment, so there is nothing for a text guard to catch. The method is four files and a conversation. The plugin shrinks from about 3,000 tracked files to under 100.

## What stays, and why

| Part | Why it stays | Family it serves |
|---|---|---|
| notion-writing skill, `notion.js`, `page-lint.mjs` | Ben's page rules, the one-request markdown publish and the lint are the parts he uses and answered on without complaint. | Ben's page |
| team-build's build loop Workflow (builder, reviewer, integrator), the mandate template and the subagent contract | The loop in one Workflow turn is the only shape that got a build through with under 20 lead turns (run of 9/22, 15 agents, 50 minutes). | The project grows |
| delegate skill, as prose | How to fan out research and review. No scripts. | none; it costs nothing |
| The mirror script to `~/.agents/skills` | Codex reads the same skills. | Codex first-class |
| Knowledge inbox and index as files, the capture rule in the rules file | Lessons across sessions. The hook that counts reads goes. | The project grows |
| PROBLEM.md, docs/misfits.md, docs/bets/, docs/decisions/history/ | The method. | all |

## What goes, and the misfit each removal names

| Part removed | Size | Rows it produced or fed | Family |
|---|---|---|---|
| Three agent hosts (Windows, Mac, Hetzner stop running agents; Netcup runs them all) | four installs per release | machine unreachable (10), rollout hand step (3), built not installed (9), release drift (2), host froze (2), host unreliable (2), child environment wrong (8), writes not persisted (2) | Four hosts |
| multi skill: notes transport, inbox hooks, flusher, pane registration, 23 scripts and 543 lines of skill text | 23 scripts, 4 hooks | note never reached (9), stall nothing detects (8), dispatch outran collection (1), 44 lead turns opened by note wakes in one day (M142) | Four hosts |
| decisions renderer, pickup, handback, goals mirror, title, project-config, their fixtures | 56 files, 21 lanes | page or pickup misbehaves (11), owner input lost (4), whole-page write (2), work put on the owner (3), goal text out of step (3) | Ben's page |
| census scripts, four-number read, collector, bearings skill and state, goal card injection | 3 census scripts, bearings, reminder hook (50,000 tokens per 300-prompt session, M9) | counted wrongly (11), cannot be computed (10), weak evidence (3), token cost over bound (10, as the measure that never changed behavior) | Numbers |
| dispatch guard (724 lines), delete guard (674), secret guard as an agent-pane control, backlog notice, knowledge-log hook, resume-size, worktree-location | about 3,300 lines of hooks | false positive (22), check proves less (11), guard wider (6), guard gap (4), no owner switch (4), routed around denial (2), hung on prompt (6) | Guards |
| janitor skill, janitor.mjs, three timers | 307-line skill, timers on three hosts | cleanup misses (5), cleanup dirties (2), and the mess it never reached (23): the loop that opens a worktree now closes it | Mess |
| 76 test files, about 3,400 tests | most of the repo's logic | test flaky or red on main (11), check proves less (11), inode exhaustion from leaked test homes (5) | Guards, Mess |
| docs/specs (1,500 files) and docs/work (1,044) off main onto an archive tag and branch | 2,544 files | mess left by agents (23 includes 193 untracked peer packets), record disagrees with the work (2) | Mess |

## How each of Ben's components lives in this design

Ben's 9/28 plan named components, each with an efficacy test. This table is the answer M206 asked for.

| Ben's component | In this design | Efficacy test Ben can read |
|---|---|---|
| Whole package, one plugin everywhere | One plugin, installed on one host. Codex reads the mirrored skills. | Install count per release: 1. |
| Skill set, one build for every project | notion-writing, team-build loop, delegate prose. | A real project task (BTO or Cadma) goes brief to merged through the loop. |
| Goal card | Replaced by PROBLEM.md and the misfit list. | Ben can say for each family whether it stopped. |
| Decisions page, your one home | One hand-published page from a markdown file in the repo, linted, read back for ticks with `notion.js read`. Items in the block shape of the notion-writing rules. No pickup daemon. | Ben's ticks are read within the next planning turn, none lost. |
| notion-writing | Unchanged. | page-lint clean on every publish. |
| Bearings, the daily check | Replaced by the bet's appetite and circuit breaker. The planning turn asks the misfit question. | No bet runs past its appetite without a decision. |
| Janitor | Removed. The build loop removes what it created; `git worktree prune` and a two-line leftover listing run at each planning turn. | Worktrees and branches on the host at a planning turn: zero outside running loops. |
| Multi, notes between sessions | Removed. Two panes on one host; the Opus pane is launched per build with a brief path and writes a record file; the lead reads records at planning turns. Nothing nudges an idle pane because no pane waits idle. | No lane state read from notes. |
| Lead and tiering | Fable plans and pitches at planning turns Ben opens. Opus runs the loop in one turn. Sonnet builds. Codex reviews with the code in hand. | Lead turns per build under 20, counted from the transcript. |
| Pane setup | Two panes, one host, launched by Ben: `skills-f` for planning turns, `skills-o` for a build. | The pane doc matches what Ben runs. |
| Knowledge and memory | Inbox and index as files, synced by the dotfiles like everything else. | The inbox is read at the start of a planning turn, by rule. |
| Codex host support | Codex is the independent reviewer on every pitch and may lead a build with its native agents; mixed handoff through the record file. | One build led from Codex through the same record shape. |
| Census and speed | Two numbers only, read by hand at a planning turn: top-tier tokens for the bet from the provider's usage page, and hours from brief to merged from the record's timestamps. | Both numbers appear on every pitch page. |

## What it ends

- The four-host family ends: there is one host to install on and no notes. Rows about the Mac, Hetzner, stale sessions and cross-host paths cannot recur.
- The guards family mostly ends: with no secrets in agent sessions and no text-matching hooks, false positives, route-arounds and lifts have no mechanism. Permission prompts hanging builders end by running builders with an allow list and auto-deny, so a refused step fails in seconds and is reported.
- The mess family shrinks to what a loop fails to remove on an aborted run, which the planning turn lists.
- The numbers family ends because the numbers are replaced by Ben's judgment on misfits plus two readings.
- Ben's page family shrinks to the hand-written page's own errors, which the lint and the notion-writing rules already catch.

## What it costs

- One bet of about one working week to shrink: archive the record to a tag, delete the parts, uninstall the hooks on all hosts, stop the three agent hosts, move the keys out of agent sessions on Netcup, write the hand-published decisions page from a template, run one real build through the loop with a Codex review. No new code except the page template.
- Ben's time in that week: one tick on the pitch, one hour to stop panes on three machines and confirm which host runs agents, one tick on the first build's result.
- What is lost: the rendered page's automatic Bearings and Components sections (replaced by the pitch page at planning turns), note wakes between panes (replaced by Ben launching the Opus pane), parallel lanes across hosts (replaced by parallel agents inside one Workflow on one host).

## Risks, with the misfit each one would produce

- Netcup alone is a single point: if it is down, no agent work runs. The record shows Netcup as the most reliable of the four (Windows unreliable M64, Mac unreachable ten times). Misfit if wrong: host unreliable.
- Ben launching the Opus pane per build is a hand step. It is one command with a brief path, and it replaces the idle-pane stall the record shows eight times. Misfit if wrong: work waits on the owner's hands.
- Removing the test suite removes the check that a loop change still works. The loop is one script; its check is one real build. Misfit if wrong: check proves less than it claims.
- The hand-published decisions page can be overwritten over Ben's edits like any page. The notion-writing read-before-write rules and the backup snapshot already cover this. Misfit if wrong: whole-page write over owner edits.
- Keys out of agent sessions means an agent cannot publish to Notion; only the lead pane does. Builders never needed to. Misfit if wrong: a part added to let agents publish.

## No-gos

- No new hook, daemon, timer or guard in the shrink bet. If a failure demands one, it goes on the misfit list and waits for the next planning turn.
- No rewrite of the loop script; it is kept as it runs today, with the round bound moved into its arguments (M212).
- Nothing deleted from the record: everything leaves main onto a tag and branch, fetchable.
- No change to Ben's own machine policy (the secret guard in his dotfiles is his, not the plugin's); the design only removes it as an agent-pane control.

## Misfit log while designing

- The two numbers kept (tokens, hours) have no instrument in this design; they are read by hand. That is a judgment that a hand reading at a planning turn beats a census that produced 24 rows. The reviewer should test it.
- "One host" depends on Netcup having what agents need (node, Codex, Playwright for visual checks). Codex could not run on Hetzner because of its sandbox (M24); it runs on Netcup today.
- The design removes the daily bearings check that produced the five RE-PLAN verdicts which, in the end, were right. Its replacement is the planning turn itself.
