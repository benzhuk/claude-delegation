# Design one: continue. Keep the plugin, fix the families one by one

Written 2026-10-04 by the lead (skills-f) for bet 1, with the misfit list open (docs/misfits.md, 282 rows in 6 families). The other design is docs/work/evidence/2026-10-04-design-simplest-core.md. Ben does not pick between them; the lead recommends in the pitch page and Ben decides go or no-go and the appetite.

## What stays

Everything on main at 0.20.20: the plugin with eight skills, the hooks (dispatch guard, delete guard, reminders, inbox, backlog notice, knowledge log), the decisions renderer and pickup, the multi notes transport, the janitor and its timers on three hosts, the census and the four-number read, bearings, the goal card, four hosts, three panes, 3,082 tracked files, 76 test files. The method on top changes as Ben adopted on 10/4: PROBLEM.md, the misfit list, bets with appetites, a Codex reviewer on three checks.

## What each family gets

| Family | Rows | The lane this design runs | Parts touched |
|---|---|---|---|
| Agents leave a mess | 45 | Widen the janitor to every class the census found (peer packets, pointer files, test homes, rollout backups, knowledge inbox), make it act unattended under the once-ticked policy, fix the drift-file write, add a live-pane check. | janitor.mjs, janitor skill, three timers |
| Guards cry wolf | 69 | Finish lane 70 with the fix round now running, close the four pre-existing gaps, add an owner switch, narrow the delete guard's quoted-text matches, seal the test homes, retire tests that check old contracts. | secret guard in dotfiles, delete-guard.mjs, test runner, 76 test files |
| Four hosts, many panes | 67 | Install on every host after every release with a check that fails loudly, auto-restart stale sessions or refuse to spawn from them, fix the inbox registration and cross-host note paths, add a stall detector that reads lane records. | hooks, multi scripts, collector, install script |
| Ben's page and input | 37 | Keep the renderer; fix the pickup binding to a checkout, allow nested toggles in waiting items, add the components and goals mirrors Ben asked for. | skills/decisions (56 files) |
| Numbers nobody can trust | 24 | Build the two missing instruments (rework after acceptance, Codex lead turns), fix the clock start, replace felt bounds with measured ones. | census scripts, four-read, collector |
| The project grows | 40 | The adopted method: misfit list, bets, reviewer checks. No code. | PROBLEM.md, docs/misfits.md, docs/bets |

## What it ends, and what it does not

It ends nothing by itself; each lane ends rows when it lands. The record of the same approach since 9/20: 38 lanes touched the census, 21 the pickup, 13 the build loop and 7 the inbox, and on 10/4 rows are still being added to the same families at the same rate (16 rows dated 10/4). The two families that are products of the architecture, the four-host spread (67) and the guards (69), cannot be ended by this design, only kept at a lower rate, because the parts that produce them stay.

## Cost

- Six lanes at the recorded rate: a lane has cost 6 to 11 times the hand-run bar in tokens (M183) and one to two days each with review rounds.
- Every lane is a release to install on four hosts and every running session (family three again).
- The repo grows. There is no lane in this design that removes a part, except where tests are retired.
- Ben's time: a guard lift on his words for every guard lane, Mac access for every install, ticks for every lane's accept.

## Risks

- It is the path the problem statement names. PROBLEM.md says the codebase for a project must get smaller or stay flat while the problem gets more solved; this design cannot show that.
- The mess family depends on the janitor, which has produced seven rows of its own (cleanup misses, cleanup dirties).
- The guard lanes edit the thing that refuses edits to itself; each needs a lift of a security hook by hand.

## No-gos

- No new mechanism. Every lane fixes a named row.
- No lane on a family whose parts the other design would remove, until Ben has decided which design runs.

## Misfit log while designing

- The design has no answer for "the project grows" beyond the method. Every other family's answer is a lane that adds code to the part that produced the rows.
- The honest case for this design is sunk cost and known behavior: the parts work most of the time, Ben knows the page, and the panes are set up. Those are real, and they are not misfits.
