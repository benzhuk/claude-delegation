OK

# Component map of the delegation plugin, 9/28 3:00 PM (America/New_York)

Read from `origin/main` at 3323d75 (release 0.20.16), fetched at 2:56 PM. The main checkout's local main is stale at ea9eba4, so it was not used. No CHANGELOG.md exists on origin/main; the brief's "top 60 lines" step had nothing to read. The Notion plan page is 357 KB (raw read saved as component-map-notion-plan.md). I read its live sections (Purpose, Operating principles, Architectural shape, Components requested, Current project view, the Lane 23 bearings head) and skipped the superseded and historical toggles. Goals page saved as component-map-notion-goals.md. Nothing was edited, installed, or tested. No command was denied.

Goal measures used below: T = top-tier tokens per build, H = hours ask to accepted, R = rework after acceptance, L = work lost or stalled.

## A. Components

State words: shipped, shipped but unfed, shipped but unmeasured, partial, missing.

### Work state and evidence

| Component | Where | State and evidence | Measure today | Last value | Serves |
|---|---|---|---|---|---|
| Goal card and goals file | `docs/GOALS.md`, `docs/goals/card.md`, `templates/goal-card.md`, `scripts/goal-card.mjs`, `hooks/lib/goal-context.mjs` | Shipped. Card hook since 0.8.0; card capped at 800 bytes by a constant | NONE for effect. `goal-card.test.mjs` checks form and byte cap only; nothing counts sessions that saw the card | none | all four (indirect) |
| Goals page mirror | `skills/decisions/scripts/goals-mirror.mjs`, `templates/goals-page.md` | Shipped. One-line table merged 9/27 10:45 PM (lane 27) | Hand-back check compares the mirror sha to the current commit; it can fail | Passes, 9/27 late evening. Notion mirror still says "main at 2ea22bf", the repo is at 3323d75 | none directly (owner legibility) |
| Work records | `docs/work-record.md`, `scripts/work-record.mjs`, `docs/work/*.record.md` (93 record files) | Shipped. `closed` status added 9/27 (lane 23). measure-truth-1 makes `accept` refuse records missing Spec-session, a UTC Spec-from, one-sha Base, or a model on the approving review | `accept` refusals; `work-census.mjs` | measure-truth-1 record is the first to pass its own rules, 9/27 | H, R |
| Evidence and accept gate | `docs/work/evidence/`, `skills/team-build/references/accept-prep.mjs`, `work-record.mjs accept` | Shipped. Needs an independent `VERDICT: APPROVE <sha>` for the exact artifact | The accept refusal itself; four-read is run after accept, and janitor-daily's accept skipped `--four-read` ("Four numbers: not run") | see four-read row | R |
| Sealed tests | `scripts/run-tests.mjs`, `scripts/test-home.mjs`, `docs/sealed-tests.md` | Shipped. Sealed homes are removed on SIGINT/SIGTERM/SIGHUP; a start-of-run sweep removes `sealed-home-*` older than 6 h | Suite pass counts; swept-dir counts | Netcup 2561 of 2565, 0 failing, 9/28 (autolink-guard). Sweep removed 72 stale homes on Netcup and 1743 on Windows, 9/27 | L (a /tmp inode outage) |

### Skills

| Component | Where | State and evidence | Measure today | Last value | Serves |
|---|---|---|---|---|---|
| delegate | `skills/delegate/SKILL.md`, `references/ladder-workflow.js` | Shipped. Ladder workflow allowed from Opus panes (memory ruling 9/21) | Ladder test only; no census row tells fan-out lanes from build lanes | none | T |
| team-build and build loop | `skills/team-build/SKILL.md`, `references/build-loop-workflow.js`, `accept-prep.mjs` | Shipped. Every lane since 9/26 ran through it (records under `docs/work/`) | four-read per build | 9/28 collect-followups: 9.84M T, 0.6 h H, 1 rework commit, 0 stalled | T, H, R, L |
| continue | `skills/continue/SKILL.md`, `scripts/continuation*.mjs`, `hooks/continuation-native.mjs` | Shipped. Bound completion check on both hosts | `continuation.test.mjs`, `native-continuation-smoke.mjs`. No outcome number | none | L |
| multi (notes and ledger) | `skills/multi/`, `hooks/multi-inbox.js`, `hooks/multi-codex-hook.mjs`, `docs/ledger/` | Shipped. 0.18.1 fixed lost notes; cross-host mirror and exit-6 refusal merged 9/27 | four-read counts unanswered ASKs to the lead; flush log. Wakes per build NONE | sealed-signal 9/27: 1 unanswered ASK to skills-a; collect-followups 0 | L |
| decisions | `skills/decisions/` (read, handback, pickup, render, title, archive) | Shipped. Render publish guarded (exits 4, 7, 2 for drift, uncommitted files, autolinks) | Hand-back check; page-drift check | Passes 9/27 10:50 PM. Ben's tick at 7:00 AM was picked up at 8:19 AM by the Netcup timer; the close-out then stuck the pickup and a fix was queued | L |
| bearings | `skills/bearings/` (`bearings-state.mjs`, evidence template) | Shipped. SessionStart due notice reaches Ben's pane | Entries per week, RE-PLAN count, and each verdict's falsifiable prediction, checked next day | 9/27 RE-PLAN, second in a row (fresh Opus). Prediction 1 (at most 20M tokens) MISSED at 86.4M; prediction 2 HELD. Next check was due 9/28 8:00 AM; no result on origin/main | T |
| janitor | `skills/janitor/SKILL.md`, `scripts/janitor.mjs` (1581 lines), `install-janitor-timer.mjs` | Shipped. Never scheduled to act; see section C | `docs/work/evidence/janitor/drift.md` line and JSON per run | 9/26 ben-desktop: 20 worktrees, 29 branches, SAFE 1 and 1, JUDGMENT 4 worktrees, 13 branches, 8 remote. No record on origin since | L (indirect), none of the four directly |
| notion-writing | `skills/notion-writing/SKILL.md` | Shipped, copied from the chezmoi skill | None. The Ben-Zhuk authorship rule is not checked by any script | none | none directly |
| dev-server | `skills/dev-server/SKILL.md` | Shipped, copied; needs `server-manager-agent`, which lives outside the plugin | NONE | none | none directly |
| Agent roles | `agents/{builder,integrator,reviewer,runner}.md`, `codex/agents/*.toml` | Shipped. The Codex safety block is hand-kept in sync; no test compares it | build-census roles table (tokens by model and role) | codex-census 9/27: 49.9M build tokens on gpt-5.6-sol and gpt-6-astra | T |
| Shared docs | `docs/model-tiers.md`, `subagent-contract.md`, `concurrency-budget.md`, `agent-pacing.md`, `mandate-*.md` | Shipped as prose. Only the dispatch guard checks any of it | NONE, other than the guard's log | none | T, L |
| Pane setup | `docs/pane-setup.md` | Shipped but unmeasured. Goals page: "describes a setup Ben does not run" | NONE (the goal wants a pane setup backed by the census) | none | T, H |

### Hooks, wiring and discovery

| Component | Where | State and evidence | Measure today | Last value | Serves |
|---|---|---|---|---|---|
| Delegation reminder | `hooks/delegation-reminder.js` | Shipped. SessionStart, UserPromptSubmit, PostToolBatch | NONE | none | T |
| Agent dispatch guard | `hooks/agent-dispatch-guard.mjs`, `hooks/resume-size.mjs` | Shipped. Advisory until `~/.agents/dispatch-guard-enforce` exists (per `required-wiring.default.json`); the mode on each host was not checked | Its own log only; no census reads it | none | T |
| Delete guard | `hooks/delete-guard.mjs` | Shipped 9/27 (lane 16) | Live refusal test; stalls at delete prompts | Refusal in 2.2 s, 9/27. Stall-nudge record: a builder still hung from 03:15Z on 9/28 on a compound command starting with `rm -rf` | L |
| Backlog notice | `hooks/backlog-notice.js`, `docs/backlog-notice.md` | Shipped | NONE | none | H |
| Knowledge read logger | `hooks/knowledge-log.mjs` | Shipped, and it works | `scripts/knowledge-count.mjs` | 9/27 Windows: 16 topics, 70 inbox notes, 1 read in 7 days | none of the four |
| Wiring check | `scripts/wiring-check.mjs`, `required-wiring.default.json` | Shipped. Exits 1 on anything missing or stale since 9/27 (lane 19) | The exit code | Exit 0 on Hetzner and Windows, 9/27. Not confirmed on Netcup or Mac | L |
| Discovery and mirror | `.claude-plugin/`, `.codex-plugin/`, `.agents/plugins/marketplace.json`, `scripts/mirror-shared-skills.mjs` | Shipped. Nine skills, four roles, note-send shim | Per-host install evidence, wiring check | 0.20.13 on four hosts 9/27 7:26 AM (mirror 0 refusals). 0.20.16 waits on Ben's word | L |
| Note flusher (wake-up) | `skills/multi/scripts/note-flush.mjs`, per-host timer | Shipped. One-minute timer; FYI and ACK never wake | Heartbeat `~/.agents/notes/flush-last.json` freshness in wiring check | not read | L |
| Done-tick wake (wake-up) | `skills/decisions/scripts/decisions-pickup.mjs` | Partial. Registered on Netcup only (9/27 8:20 AM); a stuck-round fix was still queued | Pickup result per tick | Round 1 picked up 8:19 AM 9/27 | L |
| Native continuation (wake-up) | `hooks/continuation-native.mjs` | Shipped | Smoke script | none | L |

### Measurement and collection

| Component | Where | State and evidence | Measure today | Last value | Serves |
|---|---|---|---|---|---|
| Build census | `scripts/build-census.mjs`, `docs/census.md` | Shipped, Claude and Codex | Its own tests. Wakes and Stop-blocks per build are not counted (goal 1 asks for them) | Lead 86.4M Fable tokens over 468 turns, 9/27 window (bearings) | T |
| Four-number read | `scripts/four-read.mjs` | Shipped. Codex tokens unavailable outside the discovery horizon; Codex stalls unclassified; spec slice often "not run" | It is the measure | codex-census 9/27: 54.7M T, 2.4 h, 0 rework | T, H, R, L |
| Work census | `scripts/work-census.mjs` | Shipped | Its tests | none found | H |
| Token census (older) | `scripts/token-census.mjs` | Shipped but unfed. Goals page says it counted the wrong agents | none | none | T |
| Collector | `collect-from-origin.mjs`, `collect-status.mjs`, `install-janitor-timer.mjs --job collect-status` | Shipped, Netcup timer only (stall nudge with `--stale-hours 2`). Windows has no status dir for the main repo | Accepted-unmerged rows older than 4 h; attention count | 9/27 prediction 2 HELD: 15 accepted branches all merged, all on the page | L, H |
| Knowledge count | `scripts/knowledge-count.mjs`, `knowledge-counts.mjs` | Shipped | Reads per 7 days | 1 read, 9/27 | none of the four |

### Plan-page components with no complete home

| Component | Where | State and evidence | Measure today | Last value | Serves |
|---|---|---|---|---|---|
| Memory sync and triage | none in the plugin (`knowledge`, `triage`, `learn` live in chezmoi and are only mirrored) | Missing. Goals page: NONE; triage unscheduled; Claude auto-memory dirs are not synced | Knowledge count is the only reading | 70 inbox notes pending, oldest 7/28 | none of the four |
| Research (plan page) | none. `delegate` covers research fan-out; no source-preserving ladder | Missing | NONE | none | T |
| Multi-build (plan page) | `team-build` only; no alias | Partial. Plan wanted one implementation and an alias or rename | NONE | none | T, H |
| Advisor and builder docs | `skills/decisions/templates/`, `docs/decisions/` | Partial. Builder page shipped; no advisor-audience template | Hand-back check (builder side only) | see decisions row | none directly |
| Codex host integration | `codex/`, `hooks/codex-hooks.json`, `multi-codex-hook.mjs`, `codex-hook-trust.mjs`, Codex path in build-census | Partial. Two lanes led from Codex 9/27; the DONE test needs a mixed Claude and Codex handoff, not shown | DONE build run from each host | codex-census 9/27 (Codex lead, 2.4 h); sealed-signal 0.9 h | all four |

## B. Gaps

Components with NONE in the measure column:
- Goal card effect (nothing counts sessions that saw it).
- Delegation reminder hook, dispatch guard effect, backlog notice.
- Shared prose docs (tiers, pacing, concurrency, mandates).
- Pane setup.
- notion-writing and dev-server.
- Research and Multi-build (no component either).
- Wakes and Stop-blocks per build, the second half of goal 1's measure. The census does not count them.
- Janitor's effect: drift.md has no line after 9/26, while the tree grew back to 47 worktrees.

Plan-page components with no repo path or an incomplete one:
- Research: no path.
- Memory sync and triage: no path in the plugin.
- Multi-build: no alias.
- Advisor documents: no template.
- Codex mixed handoff: no test or record.

Stale status text on the Goals page, to fix in the next release commit:
- Janitor "has never acted": it did on 9/26 when a runner applied the safe class at Ben's choice (60 worktrees to 19 on Windows).
- Decisions "a checked-Done handback has still never happened": history shows a Done pickup on 9/27 at 8:19 AM.
- Notion mirror says "main at 2ea22bf".

Other findings:
- `L29-main-merge.raw.exit` and `.log` are committed at the repo root of origin/main.
- The 9/28 3:15Z builder hang on `rm -rf` after the delete guard merged needs a look: guard not installed on that host, or a compound-command shape it misses. Not verified.

## C. Janitor today against Ben's ask

Ben, 9/28: janitor should remove temp files, temp files should be created so they can be removed, and worktrees and branches should be cleaned up as we go.

| Item | What exists |
|---|---|
| What it deletes | Only two actions, both through git: `git worktree remove` (no force) and `git branch -D` for a local branch. It has no file-delete code path, on purpose. `-D` runs only for a SAFE row, after this run's fetch, and re-proves the tip right before deleting |
| SAFE class | Worktree or local branch whose tip is an ancestor of `origin/main` after a fresh `git fetch origin --prune`. Also: not locked, not the main tree or current tree, not a protected name, no submodules, `git status --porcelain --ignored` empty (ignored files count), older than 6 h, not unstarted (tip on main's first-parent chain) |
| JUDGMENT class | Dirty or ignored-content worktree, locked, submodules, merged only into local main, unverifiable fetch, unmerged with no commit in 14 days, protected name, untracked files matching `scratch_patterns`, unstarted, remote branches (it prints the `git push origin --delete` command and never runs it), overdue `WORKAROUND:` lines |
| What it refuses | Deleting any file; force removal; wiping uncommitted work; acting under `--no-fetch` (`--apply` exits 3); deleting remote branches; recursive delete of a path it did not create |
| Schedule | `install-janitor-timer.mjs` writes one report-only daily run (`--record`, 6:00 AM local): systemd `--user` timer on Linux, Task Scheduler task on Windows, launchd agent on macOS. `--apply` never appears in it. Windows task `janitor-record` was registered at 2:57 PM today (observed: state Ready, never run, next run 9/29 6:00 AM). Netcup, Hetzner and Mac timer state not checked; the 9/27 history says none was installed then |
| Who applies | A human or the lead, by hand. The skill says the lane's integrator runs `--record` then `--apply` after every accepted build, but no skill, agent brief, workflow or script other than the janitor files mentions janitor. That cadence is prose no script checks |
| Temp-file conventions | Briefs say "temp files go in the scratch folder your brief names, never in a repo" (all four agent files and the Codex runner). Builders never delete a directory, scratch included. The delete-guard hook refuses agent recursive deletes and names the lead's standalone command as the remover. The session scratchpad (`%TEMP%\claude\...`) belongs to Claude Code. Sealed test homes are swept after 6 h by `run-tests.mjs`; this is the only automatic temp-file removal in the repo. The subagent contract has no scratch rule and no `SCRATCH` variable; the only `SCRATCH/` path is in a census command in the 9/27 bearings text |
| What marks a worktree or branch removable | Only the janitor's SAFE proof above. Records also mark it: `Status: closed` means the merge commit is an ancestor of main, and the record carries a `Worktree:` field. The janitor reads records only for `WORKAROUND:` lines, so it never uses `closed` or `Worktree:` |

| Ben's ask | What is missing |
|---|---|
| 1. Remove temp files | (a) No component removes files: janitor has no unlink path, and the delete guard bars agents. (b) Nothing records what a lane created, so nothing can tell a temp file from real work. (c) `.agents/project.json` here sets no `scratch_patterns`, so the untracked-scratch check is inactive in this repo. (d) Scratchpad worktrees and files sit under `%TEMP%\claude\<project>\<session>`; nothing removes a session directory. Decision needed: a scratch-root rule (lane creates `<scratch>/<lane>/`, records it in the work record) and one owner that removes a whole closed lane directory, so no per-file delete is needed |
| 2. Created so they can be removed | No convention. Needed: a brief-level rule that every temp path lives under one lane-named directory, plus a record field naming it, plus a script check (the "NOT a rule no script checks" line) |
| 3. Worktrees and branches "as we go" | (a) Nothing runs `--apply` unattended; the timer is report-only. (b) No closeout step in `work-record.mjs close`, the collector or the loop removes the lane's worktree or branch, so the last 9/27 lanes left them. (c) Origin branches are never deleted by any tool. (d) SAFE excludes any worktree with ignored files such as `node_modules`, so build worktrees stay JUDGMENT until cleaned by hand. (e) The 6 h floor delays SAFE. Result today: 44 merged branches on origin, 35 merged worktrees and 47 merged local branches still present |

## D. Host coverage

| Component | Claude Code | Codex | Evidence |
|---|---|---|---|
| Goal card | yes | lead sessions only, when native metadata classifies a lead | `hooks/delegation-reminder.js`; `hooks/multi-codex-hook.mjs` via `scripts/goal-card.mjs:327`; README bearings paragraph |
| Goals page mirror, decisions | yes | yes (skill mirrored) | `PLUGIN_SKILLS` in `scripts/mirror-shared-skills.mjs:85` |
| Work records, accept gate, evidence | yes | yes | `scripts/work-record.mjs`, host-neutral; codex-census record has Codex as lead |
| delegate, team-build, continue, multi, bearings, janitor, notion-writing, dev-server | yes | skills mirrored to `~/.agents/skills` | `PLUGIN_SKILLS` list; codex/README.md lists eight of the nine and omits janitor, though the code list has it |
| build-loop and ladder workflows | yes | no. They are Claude Workflow scripts; the Codex-led builds did not use them | `references/build-loop-workflow.js`; not stated as unsupported anywhere |
| Agent roles | yes | yes | `agents/*.md`, `codex/agents/*.toml` |
| multi notes and note flusher | yes | yes | `inbox-claude.mjs`, `inbox-codex.mjs`, `hooks.test.mjs`, `inbox.test.mjs` |
| Done-tick wake | yes | yes (timer is host-native, wakes by note) | registered on Netcup, `skills/decisions/scripts/registered-pickup.contract.test.mjs` |
| Native continuation | yes | yes | `hooks/continuation-native.mjs`, `native-continuation-smoke.mjs` |
| Delegation reminder, backlog notice, dispatch guard, resume-size | yes | no, and not stated as unsupported | `hooks/hooks.json`; absent from `hooks/codex-hooks.json`; no "Codex" text in those files |
| Delete guard | yes | wired by opt-in `--codex-hooks` install; live Codex refusal unverified | `scripts/codex-hook-trust.mjs` (delete-guard marker); 9/27 history |
| Knowledge read logger | yes | unsupported, stated | `hooks/knowledge-log.mjs:67-93`; census.md last section |
| Wiring check SessionStart line | yes | no, and not stated | `hooks/hooks.json`; not in `codex-hooks.json` |
| Build census, four-read | yes | yes, tokens only inside the discovery horizon; stalls unclassified | `scripts/build-census.codex.contract.test.mjs`; sealed-signal record says unavailable |
| Collector, janitor, timers | host OS only, no agent-host dependence | same | scripts; timer per OS |
| Discovery | `.claude-plugin/` | `.codex-plugin/`, `.agents/plugins/marketplace.json` | `native-package.test.mjs`; four-host evidence 0.20.6 |
| Mixed handoff (DONE) | not shown | not shown | Goals page: a Codex-led build "has not been run end to end"; 9/27 history says two Codex-led lanes ran, no Claude to Codex handoff recorded |

## E. Counts

| Item | Count | Oldest |
|---|---|---|
| Origin branches, all | 52 (main plus 51) | |
| Merged into origin/main, not deleted | 44 | build/one-launch-1, tip 9/25 7:48 PM |
| Unmerged | 7 | feat/working-smarter, tip 9/20 12:51 PM, 22 commits ahead |
| Local worktrees (main checkout list) | 47 | merged: gate-notes-main, 9/20; unmerged: benzhuk/astra-private-capture, 9/23 |
| Worktrees whose tip is merged | 35 | |
| Worktrees whose tip is unmerged | 12, including this session's own gudgeon | |
| Worktrees under the Windows temp dir | 9 | |
| Local branches | 63 (47 merged, 16 unmerged) | feat/multi-protocol, tip 9/13 |

Unmerged origin branches:
- feat/working-smarter (9/20)
- docs/bearings-0925 (9/25)
- docs/bearings-0926 (9/26)
- build/fresh-walk-1 (9/26, 20 ahead)
- build/gate-under-load-1 (9/26)
- docs/bearings-0927 (9/27)
- docs/lane-specs-0925 (9/27, 31 ahead)
