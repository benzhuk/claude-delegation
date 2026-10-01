Territory: skills/decisions/scripts/goals-mirror.mjs, goals-mirror.test.mjs,
skills/decisions/scripts/fixtures/goals-page.expected.md (pre-existing fixture, used only
by this lane's test), docs/pane-setup.md's "Releasing" paragraph only.

Contracts I rely on: unchanged from G1-state.md — decisions-read.mjs's
`matchTitle`/`matchTopLevelHeading` and decisions-handback.mjs's `extractPageSha`, both
read-only, from lane 26.

Done (round 2, on top of round 1's delivered render):
- M1: date column now takes the LATEST standalone ISO date anywhere in the Status line's
  text (not just a trailing citation), excluding dates glued into a file name
  (`STATUS_DATE_RE`/`extractStatusDate`, goals-mirror.mjs:108-116). Fixture regenerated;
  exactly the 4 predicted rows gained a date. Real docs/GOALS.md's 12 rows all match the
  reviewer's predicted dates (see G1-r2-report.md).
- M2: the "decisions-read sees every goal heading" test now runs the real reader (a
  test-only probe checkbox under every toggle heading) instead of re-implementing
  matchTitle's regex.
- L1: added a test for `|`-escaping in table cells (heading and sentence).
- L2: the "no callout before Detail" scan now runs to `detailIdx`, not `tableIdx`.
- L4: `findHexToken`'s regex now uses hex-char lookaround instead of `\b`, catching a sha
  glued to another hex character (e.g. `g7dfc59d`, `sha7dfc59d`).
- L5: `checkTableSentence` refuses a literal `<callout>`/`</callout>` tag in the table
  sentence.
- L3: pane-setup.md's "Releasing" paragraph gained the reviewer's three sentences (exit-2
  recovery path, first-run one-time migration, readback table shape). Only that
  paragraph touched.
- Gate green: 136/136 territory+reader tests (was 132; +4 new), full suite 2384/2384
  pass (0 fail, 4 skipped, unrelated to this lane).
- Committed (review file, code+docs, gate log as 3 separate commits) and pushed to
  origin/build/goals-one-line-1.

Next: nothing outstanding in this territory for round 2. Left one deliberate omission for
lead judgment: L2's "Optionally" suggestion (asserting `extractPageSha` from lane 26's
decisions-handback.mjs in the same test) was not added — the review marks it optional and
it would be this lane's first import from lane 26's module inside test code. Flagged in
G1-r2-report.md.

Open questions: none blocking. Same two judgment calls from round 1 remain open for the
lead (table header text is not pinned; "status date" definition was exactly what M1
addressed this round, so that one is now resolved per the reviewer's recommended fix).

How to run my gate:
  node --test skills/decisions/scripts/goals-mirror.test.mjs skills/decisions/scripts/decisions-read.test.mjs
  node scripts/run-tests.mjs > docs/specs/goals-one-line-1/reports/G1-r2-gate.log 2>&1
