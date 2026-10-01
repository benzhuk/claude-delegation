# Lane 66: fresh-walk — spec

The pinned scope is the "Lane 66" section of the lead's packet, quoted verbatim below (source: main:docs/notes/skills-f-resume-lanes-1.md at f976ca0a, from skills-f-resume-lanes-1). Rules-for-all-three in that packet apply.

## Rules for all three
- Repo is `C:\Users\benzh\Code\zhuk-infra\claude-delegation`. Every worktree goes under `<repo>/.claude/worktrees/<lane>`, never anywhere else. Each lane removes its own worktree when it closes and says so in its record.
- No test suite on Windows. Builders run the focused tests only. The full suite runs once per lane at accept on Netcup (`ssh ben@100.69.249.18`, `bash -lc`, repo at `~/Code/zhuk-infra/claude-delegation`) and once on Hetzner (`ssh ben@100.111.119.54`), one suite at a time per machine. skills-a is finishing lane 62 against the same hosts; if a host is busy, wait for it.
- One Opus red-team round on the spec at most, then build; later ambiguity is a ruling in the record, not a new spec. A reviewer is spawned only on a green builder gate, in the same turn the builder report lands.
- Own branch (`build/<name>-<lane>`), own work record in `docs/work/`, record names the goal-card measure it moves. Accepted = Opus APPROVE sha plus both suite results in the record. Then merge into main with a merge commit under the 9/26 standing grant, closing bullet in `docs/decisions/history/<NY day>.md`. No release, no install.
- Every execution brief carries: "If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block." And: never set a git identity, no `--no-verify`, no force, no recursive deletes.
- Receipts only: one ACK now, one RESULT per lane when it is on main (or BLOCKED with the reason). Do not ask me what the packet or the code can answer; rule it and write the ruling in the record.

## Lane 66: land `build/fresh-walk-1`. Measure: hours ask to accepted (a fresh host installs from the docs without the lead).
Approved 9/26, blocker fixed since, never merged. Merge current main into it in a worktree; conflicts expected in `README.md`, `docs/native-use.md`, `skills/janitor/SKILL.md`; keep main's side for anything the continue-skill retirement or later lanes removed. Commit dee95ab fixes a wrong script name at `scripts/goal-card.mjs:448`; make sure it survives. One Opus review of the conflict resolution only, suites on the two Linux hosts, then merge under the grant and delete the origin branch with `git push origin --delete` after the merge is on origin.
Due on main: 10/1 11:30 PM NY.

