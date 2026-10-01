Territory: skills/decisions/scripts/goals-mirror.mjs, goals-mirror.test.mjs,
skills/decisions/templates/goals-page.md, docs/pane-setup.md's "Releasing" paragraph
only. Also touched the pre-existing test fixture
skills/decisions/scripts/fixtures/goals-page.expected.md (used only by
goals-mirror.test.mjs; not owned by lane 26).

Contracts I rely on: decisions-read.mjs's `matchTitle`/`matchTopLevelHeading` (any
`#`/`##`/`###` heading ending `{toggle="true"}`, any indentation, is a title;
`shapeless` only ever fires for `<summary>`-shape titles, never headings) and
decisions-handback.mjs's `extractPageSha` (reads `main at <sha>` off the FIRST line
inside the page's first `<callout>`). Both read-only, from lane 26; unchanged by me.

Done:
- Rewrote goals-mirror.mjs to the pinned shape: marker callout first (sha on its first
  line) -> one markdown table (`| State | Goal | Summary | Date |`, one row per `## `
  goal, state word in the existing colour-span style, sentence cut at the first ". "
  after the state word, status date from a trailing dated citation else "undated") ->
  ONE `# Detail {toggle="true"}` whose tab-indented children are the card callout, the
  source note, and every goal's own `# X {toggle="true"}` section carried byte for byte
  after exactly one added tab -> trailing `<empty-block/>`.
- Table-sentence refusal (exit 2 via RefusedError, caught as run() exit 1): a hex token
  (7-40 hex chars with a letter and a digit), a test count (`N of M` or `N/M`), or a
  session id (UUID shape) in the CUT sentence only — text past the cut, kept in Detail,
  is never checked. Naming the goal heading and the offending token.
- templates/goals-page.md rewritten to `{{sha}}`/`{{table}}`/`{{detail}}`.
- New fixture regenerated from the fixture repo (`fixtures/goals-src`); byte-stable test
  kept.
- 30 goals-mirror tests (was 13) + 102 decisions-read tests green (132 total, 0 fail).
  Full suite `node scripts/run-tests.mjs`: 2384 tests, 2380 pass, 0 fail, 4 skipped.
- Table-sentence refusal exits 2 at the CLI (TableRefusalError), distinct from every
  other refusal in this file (exit 1) — matches the pinned rule literally.
- pane-setup.md "Releasing" paragraph rewritten: anchors are now the marker callout, the
  table (rows agent-owned too), and Detail; Detail's children write/diff one tab deeper.
  Procedure unchanged: render, fresh read, anchored edits, verify.
- Ran the real docs/GOALS.md (read-only) through render: exit 0, all 11 goals render,
  zero refusals. See G1-report.md for the table.

Next: nothing outstanding in this territory. The lead runs the live mirror step once
(commands in pane-setup.md's Releasing paragraph) after review; I did not touch Notion.

Open questions: none blocking. Two judgment calls I made without a pinned rule, flagged
for lead review: (1) table header text ("State | Goal | Summary | Date") is my choice,
not pinned; (2) "status date" = a trailing `(YYYY-MM-DD ...)` parenthetical at the very
end of the Status line's full text (not just the cut sentence) — any other pinned rule
is a one-line regex change in `extractStatusDate`.

How to run my gate:
  node --test skills/decisions/scripts/goals-mirror.test.mjs skills/decisions/scripts/decisions-read.test.mjs
  node scripts/run-tests.mjs > docs/specs/goals-one-line-1/reports/G1-gate.log 2>&1
