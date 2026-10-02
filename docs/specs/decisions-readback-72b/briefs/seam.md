Task: Review the joints of lane 72b at the integration worktree AFTER Integrate, on the merged head: there is one territory (readback72b), so the seam is the renderer/normaliser fix versus the publish pipeline versus the other decisions scripts and the page-shape docs. Verdict APPROVE or NEEDS_FIXES; first line of your report exactly `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`, where <sha> is the full 40-character output of `git rev-parse HEAD` you ran yourself in the integration worktree.
Goal: Agent work gets cheaper, faster and more reliable; this lane removes a stall: every live decisions publish ends in exit 5 and needs --adopt-live. Measure: work lost or stalled.
Work: wr-2026-10-01-decisions-readback (you never touch docs/work/)

Inputs (by path; your prompt adds the integration worktree, round and approved territory):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/spec.md
- Territory brief: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/briefs/readback72b.md
- Integrator report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/reports/integrate.md
- Territory review (do not redo it): the readback72b findings file under C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/reports/

PROJECT FACTS:
- Windows host; node only; `node --test <files>`; NO full suite on Windows (the lead runs suites on Netcup and Hetzner later). Never start a server or use a port; never run a production build. No live Notion writes (reading the local backups under ~/.local/state/notion-backups/ is fine).
- Read-only: never modify, stage or commit the code under review. Temp files only under C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-72b/ ; never delete a directory.
- The seam review runs after Integrate, on the merged head. Integration worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b, branch build/decisions-readback-72b.
- Joints to check, by running them: (1) render the merged tree offline (`node skills/decisions/scripts/decisions-render.mjs render --repo C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b`) and show normalize() of it equals the latest backup .after.md on the Goal card, Bearings and Components toggles (the lines before Waiting on you now), so the readback no longer differs there; (2) every other consumer of the changed symbol or URL (grep GOALS_PAGE_URL and any notion.so or app.notion.com string) is consistent: decisions-read.mjs, decisions-pickup.mjs, decisions-handback.mjs, goals-mirror.mjs, skills/decisions/references/page-shape.md, skills/decisions/SKILL.md, and the fixtures; (3) docs/decisions/last-render.md (the adopted live page) is consistent with what the merged renderer produces for the toggles, so the lead's next publish needs no --adopt-live; (4) the exit-4 drift check (publish step 2) and the F4 backup check still use normalize with unchanged meaning, and a changed content line still reaches exit 5; (5) the focused gate passes on the merged head: node --test skills/decisions/scripts/*.test.mjs skills/notion-writing/scripts/*.test.mjs > C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-72b/seam-gate.log 2>&1, tail and failing names only.

NOT (out of scope, stated explicitly):
- Writing or fixing code; re-reviewing inside the territory (the territory reviewer did that); deciding what the spec leaves open (list it as an open question).
- Any push, release, install, merge or live Notion write.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Evidence format: cite file:line for every finding, labelled BLOCKER, MAJOR or MINOR, with the command that shows it; counts of blockers and majors in the schema fields. NEEDS_FIXES if any BLOCKER or MAJOR stands. Verdict word first.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/reports/seam-r<round>.md (round from your prompt; the file you return as findingsPath). Line 1 is the verdict line above.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: any read-only command and any test; check in (BLOCKED) before anything outside the integration worktree and scratch.

Un-agent-able steps: the full suite and the live publish (the lead's), scoped out of "done".
ETA: 15 to 30 minutes; report or park by 40.

Wall-clock limit 40 minutes from your start; at 40 minutes stop, write your report with VERDICT: BLOCKED and the reason timeout, and return (return verdict BLOCKED with timeout in the note field; this overrides the APPROVE/NEEDS_FIXES first-line rule).

JUDGMENT: whether the fix holds together with the publish pipeline and the adopted page so the next live publish verifies

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Never send peer notes.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
