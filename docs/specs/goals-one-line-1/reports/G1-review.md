VERDICT: NEEDS_FIXES cb555e65cc2d70b2e845a2d90e3c55a98d146117

# G1 review, lane 27 goals-one-line (restart reviewer, round 1)

Artifact: cb555e65cc2d70b2e845a2d90e3c55a98d146117 (diff 06eb093..cb555e6). Worktree HEAD 119fad7 has no code change since the artifact (`git diff --quiet cb555e6 HEAD -- skills docs/pane-setup.md` is clean). The worktree was not written: `git status --short` is empty after the review.

Blocking: 2 MEDIUM (M1 date column, M2 heading test does not use the reader). Also 5 LOW and some INFO items. The LOW items are cheap, so fix them in the same round.

## How this was checked (restart addendum followed)

- Territory tests in the worktree: `node --test goals-mirror.test.mjs decisions-read.test.mjs` gave 132 tests, 132 pass, 0 fail.
- `probe.mjs` (read-only imports from the worktree) covered the edge cases, the refusal hunt, the real GOALS.md render, handback's `extractPageSha`, the reader on the render and on a simulated Notion readback, and the old renderer (06eb093, extracted via `git show` into scratch) against the new Detail block.
- `probe2.mjs` compared date and hex rules across the real Status lines. `probe3.mjs` tried a reader-backed heading check against a reader mutant.
- `mutate.mjs` is one node script. For each mutation it copies `scripts/` and `templates/` into a new scratch dir named `mut-<name>-<Date.now()>`, does a plain string replace (and asserts the replace applied), then runs `node --test` on the two territory files.
- All of these live in `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/g1r/`. There were no shell scripts, no deletions and no sed/perl in-place edits. Every check returned, so none are missing.

Mutation results (pass/fail out of 132):

| Mutation | Result | Tests that failed |
|---|---|---|
| baseline | 132/0 | none |
| drop-goal-heading | 128/4 | fixture x2, "decisions-read still sees every goal heading", Detail byte test |
| callout-in-table (between rows) | 129/3 | fixture x2, "table has one row per goal" (only by accident: the row index shifts) |
| callout-after-last-row | 130/2 | fixture byte tests only |
| no-escape-cell | **132/0** | none (M, see L1) |
| no-table-check | 128/4 | the three refusal tests plus the exit-2 test |
| exit-1-for-table-refusal | 131/1 | exit-2 test |
| no-detail-indent | 128/4 | fixture x2, Detail byte test, card-in-Detail test |
| card-before-table (template) | 128/4 | fixture x2, marker-first, card-in-Detail |
| drop-trailing-empty-block | 130/2 | fixture byte tests only |
| date-always-undated | 129/3 | fixture x2, date test |
| reader-headings-column-zero-only (decisions-read.mjs matchTitle accepts only column-zero `#` headings) | **132/0** | none (see M2) |

## Verified absence of defects (first-class findings)

1. **The marker callout is first, and handback can read its sha.** On the real GOALS.md render, the callouts are on line 1 (the marker) and line 19 (`\t<callout icon="🃏"`, inside Detail). The table starts on line 4 and Detail on line 18. Handback's own `extractPageSha` (decisions-handback.mjs:106-115) returns `cb555e6` from the real render, and also from a simulated Notion readback in which the pipe table becomes `<table>/<tr>/<td>` and the callout color attributes are dropped. The marker-callout bytes are identical to the old renderer's (checked on the real repo and on the fixture).
2. **Detail is byte-for-byte the old sections after one tab.** I ran the old renderer (06eb093) and the new one on the real GOALS.md and on the fixture. The old post-marker lines with one tab added equal the new Detail body: 97 of 97 lines on real and 68 of 68 on the fixture, first difference none. The only change is that the old template's single blank separator line is gone. It carries no text, and the live page has no block there.
3. **The reader stays clean.** On the real render, `parseDocument` gives 0 decisions, 0 unattached, 0 warnings and 0 shapeless. The simulated `<table>` readback gives the same zeros.
4. **Refusals.** Exit 2 fires for a lowercase, uppercase, backticked or full 40-char sha, `sha:path`, a sha inside a URL, `3 of 4`, `3/4`, and a UUID in either case. `deadbeef1` is refused, which is correct: 9 hex characters with a letter and a digit. These are not refused: `deadbee` (no digit), `1234567`, `2026-09-25`, `0.8.0`, `0.20.6`, `O9`. Text in Detail only (outside the table sentence) never refuses, including a sha, a count and a UUID in prose or later in the Status line: exit 0. The real GOALS.md renders with exit 0 and 12 rows for its 12 `## ` goals.
5. **`publish` stays disabled** (goals-mirror.mjs `run`, tests at goals-mirror.test.mjs:109-131).
6. **pane-setup.md**: `git diff 06eb093 cb555e6 -- docs/pane-setup.md` has one hunk (133-144), and it covers only the "Releasing" paragraph after the render command.

## Findings

### M1, MEDIUM (judgment; ready patch offered): the Date column says "undated" for 7 of 12 real goals whose Status line carries a date

**Evidence.** goals-mirror.mjs:108-116 takes the date only from a parenthetical at the very end of the Status line. On the real docs/GOALS.md (probe2), just 2 rows get a date: "Cut token cost" (2026-09-22) and "Nothing stalls silently" (2026-09-25). These 7 read "undated" although their Status line is dated:

- The lead spends judgment: three 2026-09-25 citations
- Simplest architecture: 2026-09-22 and 2026-09-23
- Progress is checked: 2026-09-23 and 2026-09-24
- One package: 2026-09-24 and 2026-09-25
- Decisions and goals: 2026-09-24
- What one session learns: "On Windows on 2026-09-27"
- Cleanup: 2026-09-22

On the page Ben reads, "Memory never syncs. | undated" sits next to a Status line measured today. The column misinforms on more than half the rows. The builder's report says it verified that "every other real line correctly reads undated", and that is the rule working as designed, not the column being right. The rule is not pinned (spec.md:5 says only `<status date or "undated">`), so this needs a decision, not just a patch.

**Fix, recommended.** Use the latest standalone ISO date in the Status line's text. A date that is part of a file name (preceded by `/` or followed by `-`) does not count. Predicted rows on the real GOALS.md: Cut 2026-09-22, Speed undated, Lead 2026-09-25, Simplest 2026-09-23, Progress 2026-09-24, Any host undated, One package 2026-09-25, Nothing stalls 2026-09-25, Decisions 2026-09-24, Learns 2026-09-27, Cleanup 2026-09-22, Aim undated. The existing test "table date: a trailing dated citation is the status date, else undated" still passes unchanged. `fixtures/goals-page.expected.md` must be regenerated, because four fixture rows gain a date: Simplest 2026-09-22, Decisions 2026-09-22, Learns 2026-09-27, Cleanup 2026-09-22.

Current (goals-mirror.mjs:108-116):
```js
// A trailing dated citation, e.g. "(2026-09-22 audit)" or "(2026-09-25 bearings O5; note
// `...`)" at the very end of the Status line's text — any other date mentioned mid-evidence
// (a file name, an earlier citation) is not "the status date".
const STATUS_DATE_RE = /\((\d{4}-\d{2}-\d{2})\b[^()]*\)\s*$/;

function extractStatusDate(rest) {
  const m = STATUS_DATE_RE.exec(rest.trim());
  return m ? m[1] : 'undated';
}
```
Replacement:
```js
// The status date is the latest standalone ISO date in the Status line's text (the newest
// evidence the line cites). A date inside a file name (`/2026-09-24-x.md`, `2026-09-24-x`)
// is not a standalone date and never counts. No date at all: "undated".
const STATUS_DATE_RE = /(?<![\w/-])(\d{4}-\d{2}-\d{2})(?![\w-])/g;

function extractStatusDate(rest) {
  const dates = [...rest.matchAll(STATUS_DATE_RE)].map((m) => m[1]).sort();
  return dates.length ? dates[dates.length - 1] : 'undated';
}
```
Add a test: `Status: PARTIAL. Shipped on 2026-09-24. See docs/x/2026-09-30-y.md (2026-09-25 bearings O4).` should give `2026-09-25`. That covers both the file-name exclusion and a date that is not last in the line.

**Alternative, if the lead prefers.** Use the date of the release commit that last changed the Status line (GOALS.md:3 says status changes only in a release commit). This is more authoritative, but `renderPage` would need a git-blame input injected, so it is a bigger change. Either way, the lead decides which, not the builder.

### M2, MEDIUM (mechanical; ready patch): the "decisions-read sees every goal heading" acceptance test does not run the reader for headings, and its shapeless half is vacuous

**Evidence.** In goals-mirror.test.mjs:42-59 the heading check re-applies a copy of `matchTitle`'s regex (line 48) to the page text. The reader is only used for `doc.shapeless`. On this page `shapeless` cannot be non-zero: decisions-read.mjs:378-379 counts only `<summary>`-shape titles, and the goals page has none.

Mutation proof: I changed decisions-read.mjs's `matchTitle` to accept column-zero headings only (`/^#{1,3}[ \t]+…`). That is exactly the regression this lane makes relevant, since every goal heading is now tab-indented. All 132 territory tests still pass. The spec acceptance ("a test that `decisions-read.mjs` on the rendered Goals page still sees every goal heading", spec.md:7) is therefore not really tested.

**Fix.** Have the real reader report the headings. For a test-only transform, add one checkbox option under every toggle heading, so each title becomes a `decision` that `parseDocument` returns. Then compare the titles against GOALS.md. In scratch (probe3.mjs), the real reader sees all 10 fixture goal headings (11 titles counting Detail), and the column-zero mutant misses all 10. With the patch, the mutant would fail this test.

Current (goals-mirror.test.mjs:42-59): the whole `test('decisions-read still sees every goal heading with zero shapeless', …)` block shown above.

Replacement:
```js
test('decisions-read still sees every goal heading with zero shapeless', () => {
  const page = renderPage({ repo: fixtureRepo, sha: 'test' });
  const doc = parseDocument(page);
  assert.equal(doc.shapeless.length, 0);
  assert.equal(doc.unattached.length, 0);
  // Let the real reader report the titles it recognises: a test-only checkbox under every
  // toggle heading turns each title into a decision parseDocument returns (titles without
  // options are not exported). A reader that stops seeing nested headings fails here.
  const probed = page.split('\n').flatMap((l) => {
    const m = /^(\t*)#{1,3} .*\{toggle="true"\}$/.exec(l);
    return m ? [l, `${m[1]}\t- [ ] probe`] : [l];
  }).join('\n');
  const seen = new Set(parseDocument(probed).decisions.map((d) => d.title));
  const goalsText = fs.readFileSync(path.join(fixtureRepo, 'docs', 'GOALS.md'), 'utf8');
  const goalHeadings = goalsText.split(/\r\n|\n/)
    .map((l) => /^##[ \t]+(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => m[1].trim());
  assert.ok(goalHeadings.length > 0);
  for (const heading of goalHeadings) assert.ok(seen.has(heading), `reader missed goal heading: ${heading}`);
});
```
Predicted result: green on cb555e6, red under the column-zero reader mutant (10 missing).

### L1, LOW (mechanical; ready patch): the `|` escaping in table cells has no test

**Evidence.** goals-mirror.mjs:118-120 contains `escapeCell`. Replacing its body with `return s;` leaves 132 of 132 green. Without the escape, a Status sentence containing `|` (for example `` `a|b` ``) adds a fifth column and breaks the row. The probe confirms the current code emits `Tables with a \| pipe work.`.

**Fix.** Append this test to goals-mirror.test.mjs:
```js
test('a "|" in the table sentence or heading is escaped so the row keeps four cells', () => {
  const goals = '# Goals\n\n## A | B\nStatus: PARTIAL. Uses `a|b` syntax. More.\n';
  const page = renderPage({ repo: fixtureRepo, sha: 't', readFile: readFileFor(goals) });
  assert.match(page, /\| A \\\| B \| Uses `a\\\|b` syntax\. \| undated \|/);
  assert.match(page, /\t# A \| B \{toggle="true"\}/); // Detail keeps the raw heading
});
```

### L2, LOW (mechanical; ready patch): "no callout inside the table" is guarded only by the regenerable fixture

**Evidence.** goals-mirror.test.mjs:72-82. The comment says "No other callout appears before the table / Detail toggle", but the loop stops at `tableIdx`. A callout appended after the last row is caught only by the two fixture byte tests (mutation callout-after-last-row: 130/2), and a regenerated fixture would hide it. The test also checks the sha with its own regex rather than handback's parser.

**Fix.** Current line 81:
```js
  for (let i = 2; i < tableIdx; i += 1) assert.doesNotMatch(lines[i], /<callout/);
```
Replacement:
```js
  for (let i = 2; i < detailIdx; i += 1) assert.doesNotMatch(lines[i], /<callout/);
```
Optionally, since reading lane 26's export is not editing it, add `import { extractPageSha } from './decisions-handback.mjs';` and `assert.equal(extractPageSha(page), 'abc1234');`. That turns this test into the handback contract check. Predicted result: green now, and red under both callout mutations.

### L3, LOW (instruction): the "Releasing" paragraph leaves out three steps the first live run will hit

docs/pane-setup.md:135-144 is right as far as it goes (render, fresh read, anchored edits one tab deeper, verify). It does not say:

- (a) What to do when render exits 2: fix the Status line in docs/GOALS.md at the source in the release commit, push, then render again. This is a realistic path, because release commits are what edit Status lines.
- (b) The first run after this lane is a one-time migration, not an anchored edit. The live page (goals-page-live-before.md) has the card callout, note and 12 goal toggles at top level. There are no one-tab anchors yet, so the lead must replace the region from the card callout through the last goal toggle with the new table plus Detail, and carry any `**` line Ben left inside a goal toggle.
- (c) The readback shows the table as `<table header-row="true">`/`<tr>`/`<td>` (as the Aim table already does in the live snapshot), not as pipe rows. Verify must compare cells, not raw lines.

**Fix.** Add two sentences after "Verify the readback.":

> Render exit 2 means a Status line's first sentence carries a sha, test count or session id: fix that line in docs/GOALS.md in the release commit and render again, never hand-edit the page. The readback returns the table as `<table>` rows; compare cell text. The first run after the one-line change is a one-time move: replace everything from the card callout through the last goal toggle with the rendered table and Detail block, carrying any `**` line Ben left inside a goal toggle.

### L4, LOW (mechanical; ready patch): the hex rule misses a sha that is glued to a word character

**Evidence.** goals-mirror.mjs:75 is `/\b[0-9a-fA-F]{7,40}\b/g`. In the probe, git-describe `0.20.6-3-g7dfc59d`, `sha7dfc59d` and `_7dfc59d` all render with exit 0. A 64-char sha256 also passes; that one is spec-literal, since the spec says 7 to 40.

**Fix.** Current:
```js
  const re = /\b[0-9a-fA-F]{7,40}\b/g;
```
Replacement:
```js
  const re = /(?<![0-9A-Fa-f])[0-9A-Fa-f]{7,40}(?![0-9A-Fa-f])/g;
```
Predicted result: those three become exit 2 (`7dfc59d`, `a7dfc59d`, `7dfc59d`). `deadbee`, `1234567`, dates, versions and `O9` stay clean. Zero new hits on the real GOALS.md table sentences (probe2). Add a `g7dfc59d` case to the hex refusal test.

### L5, LOW (mechanical; ready patch): a literal `<callout` in a Status sentence would put a callout tag in a table cell

**Evidence.** The probe input `Status: PARTIAL. Uses <callout> tags inline.` renders the tag inside the row. That breaks the pinned "no callout inside the table" rule by content rather than by structure. The chance is low.

**Fix.** In `checkTableSentence` (goals-mirror.mjs:88-100), before the hex check, add:
```js
  if (/<\/?callout\b/i.test(sentence)) {
    throw new TableRefusalError(`docs/GOALS.md:${lineNo} table sentence for "${heading}" carries a callout tag: fix the Status line at the source`);
  }
```
This is a fourth exit-2 case beyond the spec's three, so the lead may decline it. Test: that input gives exit 2.

### INFO (no change requested)

- **Spec-literal sentence cut.** `e.g. x` is cut to `…, e.g.` and `vs.` to `Codex vs.`. A sentence ending in `."` runs on to the next `. `. None of this happens on today's real GOALS.md. Pinned text wins; an abbreviation list would deviate from it.
- **Spec-literal `\d+/\d+`.** It also refuses `2026/09/25`, `24/7` and `0.20.7/0.20.8` (reported as test count `7/0`). The wording "test count" is misleading for a version pair, but the fix stays at the source. It does not refuse `3 / 4`, `3of4` or `three of four`, which is also spec-literal.
- **Two Status lines in one goal.** The table shows the last one while Detail shows both. This is pre-existing behaviour for Detail.
- **No Status line.** A missing Status line, or `Status: MET.` with nothing after it, gives an empty Summary cell. That is correct by the spec. A visible "(no Status line)" would read better for "The aim".
- **Builder report miscount.** G1-report.md says "All 11 `## ` goals"; there are 12. The table it prints has 12 rows.
- **Detail byte test uses a hand literal.** goals-mirror.test.mjs "the Detail toggle carries the old per-goal sections byte for byte" compares against a hand-written literal, not the old renderer. My old-versus-new run (verified absence 2) closes that gap for this artifact.

## Attack-brief answers

1. **Marker callout.** It is the first callout, and handback's own parser reads the sha from its first line. Verified on the real render and on a simulated Notion readback. See L2 to make the test use that parser.
2. **Table.**
   - There is one row per `## ` goal (12 of 12). The state word uses the existing span.
   - The sentence cut matches the pinned rule. For "0.20.6 release" the cut is intact. "e.g." and "vs." are cut spec-literally (INFO). A Status line with no `. ` gives the whole rest. A missing Status gives UNKNOWN, an empty cell and undated. A trailing period is kept.
   - A `|` is escaped but untested (L1).
   - The date comes from a trailing parenthetical citation only, and it is wrong for 7 of 12 real goals (M1).
3. **Refusals.** Exit 2 on the three classes and only on the table sentence. False negatives are glued shas (L4) and `3 / 4` or `3of4` (spec-literal). The only false positives are spec-literal slash pairs. The real GOALS.md is clean. `deadbeef1` is refused, which is correct.
4. **Detail.** `# Detail {toggle="true"}` holds the old sections byte-for-byte after one tab (97 of 97 real lines), with `<empty-block/>` last, and no callout between the marker and Detail. An anchored edit of today's live page cannot produce this directly: the first run is a one-time move of top-level blocks into Detail (L3 b). Nothing on the live snapshot is Ben-written, and the procedure must carry any `**` line found at run time.
5. **decisions-read test.** The shapeless half runs the real reader on the real render but can never fail on this page. The heading half does not use the reader, as the mutation proves (M2). Dropping a heading or adding a callout in the table is caught, by the heading test and the fixture tests respectively.
6. **pane-setup.md.** Only "Releasing" changed. The procedure is executable, but it lacks the exit-2 path, the first-run migration and the readback table shape (L3).
7. **publish.** It stays disabled.

## Bug-fix fields (artifact commit cb555e6 is `fix(goals-mirror): table-sentence refusal exits 2`)

Cause: `run()` mapped every non-BLIND error, table-sentence refusals included, to exit 1, although the pinned rule requires exit 2 for those refusals.
Discriminating check: the scratch mutation `return err instanceof TableRefusalError ? 2 : 1;` changed to `return 1;` makes exactly one test fail ("a table-sentence refusal exits 2 at the CLI, distinct from every other refusal (exit 1)"), and it passes at cb555e6. The fix is real and the regression test catches its revert.
Fix location: skills/decisions/scripts/goals-mirror.mjs `TableRefusalError` class (line 31) and the `run()` catch return (line 325).
Simplification: a subclass of `RefusedError` plus a one-line exit mapping. No new exit-code table or error registry, and every other refusal keeps exit 1.
