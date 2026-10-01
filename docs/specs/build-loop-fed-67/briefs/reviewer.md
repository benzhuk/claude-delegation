Task: Adversarially review the delivered commit of one territory of lane 67 against the spec and the territory brief; verdict APPROVE or NEEDS_FIXES. Try to break it; do not confirm it. Done means a findings file whose first line is exactly `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`, where <sha> is the full 40-character output of `git rev-parse HEAD` that you ran yourself in the territory worktree named in your prompt (never a sha handed to you).
Goal: Feed the build loop: every Claude-led build record names a Workflow run and costs under 20 lead turns; a hung agent ends; a run survives its session.
Work: wr-2026-10-01-build-loop-fed (you never touch docs/work/)

Inputs (by path; your prompt adds the territory brief, worktree and builder report):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/spec.md
- Lead addendum (binding): C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/addendum-lead.md
- Scout addendum: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/briefs/scout-loop67.md
- Territory brief (the scope you check against): C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/briefs/loop67.md

PROJECT FACTS:
- Windows host. Node only. Run tests with `node --test <files>`; there is NO full suite on Windows (the lead runs it later on Linux hosts). Never start a server or any process on a port. Never run a production build.
- Review read-only: you never modify, stage or commit the code under review, and never edit any file in the worktree. Temp files only under C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-67/ ; never delete a directory.
- Checks you must make, by running them: (1) each of scope items 1 to 6 and addendum items d to h in the territory brief is present in the diff `677c4a90e81f14cabd805679dcc5431d9a2ca93d..HEAD` and has a test that FAILS on the base tree (prove it: run the new test file's new tests against the base versions of the non-test files, in scratch, never in the worktree); (2) the pinned script tests still hold: the build-loop-workflow.js banned tokens (L-C4.3), the flat `const X = {...}` opts shape with the four pinned agentType/model pairs (L-C4.4), `args ?? {}` first (L-C4.5), meta phases equal the phase() calls, every `*_MANDATE` ends with `Never send peer notes.`; (3) `Workflow:`/`Measure:` round-trip through parseRecord and requireStrictRecordShape with no `unknown label`; (4) accept-prep still preserves unowned bytes (CRLF, no trailing newline) when it inserts Artifact:/Evidence:; (5) the state file: a relaunch with identical args skips done territories, an args startFrom overrides it, a state with another baseSha is ignored, and no recordPath means the old behaviour; (6) the timeout is honest: it is a prompt-level limit, the code and report say so, and a timeout BLOCKED excludes only that territory; (7) the second-host phase never runs for a Windows host and the arg is optional; (8) no edit outside the territory file list in the territory brief.
- Run the territory gate yourself: node --test skills/team-build/references/build-loop-workflow.test.mjs skills/team-build/references/accept-prep.test.mjs scripts/work-record.test.mjs scripts/work-census.test.mjs > <scratch>/review-gate.log 2>&1 and read only its tail and failing names.

NOT (out of scope, stated explicitly):
- Writing or fixing any code; deciding anything the spec leaves open (list it as an open question).
- Any push, release, install or merge.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Evidence format: cite file:line for every finding; each finding labelled BLOCKER, MAJOR or MINOR with the command or test that shows it; counts of blockers and majors in the schema fields. NEEDS_FIXES if any BLOCKER or MAJOR stands. Verdict word first.

Report: your findings file, C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/reports/loop67-review-r<round>.md (round from your prompt; the file you return as findingsPath). Line 1 is the verdict line above.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you may run any read-only command and any test; you may not change the code. Check in (BLOCKED) before anything outside the worktree and scratch.

Un-agent-able steps: the full suite and the real second-host ssh run (the lead runs them on Linux hosts); you only review the script's side with the stubs.
ETA: 40 to 70 minutes; report or park by 70.

JUDGMENT: whether delivery of lane 67 is correct, complete against the spec and addendum, and honest about what it cannot prove

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
