Task: Merge the approved territory of lane 73 into the integration worktree and run the mechanical gates; report PASS, FAIL or BLOCKED. You fix nothing and decide nothing. The seam review runs AFTER Integrate, on the merged head, as a separate reviewer's job: you merge the approved territory and run your gates whether or not a seam review follows, you never require seam sign-off before your merge, and you never refuse, wait or stop because a seam review is on.
Goal: Agent work gets cheaper, faster and more reliable; this lane removes a stall: Ben and the lead cannot see where a long-running thing is without reading it. Measure: work lost or stalled.
Work: wr-2026-10-01-report-states (you never touch docs/work/)

Inputs (by path; your prompt adds base sha, approved territory with its sha, and the integration worktree):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/spec.md
- Territory brief: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/briefs/states73.md

PROJECT FACTS:
- Integration worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73, branch build/report-states-73. Territory worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-report-states-73-states73, branch build/report-states-73-states73 (the only territory, id states73). Base sha 7233aa7f7c287b7edc81989f5eaedbed80aef5b4.
- Windows host; node only; NO full suite on Windows. The full-suite gate for this lane is focused tests only: the report check script (scripts/report-check.test.mjs), the work-record scripts (scripts/work-record*.test.mjs, scripts/record-closed-and-skip.contract.test.mjs, scripts/work-census.test.mjs, hooks/backlog-notice.test.mjs), the decisions renderer (skills/decisions/scripts/*.test.mjs) and the notion-writing scripts (skills/notion-writing/scripts/*.test.mjs), plus agents/agents.test.mjs. Run `node --test scripts/report-check.test.mjs scripts/work-record*.test.mjs scripts/record-closed-and-skip.contract.test.mjs scripts/work-census.test.mjs hooks/backlog-notice.test.mjs agents/agents.test.mjs skills/decisions/scripts/*.test.mjs skills/notion-writing/scripts/*.test.mjs` in the integration worktree after the merge. The full suite runs later on Netcup and Hetzner, run by the lead; do not run it and do not report it as run.
- No live Notion writes (no notion.js command). Never start a server or use a port; never run a production build.
- Existing open records on main must still parse: after the merge, also run `node -e` (or a one-line script in the Scratch dir) that calls parseRecord and validateRecord from scripts/work-record.mjs over every docs/work/*.record.md of the merged tree and report the finding-level counts next to the same counts at the base sha; a record that newly fails is a FAIL naming the file. Closed records must be byte-identical to base (`git diff --stat 7233aa7f7c287b7edc81989f5eaedbed80aef5b4 -- docs/work` shows no closed record).
- Merge the approved territory branch at exactly the sha your prompt names (`git merge --no-ff <sha>`); include it only after its reviewer returned APPROVE for that exact sha. Report headSha as the full 40-character output of `git rev-parse HEAD` in the integration worktree after the merge and the gate. Commits: conventional, no Co-Authored-By, the configured git identity only (never set or switch one).
- The integration worktree holds uncommitted spec-pack files under docs/specs/report-states-73/ (briefs, reports) and other untracked docs; never stage, commit or delete them.
- Redirect the gate to a log in docs/specs/report-states-73/reports/ of the integration worktree: `... > <dir>/integrate-gate.log 2>&1`; read only the tail and the failing names. No wrapper script.
- Temp files only under the Scratch dir C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-73/ ; never delete a directory.

NOT (out of scope, stated explicitly):
- Fixing a failing test, editing any file other than the merge itself, resolving a merge conflict by choosing a side (report BLOCKED naming the conflicting paths), any push, any reset --hard, clean, stash, force flag.
- The seam review, the live publish, accept, and docs/work/: none are yours. No live Notion write.
- Waiting on, requiring or refusing because of the seam review (it follows your merge, never precedes it).
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Evidence format: for the gate, the exact command, its exit code, and the pass/fail counts from the tail; for the record check, the two counts; on FAIL name the failing test and the territory it belongs to (failedGate, territory fields). Verdict word first.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/reports/integrate.md. Line 1 is the verdict, first word.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you may run the merge, the gate and the record check above only. Check in (BLOCKED) before anything else.

Un-agent-able steps: the full suite on Netcup and Hetzner and the live publish (the lead's), scoped out of "done".
ETA: 10 to 20 minutes; report or park by 30.

Wall-clock limit 30 minutes from your start; at 30 minutes stop, write your report with VERDICT: BLOCKED and the reason timeout, and return (return verdict BLOCKED with timeout in the note field).

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Never send peer notes.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
