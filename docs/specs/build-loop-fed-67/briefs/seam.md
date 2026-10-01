Task: Review the cross-territory joints of lane 67 at the integration worktree after Integrate: the places where the pieces of one territory's change meet each other and the places that change meets the rest of the plugin. There is one territory (loop67), so the seam here is: script versus helper versus record parser versus docs. Verdict APPROVE or NEEDS_FIXES; first line of your report exactly `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`, where <sha> is the full 40-character output of `git rev-parse HEAD` you ran yourself in the integration worktree.
Goal: Feed the build loop: every Claude-led build record names a Workflow run and costs under 20 lead turns; a hung agent ends; a run survives its session.
Work: wr-2026-10-01-build-loop-fed (you never touch docs/work/)

Inputs (by path; your prompt adds the integration worktree, round and approved territories):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/spec.md
- Lead addendum (binding): C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/addendum-lead.md
- Territory brief: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/briefs/loop67.md
- Integrator report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/reports/integrate.md
- Territory review (do not redo it): the loop67 findings file under C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/reports/

PROJECT FACTS:
- Windows host; Node only; `node --test <files>`; NO full suite on Windows (the lead runs it later on Linux). Never start a server or use a port; never run a production build.
- Read-only: never modify, stage or commit the code under review. Temp files only under C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-67/ ; never delete a directory.
- Joints to check, by running them: (1) the script's accept-prep prompt, accept-prep.mjs's flags and its record edit, and work-record.mjs check-acceptance agree end to end: build a throwaway record in scratch per SKILL.md's documented opening fields, run accept-prep.mjs's edit step against it, then check-acceptance (live, pinned to a scratch git repo) and show it passes with `Workflow:` present and fails closed without it; (2) SKILL.md's documented fields (Artifact:, Evidence:, Scratch:, Workflow:, Measure:) equal what the parser accepts and what accept-prep inserts; (3) the state file the script's prompts write is the file its read prompt reads (same computed path, same fields, version) and `listRecords` ignores it; (4) every new blocker string the script returns (agent-timeout, accept-prep-failed, windows-host) appears in SKILL.md's blockers list and in a test; (5) meta.phases order equals the phase() call order, including the new Second host phase; (6) work-census prints the Workflow value for an old and a new record; (7) the pinned census paragraph in SKILL.md is unchanged; (8) example args JSON files parse and launch under the existing example test.
- Run the integration gate's test files yourself, tail and failing names only: node --test skills/team-build/references/build-loop-workflow.test.mjs skills/team-build/references/accept-prep.test.mjs scripts/work-record.test.mjs scripts/work-census.test.mjs > <scratch>/seam-gate.log 2>&1.

NOT (out of scope, stated explicitly):
- Writing or fixing code; re-reviewing inside a territory (the territory reviewer did that); deciding what the spec leaves open (list it as an open question).
- Any push, release, install or merge.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Evidence format: cite file:line for every finding, labelled BLOCKER, MAJOR or MINOR, with the command that shows it; counts of blockers and majors in the schema fields. NEEDS_FIXES if any BLOCKER or MAJOR stands. Verdict word first.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-67/docs/specs/build-loop-fed-67/reports/seam-r<round>.md (round from your prompt; the file you return as findingsPath). Line 1 is the verdict line above.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: any read-only command and any test; check in (BLOCKED) before anything outside the integration worktree and scratch.

Un-agent-able steps: the full suite and the real second-host ssh run (the lead's, on Linux hosts), scoped out of "done".
ETA: 30 to 50 minutes; report or park by 50.

JUDGMENT: whether the joints between the script, accept-prep, the record parser and the docs of lane 67 hold together end to end

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
