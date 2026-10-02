Task: Adversarially review the delivered commit of territory states73 of lane 73 against the spec and the territory brief; verdict APPROVE or NEEDS_FIXES. Try to break it; do not confirm it. Done means a findings file whose first line is exactly `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`, where <sha> is the full 40-character output of `git rev-parse HEAD` that you ran yourself in the territory worktree named in your prompt (never a sha handed to you).
Goal: Agent work gets cheaper, faster and more reliable; this lane removes a stall: Ben and the lead cannot see where a long-running thing is without reading it. Measure: work lost or stalled.
Work: wr-2026-10-01-report-states (you never touch docs/work/)

Inputs (by path; your prompt adds the territory worktree and builder report):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/spec.md
- Scout addendum: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/briefs/scout-states73.md
- Territory brief (the scope you check against): C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/briefs/states73.md

PROJECT FACTS:
- Windows host. Node only; test command `node --test <files>`; NO full suite on Windows (the lead runs suites on Netcup and Hetzner later; never report a full suite as run). Never start a server or use a port; never run a production build. No live Notion writes; never read env, credentials or token files.
- Temp files only under the Scratch dir C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-73/ ; never delete a directory.
- Review read-only: you never modify, stage or commit the code under review, and never edit any file in the worktree.
- Checks you must make, by running them:
  (1) Report states: `scripts/report-check.mjs` accepts each of DONE, NEEDS BEN: x, NEEDS <peer>: x, FAILED: x, each ending `<n> of <m> steps done`; refuses PARTIAL, a missing "n of m steps done", a non-DONE report with no line 2, a line 2 missing any of Now / To finish / Est, an empty field, and a state word inside a fenced block (try lowercase, `Partial`, `NEEDS:` with no peer, `n of m` with m smaller than n, CRLF line endings, a leading blank line). Exit codes 0/1 and the message names what is missing.
  (2) Records: `accept` and `merge-check` refuse any Status word outside the allowed set and an open record with no Now / To finish / Est line; run `validateRecord`/`parseRecord` over EVERY docs/work/*.record.md at the territory head and show the finding counts equal the base sha's (7233aa7f7c287b7edc81989f5eaedbed80aef5b4) so no existing record newly fails; confirm no closed record file changed (`git diff --stat 7233aa7f7c287b7edc81989f5eaedbed80aef5b4 -- docs/work`).
  (3) Renderer: a waiting item and a session bullet with the three-field line render; one without it is refused naming file and line; the real docs/decisions/ sources at the territory head either render or the builder says why not; page-lint still passes on the rendered page.
  (4) Consumers: grep every reader of Status words (hooks/backlog-notice.js, scripts/work-census.mjs, scripts/collect-status.mjs, scripts/collect-from-origin.mjs, scripts/four-read.mjs) and decide whether a new word (open, NEEDS BEN, NEEDS <peer> with a space, FAILED) is mishandled, for instance a Status value with a space breaking the header regex or a NOTE_STATE_TOKENS lookup.
  (5) Rule stated once each in skills/team-build/SKILL.md and skills/delegate/SKILL.md, and the contract keeps `VERDICT:` for reviewer, integrator and seam reports; agents/*.md untouched.
  (6) No edit outside the territory file list in the territory brief; no docs/work, docs/decisions or docs/specs change; the scout's seven open questions each have a "Readings taken" answer that you judge against the spec.
- Run the territory gate yourself: the Gate command in the territory brief, but redirect to C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-73/review-gate.log and read only its tail and failing names.

NOT (out of scope, stated explicitly):
- Writing or fixing any code; deciding anything the spec leaves open (list it as an open question).
- Any push, release, install, merge or live Notion write.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Evidence format: cite file:line for every finding; each finding labelled BLOCKER, MAJOR or MINOR with the command or test that shows it; counts of blockers and majors in the schema fields. NEEDS_FIXES if any BLOCKER or MAJOR stands. Verdict word first.

Report: your findings file, C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73/docs/specs/report-states-73/reports/states73-review-r<round>.md (round from your prompt; the file you return as findingsPath). Line 1 is the verdict line above.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you may run any read-only command and any test; you may not change the code. Check in (BLOCKED) before anything outside the worktree and scratch.

Un-agent-able steps: the full suite and the live publish (the lead's). Scoped out of "done".
ETA: 30 to 50 minutes; report or park by 60.

Wall-clock limit 60 minutes from your start; at 60 minutes stop, write your report with VERDICT: BLOCKED and the reason timeout, and return (return verdict BLOCKED with timeout in the note field; this overrides the APPROVE/NEEDS_FIXES first-line rule).

JUDGMENT: whether the new report and record states are enforced by the scripts without breaking any existing record, report reader or the decisions page

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Never send peer notes.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
