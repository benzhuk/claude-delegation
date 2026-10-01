# Lane 64: decisions-wedge — spec

The pinned scope is the "Lane 64" section of the lead's packet, quoted verbatim below (source: main:docs/notes/skills-f-resume-lanes-1.md at f976ca0a, from skills-f-resume-lanes-1). Rules-for-all-three in that packet apply.

## Rules for all three
- Repo is `C:\Users\benzh\Code\zhuk-infra\claude-delegation`. Every worktree goes under `<repo>/.claude/worktrees/<lane>`, never anywhere else. Each lane removes its own worktree when it closes and says so in its record.
- No test suite on Windows. Builders run the focused tests only. The full suite runs once per lane at accept on Netcup (`ssh ben@100.69.249.18`, `bash -lc`, repo at `~/Code/zhuk-infra/claude-delegation`) and once on Hetzner (`ssh ben@100.111.119.54`), one suite at a time per machine. skills-a is finishing lane 62 against the same hosts; if a host is busy, wait for it.
- One Opus red-team round on the spec at most, then build; later ambiguity is a ruling in the record, not a new spec. A reviewer is spawned only on a green builder gate, in the same turn the builder report lands.
- Own branch (`build/<name>-<lane>`), own work record in `docs/work/`, record names the goal-card measure it moves. Accepted = Opus APPROVE sha plus both suite results in the record. Then merge into main with a merge commit under the 9/26 standing grant, closing bullet in `docs/decisions/history/<NY day>.md`. No release, no install.
- Every execution brief carries: "If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block." And: never set a git identity, no `--no-verify`, no force, no recursive deletes.
- Receipts only: one ACK now, one RESULT per lane when it is on main (or BLOCKED with the reason). Do not ask me what the packet or the code can answer; rule it and write the ruling in the record.

## Lane 64: decisions page wedge (plan item 16). Measure: work lost or stalled.
State: page `3e1da11277a18174bccfea187d5c3972`, pickup round 3 stuck in NEEDS_RECONCILIATION; `account` refuses (new owner input on the page; attestation bound to skills-a) and `publish` refuses. `note-flush --status` today also prints `pickup: PICKUP_CONFIG_INVALID`, probably the registration still naming the pre-move repo path: confirm and fix inside this lane. Background: `C:\Users\benzh\.agents\handoff-0930\consolidation-state.md`, `docs/notes/skills-fable-pickup-r3-accounted-1.md`, the three untracked `docs/notes/decisions-pickup-*-r{1,2,3}.pointer.json`.
Scope, pinned:
1. Clearing Done and accounting the round are one step; no path clears Done without accounting.
2. A round whose owner inputs are all quoted in `docs/decisions/history/` on origin is admitted as closed.
3. The owner binding follows the lead that runs the pickup, not the first lead that ever ran it.
4. Regression tests for each of the three, from a fixture of the 9/30 wedge.
5. Prove it live: with the fixed scripts, close round 3 and run `publish` on the real page with the waiting set as it stands (currently empty). Every answer on the page is already quoted in history 2026-09-30. Do not hand-edit the receipt or the page.
Not in scope: the publish-without-pickup redesign, new page sections, any waiver flag.
Due on main: 10/2 9:00 AM NY.

