Work: wr-2026-09-27-decisions-render
Scope: docs/specs/2026-09-27-decisions-render.md@952c6ef (origin/docs/lane-specs-0925), section Lane 26, decisions-render
Owner: skills-o
Status: reviewed
Authority: skills-fable ASK skills-fable-lane-26-1: build, review, live proof on the decisions page (dry-run plus one publish after a session.md edit), merge on acceptance under the standing grant of 2026-09-26, Closed bullet in docs/decisions/history in the merge commit. No release, chezmoi or install. Never fake owner input.
Artifact: build/decisions-render-1@4a2b21c279e058f98cc009747ce1162c64d7930f
Worktree: build/decisions-render-1
Evidence: docs/work/evidence/wr-2026-09-27-decisions-render-review-r3.md
Next: accept, merge with the history bullet and Summary line, one real publish from main after a session.md edit, readback diff only in This session
Lead-session: 588290d9-ee43-400b-a808-cf44c407171c
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-27T21:00:00Z
Base: d153389a2eea3e8008c2038360ab5d74f92a9adf
Opened: 2026-09-27T20:51:05Z
Log: 2026-09-27T20:51:05Z owned skills-o pack at C:/Users/benzh/Code/decisions-render/pack, live page read saved as pack/live-page.md
Log: 2026-09-27T22:40:07Z delivered skills-o Sonnet builder, three rounds: a806bb3 (r1), e2ceba8 (r2), 4a2b21c279e058f98cc009747ce1162c64d7930f (r3); gate 451/451
Log: 2026-09-27T22:40:07Z reviewed skills-o Opus APPROVE 4a2b21c279e058f98cc009747ce1162c64d7930f after Opus NEEDS_FIXES on a806bb3 (1 blocker, 5 major) and on e2ceba8 (1 new blocker); live publish --dry-run exit 0 equal to the live page; Netcup 2446/2450 0 fail 4 skipped

Observed: round 1 would have made every real --clear-done exit 4 (drift compared against a page still holding the owner input); round 2 fixed that but read the pickup status from the wrong field, so every real --clear-done exited 3; round 3 fixed it with a test on the real receipt shape, and the Opus end-to-end probe (real pickup receipt, real reader and git, fake Notion and push) dropped only the committed owner line and cleared Done. Open minors: M3(b), M3(c), M5, M9 deferred with reasons in review-r2; the Done-line refusal names the item last line rather than the Done line (decisions-render-core.mjs:282, patch in review-r3). No clear-done round runs live: faking owner input on the real page is forbidden, so that path is proved by unit test and the scratch probe only.

Predicts: the page is never again written except by publish; the next hand or anchored edit makes the next publish exit 4 instead of silently growing the page.
