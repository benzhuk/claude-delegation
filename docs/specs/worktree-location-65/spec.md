# Lane 65: worktree-location — spec

The pinned scope is the "Lane 65" section of the lead's packet, quoted verbatim below (source: main:docs/notes/skills-f-resume-lanes-1.md at f976ca0a, from skills-f-resume-lanes-1). Rules-for-all-three in that packet apply.

## Rules for all three
- Repo is `C:\Users\benzh\Code\zhuk-infra\claude-delegation`. Every worktree goes under `<repo>/.claude/worktrees/<lane>`, never anywhere else. Each lane removes its own worktree when it closes and says so in its record.
- No test suite on Windows. Builders run the focused tests only. The full suite runs once per lane at accept on Netcup (`ssh ben@100.69.249.18`, `bash -lc`, repo at `~/Code/zhuk-infra/claude-delegation`) and once on Hetzner (`ssh ben@100.111.119.54`), one suite at a time per machine. skills-a is finishing lane 62 against the same hosts; if a host is busy, wait for it.
- One Opus red-team round on the spec at most, then build; later ambiguity is a ruling in the record, not a new spec. A reviewer is spawned only on a green builder gate, in the same turn the builder report lands.
- Own branch (`build/<name>-<lane>`), own work record in `docs/work/`, record names the goal-card measure it moves. Accepted = Opus APPROVE sha plus both suite results in the record. Then merge into main with a merge commit under the 9/26 standing grant, closing bullet in `docs/decisions/history/<NY day>.md`. No release, no install.
- Every execution brief carries: "If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block." And: never set a git identity, no `--no-verify`, no force, no recursive deletes.
- Receipts only: one ACK now, one RESULT per lane when it is on main (or BLOCKED with the reason). Do not ask me what the packet or the code can answer; rule it and write the ruling in the record.

## Lane 65: worktree location rule (Ben, 9/30: "use .claude/worktrees/"). Measure: work lost or stalled.
Scope, pinned:
1. The dispatch guard refuses a worktree created outside `<repo>/.claude/worktrees/` (agent isolation worktrees and `git worktree add` alike), with a message naming the right path.
2. Janitor SAFE class covers clean, merged worktrees under that folder.
3. Sync, mirror and test runners exclude `.claude/worktrees/`; it is gitignored.
4. `skills/team-build`, `skills/delegate`, the builder and runner agent files and `docs/pane-setup.md` state the path once each.
5. `scripts/install-janitor-timer.mjs` line 156 defaults to `Code/zhuk-infra/claude-delegation`, falling back to the old `Code/claude-delegation` only when the new path is absent. Sweep the repo for other hardcoded `Code/claude-delegation` and fix the ones that are live code. The chezmoi mirror templates are NOT in this lane (they wait for the Mac move).
6. Tests for 1, 2, 3, 5 and 7.
7. Added 10/1 3:45 PM NY, before this packet was read: the janitor appends a line a day to the tracked file `docs/work/evidence/janitor/drift.md` in every durable checkout, and that local edit made `git pull --ff-only` refuse on Netcup and Hetzner during the 0.20.19 install (`docs/work/evidence/2026-10-01-install-0.20.19.md`). The janitor writes its drift log outside the tracked tree (under `~/.agents/`), the tracked file stops being written, and nothing a scheduled job does leaves a durable checkout dirty.
Due on main: 10/1 11:30 PM NY.

