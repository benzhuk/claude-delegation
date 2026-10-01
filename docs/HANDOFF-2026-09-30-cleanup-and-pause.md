# Hand-off: cleanup and pause, written 9/30 9:15 PM America/New_York

Read this whole file before doing anything. It replaces the session `skills-fable` that Ben closed. You are the new lead. The project is PAUSED: no new lanes, no builds, no installs. The only work is the cleanup below.

## What Ben asked for (his words, 9/30 about 7:25 PM)

"i am pausing, but first this project is a mess and all over the place. help me consolidate, remove ALL worktress if we can, merging and discarding all work done so far, and consolidate all the different projects that have to do with zhuk-infra into that folder (zhuk-infra), claude-delegation should be there too. then help me reorganize and trim the whole code folder, it somehow became a mess with all kinds of worktress right in there, I never wanted that to happen and never want it to happen again"

His rulings so far, all quoted in `docs/decisions/history/2026-09-30.md`:

- Layout: `Code/zhuk-infra/` becomes a plain parent folder holding the repos side by side: `infra` (the zhuk-infra repo, renamed), `claude-delegation`, and on the Mac `orca-fork`.
- Other projects: remove clean, merged or pushed worktrees; leave what holds work; give him the list. "leave BTO to BTO": never touch `Code/BTO` on any machine. The taxonomy-fable session owns it.
- Worktree rule from now on: "use .claude/worktrees/". Every worktree lives under its own repo at `<repo>/.claude/worktrees/`, never as a sibling in Code.
- Branches: option a. Done, see below.
- Leftover folders: he runs the delete himself with `pwsh -File C:\Users\benzh\cleanup-leftovers.ps1` (add `-DryRun` to preview). Ask whether he ran it; do not run it for him unless he says so.

## Where to run and what sessions are needed

- **You need one session only: this one, on Windows.** Every other machine is reached over ssh. No other window is required for the cleanup.
- **Open it outside Orca.** The move step needs Orca and every agent pane closed on the machine being moved, and a session inside Orca would be moving its own home. Ben: open Windows Terminal and run the two lines below.

```powershell
cd C:\Users\benzh\Code\claude-delegation
claude
```

- **Do not open the old folder** `C:\Users\benzh\orca\workspaces\claude-delegation\gudgeon`. It is a leftover worktree of the closed session and is itself due for removal (detached, 2 commits past an old main, 6 untracked files: look before removing, archive what is real).
- **Sessions that exist and must be parked, then closed, before the move.** Ask Ben to close each one after its step below; you cannot close them yourself.
  - `skills-a`: Codex on Windows, in Orca. Owns lane 62, paused mid-build. Its three worktrees under `C:\Users\benzh\orca\workspaces\claude-delegation\census-completeness-62*` hold uncommitted files (2, 2 and 4). The committed part is pushed to origin as of 9:14 PM. It must commit and push the rest, or say it is disposable, before those worktrees go.
  - `skills-o`: Claude Opus on Windows, in Orca. Idle. Nothing owed.
  - `skills-n`: Claude Opus on Netcup. Three worktrees there hold its work: `~/Code/wt-mt`, `~/Code/wt-pc`, `~/Code/wt-withdraw-status-1-W1`.
  - `skills-h`: Hetzner, idle.
  - None of them answered the pause ASK (topic `pause`) sent 9/30. If Ben wants them consulted, the fastest route is Ben typing in each pane: "commit and push everything you hold, list anything unpushed, then stop." A peer note works too but nothing wakes an idle pane reliably.
- **How to send a peer note** (only if needed): from `C:\Users\benzh\Code\claude-delegation`, `note-send --from skills-fable --to <slug> --kind ASK --topic pause --text "..." --needs ack`. To Netcup: `ssh ben@100.69.249.18 "~/.local/bin/note-send ... --sender-host ben-desktop ..."`. Text may not contain backticks, semicolons, pipes, `&&` or `$(`; the line must stay under 700 characters; never re-send an id; never wait inside a turn for a reply.

## Machines

| Machine | Reach | Notes |
|---|---|---|
| Windows | local | 2 GB free of 32 at last check. No test suites here. |
| Netcup | `ssh ben@100.69.249.18` | node only in a login shell: `bash -lc`. Authors dotfile commits. |
| Hetzner | `ssh ben@100.111.119.54` | no git identity, so no commits there. node via fnm path. |
| Mac | `ssh benzhuk@100.116.13.27` | git credentials are broken over ssh: never fetch or push there. May be asleep. |

## Done so far

- Worktrees removed without force: claude-delegation Windows 38 of 45, zhuk-infra 7, nightrush 1, bto_nucleus 1, tdf 15, cadma-app 4, Netcup 10, Mac 2, Hetzner 1.
- Branches: six docs branches landed in main (merge `72ad3e36`, links repointed `f8ebf569`). 60 local Windows branches and 47 origin branches deleted. Origin now holds only `main`, `build/census-completeness-62`, `-62-source`, `-62-tests` and `build/fresh-walk-1`. Every deleted commit id is saved (see the files list).
- Netcup user settings: the blanket ask rule for recursive deletes was removed on Ben's word; backup `~/.claude/settings.json.bak-0930-ask-rule`.
- Delete script written for Ben: `C:\Users\benzh\cleanup-leftovers.ps1`, 53 paths, about 4.3 GB, not run by me.

## Remaining, in order

1. **Ask Ben whether he ran the delete script**, then list what is left in `C:\Users\benzh\Code`, `Code\Zhuk Projects\tdf-wt`, `orca\workspaces\claude-delegation` and `orca\gates`. Held out of the script on purpose: `Code\delete-deny`, `Code\notion-writing` (not empty), `Code\scratch-l59b-win1` (a clean clone already in main), lane 62's gate folder, four gate folders under a day old.
2. **Remaining claude-delegation worktrees, Windows** (`git -C C:\Users\benzh\Code\claude-delegation worktree list`):
   - three lane 62 worktrees: after skills-a pushes or releases them.
   - `orca\workspaces\claude-delegation\codex-census-1-final-main-merge`: in a merge conflict, branch `benzh/record-closed-and-skip-1-main-closeout`, its one commit is already in main. Removing it needs force, so it needs Ben's explicit word.
   - two under the old sessions' Temp scratchpads (`...7ce97c6a...\loop-gates\wt-base`, clean and merged; `...9c61c35a...\gate-notes-main`, 2 modified files of the old lead, disposable).
   - `gudgeon`, last.
3. **Remote claude-delegation leftovers.** Netcup: about 25 old local lane branches, all expected merged (delete with `git branch -d`, which refuses unmerged ones), three worktrees of skills-n's, plus `~/Code/claude-delegation-gate-under-load-1-remote`, `~/Code/wt-ws-mainbase` (holds `main`) and one under `/tmp`. Hetzner: five worktrees under `~/Code/claude-delegation-wt/` each with one or two untracked report files and no git identity to archive them; `janitor-inodes-1` there has 1 modified and 2 untracked files and its branch was ruled discarded. Mac: nothing left for this repo.
4. **Give Ben the list of what holds work in other projects** and act only on his word:
   - tdf, Windows: 9 worktrees kept. i-3, i-4, i-5, j-1, j-2, k-1, k-2 had commits under a day old; d and h-c1 are dirty.
   - cadma-app, Windows: `ask-cadma-2` and `Table-UI`, both dirty.
   - Mac: two cook worktrees (12 and 2 unpushed commits), Cadma `find-bar-search-2`, `cadma-ai-search`, `fee-spec`, `sdk`. The bto-workflows one is BTO: leave it.
   - Hetzner: two stale cook worktree records, one bto worktree (leave).
5. **The move into `Code/zhuk-infra`.** Not started. Read `move-path-census.md` first; it lists every path that must be repointed. Preconditions: every agent pane and Orca closed on that machine, services stopped where listed. Order: Mac first, then Hetzner, Netcup, Windows last. Per machine: stop services, move folders, repoint (Codex hooks.json and config.toml trust key, `~/.local/bin/reclaim`, janitor scheduled task or service, collect-status and zhuk-panel services on Netcup, Orca registry, Mac `codex-select` and `orca-p`), run `git worktree repair` for any worktree left, restart, verify. Unchecked before starting: the `~/.agents/janitor*` repo pin and how the Windows token broker launches. Last of all: the chezmoi `mirror-shared-skills` templates that hardcode `Code/claude-delegation` (commit from Netcup only after every machine has moved) and `scripts/install-janitor-timer.mjs` line 156. The Windows zhuk-infra checkout sits on `feat/accounts-auth-health`, 20 commits past main, with 1 modified and 2 untracked files: settle that before renaming it.
6. **Trim the Code folder on each machine**: after the move, list what is left at the top level of Code and propose what goes, to Ben, before deleting.
7. **When work resumes (not now)**: first lane is the two fixes in plan item 16 and the worktree rule: worktrees at `<repo>/.claude/worktrees/` enforced by the dispatch guard, a janitor class for them, sync and test-runner excludes; and the decisions page wedge. Then the paused plan in `docs/plan-to-done-2026-09-30.md`: the 10/1 3:00 PM census read (missed by the pause), the 0.20.19 installs on Ben's word, `build/fresh-walk-1` to land.

## The decisions page is wedged: do not publish

Page `3e1da11277a18174bccfea187d5c3972`. Pickup round 3 is stuck in NEEDS_RECONCILIATION and cannot be accounted; `publish` refuses. Do not edit the page or the receipt by hand and do not sign the round as skills-a. Until the fix lands, put Ben's decisions to him in chat and record his answers, quoted, in `docs/decisions/history/<NY day>.md`. The page still shows four answered items and a ticked Done; that is stale, not new input. Detail is in `consolidation-state.md`.

## Rules that bind you

- Never touch `Code/BTO` anywhere.
- `git worktree remove` without force only. No `git stash`, `reset --hard`, `checkout .`, `clean`, force-push. Recursive deletes are ask-first, and on Windows the lead's own recursive delete is denied by permission: Ben runs deletes from a script you write.
- A denied command stops that step. Never do the same thing through another tool, shell or session. Put this sentence in every agent brief: "If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell."
- Before deleting anything: look at it. Save commit ids before deleting branches. Dirty worktree with real work: commit it to an `archive/<name>-<sha7>` branch first, or ask.
- Never set or switch a git identity; no `--no-verify`; no trailers. `git add`, `commit`, `push` as separate commands.
- Never print or read secrets or environment files.
- Execution (listings, censuses, removals over many paths) goes to Sonnet agents (`delegation:runner`) that report to disk; you judge. Never spawn a top-tier agent for execution.
- No test suites on Windows. No polling, sleeping or waiting on a peer inside a turn.
- Every time shown to Ben is America/New_York, read from the clock.
- Simplest thing first. Nothing new gets built during the pause.

## Files

Repo (this checkout, on `main`, equal to origin):
- `docs/decisions/history/2026-09-30.md`: every ruling, quoted.
- `docs/plan-to-done-2026-09-30.md`: the paused plan; item 16 holds the page fix.

Machine-local, `C:\Users\benzh\.agents\handoff-0930\` (copies of the closed session's scratch files):
- `consolidation-state.md`: running state of the cleanup.
- `move-path-census.md`: every path to repoint for the move.
- `inventory-vps-report.md`, `lists.md`: worktree inventories.
- `branch-triage-report.md`, `branch-cleanup-*.md`: what was discarded and why.
- `branch-delete-shas*.tsv`, `origin-merged-delete.log`: commit id of every deleted branch. Restore one with `git branch <name> <sha>`.
- `leftover-folders-report.md`: what the delete script includes and excludes.
- `wt-clean-pass.sh`, `wt-archive-pass.sh` and their logs: the removal method used.
- `untracked-specs-moved\`: three untracked spec drafts moved out of the checkout to let the docs merge through.

## First message to Ben

Say what is left in one short list (steps 1 to 6), ask whether he ran the delete script, and ask which sessions are still open. Then start on step 2 and 3 with what needs no answer.

## Status update, 10/1 12:10 AM America/New_York (supersedes the lists above where they differ)

- Ben kept the cleanup in the original session. The plugin work resumes later from `docs/RESUME-plugin-work.md`.
- Worktrees: none left for this repo on any machine except `orca\workspaces\claude-delegation\gudgeon` on Windows (the lead's own pane). Forced removals were done on Ben's word "Do it".
- Branches: Windows main plus three lane 62 branches; Netcup main; Hetzner main and fresh-walk-1; origin main, three lane 62 branches, fresh-walk-1. Lane 62's uncommitted notes were committed and pushed.
- Move done on Hetzner and Netcup: `~/Code/zhuk-infra/{infra,claude-delegation}`. Units, janitor pin and collector pin repointed, backups `.bak-0930-move`. Orca on both still lists the old repo path; Ben re-adds it in Orca.
- Move NOT done on the Mac (did not answer) and NOT done on Windows (Orca holds `Code\zhuk-infra`; task changes need an elevated shell). Windows script for Ben: `C:\Users\benzh\move-zhuk-infra.ps1`, run elevated with Orca closed. After it runs this repo is at `C:\Users\benzh\Code\zhuk-infra\claude-delegation`.
- After all four machines: chezmoi mirror templates (commit from Netcup) and `scripts/install-janitor-timer.mjs` line 156 still name `Code/claude-delegation`.
- Not started: trimming the top level of Code on each machine (Netcup has loose logs, temp files, scratch folders, `f2r4-verify`, `reserve`). The 53-path delete script on Windows appears to have been run by Ben.
- Reports: `C:\Users\benzh\.agents\handoff-0930\move-*-report.md`.
