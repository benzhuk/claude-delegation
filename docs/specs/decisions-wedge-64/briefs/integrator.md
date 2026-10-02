Task: Integrate territory wedge64 (the only territory in this build) into `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64` on branch `build/decisions-wedge-64`, run the Windows focused gate once, and report pass/fail with the failing test names. You decide nothing, you report. Spawn only after wedge64's own gate is green and the reviewer's verdict is APPROVE (C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/reviewer-report.md).
Goal: the test files this lane added or changed are green on `build/decisions-wedge-64`, so the lead can push, run the Netcup and Hetzner full suites, and run step 5 (the live close and publish).
Work: wr-2026-10-01-decisions-wedge (docs/work/wr-2026-10-01-decisions-wedge.record.md; read-only for you; only the lead writes it).

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/spec.md
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/wedge64-report.md and wedge64-gate.log
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/reviewer-report.md

PROJECT FACTS: integration worktree `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64`, branch `build/decisions-wedge-64`, base 0d9cdeb539a6f23e7974cdea589fb0d3b127f2f9; its working tree already carries an uncommitted edit to docs/work/wr-2026-10-01-decisions-wedge.record.md (the lead's): do not stage, commit, stash or revert it. Merge branch `build/decisions-wedge-64-wedge64` into the integration branch with a merge commit before the gate. Gate (Windows has NO full suite): run `node --test` only on the test files this lane added or changed, found with `git diff --name-only 0d9cdeb539a6f23e7974cdea589fb0d3b127f2f9..HEAD -- "*.test.mjs"` after the merge. The full suite runs later on Linux hosts, by the lead. Do NOT run step 5 (live close and publish on the real page); the lead does that after accept-prep. Pure Node, no build step. Never set a git identity, no trailers, never push, never send peer notes. If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- Do not decide ship or accept; report pass/fail plus the failing-test list only.
- Do not touch `docs/work/`; do not run the live step, the Netcup or Hetzner suites, or any `notion.js` call.
- Do not fix a failing test; triage it to the file it covers and report.
- No full-repo run (`scripts/run-tests.mjs` with no file list is the Linux hosts' job).

Evidence format: `VERDICT: PASS` or `VERDICT: FAIL` as the literal first line. On FAIL list every failing test name exactly as `node --test` printed it, plus the one file:line in the log tail naming the failure. On PASS name the files run, the total test count, and the merge commit sha.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/integrator-report.md. Line 1 is the verdict, first word.

Gate: node --test <the added or changed test files from the diff command above> > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/integrator-gate.log 2>&1. Read only the tail and the failing names. No wrapper script.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64/docs/specs/decisions-wedge-64/reports/integrator-state.md. Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you may perform the merge and resolve a purely mechanical, non-conflicting one yourself. Any real conflict stops you: report it, do not pick a side.

Un-agent-able steps: step 5 live close and publish, the Netcup and Hetzner suites, the push, and accept are the lead's, scoped out of your "done".

ETA: 15-20 minutes. Report or park by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
