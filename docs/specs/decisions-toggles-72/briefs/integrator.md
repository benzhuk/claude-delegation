Task: In the integration worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72 (branch build/decisions-toggles-72), merge the approved territory branch build/decisions-toggles-72-toggles72 (only after its review report says APPROVE for the head you merge), resolve conflicts, and run the focused gate on the merged head. You do not merge into main, push, release, install or publish.
Goal: Agent work gets cheaper, faster and more reliable at equal or better quality, on any agent host (docs/goals/card.md line 1). This integration guards "work lost or stalled": a merge that drops Ben's decisions-page sections loses work.
Work: wr-2026-10-01-decisions-toggles (docs/work/wr-2026-10-01-decisions-toggles.record.md)

Inputs (by path):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/spec.md
- Territory brief and its report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/briefs/toggles72.md and reports/toggles72.md
- Review report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/reports/review-toggles72.md (must say VERDICT: APPROVE for the head you merge)
- Seam brief (for your information only, see the seam note below): C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/briefs/seam.md

PROJECT FACTS:
- Node ESM; Windows host. The full suite is NOT run on Windows. The gate is focused tests only: the decisions renderer, page-lint, wiring-check and pickup fixtures: node scripts/run-tests.mjs skills/decisions/scripts/decisions-render.test.mjs skills/decisions/scripts/decisions-render-core.test.mjs skills/decisions/scripts/decisions-render-publish.test.mjs skills/decisions/scripts/decisions-read.test.mjs skills/decisions/scripts/decisions-handback.test.mjs skills/decisions/scripts/decisions-pickup.test.mjs skills/decisions/scripts/registered-pickup.contract.test.mjs skills/decisions/scripts/skill-text.test.mjs skills/decisions/scripts/goals-mirror.test.mjs skills/notion-writing/scripts/page-lint.test.mjs scripts/wiring-check.test.mjs
- No live Notion writes and no publish to the real page, by you or by any test. The two suite runs (Netcup, Hetzner) and the live publish belong to the lead after your report.
- Git: conventional commit for the merge, no Co-Authored-By line, no identity changes, never push, never skip hooks, no hard resets, clean, stash or force; on a conflict you cannot resolve from the spec, stop and report it.
- Seam review ordering: the seam review runs AFTER Integrate, on the merged head, as a separate reviewer's job. You merge the approved territory and run your gates whether or not a seam review follows. You never require seam sign-off before your merge, and you never refuse, wait or stop because a seam review is on.

NOT (out of scope, stated explicitly):
- Pushing, merging into main, tagging, releasing, installing, or the live publish.
- Editing code beyond conflict resolution needed to merge; fixes go back to the builder.
- Running the full suite on Windows.

Evidence format: the merged head sha in full on line 2; the exact gate command, exit code, and counts of tests passed and failed; names of any failing test; list of conflicts and how each was resolved.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/reports/integrate.md. Line 1 is the verdict, first word: `VERDICT: PASS`, `VERDICT: FAIL` or `VERDICT: BLOCKED` (BLOCKED with the note `timeout` if the wall-clock limit is reached).

Gate: the focused command in PROJECT FACTS > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/reports/integrate-gate.log 2>&1, run in the lane-72 worktree on the merged head. Read only the tail and the failing names. No wrapper script.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72/docs/specs/decisions-toggles-72/reports/integrate-state.md. Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: You may resolve textual conflicts that the spec decides. You may not change behaviour; a gate failure goes back to the builder in your report.

Un-agent-able steps: Netcup and Hetzner suite runs and the live publish are done by the lead after this report.
ETA: 45 minutes; report or park by then.

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
