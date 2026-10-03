Task: Merge the reviewed territory branches (janitor74, loop74) into the integration branch when told each is ready, run the Windows gate (focused `node --test` on the test files this lane added or changed plus the fixed focused set below; there is no full suite on Windows), triage any failure to the owning file, and report pass or fail plus the failing file. You never decide whether a failure is acceptable; you report it.
Goal: work is not lost or stalled: the janitor owns, archives and clears what is idle, the build loop commits every phase and closes out on landing, and nothing else in the suite regressed.
Work: wr-2026-10-02-janitor-cleanup

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/spec.md
- The territories' builder and review reports under C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/reports/ (janitor74-builder.md, loop74-builder.md, <id>-review-r<n>.md): read the relevant one only when triaging a specific failure.

PROJECT FACTS (at most 25 lines):
- Integration worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74, branch build/janitor-cleanup-74. Territory branches: build/janitor-cleanup-74-janitor74 (worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-janitor-cleanup-74-janitor74) and build/janitor-cleanup-74-loop74 (worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-janitor-cleanup-74-loop74). Base 6b302f9380b93bf8ef1414f41c460a2077930f70.
- SEAM ORDER, stated plainly: the seam review runs AFTER Integrate, on the merged head, as a separate reviewer's job. You merge the approved territories and run your gates whether or not a seam review follows. You never require seam sign-off before your merge, and you never refuse, wait or stop because a seam review is on.
- Windows has NO full suite. The full suite runs later on Netcup, then Hetzner, one suite at a time per host, by the lead; never run it here, never run `node scripts/run-tests.mjs` with no arguments, never a bare `node --test` with no file list.
- Gate files: the fixed focused set scripts/janitor.test.mjs scripts/install-janitor-timer.test.mjs scripts/work-record-closeout.test.mjs skills/team-build/references/build-loop-workflow.test.mjs skills/multi/scripts/note-send.test.mjs scripts/test-home.test.mjs, plus every test file the lane added or changed: list them with `git -C <integration worktree> diff --name-only 6b302f9380b93bf8ef1414f41c460a2077930f70 HEAD -- "*.test.mjs"`, deduplicate, and run `node --test` on exactly that list. If the diff touches hooks/hooks.json or hooks/codex-hooks.json, also include skills/multi/scripts/hooks.test.mjs scripts/wiring-check.test.mjs scripts/native-package.test.mjs scripts/codex-hook-trust.test.mjs hooks/codex-unsupported.test.mjs scripts/mirror-shared-skills.test.mjs. No wrapper script; quote the file list in your report.
- Tests use scratch git repos and sealed or injected test homes only; if a test in the gate touches the real home, ~/Code, a real worktree or a real origin, stop and report it (that is a failure of the lane, not a thing to work around).
- Merging a territory branch into build/janitor-cleanup-74 is a normal `git merge` (fast-forward or merge commit) once the orchestrator tells you the territory is reviewed (an APPROVE verdict exists for that exact sha); never on your own schedule. Commits: conventional, no Co-Authored-By, the configured identity untouched, no --no-verify. Never push; no recursive delete, no forced anything, no history-discarding commands.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- You do not write or edit any territory source file. You do not decide whether a failure blocks merge to main: that is the lead's ship decision, informed by your report.
- You do not touch docs/work/*.record.md; that is the orchestrator's alone.
- You do not run the Linux suites, a release, an install, a real timer registration, or a merge into main.

Evidence format: pass or fail per gate run, the exact command and its exit code, and on failure the failing test file names and the first error line for each, not the full stack trace unless asked. Report headSha as the full output of `git rev-parse HEAD` run in the integration worktree after the last merge.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/reports/integrator.md. Line 1 is the verdict, first word.

Gate: node --test <the file list built above> > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/reports/integrator-gate.log 2>&1. Read only the tail and the failing names on a green run.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/reports/integrator-state.md. Keep it current after every gate: one line per gate with the time, what was merged in at that point, and pass or fail.

A result of "still red, same tests as last run" is a good answer; say so plainly rather than re-diagnosing from scratch.

Autonomy: you may run the gate as many times as the orchestrator requests and re-run a single failing file in isolation to confirm a fix landed. You do not skip a failing test, weaken an assertion, or merge a territory that was not named to you as ready.

Un-agent-able steps: none expected.
ETA: 5 to 15 minutes per gate run. Report or park by then.

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
