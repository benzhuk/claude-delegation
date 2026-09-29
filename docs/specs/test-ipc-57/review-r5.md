VERDICT: NEEDS_FIXES (3) 486dbcbdfd8c2b39ee37d49192a800db860dec54

# Lane 57 delta verify r5: 486dbcb against ae7dfce (closing check under lead-ruling-r4)

- Reviewed 2026-09-29, about 4:21 PM America/New_York.
- Worktree /var/tmp/lane-57/wt:
  - HEAD b360033 is record-only (`git diff --stat 486dbcb b360033`: build-r4.md and the record).
  - The code diff ae7dfce..486dbcb touches only skills/multi/scripts/hooks.test.mjs.
  - The worktree was not modified: `git status --short` was identical before and after the gates.
- Scratch is /var/tmp/l57r5-QjT1:
  - `g/` is a pristine archive of 486dbcb, and `m/` is the mutation copy (restored and `cmp`-checked after every run).
  - scanner.mjs is the scanner functions extracted verbatim.
  - battery.mjs and audit.mjs are the r4 scripts, unchanged. fuzz.mjs, edge.mjs, mutate.mjs, pin.mjs, addpins.mjs, pvoid.mjs and docpatch.mjs are new.
- No command was denied this round. No deletes, no git identity set, TMPDIR=/var/tmp throughout.

## Summary against the five criteria

| # | criterion | result |
|---|---|---|
| 1 | patches match review-r4 | **holds**. F1, F2, F3, F5 and the unit test are verbatim. The extracted scanner gives a battery output byte-identical to my r4 patched scanner (sp-F1235.mjs). |
| 2 | each new fixture discriminates when its fix is reverted | **fails for F1 and F2** (R5-1). F3, both halves of F5, and R4-7 discriminate. |
| 3 | Known limits names every silent class accurately | **mostly**. R4-5 and R4-6 are complete and accurate. The R4-3 line says a wrapper's env value "is judged", but a composite wrapper value is silent (R5-3). |
| 4 | nothing regressed | **holds**. 10 files and 15 sites, identical to ae7dfce. 1167b9a flags :66 and :523 (and run-tests :804). Gates are green. |
| 5 | no silent pass outside the limits in the desync, nested-key and undefined/null/void 0 classes | **one narrow gap**: `env: (null)` and `env: void(0)` are silent (R5-2). The desync and nested-key classes are clean across a 115,712-case fuzz. |

All three findings are LOW and mechanical. Each has an exact patch, measured together in `m/`:
- hooks.test.mjs passes 42/42;
- the real tree is identical;
- each new assertion goes red when its fix is reverted.

R5-1 traces to my own r4 unit test: its fixtures were closed redundantly by F3, which I did not check per fix in r4.

## Criterion 1: patch match

`git diff ae7dfce 486dbcb` compared with review-r4's patches:
- F1 regexEnd at :454-455, F2/F3 `callShape` at :534-551 and :662-664, F5 at :531 and :665, and the r4 unit test at :1012-1042 are verbatim.
- The doc comment was rewritten with the round-history narration removed, as ruled.
- `battery.mjs` output against the shipped scanner is identical (diff empty) to the r4 patched scanner.

## Criterion 2: per-fix revert on `m/` (mutate.mjs, full hooks.test.mjs run)

| revert | result |
|---|---|
| none | 42 pass / 0 fail |
| **F1 (regexEnd operator and keyword set), whole** | **42 pass (green)** |
| F1, operator characters only / keyword test only | 42 pass / 42 pass |
| **F2 (`shape.broken` trip)** | **42 pass (green)** |
| F3 (`topEnvKey`) | `not ok 40` (the r4 test) |
| F2 and F3 together | `not ok 40` |
| F5 in `resolveIdentHasEnvKey` (:531) | `not ok 40` |
| F5 `void 0` in `inheritsBare` (:665) | `not ok 40` |
| R4-7 (codeOnly regexEnd line) | `not ok 40` |

### R5-1 LOW: F1 and F2 have no discriminating fixture

- Evidence: the table above.
- The arrow-regex and nested-template fixtures are also closed by F3. The swallowed sealed call's key sits at paren depth 2, so the key test alone already refuses it. Reverting F1 or F2 alone therefore stays green.
- F2 is load-bearing, though. The shape below is **silent without F2** and TRIP with it (pin.mjs: `noF2=[]`, `shipped=["3:TRIP"]`): a desync that swallows a later top-level `const o = { env: ... };` followed by an enclosing `});`.
- F1 is load-bearing on a wrapper line. Without F1, `runChild(NODE, [(s) => /'/.test(s)], { env: <parent> })` goes from 1 hit to 0.

Fix (mechanical). Insert these three lines in hooks.test.mjs immediately before :1041 (the `'control: a top-level env key still seals the call'` assertion):
```js
  assert.deepEqual(flagged("runChild(NODE, [(s) => /'/.test(s)], { env: " + PARENT + ' });'), [1], 'a regex after => must not blank a later inheriting value on a wrapper line (regexEnd operator set)');
  assert.deepEqual(flagged([N, EXEC_FILE + "(NODE, ['x'], { env: childEnv(h) }, (e, o) => {", "  assert.ok([o].some((l) => /won't/.test(l))); // it's", '});'].join('\n')), [], 'a sealed call whose callback holds a regex after => must parse cleanly, not trip (regexEnd operator set)');
  assert.deepEqual(findEnvLessSpawns([N, 'wrap(() => {', '  ' + SPAWN + "(NODE, x, `${`'`}`); // it's", '  const o = { env: childEnv(h) };', '  run(o);', '});'].join('\n')).map((h) => [h.line, /call extent not parsed/.test(h.target)]), [[3, true]], 'a desync that swallows a later top-level env key must trip the structural check, not pass (callShape.broken)');
```
- Measured (addpins.mjs, text in /var/tmp/l57r5-QjT1/pins.txt): with the pins, 42/42 green. Reverting F1 gives `not ok 40`, and reverting F2 gives `not ok 40`.
- The real N2 test stays green, so the file does not flag itself.

## Criterion 5: silent-pass re-hunt in the patched classes

- **Battery (91 fixtures, r4's battery.mjs):**
  - Every desync row (4a, 5f, 5g, 5j, 5l), every nested-key row (m1 to m4) and every undefined/null/void 0 row (7b, 7c, m5) is caught.
  - The remaining SILENT rows are exactly 2a-2h, 3a, 3d, 7d-7i, 8f-8o, m6, m10, m12 and m14. Every one is R4-3, R4-5 or R4-6.
  - The one FALSE-RED (7k, `let opts` reassigned) is loud, as before.
- **Fuzz (fuzz.mjs):** 115,712 programs, each with an env-less node call carrying a desync-prone token on its line, followed by 0 to 3 pool lines holding quotes, templates, regexes, env keys and stray closers, with and without an enclosing `test(...)`.
  - 16 desync call shapes covered regexes after `=>`, `+`, `...`, `instanceof`, `?`, `??` and ternaries, `a++ / 2`, nested templates holding `'`, `"` or a backtick, `String.raw`, and a `/* it's */` comment.
  - ae7dfce: 24,863 silent.
  - 486dbcb: 1,154 silent, all from a single shape, `x(o) /'/;`. That is not a regex: JS itself reads it as division by a string, so the scanner lexes it correctly, and the program is not valid JS. **Zero valid-JS desync silent passes remain.**
- **Edge cases (edge.mjs):**
  - Caught: `env: undefined // comment` + newline, `{env:undefined}` with no spaces, an options variable with multi-line `env: void 0`, `env: null,` with a trailing comma, and ternary options expressed through a spread.
  - Controls stay clean: a sealed call with an arrow in its options, a sealed call with a block-bodied callback, and a sealed call whose callback holds a regex after `=>`.

### R5-2 LOW: `env: (null)` and `env: void(0)` are silent (undefined/null/void 0 class)

- Evidence: :531 and :665 match `(?:undefined|null|void\s+0)\s*[,}]`, which rejects a parenthesized value. edge.mjs: `spawn(NODE, ['x'], { env: (null) })` gives `[]`, and `{ env: void(0) }` gives `[]`.
- Fix (mechanical): in both :531 and :665, replace the exact substring
```
(?:undefined|null|void\s+0)\s*[,}]
```
with
```
[(\s]*(?:undefined|null|void[\s(]*0)[\s)]*[,}]
```
- Add two assertions next to R5-1's:
```js
  assert.deepEqual(flagged([N, SPAWN + "(NODE, ['x'], { env: (null) });"].join('\n')), [2], 'a parenthesized null inherits');
  assert.deepEqual(flagged([N, SPAWN + "(NODE, ['x'], { env: void(0) });"].join('\n')), [2], 'void(0) inherits');
```
- Measured (pvoid.mjs, docpatch.mjs): both are caught; the battery and real tree are identical; hooks.test.mjs passes 42/42.

Two further silent shapes in the key class are best documented rather than patched. They are folded into R5-3's text:
- options chosen by a ternary whose one branch is sealed, as in `spawn(NODE, x, c ? { env: childEnv(h) } : { stdio })`;
- an `env` key in an extra object argument the API ignores.

## Criterion 3: the Known limits paragraph (:579-592)

- The R4-5 bullet (exec/execSync, renamed import or destructure, `spawn.call`, argv0 and argv[0], destructured execPath, node in an untracked variable) is accurate and complete. It covers battery 8f-8o, including the `const N2 = NODE` alias chain as "a variable other than the tracked ones".
- The R4-6 bullet names all five shapes (2h, 3d, 7h, m6, m14) accurately.
- The builder's prose rewrite of the inline example is correct: no spawn-family call shape remains in the comment, and the real N2 test is green.

### R5-3 LOW: the R4-3 bullet's closing clause is inaccurate, and three silent shapes are not named

- Evidence:
  - :584 says "only a call's own text and a wrapper's own env value are judged". For a wrapper (any name outside the spawn family), part (b) judges only the exact `env: <parent>` value or a bare spread (:700 `inheritRe`). So `runChild(NODE, x, { env: Object.assign({}, <parent>) })` is silent (battery m12), which is exactly the reading the clause rules out.
  - `const { env } = process` (battery 2c and 2d) is not named. "A local alias such as..." arguably covers it, but a destructure is the spelling most likely to be missed.
  - The two R5-2 shapes above (ternary-chosen options, an extra ignored argument) are not named.
- Fix (mechanical).

Current, :583-584:
```
 *    existing options object's `env` property, or a helper function that returns `process.env` - is
 *    silent; only a call's own text and a wrapper's own env value are judged.
```
Replacement:
```
 *    existing options object's `env` property, or a helper function that returns `process.env` - is
 *    silent, as is `const { env } = process`. A wrapper call (any name outside the spawn family) is
 *    judged only for the exact `env: process.env` value or a bare `...process.env` spread, so a
 *    composite value there (`Object.assign`, a ternary) is silent as well.
```
Current, :591:
```
 *    `env: process.env` on a line that begins inside a multi-line template are silent; each needs a
```
Replacement:
```
 *    `env: process.env` on a line that begins inside a multi-line template, options chosen by a ternary
 *    whose one branch is sealed, and an `env` key in an extra object argument the API ignores are
 *    silent; each needs a
```
- Measured (docpatch.mjs applies R5-1, R5-2 and R5-3 together to `m/`):
  - hooks.test.mjs passes 42/42, with the real N2 test green, so the new comment text does not flag itself.
  - The re-extracted scanner gives a real tree identical to 486dbcb (10 files, 15 sites).

## Criterion 4: no regression

- Real tree (audit.mjs on `g/`): 10 files, 15 sites, byte-identical to the ae7dfce audit. The per-file counts 1/2/1/1/2/1/1/3/1/2 match `N2_SPAWN_ENV_EXEMPTIONS` exactly.
- 1167b9a:
  - The extracted 486dbcb scanner gives test-home `[[66,"spawn"],[523,"execFileSync"]]` and run-tests `[[804,"spawnSync"]]`.
  - The whole N2 test with 486dbcb's hooks.test.mjs in the 1167b9a tree is red, listing exactly `scripts/run-tests.test.mjs:804`, `scripts/test-home.test.mjs:66` and `:523`.
- Gates in the worktree, TMPDIR=/var/tmp:
  - The three touched files give tests 97, pass 96, fail 0, skipped 1, exit 0.
  - The full suite (`node scripts/run-tests.mjs`) gives tests 3044, pass 3039, fail 0, skipped 5, exit 0, "leak check: 0 new temp entries".
  - Both match build-r4. The "fail 1" lines inside full.log belong to the leak-check tests' own planted nested runs, not the suite.

## C4 fields

Cause: The r4 unit test's desync fixtures were each closed by more than one of the new mechanisms. The top-level key test alone rejects a swallowed later call's key, so the regex-context fix (F1) and the structural trip (F2) shipped without a fixture that fails when either is removed. Separately, the inheriting-value regex requires the bare token followed by `,` or `}`, so a parenthesized `(null)` or `void(0)` reads as a real override. And the limits paragraph generalized "a wrapper's own env value is judged" from part (b)'s two exact forms.

Discriminating check: reverting F1 or F2 alone on `m/` leaves hooks.test.mjs at 42/42. With the three R5-1 assertions added, each revert gives `not ok 40`. The shipped scanner returns `[]` for `{ env: (null) }` and `{ env: void(0) }`, and the R5-2 regex returns a hit for each with an identical battery and tree. The shipped scanner also returns `[]` for a `runChild` call whose env value is `Object.assign({}, <parent>)`, contrary to :584.

Fix location: skills/multi/scripts/hooks.test.mjs:
- :531 and :665 (R5-2 regex);
- :583-584 and :591 (R5-3 doc text);
- five assertions inserted before :1041 (R5-1 pins and R5-2 cases).

Simplification: none needed. Each fix is a pin, a widened alternation or a doc line on the mechanisms the ruling already adopted, with no new mechanism. The simpler-design follow-up inherits these fixtures unchanged, because its rule (A) uses the same extent and top-level key checks.

## Scratch

Everything is under /var/tmp/l57r5-QjT1 and left in place:
- copies: `g/`, `m/` (restored to pristine);
- scripts: extract.mjs, battery.mjs, audit.mjs, fuzz.mjs, edge.mjs, mutate.mjs, pin.mjs, addpins.mjs, pins.txt, pvoid.mjs, docpatch.mjs;
- scanners: scanner.mjs, sp-*.mjs;
- outputs: bat.txt, bat-mine.txt, audit.json, three.tap, full.log.

The 1167b9a check reused /var/tmp/l57r4-i4gf/red/t, whose hooks.test.mjs is now 486dbcb's copy. Nothing from it is in a repo.
