## Territory
readback72b: decisions publish readback fix. Worktree wt-decisions-readback-72b-readback72b.
## Contracts I rely on
Spec docs/specs/decisions-readback-72b/spec.md; Notion rewrites notion.so/<id> to app.notion.com/p/<id> on write.
## Done
Cause found (GOALS_PAGE_URL), fixed at decisions-render-sections.mjs:22, 2 regression tests, assertion at decisions-render.test.mjs:1106 updated. Gate 679/679. Commit 2673d7a2320e0035121ebffc9aeb16a7557af2dc.
## Next
Nothing; lead merges, publishes live.
## Open questions
None.
## How to run my gate
node --test skills/decisions/scripts/*.test.mjs skills/notion-writing/scripts/*.test.mjs
