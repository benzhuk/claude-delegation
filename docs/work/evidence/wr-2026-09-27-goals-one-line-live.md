# Lane 27 live mirror step on the Goals page

Page: Goals, 3e3da11277a1813cb326c42ed97a1d5d. Lead: skills-h on zhuk-vps32. Rendered by goals-mirror.mjs at build/goals-one-line-1@70e4c344fe90927ac87d401538ea8ea519325a6a (`render --repo .`, rc 0, 116 lines, 0 refusals).

## Steps (times are UTC, from the notion.js backup file names)
1. A fresh read seconds before the first edit was byte-identical to docs/specs/goals-one-line-1/goals-page-live-before.md: 126 lines, no line starting with `**`, so no line Ben wrote.
2. Edit 1, 2026-09-28T02:35:49Z. `notion.js edit --safe`. Old: the live marker callout (lines 1-3). New: the rendered marker callout plus the one-line table. Readback: 0 lines removed, 80 added. Notion stores the pipe table as `<table header-row="true">` html.
3. A fresh read before edit 2 matched the edit-1 readback: 206 lines, and the old content (lines 84-206) was byte-identical to the before-snapshot's lines 4-126.
4. Edit 2, 2026-09-28T02:37:08Z. `notion.js edit --safe`. Old: live lines 84-206, the card callout, note line and 12 goal toggles. New: the rendered `# Detail {toggle="true"}` block. Readback: 93 lines removed, 95 added.
5. Readback, 208 lines:
   - the marker callout (lines 1-3), then the table (line 4), then `# Detail {toggle="true"}` (line 84) with every child indented, then `<empty-block/>` (line 208);
   - no top-level line other than those four;
   - the Detail body equals the old content one tab deeper, apart from Notion's own normalization of the nested Aim table's rows;
   - the Detail body differs from the render only by Notion normalization: the `color="blue_background"` attribute on the card callout was not kept, `docs/GOALS.md` reads back as an autolink, and the Aim pipe table reads back as table html. None of these is content.
6. `replace-md` was not used, publish stays disabled, and no line Ben wrote was touched.

## Hand-back check on fresh reads, run right after
```
title ok: Skills: 9/27 7:35PM Decisions
Decisions waiting: 0, notes logged today: 0, goals mirror at 2ea22bf
HANDBACK ok
```
(decisions-handback.mjs from the branch, with --decisions, --goals, --title-meta and --repo ., rc 0)

Rollback: the pre-edit backups are in ~/.local/state/notion-backups/3e3da11277a1813cb326c42ed97a1d5d/ on zhuk-vps32.
