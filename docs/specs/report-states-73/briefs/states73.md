Task: In territory states73 (worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-report-states-73-states73, branch build/report-states-73-states73) build the five scope items of the lane 73 spec: the new report first-line states and the report check script that enforces them, the new lane-record Status words with the Now / To finish / Est line enforced by accept and merge-check, the three-field line in the decisions renderer, the hook-card component line reference, and focused tests against fixtures. Done means each of the five items is on the branch with its tests, existing open records on main still parse, and the gate is green.
Goal: Agent work gets cheaper, faster and more reliable (docs/goals/card.md); this lane removes a stall: Ben and the lead cannot see where a long-running thing is without reading it. Measure: work lost or stalled.
Work: wr-2026-10-01-report-states (docs/work/wr-2026-10-01-report-states.record.md on the integration worktree; you never touch docs/work/)

Inputs (by path):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/spec.md
- Scout addendum for this territory (file and line facts; where it conflicts with the spec the spec wins): C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/briefs/scout-states73.md
- Ben's ruling and the packet text: docs/decisions/history/2026-10-01.md in your worktree, section "Pickup round 4" (read-only)
- Nearest existing check to model the report script on: scripts/bugfix-fields.mjs and scripts/bugfix-fields.test.mjs
- Mandate template this brief follows: docs/mandate-template.md

PROJECT FACTS:
- Windows host. Node only; test command `node --test <files>`; NO full suite on Windows (the lead runs suites on Netcup and Hetzner later; never report a full suite as run). Never start a server or use a port; never run a production build.
- NO live Notion writes, no notion.js command, no read of env, credentials or token files.
- Temp files only under the Scratch dir C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-73/ ; never delete a directory.
- Territory files you own (edit only these): docs/subagent-contract.md, docs/mandate-template.md, docs/work-record.md, docs/components.md (comment header only, for item 4), scripts/report-check.mjs and scripts/report-check.test.mjs (new), scripts/work-record.mjs, scripts/work-record*.test.mjs, scripts/record-closed-and-skip.contract.test.mjs, skills/team-build/SKILL.md, skills/delegate/SKILL.md, skills/decisions/SKILL.md, skills/decisions/templates/decision-item.md, skills/decisions/scripts/decisions-render-core.mjs, skills/decisions/scripts/decisions-render-sections.mjs, skills/decisions/scripts/decisions-render*.test.mjs, new fixture files under skills/decisions/scripts/fixtures/, and a new fixture directory scripts/fixtures/report-states-73/. Consumers that read Status words (hooks/backlog-notice.js, scripts/work-census.mjs, scripts/collect-status.mjs, scripts/collect-from-origin.mjs, scripts/four-read.mjs and their tests) may be edited only if a test of yours proves they break; say which and why in the report.
- Pinned first lines (spec item 1): the first line of a report is exactly one of `DONE`, `NEEDS BEN: <one line>`, `NEEDS <peer slug>: <one line>`, `FAILED: <why>`, and ends with `<n> of <m> steps done`. `PARTIAL` is refused. Line 2 for anything not DONE: `Now: <one line> | To finish: <one line> | Est: <duration>`. The check script refuses a report missing either line, and exits 0/1 like bugfix-fields.mjs, naming what is missing.
- Pinned lane-record words (spec item 2): `Status:` becomes open, NEEDS BEN, NEEDS <peer>, FAILED, accepted, closed; every open record carries the same Now / To finish / Est line, refreshed by whoever writes the record. The accept and merge-check scripts refuse a record with any other Status word.
- Compatibility, pinned by the lead: existing open records on main must still parse (parseRecord, validateRecord, work-census, collect-status, backlog-notice all read all of docs/work/*.record.md); open records get the new Status words and a Now / To finish / Est line only where the spec requires; closed records are never rewritten; grandfather by a dated cutoff the way ACCEPTED_WITHOUT_CHECK_CUTOFF does rather than rewriting history. The unresolved lifecycle questions are in the scout addendum section 4 (questions 1 to 7). Do not decide them silently: take the narrowest reading that satisfies the spec (new words added, old words stay readable, accept still moves a record through its existing pre-accept state, accept and merge-check refuse any word outside the allowed set at their own gate), write the reading you took in the report under "Readings taken", and report BLOCKED with the question only if no reading can satisfy the spec.
- The first-line states govern progress reports (runner, lead, long-running thing). Reviewer, integrator and seam reports keep their `VERDICT:` first line, which accept and the evidence check depend on (work-record.mjs:427, :641, :1499); say so in the contract once. Do not change agents/*.md or the build-loop worker prompts.
- Item 3 (renderer): every waiting item and every in-progress item the renderer emits shows Now / To finish / Est as one short line directly under its title; add the check beside checkWaitingItem and the session bullet checks, keep the session limits (8 bullets, 200 chars) honest, and add a fixture with the line and one without (refused, naming file and line). docs/decisions/ source files are the lead's; fixtures only.
- Item 5: the briefs in skills/team-build and skills/delegate state the first-line rule once each (not repeated), and the tests assert the rule text is present once.
- Commits: conventional (`feat:`, `test:`, `docs:`), no Co-Authored-By line, the configured git identity only; commit on build/report-states-73-states73 in your worktree, never push.

NOT (out of scope, stated explicitly):
- The goal card text, the census, any retroactive rewrite of a closed record, anything in docs/work/ or docs/decisions/ or docs/specs/, agents/*.md, hooks other than a proven-broken consumer, any file outside the territory list.
- Any live Notion write, push, release, install or merge; deciding the open lifecycle questions beyond the narrowest reading.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Evidence format: cite file:line for every claim; measured numbers (test counts), not adjectives; for each of the five spec items, the test name that proves it and the command with its exit code; the list of every file touched; "Readings taken" for the scout's open questions.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/reports/states73-builder.md. Line 1 is the verdict, first word (VERDICT: PASS, FAIL or BLOCKED).

Gate: node --test scripts/report-check.test.mjs scripts/work-record*.test.mjs scripts/record-closed-and-skip.contract.test.mjs scripts/work-census.test.mjs hooks/backlog-notice.test.mjs agents/agents.test.mjs skills/decisions/scripts/*.test.mjs skills/notion-writing/scripts/*.test.mjs > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/reports/states73-gate.log 2>&1. Read only the tail and the failing names. No wrapper script.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/reports/states73-state.md. Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you may choose the file layout of the new script and fixtures and the exact wording of contract text within the pinned line shapes. Check in (report BLOCKED with the question) before touching a file outside your territory or changing a Status word's meaning for a record that is already closed.

Un-agent-able steps: the full suite (Netcup and Hetzner, the lead's); the live decisions publish (the lead's). Scoped out of "done".
ETA: 60 to 120 minutes; report or park by 120.

Wall-clock limit 120 minutes from your start; at 120 minutes stop, write your report with VERDICT: BLOCKED and the reason timeout, and return.

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Never send peer notes.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
