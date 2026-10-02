# Lane 72: card, bearings and components on the decisions page (10/1 8:40 PM NY)

Ben, 10/1 8:30 PM: "part of the notion decisions skill is that the goals card and bearings should be mirrored on the decisions page in their own toggles, i always want immediate access." Measure: work lost or stalled (decisions made faster because the context is where he reads).

## Scope, pinned
1. The decisions renderer (`skills/decisions/scripts/decisions-render*.mjs`) emits three agent-owned toggles at the top of the page, above Waiting, regenerated on every publish and never hand-edited: `Goal card` (the full text of docs/goals/card.md plus "main at <sha>"), `Bearings` (from the newest docs/work/evidence/*-bearings-assessment.md and its -response.md: decision, condition if any, next action, prediction and check date, links to the Goals page 3e3da11277a1813cb326c42ed97a1d5d and to both files on GitHub main), `Components` (one line per component: name, what it does for the goal, state word, from `docs/components.md`).
2. `docs/components.md` is created in this lane from docs/work/evidence/2026-09-28-component-map.md section A, trimmed to one line per component with the state words fed, measured, unfed, partial, missing, and brought current to tonight's main (continue is retired; the build loop is the only route; lanes 64 to 68b landed). A script check (`wiring-check.mjs` or the renderer's own guard) fails publish when components.md names a skill or script path that does not exist on main.
3. The Goals page mirror stays as it is; the hand-back stale-sha check also covers the card toggle on the decisions page.
4. Page-lint clean on a fresh read after the live publish; the title rule (Topic: M/D H:MMAM Decisions) unchanged; every section Ben or earlier sessions wrote preserved.
5. Tests for 1 and 2 against fixtures.
Not in scope: changing the card's text (that is Ben's v6 decision, on the page tonight), the pickup, the Goals page layout.

## Build shape
Through the Workflow, Sonnet builds, Opus reviews, one red-team round at most, worktree under <repo>/.claude/worktrees/, suites once on Netcup and once on Hetzner, merge under the 9/26 grant, then one live publish of the real page with the three toggles. Every execution brief: if any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block. Everything in Notion appears authored by Ben Zhuk. Never set a git identity, no --no-verify, no force, no recursive deletes.

Due on main: 10/2 12:00 PM NY.

## Received / acted

## Added 8:55 PM NY, Ben's page-shape rule (scope items 6 to 8, pinned)
Ben: "part of writing the notion is that everything should be in toggles planned in an intelligent way to make it easy for me to find a section then zoom in. make that part of the skill so the notion is always written in the best way by all future sessions, not just remembering from your context. the done checkbox should be in the 'Waiting on you now' section at the end."
6. The page shape is a rule in skills/decisions (SKILL.md plus references/page-shape.md), cross-referenced from skills/notion-writing: every section is a toggle; the top level is few and named for what Ben looks for (Goal card, Bearings, Components, Waiting on you now, Done, Closed, History); detail nests inside; the renderer is the only writer of that shape. Page-lint fails a top-level block that is not a toggle, a heading or the title.
7. The Done checkbox Ben ticks to hand back is the last block inside the Waiting on you now toggle. The pickup reads it there; its fixture moves with it.
8. The skill states the shape once, with the reason in Ben's words, so a fresh session follows it without this packet.
