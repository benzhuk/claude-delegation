# Lane 47 lead ruling on review r2 (NEEDS_FIXES 6ef609a)

Review: scratchpad lane-47/review-r2.md, copied at accept time to docs/work/evidence/wr-2026-09-28-repo-env-everywhere-review-r2.md. Apply every patch below exactly as the review gives it. Do not change anything else.

- R2-1 MEDIUM: apply as patched. That means the goal-context.mjs fallback condition and the one new goal-context.test.mjs test, with the card written only in the worktree and no receipt. The test must be red at 6ef609a and green at the fix. Prove the red with a mktemp copy, not by editing the worktree back and forth.
- R2-2 LOW: apply the five build.md patches as given. Keep the four fields untouched, and rerun `node scripts/bugfix-fields.mjs docs/specs/repo-env-everywhere-1/reports/build.md`.
- R2-3 LOW: apply both patches, `childEnv` in the collect-from-origin.test.mjs git helper and in decisions-render-core.test.mjs `mkRepo`. Rerun both F3 tests standalone and confirm they pass.
- NIT 1: apply it (the note-inbox.test.mjs:208 comment).
- NIT 2: note the correction in build-r2.md. Do not edit build-r1.md.
- INFO: no action.

Gate: the targeted tests for the touched files, then the full `node scripts/run-tests.mjs` once. Report to docs/specs/repo-env-everywhere-1/reports/build-r2.md with the four bug-fix fields for R2-1 (the review gives them; copy or correct them).
