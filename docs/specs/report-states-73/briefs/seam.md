Task: Review the joints of lane 73 at the integration worktree AFTER Integrate, on the merged head: there is one territory (states73), so the seam is the report check script and contract versus the record scripts versus the decisions renderer versus every existing reader of reports and Status words. Verdict APPROVE or NEEDS_FIXES; first line of your report exactly `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`, where <sha> is the full 40-character output of `git rev-parse HEAD` you ran yourself in the integration worktree.
Goal: Agent work gets cheaper, faster and more reliable; this lane removes a stall: Ben and the lead cannot see where a long-running thing is without reading it. Measure: work lost or stalled.
Work: wr-2026-10-01-report-states (you never touch docs/work/)

Inputs (by path; your prompt adds the integration worktree, round and approved territory):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/spec.md
- Territory brief: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/briefs/states73.md
- Integrator report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/reports/integrate.md
- Territory review (do not redo it): the states73 findings file under C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/reports/

PROJECT FACTS:
- Windows host; node only; `node --test <files>`; NO full suite on Windows (the lead runs suites on Netcup and Hetzner later). Never start a server or use a port; never run a production build. No live Notion writes.
- Read-only: never modify, stage or commit the code under review. Temp files only under C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-73/ ; never delete a directory.
- The seam review runs after Integrate, on the merged head. Integration worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73, branch build/report-states-73.
- Joints to check, by running them: (1) every writer of a report still passes the report check it is subject to: the contract, skills/team-build/SKILL.md, skills/delegate/SKILL.md, docs/mandate-template.md and the build-loop worker prompts agree on which reports use the new first line (progress reports) and which keep `VERDICT:` (reviewer, integrator, seam, builder), and no text tells one agent to write both; (2) work-record.mjs: accept, merge-check, close, withdraw, validateRecord and parseRecord agree on the set of Status words, and the lead's own record at the merged head (docs/work/wr-2026-10-01-report-states.record.md, Status owned) is still processable by them; run all of docs/work/*.record.md through parseRecord/validateRecord and compare finding counts with base 7233aa7f7c287b7edc81989f5eaedbed80aef5b4; (3) every consumer of Status words (hooks/backlog-notice.js, scripts/work-census.mjs, scripts/collect-status.mjs, scripts/collect-from-origin.mjs, scripts/four-read.mjs, scripts/build-census.mjs) copes with `open`, `NEEDS BEN`, `NEEDS <peer>` (contains spaces) and `FAILED`; (4) the decisions renderer against the real docs/decisions/ sources of the merged tree (`node skills/decisions/scripts/decisions-render.mjs render --repo C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73`): either it renders or the refusal names the exact source file and line the lead must add the Now / To finish / Est line to; page-lint and the decisions-read self-check still pass; (5) lane 72/72b output unchanged otherwise: a render of the base tree and the merged tree with the three-field lines stripped are identical; (6) docs/work-record.md, docs/subagent-contract.md and the SKILL.md texts describe the same words and line shapes as the code; (7) the focused gate passes on the merged head: the Gate command in the territory brief, redirected to C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-73/seam-gate.log, tail and failing names only.

NOT (out of scope, stated explicitly):
- Writing or fixing code; re-reviewing inside the territory (the territory reviewer did that); deciding what the spec leaves open (list it as an open question).
- Any push, release, install, merge or live Notion write.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Evidence format: cite file:line for every finding, labelled BLOCKER, MAJOR or MINOR, with the command that shows it; counts of blockers and majors in the schema fields. NEEDS_FIXES if any BLOCKER or MAJOR stands. Verdict word first.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/reports/seam-r<round>.md (round from your prompt; the file you return as findingsPath). Line 1 is the verdict line above.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: any read-only command and any test; check in (BLOCKED) before anything outside the integration worktree and scratch.

Un-agent-able steps: the full suite and the live publish (the lead's), scoped out of "done".
ETA: 20 to 35 minutes; report or park by 45.

Wall-clock limit 45 minutes from your start; at 45 minutes stop, write your report with VERDICT: BLOCKED and the reason timeout, and return (return verdict BLOCKED with timeout in the note field; this overrides the APPROVE/NEEDS_FIXES first-line rule).

JUDGMENT: whether the report states, record Status words and the renderer line hold together and leave every existing record and reader working

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Never send peer notes.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
