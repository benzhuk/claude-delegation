Task: Integrate territory rebind64b (the only territory in this build) into `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b` on branch `build/pickup-rebind-64b`, run the Windows focused gate once, and report pass/fail with the failing test names. You decide nothing, you report. Spawn only after rebind64b's own gate is green and the reviewer's verdict is APPROVE (C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/reviewer-report.md).
Goal: the decisions test files are green on `build/pickup-rebind-64b`, so the lead can push, run the Netcup and Hetzner full suites, and run the live rebind and publish.
Work: wr-2026-10-01-pickup-rebind (docs/work/wr-2026-10-01-pickup-rebind.record.md; read-only for you; only the lead writes it).

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/spec.md
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/rebind64b-report.md and rebind64b-gate.log
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/reviewer-report.md

PROJECT FACTS: integration worktree `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b`, branch `build/pickup-rebind-64b`, base b52e3faeb197dcb32f2fdfaf5931dc13a2f1b516 (the branch tip may sit a docs commit or two above it). Its working tree carries the untracked spec-pack briefs and reports under docs/specs/pickup-rebind-64b/ and may carry an uncommitted edit to docs/work/wr-2026-10-01-pickup-rebind.record.md (the lead's): do not stage, commit, stash or revert any of it. Merge branch `build/pickup-rebind-64b-rebind64b` into the integration branch with a merge commit before the gate. Gate (Windows has NO full suite): run `node --test` on the decisions test files only, `skills/decisions/scripts/*.test.mjs`, in Git Bash so the shell expands the glob. The full suite runs later on Linux hosts, by the lead. Do NOT run `rebind`, `publish`, `account` or `--once` against the real page or the real ~/.agents state; the live run is the lead's. Pure Node, no build step. Never set a git identity, no trailers, never push, never send peer notes. If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- Do not decide ship or accept; report pass/fail plus the failing-test list only.
- Do not touch `docs/work/`; do not run the live step, the Netcup or Hetzner suites, or any `notion.js` call.
- Do not fix a failing test; triage it to the file it covers and report.
- No full-repo run (`scripts/run-tests.mjs` with no file list is the Linux hosts' job).

Evidence format: `VERDICT: PASS` or `VERDICT: FAIL` as the literal first line. On FAIL list every failing test name exactly as `node --test` printed it, plus the one file:line in the log tail naming the failure; for each, say whether it also fails at base b52e3faeb197dcb32f2fdfaf5931dc13a2f1b516 (a Windows-only pre-existing failure) by running that one test file there with `scripts/prefix-test.mjs` or in a throwaway read-only check-out you do not modify. On PASS name the files run, the total test count, and the merge commit sha.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/integrator-report.md. Line 1 is the verdict, first word.

Gate: node --test skills/decisions/scripts/*.test.mjs > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/integrator-gate.log 2>&1. Read only the tail and the failing names. No wrapper script.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/integrator-state.md. Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you may perform the merge and resolve a purely mechanical, non-conflicting one yourself. Any real conflict stops you: report it, do not pick a side.

Un-agent-able steps: the live rebind and publish on page 3e1da11277a18174bccfea187d5c3972, the registrations.json repoint, the Netcup and Hetzner suites, the push, and accept are the lead's, scoped out of your "done".

ETA: 15-20 minutes. Report or park by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
