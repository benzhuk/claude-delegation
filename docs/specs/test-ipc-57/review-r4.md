VERDICT: NEEDS_FIXES (8) ae7dfcebb8aa11c9ea4e334348d3f7b1780e6f2d

# Lane 57 delta review r4: N2 scanner at ae7dfce (diff 163ba16..ae7dfce)

- Reviewed 2026-09-29, about 4:05 PM America/New_York.
- Worktree /var/tmp/lane-57/wt, branch build/test-ipc-57-1. HEAD 17db1eb is ae7dfce plus docs only (`git diff --stat ae7dfce 17db1eb`: build-r3.md and the record). The code diff 163ba16..ae7dfce touches only skills/multi/scripts/hooks.test.mjs.
- The worktree was not modified (`git status --short` identical before and after the test runs). All measurements were made on `git archive` copies under /var/tmp/l57r4-i4gf:
  - `ae7dfce/`, `163ba16/` and `1167b9a/` are pristine copies.
  - `m/` is the mutation copy. It was restored to pristine after every run, confirmed with `cmp`.
  - `red/t` is 1167b9a with ae7dfce's hooks.test.mjs dropped in.
  - scanner.mjs and scanner-163.mjs are the scanner functions extracted verbatim (extract.mjs). sp-*.mjs are patched variants (mkpatched.mjs).

## Answer to the judgment question

**Yes, the scanner still passes silently.** It passes at least one silent case in the exact class N2 was ruled to close, and I measured it on a real file through the real N2 test:

- The fixture appends a test to scripts/test-home.test.mjs that holds an env-less `execFile(NODE, ...)`.
- Inside that call's callback is `[out].forEach((l) => /won't/.test(l)); // it's fine`, followed by a sealed call.
- The real N2 test is **green** on it (R4-1).

Several semantic classes are also still silent (R4-2 to R4-6). Per ruling r3's stop rule, this is a ship-with-documented-limit outcome.

However, R4-1, R4-2 and R4-4 have small, measured patches:
- Together they close every desync and nested-key fixture in my battery.
- They leave the real tree byte-identical (10 files, 15 sites).
- They keep 1167b9a red on :66 and :523.
- They pass 42/42 hooks tests, including a new discriminating test.

The desync and top-level-key fixes are needed in the simpler design as well, because rule (A) still has to find a call's extent and its top-level `env` key. So applying them now is not work that the follow-up throws away.

## Process notes (disclosed)

- **Two commands were denied, and each step stopped there.** Neither was retried or reworded.
  1. `sed -n 36,44p` of hooks/multi-inbox.test.mjs, to classify the one extra real-tree hit from candidate patch F4. Denied by secret-guard ("references a secret file"). As a result, **the F4 hit at hooks/multi-inbox.test.mjs:40 is unclassified**: it could be a live whole-object reference that the scanner misses today, or a false red.
  2. The command that built and measured candidate F6 (part (b) as one whole-file pass), which would close m14. Denied by secret-guard ("dumps the process environment"): the heredoc held the scanner's literal target string. **F6 is unmeasured.**
- No deletes. No git identity set. TMPDIR=/var/tmp. The scratch folder is left in place.

## Item 1: N1 to N5, each fix reverted alone on `m/` (mutate.mjs), full hooks.test.mjs run

| revert | result | discriminates? |
|---|---|---|
| none (pristine) | 41 pass / 0 fail | - |
| N1 (old hasEnvKey/inheritsBare) | `not ok 35` (N1 test) | yes |
| N2 both regexEnd calls | `not ok 33` (R2) + `not ok 36` (N2) | yes |
| N2, extractBalanced call only (:510) | `not ok 33` + `not ok 36` | yes |
| **N2, codeOnly call only (:486)** | **41 pass (green)** | **no, see R4-7** |
| N3 (old regex comment strip) | `not ok 37` (N3 test) | yes |
| N4 (line ownership + per-line loop) | `not ok 38` (N4 test) | yes |
| N5 (fixed message) | `not ok 39` (N5 test) | yes |

All five fixes are present and match review-r3's patches verbatim. The builder placed the `regexEnd` calls after the `//` and `/*` checks, as review-r3 specified.

Every fixture discriminates except the codeOnly half of N2. That half matters: without it, `runChild(NODE, [/'/.source], { env: <parent env> })` goes from 1 hit to 0 (n2a.mjs).

## Item 2: silent-pass hunt (battery.mjs, 91 fixtures, run against ae7dfce and 163ba16)

SILENT means a node-reachable inheriting or env-less spawn with 0 hits. LOUD-ELSEWHERE means flagged on a nearby line, which is acceptable. TRIP means flagged as "call extent not parsed", which is loud and acceptable.

| brief shape | fixture | ae7dfce | tag |
|---|---|---|---|
| spread in nested object | `env: { nested: { ...P } }`, options variable with nested spread, `{ ...base.deep }` | caught | - |
| | `{ ...{ env: Object.assign({}, P) } }` | caught (was SILENT at 163ba16) | - |
| alias | `const e = P; {env: e}`, `const env = P; {env}`, `const { env } = process`, `const { env: parent } = process`, `process['env']`, `e = P` later, `opts.env = P` | **SILENT** | R4-3: simpler design (B), or F4 |
| | `delete opts.env` | **SILENT** | R4-6: limit |
| helper | `function mk() { return P }` then `{ env: mk() }` | **SILENT** | R4-3: (B) or F4 |
| | `{ env: childEnv(h), ...extra() }` | **SILENT** | R4-6: limit |
| | `buildOpts(h)` as options; arrow returning `{...P}` | caught / loud | - |
| nested backticks | `` `${`'`}` `` in argv, then `// it's`, then a sealed call | **SILENT** | R4-1: current design (F2/F3) |
| | `` `${`"`}` ``, `` `${ {env:1}.env }` ``, inherit hidden in `${}` | caught (TRIP / caught) | - |
| regex quote/slash in class | `/[/']/`, `/[\]']/` | caught | - |
| | **regex after `=>`** with a quote, re-closing (5j) | **SILENT** | R4-1: current design (F1) |
| | **regex after `+`** with a quote (5l) | **SILENT** | R4-1: F1 |
| | regex after `=>` on a (b) line / wrapper line (5f, 5g) | **SILENT** | R4-1: F1 |
| | regex after `return`, `)`, `of`, or after `=>` holding `//` | caught (TRIP or by luck) | F1 hardens |
| division next to regex | `(a) / 2 / 3`, `}.a / 2`, `arr[0] / 2` then a quote, `{} /2` | caught (one TRIP) | - |
| options on an earlier line | no env | caught | - |
| | `env: undefined` / `env: null` | **SILENT** | R4-4: current design (F5) |
| | ternary / `Object.assign` / `structuredClone` / `??` / multi-line composite (the N1 twin) | **SILENT** | R4-3: (B) or F4 |
| | a parameter named like a sealed top-level const | **SILENT** | R4-6: limit |
| | `let opts` then reassigned with env | FALSE-RED (loud) | acceptable |
| no options | `execFileSync(NODE, [...])`, `fork(x)`, `fork(x, args)`, `cp.fork(x)`, `execFileSync(process.execPath)` | caught | - |
| comments with unbalanced parens or quotes | `// (`, `// )`, `/* it's ( */`, `/* don't */` before the call, commented-out `env:`, a jsdoc apostrophe, `'// it\'s'` in a string, `'*/'` in a string | caught | - |
| misc | env key only inside an argv object, an `input:` payload, a nested options object, or a callback's inner sealed spawn | **SILENT** | R4-2: current design (F3) |
| | `env: void 0` | **SILENT** | R4-4: F5 |
| | `env: o.env ?? undefined` | **SILENT** | R4-6: limit |
| | `{ env: ENV }` with `const ENV = P` declared after | **SILENT** | R4-3 |
| | `runChild` with a multi-line `Object.assign({}, P)` | **SILENT** | R4-3 |
| | `runChild(..., { env: P })` on a line that begins inside a multi-line template | **SILENT** | R4-6: F6 (unmeasured) |
| | globalThis-prefixed parent env | caught (was SILENT at 163ba16) | - |
| reachability | `exec`/`execSync`, `import { spawn as sp }`, `{ spawnSync: run } = cp`, `spawn.call(...)`, `process.argv0`, `process.argv[0]`, `const { execPath } = process`, `const bin = 'node'`, `const N2 = NODE` | **SILENT** (both commits) | R4-5: needs a design decision beyond both designs |

(P stands for the parent-environment object throughout.)

Live exposure today: none of the SILENT rows fires on the real tree.
- With patches F1, F2, F3 and F5 applied, real-tree output is identical (no hidden desync or nested key today).
- The tree has zero child_process `exec`/`execSync` calls, zero renamed spawn imports, and zero `argv0` or `argv[0]` spawns (grep).
- The one exception is still open: F4 adds a hit at hooks/multi-inbox.test.mjs:40, which I could not classify (see Process notes).

## Findings

### R4-1 MEDIUM (the N2 twin; blocking under "when unsure, flag"): `regexEnd` misses regex literals after `=>`, binary operators and keywords, and a nested template holding a quote desyncs too. Both re-close silently over a later env key.

- Evidence, hooks.test.mjs:454:
  - The previous-character set `(,=:[!&|?{};\n` has no `>`, which is what an arrow function leaves before its body. It also has no `<`, `+`, `-`, `*`, `%`, `~` or `^`, and no keyword test for `return`, `typeof` and similar.
  - So `/won't/` after `=>` is read as division followed by a string.
  - Separately, `codeOnly` and `extractBalanced` (:474, :497) treat `${` inside a template as ordinary template text, so a nested template's backtick flips the state.
- Measured through the real N2 test (append-twin.mjs "arrow" variant):
  - The appended test is `execFile(NODE, ['-e', '0'], (err, out) => { [out].forEach((l) => /won't/.test(l)); // it's fine ... }); execFileSync(NODE, [...], { env: childEnv(...) });`.
  - The real N2 test passes, and the extracted scanner returns `[]` for the whole file.
  - The env-less `execFile` at test-home.test.mjs:543 is silent.
  - Battery rows 5j, 5l, 5f, 5g and 4a are SILENT.
- Fix: three parts, all mechanical, measured together as F1+F2+F3.
  - F1 alone closes 5f, 5g, 5j and 5l.
  - F2 alone closes 4a, 5j and 5l.
  - F2 is the backstop that makes the whole desync class loud rather than silent. A `;` at the call's own top level (paren depth 1, brace 0, bracket 0), or any depth going negative, cannot happen in a correctly parsed call. When it appears, the extent swallowed later statements.

F1, hooks.test.mjs:454. Current:
```js
  if (j >= 0 && !'(,=:[!&|?{};\n'.includes(s[j])) return -1;
```
Replacement:
```js
  if (j >= 0 && !'(,=:[!&|?{};\n<>+-*%~^'.includes(s[j])
    && !/(?:^|[^\w$.])(?:return|typeof|case|in|of|void|delete|throw|new|yield|await|else|do)$/.test(s.slice(Math.max(0, j - 9), j + 1))) return -1;
```

F2 and F3. Insert before the `findEnvLessSpawns` doc comment (before :532):
```js
/** Structural check over a call's code (comments, strings and regexes blanked by `codeOnly`): `broken`
 * when a `;` sits at the call's own top level or any depth goes negative - impossible in a correctly
 * parsed call, so the extent swallowed later statements; `topEnvKey` when an `env` key sits at the
 * top level of an argument object (paren 1, brace 1, bracket 0) - not inside an argv value, a payload,
 * a nested object or a callback body. */
function callShape(code) {
  let p = 0; let b = 0; let k = 0; let broken = false; let topEnvKey = false;
  const at = [];
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '(') p++; else if (c === ')') p--;
    else if (c === '{') b++; else if (c === '}') b--;
    else if (c === '[') k++; else if (c === ']') k--;
    else if (c === ';' && p === 1 && b === 0 && k === 0) broken = true;
    if (p < 0 || b < 0 || k < 0) broken = true;
    at.push(p === 1 && b === 1 && k === 0);
  }
  for (const m of code.matchAll(/[{,]\s*(env)\s*[:,}]/g)) if (at[m.index + m[0].indexOf('env')]) topEnvKey = true;
  return { broken, topEnvKey };
}
```
Current, :628-629:
```js
    const code = codeOnly(call);
    const hasEnvKey = /[{,]\s*env\s*[:,}]/.test(code);
```
Replacement:
```js
    const code = codeOnly(call);
    const shape = callShape(code);
    if (shape.broken) { found.push({ line, fn: m[1], target: 'call extent not parsed - rewrite or split this call' }); continue; }
    const hasEnvKey = shape.topEnvKey;
```

- Measured with F1+F2+F3+F5 applied (sp-F1235.mjs, and the same patches applied to a full hooks.test.mjs in `m/`):
  - Battery: 5f, 5g, 5j, 5l, 4a, m1, m2, m3, m4, 7b, 7c and m5 all move to caught. No new false red; every control stays at 0.
  - Real tree: identical to ae7dfce (10 files, 15 sites; audit.mjs diff empty).
  - 1167b9a: test-home :66 and :523, run-tests :804, unchanged.
  - hooks.test.mjs: 41/41, and 42/42 with the new test below.
- Tag: fixable in the current design, and required in the simpler design too, because rule (A) also parses extents.

Add this unit test after the N5 test (after :975). It is red at ae7dfce and green with the patches, both measured in `m/`:
```js
test('N2 scanner: r4 - a regex after => or an operator, a nested template, or an env key below the options top level never passes silently', () => {
  const SPAWN = ['sp', 'awn'].join('');
  const EXEC_FILE = ['exec', 'File'].join('');
  const PARENT = ['process', 'env'].join('.');
  const N = 'const NODE = process.execPath;';
  const SEAL = '  ' + SPAWN + "Sync(NODE, ['y'], { env: childEnv(h) });";
  const arrowRegex = [N,
    "test('t', (t, done) => {",
    '  ' + EXEC_FILE + "(NODE, ['x'], (err, out) => {",
    "    pick((l) => /won't/); // it's fine",
    '    done();',
    '  });',
    SEAL,
    '});'].join('\n');
  const nestedTemplate = [N,
    "test('t', () => {",
    '  ' + SPAWN + "(NODE, ['-e', `${`'`}`], { stdio: 'ignore' });",
    "  x(); // it's fine",
    SEAL,
    '});'].join('\n');
  const flagged = (src) => findEnvLessSpawns(src).map((h) => h.line);
  assert.deepEqual(flagged(arrowRegex), [3], 'a regex after => holding a quote must not stretch the call over a later env key');
  assert.deepEqual(flagged(nestedTemplate), [3], 'a nested template holding a quote must not stretch the call over a later env key');
  assert.deepEqual(flagged([N, SPAWN + "(NODE, [JSON.stringify({ env: 1 })]);"].join('\n')), [2], 'an env key inside an argv value is not the options env key');
  assert.deepEqual(flagged([N, SPAWN + "Sync(NODE, ['x'], { input: JSON.stringify({ env: {} }) });"].join('\n')), [2], 'an env key inside an input payload is not the options env key');
  assert.deepEqual(flagged([N, EXEC_FILE + "(NODE, ['x'], () => { " + SPAWN + "Sync(NODE, ['y'], { env: childEnv(h) }); });"].join('\n')), [2], 'a sealed spawn inside the callback does not seal the outer call');
  assert.deepEqual(flagged([N, 'const opts = { env: undefined };', SPAWN + "(NODE, ['x'], opts);"].join('\n')), [3], 'an options variable with env: undefined inherits');
  assert.deepEqual(flagged([N, SPAWN + "(NODE, ['x'], { env: void 0 });"].join('\n')), [2], 'env: void 0 inherits');
  assert.deepEqual(flagged("runChild(NODE, [/'/.source], { env: " + PARENT + ' });'), [1], 'a regex holding a quote must not blank a later inheriting value on the same line (codeOnly half of N2)');
  assert.deepEqual(flagged([N, SPAWN + "(NODE, ['x'], { env: childEnv(h) });"].join('\n')), [], 'control: a top-level env key still seals the call');
});
```
(The file is /var/tmp/l57r4-i4gf/newtest.txt.)

### R4-2 MEDIUM: the env-key test matches `env` anywhere in the call text, so an env key in an argv value, an `input:` payload, a nested options object or a callback's inner sealed spawn seals the outer call

- Evidence, hooks.test.mjs:629: `/[{,]\s*env\s*[:,}]/.test(code)` over the whole call.
- Battery m1 to m4 are SILENT at both commits (pre-existing; r3 listed m1, m2 and m4).
- This is also the mechanism that turns any desync into a silent pass, because the swallowed later call's key counts.
- Fix: F3 above (`topEnvKey`). Measured: m1 to m4 are caught, and the real tree is identical.
- Tag: current design, and required in the simpler design's rule (A).

### R4-3 MEDIUM: whole-environment inheritance through a variable, an alias or a helper is silent (the N1 twin outside the call text)

- Evidence:
  - N1's whole-object regex runs only on the call's own text (:630-631).
  - Part (b) still uses the narrow `env: P` / `...P` regex (:665).
  - `resolveIdentHasEnvKey` (:529) checks key presence only.
- So the following are all silent:
  - `const opts = { env: Object.assign({}, P) }` (or ternary, `??`, `structuredClone`, or multi-line), then `spawn(NODE, [...], opts)`;
  - `const env = P` followed by `{ env }`;
  - `const { env } = process`;
  - `process['env']`;
  - `opts.env = P`;
  - `function mk() { return P }` then `env: mk()`;
  - a wrapper call with a multi-line composite.
  - Battery rows: 2a-2g, 3a, 7d-7g, 7i, m10, m12.
- Fix: judgment call, so this is an instruction, not a verbatim patch.
  - This is exactly the simpler design's rule (B): no whole-object reference to the parent environment anywhere in the file's code.
  - Measured as F4, which is (b)'s `inheritRe` replaced by `(?<!(?:hasOwn|hasOwnProperty\.call)\(\s*)\bprocess\s*(?:\.\s*env\b(?!\s*(?:\.|\[|\?\.))|\[)|\{[^{}]*\benv\b[^{}]*\}\s*=\s*(?:globalThis\s*\.\s*)?process\b`, with (a)'s regex widened to the same `process[` form.
  - F4 turns every row above except 2h into a loud hit on the reference line.
  - It **adds one real-tree hit, hooks/multi-inbox.test.mjs:40 [inherits]**, which I could not classify (denied read). Whoever applies F4 must first classify that line. If it is a real whole-environment handoff to a child, it is a live silent pass today. If not, it needs an exemption or a narrower rule.
- Tag: simpler design (B). It can be applied inside the current design as F4, once :40 is classified.

### R4-4 LOW: an options variable with `env: undefined`/`null`, or a call with `env: void 0`, is silent

- Evidence:
  - :529 returns key presence only.
  - :630 lists `undefined|null` but not `void 0`.
  - Battery rows 7b, 7c and m5 are SILENT (7b and 7c are pre-existing r3 SLIP rows).
- Fix, measured as F5: 7b, 7c and m5 are caught, and the real tree is identical.

Current, :529:
```js
  return /[{,]\s*env\s*[:,}]/.test(codeOnly(obj));
```
Replacement:
```js
  const c = codeOnly(obj);
  return /[{,]\s*env\s*[:,}]/.test(c) && !/[{,]\s*env\s*:\s*(?:undefined|null|void\s+0)\s*[,}]/.test(c);
```
Current, :630:
```js
    const inheritsBare = /[{,]\s*env\s*:\s*(?:undefined|null)\s*[,}]/.test(code)
```
Replacement:
```js
    const inheritsBare = /[{,]\s*env\s*:\s*(?:undefined|null|void\s+0)\s*[,}]/.test(code)
```
- Tag: current design (rule (A) needs the same).

### R4-5 MEDIUM (design limit): node reachability and function naming are allow-by-default, so whole families pass silently

- Evidence: the call-name regex at :578 lists only spawn, spawnSync, execFile, execFileSync and fork, and the node-reachability set at :568 is literal tokens only. Silent at both commits (battery 8f to 8o):
  - `exec`/`execSync` with a node command line;
  - `import { spawn as sp }` and `const { spawnSync: run } = cp`;
  - `spawn.call(...)`;
  - `process.argv0` and `process.argv[0]`;
  - `const { execPath } = process`;
  - `const bin = 'node'`;
  - `const N2 = NODE`.
- This directly contradicts "when unsure, flag": an unrecognized first argument is treated as not node.
- Live exposure is zero (grep: no child_process exec/execSync, no renamed spawn imports, no argv0 spawns in *.test.mjs).
- Fix (judgment):
  - Invert reachability. A spawn-family call is out of scope only when its first argument is a string literal in a short allowlist (`git`, `mkfifo`, `taskkill.exe`, or `sh`/`cmd` with no node token). Everything else is in scope.
  - Add `exec|execSync` to the call-name regex, not preceded by `/` or `)`, so a regex's own `.exec` is excluded.
  - Flag any renamed destructure or import from child_process as "scanner cannot follow a renamed spawn".
  - r3's classify.mjs counts (git 113, cmd 5, `...args` 3, `""` 4, mkfifo, taskkill.exe and command 1 each) say this would add a handful of review-run spy sites to the exemption table.
- Tag: needed in **both** designs. Neither the current design nor the simpler one addresses it. At minimum it must be in the documented limit.

### R4-6 LOW (document as a limit): remaining silent shapes with no cheap text rule

- The shapes:
  - `delete opts.env` (2h);
  - `{ env: childEnv(h), ...extra() }`, where a later spread may override env (3d);
  - a function parameter named like a sealed top-level `const opts` (7h: `resolveIdentHasEnvKey` resolves the top-level declaration, not the parameter);
  - `env: o.env ?? undefined` (m6);
  - a wrapper `env: P` on a line that begins inside a multi-line template (m14: part (b) is still per line, so R1's inversion survives for wrappers).
- m14 is fixable by making (b) one whole-file pass over the now regex-aware `codeOnly(text)` (F6). That measurement was denied (Process notes), so it is unmeasured.
- 7h has a cheap "when unsure, flag" rule: return null from `resolveIdentHasEnvKey` when the identifier also appears in any parameter list.
- Tag: simpler design (B) closes m14. The others are text-scanner limits to document.

### R4-7 LOW: the codeOnly half of N2 has no discriminating fixture

- Evidence: removing :486 alone leaves hooks.test.mjs at 41/41 green (item 1 table).
- The `runChild(NODE, [/'/.source], { env: P })` fixture goes from 1 hit to 0 without it (n2a.mjs).
- Fix: the second-to-last assertion of the R4-1 unit test above pins it.

### R4-8 LOW: the known limits are not written anywhere a reader of the gate will see them

- Evidence: the `findEnvLessSpawns` doc comment (:532-559) describes what is caught and names no limit.
- r3 item 4 asked for the SLIP rows to be listed there. Ruling r3's stop rule makes "limit documented" the ship condition.
- Fix: add a "Known limits (text scanner; follow-up: simpler design)" paragraph to that doc comment listing R4-5 and R4-6 (and R4-3 if F4 is not applied), each as one line. Replace the ~80 lines of round-history narration in the same region with that paragraph; the history lives in the record.

## Item 3: exemption table and 1167b9a

- Real tree at ae7dfce (audit.mjs, same walk as the test): **10 files, 15 sites** (1+2+1+1+2+1+1+3+1+2).
  - The hit set matches the table exactly: codex-unsupported:438; bugfix-fields:21,113; collect-from-origin:423; janitor:1074; native-continuation-smoke:17,20; prefix-test:91; work-record:1778; decisions-read:440,720,727; goals-mirror:30; review-run:111,577.
  - No unlisted hit, no stale entry. The real N2 test is green in the worktree three-file run.
- 1167b9a with the final scanner:
  - Extracted scanner on test-home.test.mjs gives `[[66,"spawn"],[523,"execFileSync"]]`.
  - The whole N2 test in `red/t` is red, listing `scripts/run-tests.test.mjs:804`, `scripts/test-home.test.mjs:66` and `:523`.
  - This is unchanged under F1+F2+F3+F5.

## Item 4: test runs (worktree, TMPDIR=/var/tmp)

- Three touched files (hooks.test.mjs, test-home.test.mjs, run-tests.test.mjs): tests 96, pass 95, fail 0, skipped 1, exit 0. This matches build-r3.
- Full suite, `node scripts/run-tests.mjs`: tests 3043, pass 3038, fail 0, skipped 5, exit 0, "leak check: 0 new temp entries". This matches build-r3.

## Verified absences

- N1, N3, N4 and N5 are fixed exactly as patched, and each fixture goes red when its fix is reverted.
- No regression against 163ba16 in the battery: every row caught at 163ba16 is still caught. Two rows improved (the spread-object literal holding a composite, and the globalThis-prefixed form).
- The division operator does not produce a silent pass in any tested shape (6a-6d). Comments with unbalanced parens or quotes do not produce a silent pass (9a-9h).
- `execFileSync` and `fork` with no options are always caught.

## C4 fields

Cause: `regexEnd` recognizes a regex literal only after a fixed set of characters that omits `>` (arrow bodies), the other binary operators and keywords, and neither tokenizer tracks `${}` nesting. A regex or nested template holding a quote therefore flips the string state, and the call extent re-closes within 40 lines over a later call. Because the env-key test accepts an `env` key at any depth of the extent, the swallowed call's key seals the env-less call silently. Separately, the key test and the whole-environment test cover only the call's own text: an options variable, alias or helper that carries the parent environment is never judged.

Discriminating check: through the real N2 test, appending a test with `execFile(NODE, ..., (err, out) => { [out].forEach((l) => /won't/.test(l)); // it's fine ... })` and then a sealed call to test-home.test.mjs is green at ae7dfce, with the scanner returning `[]`. The R4-1 unit test is red at ae7dfce and green with F1+F2+F3+F5. Under those patches the real tree is identical (10 files, 15 sites), 1167b9a still flags :66 and :523, and hooks.test.mjs passes 42/42.

Fix location: skills/multi/scripts/hooks.test.mjs:
- `regexEnd` :454 (F1);
- new `callShape` before :532, plus :628-629 (F2, F3);
- :529 and :630 (F5);
- (b)'s `inheritRe` :665 (F4, after classifying hooks/multi-inbox.test.mjs:40);
- the `findEnvLessSpawns` doc comment :532-559 (R4-8);
- the new unit test after :975.

Simplification: one structural walk (`callShape`) replaces the 40-line length heuristic as the real desync detector. The length check can stay as a cheap backstop. It also gives rule (A) of the simpler design its top-level key test, so the follow-up reuses it rather than rebuilding it. F4 is rule (B) itself. With F4 in place, (a)'s own whole-environment branch and the ownership table become redundant, which is the follow-up's deletion.

## Scratch

Everything is under /var/tmp/l57r4-i4gf and left in place:
- copies: `ae7dfce/`, `163ba16/`, `1167b9a/`, `m/` (restored to pristine), `red/t`;
- scripts: extract.mjs, mutate.mjs, append-twin.mjs, battery.mjs, audit.mjs, mkpatched.mjs, n2a.mjs;
- scanners: scanner.mjs, scanner-163.mjs, sp-*.mjs;
- outputs and inputs: bat-ae7.txt, bat-163.txt, three.tap, full.log, newtest.txt.

Nothing from it is in a repo.
