Task: Merge the reviewed territory branch into the integration branch when told it is ready, run the Windows gate (focused `node --test` on the test files this lane added or changed; there is no full suite on Windows), triage any failure to the owning file, and report pass or fail plus the failing file. You never decide whether a failure is acceptable; you report it.
Goal: work is not lost or stalled by worktrees outside `<repo>/.claude/worktrees/`, with nothing else in the suite regressed.
Work: wr-2026-10-01-worktree-location

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/spec.md
- The territory's builder report and review report under C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/reports/ (wtloc65-builder.md, wtloc65-review-r<n>.md): read the relevant one only when triaging a specific failure.

PROJECT FACTS (at most 25 lines):
- Integration worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65, branch build/worktree-location-65. Territory branch: build/worktree-location-65-wtloc65 (worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-worktree-location-65-wtloc65). Base 0a33fd52f00abcedf276a4e6497f66c61f5ba24b.
- Windows has NO full suite. The full suite runs later on Linux hosts (Netcup, then Hetzner, one suite at a time per host) by the lead; never run it here, never run `node scripts/run-tests.mjs` with no arguments, never a bare `node --test` with no file list.
- Gate: list the lane's changed or added test files with `git -C <integration worktree> diff --name-only 0a33fd52f00abcedf276a4e6497f66c61f5ba24b HEAD -- "*.test.mjs"`, add the focused set hooks/agent-dispatch-guard.test.mjs hooks/delete-guard.test.mjs scripts/janitor.test.mjs scripts/install-janitor-timer.test.mjs scripts/run-tests.test.mjs agents/agents.test.mjs (deduplicated), and run `node --test` on exactly that list. If the diff touches hooks/hooks.json or hooks/codex-hooks.json, also include skills/multi/scripts/hooks.test.mjs scripts/wiring-check.test.mjs scripts/native-package.test.mjs scripts/codex-hook-trust.test.mjs hooks/codex-unsupported.test.mjs scripts/mirror-shared-skills.test.mjs. No wrapper script; quote the file list in your report.
- Merging the territory branch into build/worktree-location-65 is a normal `git merge` (fast-forward or merge commit) once the orchestrator tells you the territory is reviewed (an APPROVE verdict exists); never on your own schedule. Commits: conventional, no Co-Authored-By, the configured identity untouched, no --no-verify.
- Never run a recursive delete or git clean, never force anything, never push.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- You do not write or edit any territory source file. You do not decide whether a failure blocks merge to main: that is the lead's ship decision, informed by your report.
- You do not touch docs/work/*.record.md; that is the orchestrator's alone.
- You do not run the Linux suites, a release, an install, or a merge into main.

Evidence format: pass or fail per gate run, the exact command and its exit code, and on failure the failing test file names and the first error line for each, not the full stack trace unless asked.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/reports/integrator.md. Line 1 is the verdict, first word.

Gate: node --test <the file list built above> > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/reports/integrator-gate.log 2>&1. Read only the tail and the failing names on a green run.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-65/docs/specs/worktree-location-65/reports/integrator-state.md. Keep it current after every gate: one line per gate with the time, what was merged in at that point, and pass or fail.

A result of "still red, same tests as last run" is a good answer; say so plainly rather than re-diagnosing from scratch.

Autonomy: you may run the gate as many times as the orchestrator requests and re-run a single failing file in isolation to confirm a fix landed. You do not skip a failing test, weaken an assertion, or merge a territory that was not named to you as ready.

Un-agent-able steps: none expected.
ETA: 5 to 15 minutes per gate run. Report or park by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
