# Scout addendum: territory readback72b (read at base c3d9f814debc5e0fd0e7509af1bdbfaf0e4b4c6e; the spec wins on any conflict)

## 1. Files and symbols
- skills/decisions/scripts/decisions-render-sections.mjs:21-22 exists: `GOALS_PAGE_ID = '3e3da11277a1813cb326c42ed97a1d5d'`, `GOALS_PAGE_URL = https://www.notion.so/${GOALS_PAGE_ID}`. It is used once, line 209, in the Bearings `Links:` line. This is the likely cause (see below).
- skills/decisions/scripts/decisions-render-publish.mjs:681-694 (step 6): readback is `deps.readPage(page)`; fails exit 5 if parseDocument/computeExitCode is nonzero or `normalize(readback) !== normalize(rendered)`. 583-584 and 672 use the same normalize for the exit-4 and F4 checks.
- skills/decisions/scripts/decisions-render-core.mjs:63-190 `normalize(text)`: CRLF, trailing blanks, Notion escapes of `*[]`~>|<` and inline-code delimiters. Nothing in it touches URLs. Toggles are built at core:622-646 and sections.mjs:32-34 (`toggleBlock`, trailing tab-indented `<empty-block/>`).
- Offline reproduction already done by the scout (read-only): rendered the current tree with `node skills/decisions/scripts/decisions-render.mjs render --repo <lane-72b>` and ran `normalize` on it against docs/decisions/last-render.md (equal to backup `2026-10-02T01-50-07-651Z.after.md`, the live page after adopt). In lines 1-58 (the Goal card, Bearings, Components toggles) exactly ONE line differs: line 14, the Bearings Links line. Rendered `[Goals page](https://www.notion.so/3e3d...5d)`, read back `[Goals page](https://app.notion.com/p/3e3d...5d)`. Everything after line 58 differs only because the live Waiting content moved; it is not the cause. The `main at <sha>` line, Components lines, tabs, backticks and `{toggle="true"}` headings all round-trip.
- Premise check: the spec guessed the toggles; the evidence says Notion rewrites a `notion.so/<id>` link to `app.notion.com/p/<id>` on write. The builder must still print the normalised diff itself (spec scope 1) and not take this scout's word.

## 2. Helpers to reuse
- `normalize`, `render` from skills/decisions/scripts/decisions-render-core.mjs; `publish`, `PublishError` from decisions-render-publish.mjs (re-exported by decisions-render.mjs).
- skills/decisions/scripts/fixtures/toggles-fixtures.mjs (`toggleFiles`, `withTogglesGit`, CARD_TEXT, BEARINGS_*): builds a fake repo with the three toggles; decisions-render.test.mjs:1095-1110 is the Bearings Links test and uses `renderDeps()`.
- `wireNotion(freshPage)` in decisions-render-publish.test.mjs:542 (readPage/replaceMd fake); extend it, or write a fake whose readPage returns the render with Notion's link rewrite applied, to drive a full publish to exit 0.
- Prior readback fixtures for shape: fixtures/render-readback-48/*, fixtures/readback-escapes-52/* (render-before-write vs live-after-write pairs).

## 3. Tests that police this area
- decisions-render.test.mjs:1106 pins the old `https://www.notion.so/...` Links string; a renderer fix must change this assertion deliberately.
- decisions-render-publish.test.mjs:772 (a nonmatching readback is still exit 5): must keep passing; add a case proving a REAL content mismatch still fails.
- decisions-render-core.test.mjs and the readback-escapes-52 / render-readback-48 fixture tests pin `normalize`: a normaliser change must not loosen them.
- skills/decisions/scripts/skill-text.test.mjs and skills/notion-writing/scripts/page-lint.test.mjs: page-lint rules (hex token, autolink) apply to the rendered page; a changed URL must still pass `checkAutolinkLines`.

## 4. Open questions for the spec
- Fix location: change the renderer constant to the form Notion returns (`https://app.notion.com/p/<id>`), or make `normalize` map `https://www.notion.so/<id>` to that form. The first is smaller and keeps the comparison strict; the second also covers any other notion.so link a Waiting item or the session text may carry. Spec says "renderer or readback normaliser", not which.
- Does `https://app.notion.com/p/<id>` open the Goals page for the owner? The live page already carries it, so presumably yes; nothing in the tree can check it.
