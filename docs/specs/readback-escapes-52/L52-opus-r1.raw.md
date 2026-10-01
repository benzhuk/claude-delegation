NEEDS_FIXES ee488fd
VERDICT: NEEDS_FIXES ee488fdf35dd72b3349277b1da566f66233813ed

Reviewer: Claude Opus 5.5, agent name lane52-review
Worktree: C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/9c61c35a-82dd-4aef-8eca-c99bb0e72e31/scratchpad/wt-review-52 (detached at ee488fd, left in place)
Date: 2026-09-28, America/New_York

## Findings

### MAJOR 1: unescape runs inside fenced literals, hiding a real backslash change
File: skills/decisions/scripts/decisions-render-core.mjs:41
Cause: the new `.replace(/\([*[\]`~>|<])/g, '$1')` sits in the per-line `.map` before the fence tracker runs, so it applies to every line, including fence bodies. The probe observed escapes in prose only; inside a code fence a backslash is content. The function's own comment already holds fences exempt from the details rule; this rule gets no such exemption.
Discriminating check (measured, both directions):
  normalize("```\na\*b\n```") === normalize("```\na*b\n```")  -> EQUAL (false green)
Fix location: move the unescape into the loop, applied only when outside a fence and not on the fence-open line.
Ready patch:
```diff
-    .map((l) => l.replace(/[ \t]+$/, '').replace(/\([*[\]`~>|<])/g, '$1'));
+    .map((l) => l.replace(/[ \t]+$/, ''));
@@
-  for (const l of lines) {
+  for (const raw of lines) {
     const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(l);
```
Concretely: rename the loop variable to `raw`, then at loop top:
```js
    const inLiteral = fence !== null || /^\s*(`{3,}|~{3,})/.test(raw);
    const l = inLiteral ? raw : raw.replace(/\([*[\]`~>|<])/g, '$1');
```
(keep every other line of the loop reading `l`). Failing test to add to decisions-render.test.mjs:
```js
test('normalize: Lane52 escape equivalence never applies inside a fenced literal', () => {
  assert.notEqual(normalize('```\na\*b\n```'), normalize('```\na*b\n```'));
  assert.notEqual(normalize('~~~\nC:\[x]\n~~~'), normalize('~~~\nC:[x]\n~~~'));
  assert.equal(normalize('a\*b\n```\nx\n```'), normalize('a*b\n```\nx\n```'));
});
```
Simplification: no new state; reuses the existing `fence` variable, so one comparator still serves drift and readback.

### MINOR 2: inline code spans get the same treatment
File: decisions-render-core.mjs:41. normalize("`C:\[x]`") === normalize("`C:[x]`") -> EQUAL. Same cause as MAJOR 1 at inline scale. Not fixing it needs a span tokenizer, which the brief rules out as an invented parser requirement; record it as a known limit in the comment. Discriminating check above.

### MINOR 3: escaped leading bracket equals a real to-do/quote line
normalize("- \[x] Done") === normalize("- [x] Done") and normalize("\> quote") === normalize("> quote"): a literal-text line and a structural to-do or quote compare equal. Tick changes still fail (tick mutant red below), so this only hides a block-type change, which the renderer's own emitted text cannot produce. Record as a known limit; no patch required.

### NIT 4: consecutive backslashes
Exact behaviour: the regex scans left to right; at `\*` the first `\` is followed by `\` (not in the set), so the second `\*` pair is stripped. Result: `\*` -> `\*`, `\\*` -> `\*`, `\*` -> `*`. Applied identically on both sides. `\*` vs `\*` and `\*` vs `*` both measured unequal, so no false green; the only failure mode is a false red if Notion ever escapes a literal backslash (it would return `\\*` for content `\*`, giving `\*` vs render `*`). Not observed; leave.

## Confirmed clean
- Scope: `git diff $(merge-base origin/main)..ee488fd --stat`: production change is decisions-render-core.mjs only (7 lines: normalize's replace and its comment). Rest is docs/specs, docs/work record, tests and fixtures.
- Fixtures: sha256 on this fresh checkout b448dab8... (before) and a88fa4a5... (live), matching the probe report. Fixture-local .gitattributes `* -text`. Test asserts raw pair unequal (decisions-render.test.mjs:258). Timestamp alignment lives only in the test helper alignLane52DoneMetadata, asserts exactly one replacement; no timestamp logic in normalize.
- Excluded set `_ # - + !` stays significant (test :271-273, and a\_b vs a_b measured diff). Backslash at end of line measured diff.
- Probe: eight escapes recorded with page id 3eada112-77a1-819a-88ae-c7d77fa1b3d7 in L52-probe-report.md and proof-manifest.json; archive-receipt.json shows in_trash true. I did not call Notion.

## What I ran
- node --test decisions-render.test.mjs decisions-render-core.test.mjs decisions-render-publish.test.mjs: 149 tests, 149 pass, 0 fail.
- Own mutants on the pinned live fixture (scratch copy, source untouched): drop one tab-bullet -> fails verify; change one tick to [x] -> fails verify; `\*` -> `x` -> fails verify. 3/3 red.
- Aligned snapshot pair: base normalize (merge-base copy in scratch bc/) unequal (red), candidate equal (green).
- False-green probe script scratchpad/fg.mjs: 11 cases, 5 EQUAL, of which 1 legitimate (`\*` vs `*`) and 4 are findings 1-3.

Is this removing the cause: yes for prose; MAJOR 1 is a scope leak into literals, fixed with the patch above.
