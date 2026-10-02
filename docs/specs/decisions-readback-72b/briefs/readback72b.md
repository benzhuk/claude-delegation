Task: Fix the cause of the decisions publish readback failure (exit 5 after a live write, then exit 4 until --adopt-live) in territory readback72b (worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-decisions-readback-72b-readback72b, branch build/decisions-readback-72b-readback72b): find it with a discriminating offline check, fix the renderer or the readback normaliser (never a looser comparison), and add a regression test from a fixture shaped like the live page with the three toggles. Done means Cause, Discriminating check, Fix location and Simplification are in the report, the new test fails on the base tree and passes after, and the gate is green.
Goal: Agent work gets cheaper, faster and more reliable (docs/goals/card.md); this lane removes a stall: every live decisions publish ends in exit 5 and needs --adopt-live. Measure: work lost or stalled.
Work: wr-2026-10-01-decisions-readback (docs/work/wr-2026-10-01-decisions-readback.record.md on the integration worktree; you never touch docs/work/)

Inputs (by path):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/spec.md
- Scout addendum for this territory (file and line facts; where it conflicts with the spec the spec wins): C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/briefs/scout-readback72b.md
- Local backups of the live page, read-only: ~/.local/state/notion-backups/3e1da11277a18174bccfea187d5c3972/ (the .after.md files are the page as Notion returned it after a write; docs/decisions/last-render.md on the integration worktree is the adopted live page)
- Mandate template this brief follows: docs/mandate-template.md

PROJECT FACTS:
- Windows host. Node only; test command `node --test <files>`; NO full suite on Windows (the lead runs suites on Netcup and Hetzner later; never report a full suite as run). Never start a server or use a port; never run a production build.
- NO live Notion writes and no notion.js write command from anyone but the lead after merge. Reading the local backup files under ~/.local/state/notion-backups/3e1da11277a18174bccfea187d5c3972/ is fine (read-only); never read env, credentials or token files.
- Temp files only under the Scratch dir C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-72b/ ; never delete a directory.
- Territory files you own (edit only these): skills/decisions/scripts/decisions-render-sections.mjs, skills/decisions/scripts/decisions-render-core.mjs, skills/decisions/scripts/decisions-render-publish.mjs, skills/decisions/scripts/decisions-render.test.mjs, skills/decisions/scripts/decisions-render-core.test.mjs, skills/decisions/scripts/decisions-render-publish.test.mjs, skills/decisions/scripts/fixtures/toggles-fixtures.mjs, and a new fixture directory skills/decisions/scripts/fixtures/readback-toggles-72b/.
- Offline reproduction recipe: `node skills/decisions/scripts/decisions-render.mjs render --repo <a checkout of the current tree>` prints the in-memory render (pure, no network). Compare normalize() (decisions-render-core.mjs:63) of it with a backup .after.md line by line. Print the normalised diff in your report. The scout's finding (one line, the Bearings Goals-page link, www.notion.so versus app.notion.com/p) is a lead to verify, not a fact to copy.
- Page-lint and autolink rules (checkAutolinkLines, the hex-token prose rule) still apply to anything you render.
- Commits: conventional (`fix:`, `test:`), no Co-Authored-By line, the configured git identity only; commit on build/decisions-readback-72b-readback72b in your worktree, never push.

Scope (from the spec, pinned):
1. Find the cause with a discriminating check (offline, against the latest backup and the current render); print the normalised diff.
2. Fix the cause in the renderer or the normaliser. A real page-content mismatch must still fail: add a test where one genuinely different content line makes publish exit 5.
3. Regression test: a fixture shaped like the live page with the Goal card, Bearings and Components toggles; a full `publish` through a fake notion whose readPage returns the written text with the same rewrite Notion applied (not the text verbatim), expecting exit 0 and last-render.md updated. It must fail on the base tree.
4. Update the assertion at decisions-render.test.mjs:1106 only if the renderer constant changes, and say so.

NOT (out of scope, stated explicitly):
- Anything else in lane 72 or lane 73; any live Notion write; docs/work/, docs/specs/, docs/decisions/ (the lead publishes and adopts), any file outside the territory list; any push, release or install.
- Loosening normalize or the readback comparison so a changed page passes; skipping the readback check.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Evidence format: cite file:line for every claim; measured numbers (test counts), not adjectives; the four lines Cause:, Discriminating check:, Fix location:, Simplification: each non-empty; the command and its result showing the new test failing on the base sha.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/reports/readback72b.md. Line 1 is the verdict, first word (VERDICT: PASS, FAIL or BLOCKED).

Gate: node --test skills/decisions/scripts/*.test.mjs skills/notion-writing/scripts/*.test.mjs > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/reports/readback72b-gate.log 2>&1. Read only the tail and the failing names. No wrapper script.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/reports/readback72b-state.md. Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you may choose the fix location (renderer constant or normaliser) on the evidence, and the fixture design. Check in (report BLOCKED with the question) before touching a file outside your territory or changing any other rendered line of the page.

Un-agent-able steps: the live publish and --adopt-live (the lead's, after merge); the full suite (Netcup and Hetzner, the lead's). Scoped out of "done".
ETA: 30 to 60 minutes; report or park by 60.

Wall-clock limit 60 minutes from your start; at 60 minutes stop, write your report with VERDICT: BLOCKED and the reason timeout, and return.

Fix kind: bug
Class: readback-url-rewrite
Regression test: skills/decisions/scripts/decisions-render-publish.test.mjs (the new publish-through-rewriting-notion test)
Base sha: c3d9f814debc5e0fd0e7509af1bdbfaf0e4b4c6e

Review fields (bug-fix reviews only): your findings report must carry four non-empty lines: Cause:, Discriminating check:, Fix location:, Simplification:.

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Never send peer notes.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
