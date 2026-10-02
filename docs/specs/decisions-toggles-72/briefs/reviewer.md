Task: Review the toggles72 territory (branch build/decisions-toggles-72-toggles72, worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-decisions-toggles-72-toggles72, diff against base 68bf4e1669759a9428b8c47245ff2db13ca235d1) against spec scope items 1 to 8 and judge whether it is correct, complete and inside its write set. You change no file in that worktree.
Goal: Agent work gets cheaper, faster and more reliable at equal or better quality, on any agent host (docs/goals/card.md line 1). This review guards "work lost or stalled": a page Ben cannot read, or a pickup that stops seeing his tick, loses work.
Work: wr-2026-10-01-decisions-toggles (docs/work/wr-2026-10-01-decisions-toggles.record.md)

Inputs (by path):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/spec.md
- Territory brief (the write set, assumptions and gate): C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/briefs/toggles72.md
- Scout addendum: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/briefs/scout-toggles72.md
- Builder report, state file and gate log: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/reports/toggles72.md, toggles72-state.md, toggles72-gate.log
- Mandate rules: docs/mandate-standards.md (in the territory worktree)

PROJECT FACTS:
- Node ESM; Windows host. Run only the focused gate files named in the territory brief (node scripts/run-tests.mjs <files>); no full suite on Windows.
- Check each scope item 1 to 8 against a named test and against the code, not against the builder's report. Specific traps: the three toggles regenerate on every publish and are never hand-edited; bearings fields come from files and a missing field must refuse; the components guard must fail on a path that does not exist and pass on one that does; Done must be the last block inside the Waiting on you now toggle and the legacy column-0 layout must still parse; page-lint must fail a top-level block that is not a toggle, a heading or the title; the card text in docs/goals/card.md is unchanged; no AI byline anywhere; no network or Notion write in any test.
- Reviewer model tier: high (Opus). Independent: you did not write this code.

NOT (out of scope, stated explicitly):
- Editing any file in the territory worktree or in lane-72 other than your report.
- The live publish, merging, and judging the card text or the Goals page layout.

Evidence format: cite file:line for every finding; verdict word first; each finding tagged BLOCKER (must fix before merge) or NOTE; list each scope item 1 to 8 with PASS or FAIL and the test that proves it; give the reviewed head sha in full on line 2.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/reports/review-toggles72.md. Line 1 is the verdict, first word: `VERDICT: APPROVE` or `VERDICT: NEEDS_FIXES` (BLOCKED with the note `timeout` only if the wall-clock limit is reached).

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: You may run the focused gate files and read any file. You may not edit code. One red-team round at most: after NEEDS_FIXES and the builder's fix, a second review is the last.

Un-agent-able steps: a fresh read of the real Notion page is not part of this review.
ETA: 60 minutes; report or park by then.

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
