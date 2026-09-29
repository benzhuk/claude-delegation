Work: wr-2026-09-28-notion-writing
Scope: docs/specs/2026-09-28-notion-writing.md (this branch), from skills-fable-lane-39-1
Owner: skills-o
Status: reviewed
Authority: skills-fable ASK skills-fable-lane-39-1: spec, red-team, build, review, second-host suite, merge, publish
Artifact: build/notion-writing-1@0f968192d809b43d9fdef8d36740155366c16617
Worktree: build/notion-writing-1
Evidence: docs/work/evidence/wr-2026-09-28-notion-writing-review.md
Next: accept, merge, close
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-28T22:36:00Z
Base: 6275fa0dbcfdf34cad39298fd50366e6503ddfb9
Opened: 2026-09-28T22:34:45Z
Log: 2026-09-28T22:34:45Z owned skills-o spec written by the lead in this branch (Scratch: C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/588290d9-ee43-400b-a808-cf44c407171c/notion-writing)
Log: 2026-09-28T22:50:46Z revised skills-o Opus red-team REVISE, 14 findings (6 HIGH: fixtures would leak BTO pages to a public repo, wrong render call site, verbatim text, render skip list, rule definitions), all applied as spec Revision 2; report kept in Scratch, not committed
Log: 2026-09-29T21:29:46Z delivered skills-o Sonnet builder squashed to 27ecce3, N1 fix 0f968192d809b43d9fdef8d36740155366c16617; Netcup 2749 pass 0 fail
Log: 2026-09-29T21:29:46Z reviewed skills-o Opus APPROVE 0f968192d809b43d9fdef8d36740155366c16617 (r2 approve 27ecce3 plus r3 confirm of the N1 test)
Log: 2026-09-29T21:29:46Z verified skills-o Codex session published a scratch status page through the skill, read it back, page-lint: clean (status); title "Scratch: notion-writing live proof", first block the goal callout; the page has no archive verb and waits for one hand-delete

Observed: before this lane no script checked a Notion page's shape, so page rules lived only in prose and pages drifted (em-dash arrows, done items first, missing goal callouts).
Predicts: every page written through the notion-writing skill or the decisions render passes page-lint before publish, so rework after acceptance on Notion pages drops and the census counts a page-lint clean line per publish.
