Task: Integrate lane 68. In the integration worktree, merge the territory branches your prompt lists as approved (build/reliability-68-hooks68 and build/reliability-68-census68, each at the exact sha your prompt gives), run the integration gate, and report. You fix nothing and decide nothing.
Goal: Agent work gets cheaper, faster and more reliable at equal or better quality. Lane 68 moves "work lost or stalled" and "denials per build".
Work: wr-2026-10-01-reliability

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/spec.md
- The territory reports: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/reports/hooks68.md and reports/census68.md; the reviewers' findings reports/review-hooks68-r*.md and reports/review-census68-r*.md in the same directory.
- Integration worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68, branch build/reliability-68. Base sha for both territories: 0f910a7a142f8bc346619136587d27dea87088d6.

PROJECT FACTS:
- Node project; tests are `node --test <file>`. The full-suite gate on this Windows host: Windows has NO full suite. Run `node --test` on the test files the two territories added or changed, and only those. Get the list with `git -C C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68 diff --name-only 0f910a7a142f8bc346619136587d27dea87088d6..HEAD` after the merges, keeping the names that end in `.test.mjs` (a territory's gate line in its brief and report also names the files it ran). The full suite runs later on Linux hosts (Netcup and Hetzner), never by you.
- Commits: merge commits only, conventional message such as `merge: build/reliability-68-hooks68 (lane 68, hooks68)`; no Co-Authored-By line, no AI byline, your configured git identity only. Never push.
- The integration worktree also holds the lead's uncommitted files under docs/specs/reliability-68/ (briefs and reports). Do not stage, commit, move or delete any of them; merge with `git merge --no-ff <branch>` only, never `git add -A` or `git commit -a`.
- Temp files only under C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-68/ . Never write temp files into a repo; never delete them.
- Do not run `git stash`, `git reset --hard`, `git clean`, checkout/restore of paths, `rm -rf`, force push, or any directory delete.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Procedure:
1. In the integration worktree run `git rev-parse HEAD` and `git status --short`; record both. Include a territory only if your prompt lists it as approved at an exact sha; for each, confirm with `git rev-parse <branch>` that the branch tip equals that sha, else stop and report BLOCKED for that territory.
2. Merge each approved territory with `git merge --no-ff <branch>`. The two territories own disjoint files, so a conflict is a finding: on any conflict run `git merge --abort`, report BLOCKED with the conflicting paths, and stop. Do not resolve a conflict.
3. Run the gate: `node --test <the .test.mjs files from the diff list>` > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/reports/integrator-gate.log 2>&1. Read only the tail and the failing names. A failing test is reported, not fixed; say which territory's file it sits in and whether it also fails on the base sha when you run just that file against a base checkout of the files in the scratch folder.
4. Seam review order. A seam review of the merged head, when the loop runs one, comes AFTER you, as a separate reviewer's job on your merged head. You merge the approved territories and run your gates whether or not a seam review follows; you never require seam sign-off before your merge, and you never refuse, wait or stop because a seam review is on.
5. Report `git rev-parse HEAD` of the integration worktree after the merges (run it yourself; never type a sha) as headSha.

NOT (out of scope, stated explicitly):
- Fixing, editing or reverting any code; resolving a conflict; editing the work record or any file under docs/work/; running a full suite; pushing; releasing; changing .claude-plugin/plugin.json; touching ~/.claude, ~/.agents, chezmoi or dotfiles paths; other worktrees.

Evidence format: for each merge the branch, the sha merged and the resulting merge commit sha; the exact gate command; pass and fail counts from the log tail; failing test names with their file. Verdict first.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/reports/integrator.md. Line 1 is `VERDICT: PASS`, `VERDICT: FAIL` or `VERDICT: BLOCKED`, first word. Return the report path, headSha, failedGate (empty when none) and the territory a failure belongs to.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you may run the merges and the gate above. Anything else that changes the tree: stop and report.

Un-agent-able steps: the Linux suites on Netcup and Hetzner are the lead's, at accept.
ETA: 20 minutes; report by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
