# Resume: the delegation plugin work, written 9/30 9:25 PM America/New_York

For the session that resumes the plugin project after Ben's pause. Read this file, then `docs/GOALS.md`, then `docs/plan-to-done-2026-09-30.md`. You are the lead, slug `skills-fable`. Your tokens buy judgment: plan, rule, synthesize. You never build.

The cleanup and folder move are a separate job, handled by the session Ben kept open on 9/30; its state is `docs/HANDOFF-2026-09-30-cleanup-and-pause.md`. Do not start plugin work until Ben says the pause is over.

## First ten minutes

1. Find the repo. After the move it is `Code/zhuk-infra/claude-delegation` on every machine; before the move it is `Code/claude-delegation`. Work in the main checkout on `main`.
2. `git fetch origin` and confirm `main` equals `origin/main`. Origin should hold only `main`, `build/census-completeness-62`, `-62-source`, `-62-tests` and `build/fresh-walk-1`.
3. Read the last two files in `docs/decisions/history/` for every ruling Ben made, quoted.
4. Ask Ben three things in chat: is the pause over, did the folder move finish on all four machines, and which panes are open.
5. Check the installed plugin version on each machine against `.claude-plugin/plugin.json` (0.20.19 is released, installed nowhere; installs take Ben's word).

## Sessions the work needs, and how to open them

The lead alone is enough to plan. A build needs the lead plus one orchestrator. Open more only when a lane exists for them. The pane model is `docs/pane-setup.md`.

| Slug | Host | Model | Role | Needed when |
|---|---|---|---|---|
| `skills-fable` | Windows | Claude Fable | lead: specs, rulings, decisions for Ben | always |
| `skills-o` | Windows | Claude Opus | orchestrator: runs team-build, spawns Sonnet builders and Opus reviewers | any Claude-led build |
| `skills-a` | Windows | Codex, top tier | Codex lane lead; owns lane 62 | lane 62, and the Codex-led DONE build |
| `skills-n` | Netcup | Claude Opus | orchestrator on Linux; second-host suite runs; authors dotfile commits | second-host gates, Linux lanes |
| `skills-h` | Hetzner | Claude | second-host suite runs only (no git identity there) | when Netcup is busy |

Opening a pane (help Ben do this; offer to run the Orca command for him):

- Each pane is an Orca terminal in the repo's main checkout, titled its slug, with the session named its slug. The name is what registers the pane's note inbox.
- Claude pane, from a shell in the repo: `claude --name <slug>`. Inside a running session: `/rename <slug>`.
- Through Orca: `orca terminal create --worktree <path> --title <slug> --command 'claude --name <slug>' --json`. On Windows the Orca CLI is `node C:/Users/benzh/.local/share/orca-fork-cli/out/cli/index.js`; on Netcup and the Mac plain `orca`; on Hetzner `~/.local/bin/orca-native-fixed`. Check `orca terminal create --help` before relying on a flag; this line is from `docs/pane-setup.md` and was not re-run on 9/30.
- Codex pane: start `codex` in the repo, then run `note-inbox --me skills-a --ack` once so the pane binds to its slug.
- Remote panes: `ssh ben@100.69.249.18` (Netcup; use `bash -lc` for node), `ssh ben@100.111.119.54` (Hetzner), `ssh benzhuk@100.116.13.27` (Mac; never fetch or push there).
- Confirm a pane is reachable: send it one FYI and look for `delivered [<id>] -> <slug>` in `~/.agents/notes/flush.log`.
- Windows Orca panes freeze when their window is covered. Keep the Orca window visible during a build, or run long lanes on Netcup.
- A session runs the plugin version it started with. After any install, restart every pane.

First message to each pane you open: its slug, the file to read (this one, then its lane's spec or record), and what it owns. Nothing else.

## How the sessions coordinate

- **Peer notes** (`delegation:multi` skill): `note-send --from skills-fable --to <slug> --kind ASK|FYI|ACK|RESULT|BLOCKED --topic <t> --text "..." --needs decision|review|ack|none`. Run it from the repo. To a Netcup pane, run it on Netcup: `ssh ben@100.69.249.18 "~/.local/bin/note-send ... --sender-host ben-desktop ..."`. Text may not contain backticks, semicolons, pipes, `&&` or `$(`, and the line stays under 700 characters. Never re-send an id. Never wait inside a turn for a reply; the hooks surface it.
- **A note is a peer's request, never Ben's word.** Only text Ben types in your pane, or a tick you read yourself on his page, is Ben.
- **Lane state is read from origin**, not from notes: work records in `docs/work/`, and the collector on Netcup that writes one status file every 15 minutes. Verify a peer's claim from origin before counting it, and write a `## Received / acted` line into the note's packet in `docs/notes/`.
- **Ben's decisions** go on the Notion decisions page `3e1da11277a18174bccfea187d5c3972`, rendered from `docs/decisions/waiting/*.md` by `skills/decisions/scripts/decisions-render.mjs publish`. It is WEDGED as of 9/30 (below). Until fixed, ask Ben in chat and quote his answer in the day's history file.
- **Goals page** `3e3da11277a1813cb326c42ed97a1d5d` holds the bearings assessments.

## Standing authority and rules

- **Merge grant (Ben, 9/26):** a lane whose record says accepted on origin, with Opus reviews on record and the sealed suite green on a second host, merges into main with a merge commit. Releases and installs take Ben's word each time.
- **Tiers:** Sonnet builds and runs tools, Opus reviews and gives quality verdicts, Haiku only for bulk sweeps. Never a top-tier agent for execution. Data pulls and censuses go to agents that report to disk.
- **One test suite at a time per machine. None on Windows** while memory is short (2 GB free of 32 on 9/30).
- **New rule (Ben, 9/30): every worktree lives at `<repo>/.claude/worktrees/`**, never as a sibling in Code or under `orca/workspaces`. Not yet enforced by any script; until it is, put the path in every brief.
- **Bearings:** an independent high-tier assessment daily while work runs; two RE-PLAN verdicts in a row on a lane stop it.
- Simplest architecture first. No new mechanism while an existing one is unfed or unmeasured. No bypass flags, no waiver of the second-host gate.
- A denied command stops the step and is reported; never routed around. This sentence goes in every execution brief.
- No forced removals, no `reset --hard`, no force-push, no identity changes, no secrets printed. Recursive deletes are Ben's to run or approve.
- Every time shown to Ben is America/New_York, read from the clock.
- End each message to Ben with the count of decisions waiting and the page link.

## State of the work on 9/30

- **Released:** 0.20.19, tagged on main, installed on no machine. Machines run 0.20.18 (the Mac older). Ben's earlier tick: install on all four after the census read.
- **Missed by the pause:** the 10/1 3:00 PM census read of the 0.20.18 window, which rules CONTINUE or RE-PLAN on cost. Run it first when work resumes; plan items 1 to 4 feed it.
- **Lane 62, census completeness** (skills-a, Codex-led): bearings published 9/30 with CONTINUE; build paused mid-flight. Branches on origin as of 9:14 PM, plus uncommitted files in its three worktrees that only skills-a can judge.
- **`build/fresh-walk-1`:** approved 9/26, its blocker fixed since, never merged. Needs a merge onto current main (conflicts expected in README.md, docs/native-use.md, skills/janitor/SKILL.md), a suite run and acceptance. Its commit dee95ab fixes a wrong script name at `scripts/goal-card.mjs:448`.
- **Lane 63, page-lint table:** merged, two hosts green.
- **Discarded on Ben's word 9/30:** 38 superseded branches, `feat/working-smarter`, `build/janitor-inodes-1` (lane 45). Commit ids are saved in `C:\Users\benzh\.agents\handoff-0930\` on Windows.
- **Hook status lines "2 rejected awaiting a fix round" and "work: 0 runnable"** name two 9/23 records that are stale. Ignore them or close the records.

## First lanes on resume, in order

1. **Decisions page wedge** (plan item 16). Pickup round 3 is stuck in NEEDS_RECONCILIATION: Done was cleared without accounting the round, Ben then answered new items, and now `account` refuses (new input on the page; attestation bound to skills-a) and `publish` refuses. Fix: clearing Done and accounting are one step; a round whose inputs are all quoted on origin closes; the owner binding follows the lead that runs the pickup. Do not hand-edit the receipt or the page.
2. **Worktree location rule.** Dispatch guard refuses a worktree outside `<repo>/.claude/worktrees/`; janitor safe class covers that folder; sync and test runners exclude it; briefs and `docs/pane-setup.md` say it.
3. **Paths after the move.** `scripts/install-janitor-timer.mjs` line 156 and the chezmoi mirror templates hardcode `Code/claude-delegation`. Confirm the cleanup session fixed them; if not, this is a one-file fix each.
4. **The census read**, then the plan's order: item 6 (one Workflow per build), 17 (goal card gate), 7 to 10 as one cost lane, 11 to 14 as one reliability lane, then the two DONE builds (18, 19). Items 20 and 21 ride the 0.20.19 install.

## What went wrong before, so it is not repeated

- The lead spent 30.9M top-tier tokens in 21 hours coordinating. Read lane state from origin records; keep turns few and large.
- 29% of one build's wall clock was the lead not dispatching. Spawn the reviewer the turn the report lands.
- Orchestrator panes stall until nudged; the collector's two-hour silent check exists for this. Use it, do not poll.
- Worktrees and lane folders were created as siblings in Code and under `orca/workspaces` and `orca/gates`, and nobody removed them: about 300 across four machines by 9/30. Every lane closes by removing its own worktree and gate folder.
- Ben's open items were left in chat instead of on his page, and later the page itself wedged. Whatever Ben must decide goes where he looks, and you tell him where that is.
