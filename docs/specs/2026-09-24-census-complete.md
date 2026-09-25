# Second loop build: the census counts everyone, and the record cannot be accepted without it

Written by skills-fable, 2026-09-24 late evening, for skills-o running the plugin's build loop. Feeds an existing mechanism instead of adding one: `scripts/build-census.mjs` exists, has fixtures and a test, and is named in the team-build skill, but the first loop build's census left out the lead's turns after its mid-build run and every Task-tool subagent the lead spawned itself (seam round one). "7 turns" was hand-counted. A census that omits the lead cannot prove "top-tier tokens per build", so the DONE line's "census beats the hand-run build on all four measures" is unprovable today.

Measure this build moves: top-tier tokens per build becomes measurable and script-produced; rework after acceptance, because acceptance now requires the census. Must not worsen the others: lead under 20 turns, Sonnet builds, Opus reviews.

Base: origin/build/loop-gates-1 at 2869798 (pending Ben's merge; do not wait for it). Branch `build/census-complete-1`, one worktree per builder.

## Territory C1: the census script (scripts/build-census.mjs, its test and fixtures, docs/census.md)
Findings at 2869798: `--tasks` takes one directory and globs `*.output` and `*.jsonl` in it; role is not a concept, only `message.model`; the lead file is read once and the turn count in the record was not the script's output.
Required:
1. `--tasks` accepts several directories and globs; by default, when `--lead <session.jsonl>` is given, the script also reads `<dirname of lead>/<lead session id>/subagents/agent-*.jsonl` so Task-tool subagents of the lead are counted without a flag. Each input file appears once in the output with its path, so a reader can see what was counted.
2. Roles: derive from the Workflow journal labels when present (`build:T1`, `review:T1`, `seam`, `integrate`) and from an optional `--role-map <json>` (`{"agent-<id>": "seam-reviewer"}`) otherwise; files with no role are reported under `unassigned`, never silently folded into another row. Output keeps the by-model table and adds a by-role table produced by the script, in the same shape the record used by hand.
3. Lead turns: the script prints `leadTurns`, defined and pinned by a test as the number of maximal runs of assistant messages between user messages that are not tool results (a task notification counts as a user message). The definition is written in docs/census.md in one sentence.
4. A trimmed fixture with a lead file, a subagents dir and a Workflow tasks dir, and tests for: multi-dir counting, the subagents default glob, role mapping with an unassigned file, and the turn count on a fixture with tool results and a notification interleaved.
5. The script's output is deterministic JSON plus a markdown table; both stable under a re-run with no new input (pinned by a test).

## Territory C2: acceptance requires the census (scripts/work-record.mjs, skills/team-build/SKILL.md, README changelog)
Required:
1. `accept` takes `--census <file>` produced by C1 (recognised by a header line the script writes); it copies the census summary lines (by model, by role, leadTurns, wall clock if present) into the record under `Census:` and stores the file next to the record's evidence. Without `--census`, `accept` refuses with the finding `census-missing`. `--no-census "<reason>"` is allowed and writes the reason into the record, so a build with a broken census is not blocked but is visibly unmeasured.
2. `checkAcceptance` gains `census-stale`: the census file's lead session mtime or last message timestamp must be at or after the record's last review `Log:` entry, so a mid-build census cannot pass as final.
3. The team-build skill's acceptance section says: run the census at accept time, after the last review, with the lead's own session file and the subagents dir; then `accept --census`. One line, pointing at docs/census.md.
4. Tests: accept refused without census; accepted with; `census-stale` on an older file; `--no-census` records the reason. Changelog entry under 0.20.8 (no version bump).

## Not in scope
No new hooks, no Notion writes, no install, no release commit, no merge, nothing under skills/decisions/ or skills/bearings/. No trailers; identity never set by an agent.

## Acceptance
- Sealed suite green on the integrated branch; check-acceptance and accept pass on this build's own record using C1's census of this very build (dogfood: the record's census must be the script's output, including `leadTurns` for skills-o's session, not a hand count).
- Opus reviewers per territory with `JUDGMENT:` lines; one seam review across C1 and C2.
- The RESULT to skills-fable carries the script's own `leadTurns` and by-role table for this build and names the census file. Push on green (Ben's rule of Sep 24). Merge waits for Ben's word.
