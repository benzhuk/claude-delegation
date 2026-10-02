Task: Review one territory of lane 68 (hooks68 or census68; the prompt that handed you this brief names which, the round, the territory brief and the builder report) against its territory brief and the spec. Decide APPROVE or NEEDS_FIXES for the exact commit in the worktree.
Goal: Agent work gets cheaper, faster and more reliable at equal or better quality. Lane 68 moves "work lost or stalled" and "denials per build"; a change that worsens another measure, or adds a mechanism nothing measures, is a finding.
Work: wr-2026-10-01-reliability

JUDGMENT: a verdict that this territory meets its pinned contracts, breaks no existing test, and adds no behaviour the spec does not ask for.

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/spec.md
- The territory brief and the builder report named in your prompt (briefs/hooks68.md or briefs/census68.md; reports/hooks68.md or reports/census68.md, all under C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/)
- The scout file for the territory (briefs/scout-hooks68.md or briefs/scout-census68.md, same directory). It lists the tests that police the area.
- The worktree named in your prompt: read and run only; base sha 0f910a7a142f8bc346619136587d27dea87088d6. Review the diff `git diff 0f910a7a142f8bc346619136587d27dea87088d6..HEAD` there (for round 2 and later, also the commit range your prompt gives).

PROJECT FACTS:
- Node project; tests are `node --test <file>`. Windows host: NO full suite. You may run only the test files the territory's Gate line names, and any single test file you need to check a finding. Redirect output to a file under the scratch folder below and read the tail.
- Temp files only under C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-68/ . Never write a temp file into a repo.
- You never modify, stage or commit the code under review. Your only writes are your findings file.
- Never read ~/.agents/notes/inboxes.json or any secret, env or credentials file. Never read the real secret-guard denials log beyond fields 1 to 4 of a few lines.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.
- Territory ownership: hooks68 owns hooks/, skills/multi/, agents/, codex/, skills/*/SKILL.md, docs/mandate-template.md, scripts/wiring-check.mjs, scripts/plugin-staleness.mjs. census68 owns scripts/four-read.mjs, scripts/guard-denials.mjs, docs/census.md, skills/team-build/references/. A diff that edits a file outside its territory is a finding.

What to check, in order:
1. Contract by contract (the A, B, C, D lists in the territory brief): does the diff meet each, with file:line evidence? A contract met in a test but not in the shipped code path is a BLOCKER.
2. Discriminating tests: each new test must fail on the base sha for the right reason and pass on the head. Prove it for at least the three riskiest by reasoning from the diff or by running the test file against a base-sha checkout of the single source file into the scratch folder (never into the repo).
3. Existing pins: hooks68: the "stale session:" assertions for the CLI, `--json` and guard paths unchanged; the agents safety block byte-identical; the 700 ms PostToolUse path spawns no git. census68: the leading integer of Number 4 unchanged; strings pinned by existing four-read tests unchanged; the guard-denials reader never returns or prints field 5 (command text); a missing log reads unavailable, never 0; no new bypass flag, switch or env var.
4. Scope: nothing outside the territory, no plugin.json change, no dotfiles or ~/.claude edit, no secret read.
5. Honesty of the builder report: every claim of "already built" or "not buildable here" is checked against the tree.
Severity: BLOCKER (wrong or unsafe, or a contract unmet), MAJOR (should be fixed before merge), MINOR (note only). Only BLOCKER and MAJOR make NEEDS_FIXES; count them in the verdict line.

NOT (out of scope, stated explicitly):
- Editing, staging or committing anything in the worktree. Re-deciding the spec. Reviewing the other territory. The seam between territories (a separate reviewer does that after Integrate). Running a full suite.

Evidence format: file:line for every finding, with the exact text found and what it should be. Measured numbers for any test you ran. Verdict first.

Report: write your findings to C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/reports/review-<territory>-r<round>.md (for example reports/review-hooks68-r1.md), and return that path as findingsPath. Line 1 is exactly `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`, where <sha> is the full 40-character output of `git rev-parse HEAD` that you ran yourself in the worktree and also return as your sha field. Never take a sha from the prompt or the builder report.

A result of zero findings, "not found" or "could not determine" is a good answer. Say what you checked. Do not invent findings to look thorough.

Autonomy: you may run read-only commands and the permitted test files. Anything that needs a write outside your findings file or the scratch folder: stop and report.

Un-agent-able steps: no live Claude Code session, no Linux suite.
ETA: 30 minutes; report by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
