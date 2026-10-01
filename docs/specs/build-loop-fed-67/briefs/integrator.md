Task: Merge the approved territories of lane 67 into the integration worktree and run the mechanical gates; report PASS, FAIL or BLOCKED. You fix nothing and decide nothing. A seam review may follow after you finish: it is a separate reviewer's job and never a reason for you to refuse, wait or stop; run your gates and report as normal whether the seam review is on or off.
Goal: Feed the build loop: every Claude-led build record names a Workflow run and costs under 20 lead turns.
Work: wr-2026-10-01-build-loop-fed (you never touch docs/work/)

Inputs (by path; your prompt adds base sha, approved territories with shas, and the integration worktree):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/spec.md
- Lead addendum: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/addendum-lead.md
- Territory brief: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/briefs/loop67.md

PROJECT FACTS:
- Integration worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67, branch build/build-loop-fed-67. Territory worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-build-loop-fed-67-loop67, branch build/build-loop-fed-67-loop67 (the only territory, id loop67).
- Windows host: there is NO full suite on Windows. The full-suite gate for this lane is: run `node --test` on skills/team-build/references/build-loop-workflow.test.mjs, skills/team-build/references/accept-prep.test.mjs, scripts/work-record.test.mjs, scripts/work-census.test.mjs and any other test file the lane changed (list them with `git diff --name-only 677c4a90e81f14cabd805679dcc5431d9a2ca93d..HEAD -- '*.test.mjs'` in the integration worktree after the merge). The full suite runs later on Linux hosts, run by the lead; do not run it, and do not report it as run.
- Merge each approved territory branch at exactly the sha your prompt names (`git merge --no-ff <sha>`); include a territory only after its reviewer returned APPROVE for that exact sha. Report headSha as the full 40-character output of `git rev-parse HEAD` in the integration worktree after the merge and the gates. Commits: conventional, no Co-Authored-By, the configured git identity only (never set or switch one).
- The integration worktree holds uncommitted spec-pack files under docs/specs/build-loop-fed-67/ (briefs, reports); never stage, commit or delete them.
- Redirect each gate to a log in docs/specs/build-loop-fed-67/reports/ of the integration worktree: `node --test <files> > <dir>/integrate-gate.log 2>&1`; read only the tail and the failing names. No wrapper script.
- Temp files only under C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-67/ ; never delete a directory. Never start a server or use a port.

NOT (out of scope, stated explicitly):
- Fixing a failing test, editing any file other than the merge itself, resolving a merge conflict by choosing a side (report BLOCKED naming the conflicting paths), any push, any `reset --hard`, `clean`, `stash`, force flag.
- The seam review, accept-prep, the second-host suite, the census, and docs/work/: none are yours.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Evidence format: for each gate, the exact command, its exit code, and the pass/fail counts from the tail; on FAIL name the failing test and the territory it belongs to (failedGate, territory fields). Verdict word first.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/reports/integrate.md. Line 1 is the verdict, first word.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you may run the merge and the gates above only. Check in (BLOCKED) before anything else.

Un-agent-able steps: the full suite on Linux hosts and the ssh second-host run (the lead's), scoped out of "done".
ETA: 15 to 30 minutes; report or park by 30.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
