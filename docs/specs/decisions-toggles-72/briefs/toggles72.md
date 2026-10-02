Task: In worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-decisions-toggles-72-toggles72 (branch build/decisions-toggles-72-toggles72, base 68bf4e1669759a9428b8c47245ff2db13ca235d1), build everything in the spec's scope items 1 to 8 and nothing else: the three agent-owned toggles (Goal card, Bearings, Components) at the top of the decisions page, docs/components.md plus the renderer guard that fails publish on a nonexistent skill or script path, the card-toggle stale-sha check in the hand-back, the page-shape rule (toggles only at top level, page-lint rule, SKILL.md plus references/page-shape.md, cross-reference from skills/notion-writing), and the Done checkbox moved to the last block inside the Waiting on you now toggle with the pickup, reader, publish and fixtures moved with it. Done means the focused gate below is green and every scope item has a test against fixtures.
Goal: Agent work gets cheaper, faster and more reliable at equal or better quality, on any agent host. This task serves "work lost or stalled": Ben decides faster because the goal card, bearings and components sit where he reads (docs/goals/card.md line 1).
Work: wr-2026-10-01-decisions-toggles (docs/work/wr-2026-10-01-decisions-toggles.record.md)

Inputs (by path):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/spec.md (scope items 1 to 8 are pinned; read all of it)
- Contracts: there is no separate contracts file; the spec is the only contract.
- Scout addendum: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/briefs/scout-toggles72.md (read first; it lists the files, helpers, policing tests and open questions)
- Component source: docs/work/evidence/2026-09-28-component-map.md section A (in your worktree)
- Card: docs/goals/card.md; bearings: newest docs/work/evidence/*-bearings-assessment.md and its -response.md (the 2026-10-01 pair today)
- Mandate rules: docs/mandate-standards.md (in your worktree)

PROJECT FACTS:
- Node ESM (.mjs), no package install needed; Windows host (Git Bash and PowerShell). Do not run the full suite on Windows.
- Test command: node scripts/run-tests.mjs <file> [file...] (sealed runner). Run only the focused files named in Gate.
- Territory write set (yours alone): skills/decisions/scripts/decisions-render-core.mjs, decisions-render.mjs, decisions-render-publish.mjs, decisions-read.mjs, decisions-handback.mjs, decisions-pickup.mjs, goals-mirror.mjs (export only), their *.test.mjs files, skills/decisions/scripts/fixtures/**, skills/decisions/SKILL.md, skills/decisions/templates/decisions-page.md, new skills/decisions/references/page-shape.md, skills/notion-writing/SKILL.md, skills/notion-writing/scripts/page-lint.mjs and page-lint.test.mjs, new docs/components.md, and any new small module you split out under skills/decisions/scripts/ (keep files under about 800 lines; decisions-render-core.mjs is 675 and decisions-pickup.mjs 1707, so put new code in new files).
- New toggles' shape: tab-indented children inside a `# Name {toggle="true"}` heading, matching the existing History toggle; end each toggle with the trailing <empty-block/> the toggle-tail lint rule requires.
- Bearings toggle: parse the newest *-bearings-assessment.md and its -response.md by name; fields: decision (the verdict word on line 1), condition if any, next action, prediction and check date, links to the Goals page 3e3da11277a1813cb326c42ed97a1d5d and to both files under REPO_BLOB_BASE in decisions-render-core.mjs. Refuse (RefusedError, exit 2) with a clear message if a field cannot be found; never invent one.
- Goal card toggle: the full text of docs/goals/card.md plus "main at <sha>" using goals-mirror.mjs computeSha; the hand-back stale-sha check must compare this sha to the head the same way the Goals page sha is compared.
- State words for components.md, one line per component: fed, measured, unfed, partial, missing. Use the scout's assumption for meanings (fed = shipped and something consumes its output; measured = shipped and a number is read from it; unfed = shipped, nothing consumes it) and state the meanings in a header comment in the file. continue is retired and not listed; the build loop is the only route; lanes 64 to 68b landed. Only name a skill or script path that exists on the base tree.
- Components guard: put it in the renderer (it fails publish and render with a RefusedError) and add the same check as a fixture-driven test; wiring-check.mjs is not touched. Check every backticked path under skills/, scripts/, hooks/ in docs/components.md against the repo tree.
- Where the scout's open questions 3 and 4 leave a choice, take the stated assumption, record it in the report under "Assumptions", and keep the legacy column-0 Done layout parsing (warnings unchanged) so existing pages still read.
- No live Notion write, no publish to the real page, no call to notion.js against the network. Everything in Notion appears authored by Ben Zhuk; write no AI byline anywhere (docs, commits, comments).
- Git: commit on your branch with conventional messages, no Co-Authored-By line, no git identity changes, never push, never skip hooks.

NOT (out of scope, stated explicitly):
- Changing the text of docs/goals/card.md, the pickup design beyond the Done position, the Goals page layout or templates/goals-page.md.
- Any file outside the territory write set above; scripts/wiring-check.mjs and its test; the lane-72 integration worktree.
- Releases, version bumps, installs, the live publish, and any destructive git (hard resets, clean, stash, force pushes) or recursive deletes.

Evidence format: cite file:line for every claim; measured numbers (tests passed/failed) not adjectives; verdict word first; list each of the spec's scope items 1 to 8 with the test name that proves it.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/reports/toggles72.md. Line 1 is the verdict, first word.

Gate: node scripts/run-tests.mjs skills/decisions/scripts/decisions-render.test.mjs skills/decisions/scripts/decisions-render-core.test.mjs skills/decisions/scripts/decisions-render-publish.test.mjs skills/decisions/scripts/decisions-read.test.mjs skills/decisions/scripts/decisions-handback.test.mjs skills/decisions/scripts/decisions-pickup.test.mjs skills/decisions/scripts/registered-pickup.contract.test.mjs skills/decisions/scripts/skill-text.test.mjs skills/decisions/scripts/goals-mirror.test.mjs skills/notion-writing/scripts/page-lint.test.mjs scripts/wiring-check.test.mjs > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/reports/toggles72-gate.log 2>&1. Run from the territory worktree. Read only the tail and the failing names. No wrapper script.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/reports/toggles72-state.md. Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: You may decide file splits, helper names, fixture layout and the prose of the page-shape rule within the spec's wording (Ben's quote in spec items 6 to 8 appears once, in the skill). Check in (report BLOCKED) before changing any behaviour the spec or scout lists as an open question beyond the stated assumptions, or touching a file outside the write set.

Un-agent-able steps: the live publish and a fresh read of the real Notion page are done by the lead after merge, outside this build; "done" here means fixtures and tests only.
ETA: 3 hours; report or park by then.

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
