Task: Seam review of lane 68 on the MERGED head of the integration worktree. Two territories (hooks68, census68) were reviewed one by one; you review what only shows up when they sit together. Decide APPROVE or NEEDS_FIXES for the exact commit in the integration worktree.
Goal: Agent work gets cheaper, faster and more reliable at equal or better quality. Lane 68 moves "work lost or stalled" and "denials per build".
Work: wr-2026-10-01-reliability

JUDGMENT: a verdict that the merged lane 68 head is coherent across territories, breaks no existing pin, and does what the spec's five measured claims say.

Order: this review runs AFTER Integrate, on the merged head, as a separate reviewer's job. The integrator merged the approved territories and ran its gates without waiting for you.

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/spec.md
- Integration worktree (read and run only): C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68, branch build/reliability-68. Review `git diff 0f910a7a142f8bc346619136587d27dea87088d6..HEAD` there.
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/reports/integrator.md and reports/hooks68.md, reports/census68.md, reports/review-hooks68-r*.md, reports/review-census68-r*.md, and briefs/scout-hooks68.md, briefs/scout-census68.md (same directory)

PROJECT FACTS:
- Node project; tests are `node --test <file>`. Windows host: NO full suite. You may run single test files named in the two territories' Gate lines to check a finding, output redirected to the scratch folder, tail only.
- Temp files only under C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-68/ . Never write a temp file into a repo.
- You never modify, stage or commit the code under review. Your only write is your findings file.
- Never read ~/.agents/notes/inboxes.json or any secret, env or credentials file. Never read the real secret-guard denials log beyond fields 1 to 4 of a few lines.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

What to check, across the seam:
1. The shared sentence. "If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block." must be byte-identical in all places hooks68 added (agents/*.md, codex/agents/*.toml, the two SKILL.md files, docs/mandate-template.md) and in the six mandate constants census68 added in skills/team-build/references/build-loop-workflow.js. Compare with a script or grep -c; cite counts.
2. Mandate constants versus the agents test: the new sentence in the workflow constants must not break the "Never send peer notes." test or any length cap; the agents safety block is still byte-identical across the four agents.
3. Item 6: only the state WRITE moved to haiku; PINNED_PAIRS and the assertions agree with the source; no other agent( call changed model.
4. Number 4 compatibility: scripts/work-record.mjs still parses the leading integer of the new value; docs/census.md matches what four-read now prints for pane silent, waiting on a peer, and the Guard denials row (read both, run the four-read tests if in doubt).
5. Stale and registration: the one-liner prints only on SessionStart `--hook`; the guard's deny text and the CLI paths are unchanged; registration refuses a non-checkout cwd in both hooks and note-send; no territory re-implemented the other's helper.
6. The spec's "Not in scope" list and "no new bypass flag" hold across the whole diff; no plugin.json or version change; no dotfiles or ~/.claude path in the diff.
7. Every test file added or changed by either territory is in the integrator's gate list; none is missing.
Severity: BLOCKER, MAJOR, MINOR. Only BLOCKER and MAJOR make NEEDS_FIXES; count them in the verdict line.

NOT (out of scope, stated explicitly):
- Re-reviewing each territory line by line (done). Editing, staging or committing. Running a full suite. Re-deciding the spec.

Evidence format: file:line for every finding, exact text found and what it should be; measured counts for the sentence comparison. Verdict first.

Report: write your findings to C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/reports/seam-r<round>.md (for example reports/seam-r1.md) and return that path as findingsPath. Line 1 is exactly `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`, where <sha> is the full 40-character output of `git rev-parse HEAD` that you ran yourself in the integration worktree and also return as your sha field. Never take a sha from the prompt or the integrator report.

A result of zero findings, "not found" or "could not determine" is a good answer. Say what you checked. Do not invent findings.

Autonomy: read-only commands and the permitted test files. Anything that needs a write outside your findings file or the scratch folder: stop and report.

Un-agent-able steps: no live session; the Linux suites on Netcup and Hetzner are the lead's, at accept.
ETA: 30 minutes; report by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
