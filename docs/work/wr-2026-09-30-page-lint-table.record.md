Work: wr-2026-09-30-page-lint-table
Scope: docs/notes/skills-fable-lane-63-1.md: page-lint toggle extents treat lines inside a table as the opener's indent; measure: rework after acceptance (bearings pages fail lint on a false positive)
Owner: skills-o
Status: reviewed
Authority: skills-fable ASK skills-fable-lane-63-1, defect fix to a fed mechanism; merge under the standing grant
Artifact: build/page-lint-table-63@7bdb3d2db639cef4cc2759b2e552e7c480de33ce
Worktree: build/page-lint-table-63
Evidence: docs/work/evidence/wr-2026-09-30-page-lint-table-review.md
Next: accept, merge, close
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-30T22:30:00Z
Scratch: C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/588290d9-ee43-400b-a808-cf44c407171c/page-lint-63
Base: a6bd25f7789b3a682ee439ab38deb8e4021217f9
Opened: 2026-09-30T22:30:34Z
Log: 2026-09-30T22:30:34Z owned skills-o lane 63 taken
Log: 2026-09-30T22:53:43Z delivered skills-o Sonnet builder, table lines inherit the opener's indent for extent; r1 fixes at 7bdb3d2db639cef4cc2759b2e552e7c480de33ce
Log: 2026-09-30T22:53:43Z reviewed skills-o Opus APPROVE 7bdb3d2db639cef4cc2759b2e552e7c480de33ce (r1 two findings, fixed)
Log: 2026-09-30T22:53:43Z verified skills-o fresh Goals read lints exit 0 with the fix and exit 2 without; Netcup 3334 pass 0 fail at 7bdb3d2db639cef4cc2759b2e552e7c480de33ce

Observed: page-lint ended a toggle at Notion-flattened table rows, so the correct Goals page failed toggle-tail twice and blocked bearings publications.
Predicts: bearings publications to the Goals page lint clean with no waiver, and toggle-tail still fires on a toggle without its tail.
