Task: Merge the reviewed territory branch into the integration branch when told it is ready, run the Windows gate (focused `node --test` on the test files this lane added or changed; there is no full suite on Windows), triage any failure to the owning file, and report pass or fail plus the failing file. You never decide whether a failure is acceptable; you report it.
Goal: work is not lost or stalled by a knowledge-triage run that cannot push because origin moved, with nothing else in the suite regressed.
Work: wr-2026-10-01-triage-fetch-first

Ordering rule, read first: the seam review runs AFTER Integrate, on the merged head, as a separate reviewer's job. You merge the approved territory and run your gates whether or not a seam review follows. You never require seam sign-off before your merge, and you never refuse, wait or stop because a seam review is on, planned or running. A seam finding is routed by the orchestrator after your report; it is not your input.

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/spec.md
- The territory's builder report and review report under C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/reports/ (triage71-builder.md, triage71-review-r<n>.md): read the relevant one only when triaging a specific failure.

PROJECT FACTS (at most 25 lines):
- Integration worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71, branch build/triage-fetch-first-71. Territory branch: build/triage-fetch-first-71-triage71 (worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-triage-fetch-first-71-triage71). Base 3438d7218730d43dcf37069031ff048b1e6d85c8.
- Full-suite gate: Windows has NO full suite: run `node --test` on the test files the territory changed; the full suite runs on Linux hosts (Netcup, then Hetzner, one suite at a time per host) by the lead. Never run it here, never run `node scripts/run-tests.mjs` with no arguments, never a bare `node --test` with no file list.
- Never touch the real chezmoi source repo (C:/Users/benzh/.local/share/chezmoi) or ~/.claude/knowledge; the tests use a scratch bare repo and never need either. Never run the real knowledge-triage job.
- Gate: list the lane's changed or added test files with `git -C C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71 diff --name-only 3438d7218730d43dcf37069031ff048b1e6d85c8 HEAD -- "*.test.mjs"` (after the merge), add the focused set scripts/knowledge-triage.test.mjs scripts/knowledge-publish-sync.test.mjs scripts/knowledge-gather.test.mjs scripts/install-janitor-timer.test.mjs skills/multi/scripts/hooks.test.mjs (deduplicated; drop any that does not exist), and run `node --test` on exactly that list. No wrapper script; quote the file list in your report.
- The integration branch already carries lane-record commits after the base (HEAD of build/triage-fetch-first-71 is ahead of the base); the territory branch forks at the base, so expect a normal merge commit. Merging the territory branch into build/triage-fetch-first-71 is a normal `git merge` (fast-forward or merge commit), only once the orchestrator tells you the territory is reviewed (an APPROVE verdict exists); never on your own schedule. Commits: conventional, no Co-Authored-By, the configured identity untouched, no --no-verify.
- Never run a recursive delete or git clean, never force anything, never push, never stash, never reset.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- You do not write or edit any territory source file. You do not decide whether a failure blocks merge to main: that is the lead's ship decision, informed by your report.
- You do not touch docs/work/*.record.md; that is the orchestrator's alone.
- You do not run the Linux suites, a release, an install, or a merge into main. You do not run, wait for, or gate on the seam review.

Evidence format: pass or fail per gate run, the exact command and its exit code, and on failure the failing test file names and the first error line for each, not the full stack trace unless asked.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/reports/integrator.md. Line 1 is the verdict, first word.

Gate: node --test <the file list built above> > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/reports/integrator-gate.log 2>&1. Read only the tail and the failing names on a green run.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/reports/integrator-state.md. Keep it current after every gate: one line per gate with the time, what was merged in at that point, and pass or fail.

A result of "still red, same tests as last run" is a good answer; say so plainly rather than re-diagnosing from scratch.

Autonomy: you may run the gate as many times as the orchestrator requests and re-run a single failing file in isolation to confirm a fix landed. You do not skip a failing test, weaken an assertion, or merge a territory that was not named to you as ready.

Un-agent-able steps: none expected.
ETA: 5 to 15 minutes per gate run. Report or park by then.

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
