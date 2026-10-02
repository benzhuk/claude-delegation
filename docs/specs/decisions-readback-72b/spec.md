# Lane 72b: decisions publish readback fails after lane 72 (10/1 9:50 PM NY)

Measure: work lost or stalled. Lane 72 (merge 13e6e679) added Goal card, Bearings and Components toggles. Since then every live `decisions-render.mjs publish` writes the page, then exits 5 with "readback did not verify (decisions-read.mjs was not exit 0, or the normalised diff against the render is nonempty)". The next publish then exits 4 "page was written outside the renderer" until `--adopt-live`. A fresh `notion.js read` of the page equals docs/decisions/last-render.md after adopt, and decisions-read.mjs exits 0 on it, so the mismatch is between the in-memory render and the readback, likely in the new toggles (the `main at <sha>` line, Bearings links, Components lines, or Notion normalising tabs, links, backticks or `{toggle="true"}` headings in a way the readback normaliser does not handle).

## Scope, pinned
1. Find the cause with a discriminating check: reproduce offline against the latest backup in `~/.local/state/notion-backups/3e1da11277a18174bccfea187d5c3972/` (read-only) and the current render, print the normalised diff. Record Cause, Discriminating check, Fix location, Simplification in the report.
2. Fix the cause (renderer or readback normaliser), not a looser comparison. A real page-content mismatch must still fail.
3. Regression test from a fixture shaped like the live page with the three toggles.
4. No live Notion writes by builders; the lead does the live publish after merge.
Not in scope: anything else in lane 72 or 73.
