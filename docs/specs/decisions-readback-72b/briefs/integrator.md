Task: Merge the approved territory of lane 72b into the integration worktree and run the mechanical gates; report PASS, FAIL or BLOCKED. You fix nothing and decide nothing. The seam review runs AFTER Integrate, on the merged head, as a separate reviewer's job: you merge the approved territory and run your gates whether or not a seam review follows, you never require seam sign-off before your merge, and you never refuse, wait or stop because a seam review is on.
Goal: Agent work gets cheaper, faster and more reliable; this lane removes a stall: every live decisions publish ends in exit 5 and needs --adopt-live.
Work: wr-2026-10-01-decisions-readback (you never touch docs/work/)

Inputs (by path; your prompt adds base sha, approved territory with its sha, and the integration worktree):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/spec.md
- Territory brief: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/briefs/readback72b.md

PROJECT FACTS:
- Integration worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b, branch build/decisions-readback-72b. Territory worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-decisions-readback-72b-readback72b, branch build/decisions-readback-72b-readback72b (the only territory, id readback72b).
- Windows host; node only; NO full suite on Windows. The full-suite gate for this lane is focused tests for skills/decisions scripts and skills/notion-writing scripts only: run `node --test skills/decisions/scripts/*.test.mjs skills/notion-writing/scripts/*.test.mjs` in the integration worktree after the merge. The full suite runs later on Netcup and Hetzner, run by the lead; do not run it and do not report it as run.
- No live Notion writes (reading the local backup files under ~/.local/state/notion-backups/ is fine). Never start a server or use a port; never run a production build.
- Merge the approved territory branch at exactly the sha your prompt names (`git merge --no-ff <sha>`); include it only after its reviewer returned APPROVE for that exact sha. Report headSha as the full 40-character output of `git rev-parse HEAD` in the integration worktree after the merge and the gate. Commits: conventional, no Co-Authored-By, the configured git identity only (never set or switch one).
- The integration worktree holds uncommitted spec-pack files under docs/specs/decisions-readback-72b/ (briefs, reports) and other untracked docs; never stage, commit or delete them.
- Redirect the gate to a log in docs/specs/decisions-readback-72b/reports/ of the integration worktree: `node --test <files> > <dir>/integrate-gate.log 2>&1`; read only the tail and the failing names. No wrapper script.
- Temp files only under the Scratch dir C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-72b/ ; never delete a directory.

NOT (out of scope, stated explicitly):
- Fixing a failing test, editing any file other than the merge itself, resolving a merge conflict by choosing a side (report BLOCKED naming the conflicting paths), any push, any reset --hard, clean, stash, force flag.
- The seam review, the live publish and --adopt-live, accept, and docs/work/: none are yours. No live Notion write.
- Waiting on, requiring or refusing because of the seam review (it follows your merge, never precedes it).
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Evidence format: for the gate, the exact command, its exit code, and the pass/fail counts from the tail; on FAIL name the failing test and the territory it belongs to (failedGate, territory fields). Verdict word first.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/reports/integrate.md. Line 1 is the verdict, first word.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you may run the merge and the gate above only. Check in (BLOCKED) before anything else.

Un-agent-able steps: the full suite on Netcup and Hetzner and the live publish (the lead's), scoped out of "done".
ETA: 10 to 20 minutes; report or park by 30.

Wall-clock limit 30 minutes from your start; at 30 minutes stop, write your report with VERDICT: BLOCKED and the reason timeout, and return (return verdict BLOCKED with timeout in the note field).

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Never send peer notes.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
