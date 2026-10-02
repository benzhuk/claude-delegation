Task: Adversarially review the delivered commit of territory readback72b of lane 72b against the spec and the territory brief; verdict APPROVE or NEEDS_FIXES. Try to break it; do not confirm it. Done means a findings file whose first line is exactly `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`, where <sha> is the full 40-character output of `git rev-parse HEAD` that you ran yourself in the territory worktree named in your prompt (never a sha handed to you).
Goal: Agent work gets cheaper, faster and more reliable; this lane removes a stall: every live decisions publish ends in exit 5 and needs --adopt-live. Measure: work lost or stalled.
Work: wr-2026-10-01-decisions-readback (you never touch docs/work/)

Inputs (by path; your prompt adds the territory worktree and builder report):
- Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/spec.md
- Scout addendum: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/briefs/scout-readback72b.md
- Territory brief (the scope you check against): C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/briefs/readback72b.md
- Backups of the live page, read-only: ~/.local/state/notion-backups/3e1da11277a18174bccfea187d5c3972/

PROJECT FACTS:
- Windows host. Node only; test command `node --test <files>`; NO full suite on Windows (the lead runs suites on Netcup and Hetzner later; never report a full suite as run). Never start a server or use a port; never run a production build.
- NO live Notion writes. Reading the local backup files is fine (read-only); never read env, credentials or token files.
- Temp files only under the Scratch dir C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-72b/ ; never delete a directory.
- Review read-only: you never modify, stage or commit the code under review, and never edit any file in the worktree.
- Checks you must make, by running them: (1) the new regression test FAILS on the base tree: run the new test file against the base versions of the non-test files in scratch (never in the worktree) and show the failure; (2) it passes after the fix, its fixture is shaped like the live page (three toggles, tab-indented children, trailing `<empty-block/>`), and the fake notion applies the real rewrite instead of echoing the text; (3) a genuinely different content line still gives publish exit 5 (try a changed prose line, a changed link target on a non-rewritten host, a dropped line); (4) the fix is in the renderer or normalize, not a looser comparison: read the diff of decisions-render-core.mjs and decisions-render-publish.mjs and decide whether any real mismatch could now pass; (5) re-derive the cause yourself: render the current tree offline (`node skills/decisions/scripts/decisions-render.mjs render --repo <dir>`) and diff normalize() of it against the latest backup .after.md; (6) no edit outside the territory file list in the territory brief; no docs/work or docs/decisions change; (7) page-lint and autolink checks still pass on the rendered page (skills/notion-writing/scripts/page-lint.test.mjs).
- Run the territory gate yourself: node --test skills/decisions/scripts/*.test.mjs skills/notion-writing/scripts/*.test.mjs > C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-72b/review-gate.log 2>&1 and read only its tail and failing names.
- Bug-fix review: your findings report must carry four non-empty lines: Cause:, Discriminating check:, Fix location:, Simplification: (checked by `scripts/bugfix-fields.mjs <your-report>`).

NOT (out of scope, stated explicitly):
- Writing or fixing any code; deciding anything the spec leaves open (list it as an open question).
- Any push, release, install, merge or live Notion write.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Evidence format: cite file:line for every finding; each finding labelled BLOCKER, MAJOR or MINOR with the command or test that shows it; counts of blockers and majors in the schema fields. NEEDS_FIXES if any BLOCKER or MAJOR stands. Verdict word first.

Report: your findings file, C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/reports/readback72b-review-r<round>.md (round from your prompt; the file you return as findingsPath). Line 1 is the verdict line above.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you may run any read-only command and any test; you may not change the code. Check in (BLOCKED) before anything outside the worktree and scratch.

Un-agent-able steps: the full suite and the live publish (the lead's). Scoped out of "done".
ETA: 20 to 40 minutes; report or park by 45.

Wall-clock limit 45 minutes from your start; at 45 minutes stop, write your report with VERDICT: BLOCKED and the reason timeout, and return (return verdict BLOCKED with timeout in the note field; this overrides the APPROVE/NEEDS_FIXES first-line rule).

JUDGMENT: whether the fix removes the cause of the exit-5 readback failure without letting a real page-content mismatch pass

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Never send peer notes.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
