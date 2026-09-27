VERDICT: APPROVE bb0c91a4f15359a5991c8f519ad5e79d5cfea8f6

# P2 review, round 1: decisions-read.mjs C4 (Bearings historical headings)

Worktree: /home/ben/Code/wt-pickup-complete-1-P2, branch build/pickup-complete-1-P2
HEAD (from `git rev-parse HEAD`): bb0c91a4f15359a5991c8f519ad5e79d5cfea8f6
Base: f2785a598649bee8eee63b1caa1fb1b66d97467a. One commit (bb0c91a). 2 files, +49/-1.
Worktree clean before and after the review. Nothing in the reviewed tree was written.

Blockers: 0. Major: 0. Minor: 1 (a gap in the tests, not in the code; it does not block).

## Gate (run by me before reading the diff)
`node scripts/run-tests.mjs skills/decisions/scripts/decisions-read.test.mjs skills/decisions/scripts/decisions-archive.contract.test.mjs`
exit 0, 111 tests, 111 pass, 0 fail. I wrote the log to my scratch folder, not the reports dir.

## Diff
- `skills/decisions/scripts/decisions-read.mjs:204`: `inArchive = topLevelHeading === 'Closed' || /^(?:First )?[Bb]earings\b/.test(topLevelHeading);`
  This is C4's regex exactly as written. The existing `=== 'Closed'` operand is unchanged, and nothing else in the file changed.
- `skills/decisions/scripts/decisions-read.test.mjs:660-706`: four new tests covering the four fixtures that spec.md P2 item 2 names:
  1. :662 covers the three live headings verbatim, toggle attribute included (shapeless is empty).
  2. :678 covers an owner `\*\*` comment and a ticked box under Bearings. Both are still reported (comment text, and status TICKED).
  3. :689 covers `# What is being built`, where the item is still shapeless.
  4. :697 covers `# Not Bearings`, where the item is still shapeless.

## Failure class being watched: a check that passes because it isn't looking, or an unknown rendered as a confident number
For P2 the question is whether a heading shaped like `# Bearingsless` can falsely match and silently hide a real active decision. I checked two ways, and it cannot:
- **Structurally.** Archive scope feeds only `archivedTitles`, and `archivedTitles` is read in exactly one place, the `shapeless` filter at `decisions-read.mjs:378-381`. The `decisions` list (`:362-369`) filters only on `options.length > 0` and never looks at archive scope. So even a false match could not remove a decision that has options, its comments, or its ticks. The worst a false match can do is hide one optionless `<summary>` from `shapeless`, which is the same thing `# Closed` already does.
- **Empirically.** I ran a scratch probe that imports the worktree module read-only:
  - `# Bearingsless` does not match. It stays active and shapeless is reported, because `\b` finds no boundary between `s` and `l`.
  - An active decision under `# Bearingsless plan` is listed as `OPEN X`.
  - Scout-P2.md's "Open questions" claim that the C4 regex "matches Bearingsless too" is wrong. The builder's change is correct as written.
- **Mutation.** I ran these on a scratch copy of the module and its test file, outside the tree:
  - Reverting line 204 to Closed-only makes test :662 fail. The new tests do discriminate the change.
  - Dropping `\b` leaves all tests passing, so the word boundary is not pinned by any test. That is finding m1.

## Attack brief P2: each item checked (probe output)
| Input | Result | Ruling |
|---|---|---|
| `# Bearingsless` | active (shapeless reported) | correct |
| `# bearings` (lower case) | historical | Fine. C4 spells out `[Bb]`, so this is intended. A lower-case section title on the owner page is still a Bearings section. |
| `# first bearings x` / `# First bearingsless` | active | correct (only `First ` with a capital F is allowed; the boundary holds) |
| `# **Bearings — x**` (bold) | historical | correct (the bold strip at :80 is the same one Closed gets) |
| `# Bearings-draft` | historical | acceptable (`-` is a word boundary) |
| `# Bearings_x` | active | correct |
| `# Bearingsé` | historical | Negligible edge case. JS `\b` without the `u` flag treats `é` as a non-word character. No real page heading looks like this, so no finding. |
| `## Bearings`, `\t# Bearings`, `  # Bearings` | active | correct (`matchTopLevelHeading` :75 requires column 0 and a single `#`) |
| An H1 inside a toggle's indented content (`\t# Bearings` under a `<summary>`) | does not open scope; the nested optionless summary stays shapeless | correct |
| `# Bearings` inside `<details>…</details>`, at column 0 | does not open scope (the `detailsDepth === 0` gate at :201) | correct |
| `# Bearings` followed by `# Waiting on you now` | scope ends; the later optionless item is shapeless | correct (spec item 1: scope ends at the next top-level H1) |
| An unbalanced `</details>` under Bearings | exemption is dropped, just as under Closed (`detailsBalanced` :380) | correct, same as Closed |
| An owner comment plus a ticked box under Bearings | `TICKED X b \| hello`, comment still reported | correct |
| `# Closed` fixtures, byte for byte | For 4 fixtures (plain, `{toggle="true"}`, `**Closed**`, unbalanced details), `JSON.stringify(parseDocument)` plus `formatText` output is identical between base and HEAD | byte-identical |

Scope: no file outside the P2 list was touched. The code has no network or `fetch` use. No cross-territory concern for the seam reviewer: `shapeless` is still consumed downstream in the same shape.

## Findings

### m1: MINOR. The attack-brief boundary case `# Bearingsless` is not pinned by a test
- Evidence: `skills/decisions/scripts/decisions-read.test.mjs:697-704` tests only `# Not Bearings`, which exercises the `^` anchor. It does not exercise `\b`. Removing `\b` from `decisions-read.mjs:204` on a scratch copy left the suite fully green.
- Fix: add one test. Ready-to-apply patch in `skills/decisions/scripts/decisions-read.test.mjs`. Insert it directly after the closing `});` of the `C4: a heading that is not Bearings (e.g. "Not Bearings")` test, before `test('MINOR 8: formatText and JSON report an explicit decision count'`:

  Current code:
  ```
  test('MINOR 8: formatText and JSON report an explicit decision count', () => {
  ```
  Replacement:
  ```
  test('C4: "# Bearingsless" is not a Bearings heading (word boundary), and "# bearings" in lower case is', () => {
    const less = parseDocument(L(
      '# Bearingsless',
      '<summary>Active malformed summary</summary>',
      '\t- prose only, no checkbox options',
    ));
    assert.deepEqual(less.shapeless, [{ title: 'Active malformed summary', line: 2 }]);
    const lower = parseDocument(L(
      '# bearings',
      '<summary>Historical summary</summary>',
      '\t- historical prose',
    ));
    assert.deepEqual(lower.shapeless, []);
  });

  test('MINOR 8: formatText and JSON report an explicit decision count', () => {
  ```
  Predicted outcome: passes at HEAD, based on the probe results above for both headings. It fails if `\b` is removed, and the lower-case half fails if `[Bb]` is narrowed to `B`.
- It does not block. The code is correct, and this patch only turns the attack-brief ruling into a regression guard.

## Verified absence of defects
- The regex matches the contract character for character.
- Closed behaviour is byte-identical, proven by comparing output against the base module.
- Scope cannot swallow a decision that has options, comments or ticks.
- H1 headings that are nested or indented do not open scope.
- Scope ends at the next top-level H1.
- The new tests really discriminate the change (reverting it makes them fail).
