VERDICT: NEEDS_FIXES (5) 9e36a082ab6516103c993766bb417f69cddd3040

# Lane 57 delta review r3: N2 scanner at 9e36a08 (diff 1135839..9e36a08) plus a whole-scanner false-green hunt

- Reviewed 2026-09-29, about 3:45 PM America/New_York.
- Worktree /var/tmp/lane-57/wt, branch build/test-ipc-57-1. HEAD is e5d49f7, which is 9e36a08 plus docs only (`git diff --stat 9e36a08 HEAD` shows only build-r2.md and the record).
- The worktree was not modified. Everything was measured on `git archive` copies under /var/tmp/l57r3-OAWV:
  - `g/` is 9e36a08, `r1135/` is 1135839, `red1167/` is 1167b9a.
  - `gm/` is a mutation copy of g, restored after every run.
  - `gp/` is a patch-simulation copy of g.
  - scanner.mjs is the 9e36a08 scanner functions, extracted verbatim. scanner-1135.mjs is the same for 1135839.
- GOAL line served: "work lost or stalled" (gate false reds, and inheriting spawns that land unseen). Nearest NOT: "a rule no script checks". A scanner that is green over a real inheriting spawn is a rule that only looks checked.

## Summary

- R1, R2 and R3 are fixed as ruled. Each was re-measured on a real test file through the real N2 test (item 1).
- Two changes in this delta **regress** coverage that 1135839 had, both measured:
  - N1: `env: process.env || {}` / `?? {}` is now silent.
  - N4: a wrapper line that shares a line with a spawn-shaped string is now silent.
- R2's tripwire does not close the class it was ruled for. A regex literal that desyncs the extent can re-close inside 40 lines and silently swallow a later env key (N2). This is measured on a real file through the N2 test.
- R3's comment strip is not string-aware, so a `//` inside a string drops a node token (N3, regression, LOW).
- A tripwire hit prints as "passes no env key at all", which misleads the author (N5, LOW).
- One patch set closes N1 to N5. It gives an identical real-tree result (same 15 sites in 10 files). It keeps the 1167b9a red on :66 and :523. It passes every existing unit test except the R2 regex fixture, whose premise changes; the replacement is given below.
- Blocking: N1 and N2. N3 to N5 are LOW, and each has a patch.

## Process notes (disclosed)

- **One command was denied and the step stopped.** The secret-guard PreToolUse hook blocked the command that built and scored a "simpler design" scanner variant (scanner-simple.mjs), with the reason "command dumps the process environment". The command only held regex text naming the environment object. Per the brief, I did not retry or reword it.
  - As a result, the item 4 simpler design is measured only in part: its new rule over the real tree gives exactly the same one hit as today's (b) (ruleb.mjs).
  - Its battery run and unit-test run were **not** done.
- The three touched test files were run once, in `g/` (identical code to 9e36a08): `tests 91 / pass 90 / fail 0 / skipped 1` (the skip is the win32-only signal test), exit 0. This matches build-r2. The full suite was not run.
- I ran no deletes and set no git identity. TMPDIR=/var/tmp was used throughout. The scratch folder is left in place.

## Item 1: R1 to R3, re-measured on real files through the real N2 test

Method: mutate one real file in `gm/`, then run `node --test --test-name-pattern="^N2: no test file" skills/multi/scripts/hooks.test.mjs` once with 9e36a08's hooks.test.mjs and once with 1135839's (runmut.sh, mutate.mjs).

| mutation | 9e36a08 | 1135839 | verdict |
|---|---|---|---|
| R1: test-home.test.mjs:497-499 rewritten as a multi-line template `-e` script closed on the same line as `{ env: process.env, ... }` | **red** (`:497 [spawn]`) | green (silent) | R1 fixed |
| R2: test-home.test.mjs:534 gets `/https?:\/\//.source` in its argv | **red** (`:534`) | red | tripwire fires, but see N5 for the message |
| R3: collect-status.test.mjs:36 git call gets `// the node side reads this` inside its options | green | red (false red) | R3 fixed |
| N1: test-home.test.mjs:498 `env: childEnv(fixture.home)` changed to `env: process.env \|\| {}` | **green (silent)** | red (`:498 [inherits]`) | **regression, N1** |
| N1: same site, `env: fixture.sealed ? childEnv(fixture.home) : process.env` | green (silent) | green (silent) | pre-existing gap, N1 |
| N2: a new test appended to test-home.test.mjs: `execFile(NODE, [...], (err, out) => { assert.match(out, /won't/); // it's fine ... })` then a sealed `execFileSync(NODE, ..., { env: childEnv(...) })` | **green (silent)** | green (silent) | **silent pass, N2** |

## Item 2: the r1/r2 defeat table, measured now

Method: battery.mjs holds 66 fixtures run through both extracted scanners. Every fixture below is a node-reachable spawn that inherits, unless it is marked as a control. SLIP means 0 hits.

| form | 9e36a08 | 1135839 |
|---|---|---|
| options variable with no env / env sealed (control) / `env: process.env` (caught by (b) on the declaration line) | caught / 0 / caught | same |
| options variable with `env: undefined` or `env: null` | **SLIP** | SLIP |
| options variable declared twice / `let` then assigned / function parameter / member expression | caught | caught |
| spread `{...opts}`, `{...base, stdio}`, `env: {...process.env, X}`, `env: {...process.env}` | caught | caught |
| `env: undefined`, `env: null`, `env: process.env` | caught | caught |
| `env: process.env` on a line that begins inside a multi-line template (R1) | caught | SLIP |
| `env: process.env \|\| {}`, `env: process.env ?? {}` | **SLIP** | caught |
| `env: o.env ?? process.env`, `env: c ? childEnv(h) : process.env`, `Object.assign({}, process.env, ...)`, `structuredClone(process.env)`, `globalThis.process.env` | **SLIP** | SLIP |
| `process['env']`, `const env = process.env; ... { env }` (aliasing) | SLIP | SLIP |
| `execFile` with a callback and no options, `execFileSync` with no options, `cp.execFileSync` | caught | caught |
| `fork(x)`, `fork(x, args)`, `fork` with `env: process.env`; `fork` sealed (control) | caught; 0 | same |
| `'node'`, `"node"`, `` `node` ``, `'node.exe'`, `'/usr/bin/node'`, `sh -c 'node x'`, `sh -c '"$0"' + execPath`, `cmd /c node` | caught | caught |
| `sh -c` template with `${d}//sub && node x.mjs` | **SLIP** | caught |
| `process.argv[0]`, `process.argv0`, `const { execPath } = process`, `NODE` imported from a helper | SLIP | SLIP |
| multi-line call with no env | caught | caught |
| `// env: later` comment, `/* env: x */`, apostrophe comment then a later env key | caught | caught |
| template containing `env:`, `${ {env:1}.env }`, regex containing `env:` | caught | caught |
| regex containing `//`, regex with `'` or `"` followed by a later sealed call | caught (tripwire) | caught |
| regex with `'` inside an execFile callback, re-synced by `// it's` and followed by a sealed call | **SLIP** (desync.mjs) | SLIP |
| an `env` key nested in an argv object or in an `input:` JSON payload | SLIP | SLIP |
| `execFile(NODE, ..., cb)` whose callback holds a sealed spawn | SLIP | SLIP |
| a one-line template holding sealed spawn text, and on the same line `runChild(..., { env: process.env })` | **SLIP** | caught |

Live exposure of every SLIP row today is zero, measured three ways:
- classify.mjs lists the first argument of every call treated as not node-reachable: `git` 113, `cmd` 5 (git pass-through wrappers), `...args` 3 (review-run spies), `""` 4 (comment text), `mkfifo`, `taskkill.exe` and `command` 1 each. None runs node by another name.
- live.mjs: of 114 node-reachable calls, 0 carry their env key only below the options' top level, and 0 hold a regex literal.
- Every whole-object reference to the environment in the tree is either native-continuation-smoke.test.mjs:20 (exempted) or a `hasOwnProperty.call(process.env, X)` line.

So none of this is a live false green. It is an open door for the next test file, which is exactly what this scanner exists to shut.

## Findings

### N1 MEDIUM (blocking): an inheriting env value inside a composite expression is silent, and `|| {}` / `?? {}` regressed in this delta

- Evidence: hooks.test.mjs:597-599. Part (a) now owns inheriting values, but it recognizes them only in the exact form `env: <undefined|null|process.env>` followed by `,` or `}`, or a spread.
- R1 then makes (b) skip every line of an owned call (:631). (b) used to catch `env: process.env || {}` through its looser `\benv\s*:\s*process\.env\b`.
- Measured on a real file (table above): `env: process.env || {}` at test-home.test.mjs:498 is red at 1135839 and green at 9e36a08.
- The ternary, `o.env ?? process.env`, `Object.assign`, `structuredClone` and `globalThis.` forms are silent in both commits.

Fix (mechanical): judge "inherits" as any whole-object reference to the environment in the call's code, meaning `process.env` not followed by `.`, `[` or `?.`. This covers by-name, spread, `||`, `??`, ternary, `Object.assign` and `structuredClone` with one regex. It still allows `childEnv(h, { PATH: process.env.PATH })`.

Current, hooks.test.mjs:597-599:
```js
    const hasEnvKey = /[{,]\s*env\s*[:,}]/.test(code) || /\.\.\.\s*process\s*\.\s*env\b/.test(code);
    const inheritsBare = /[{,]\s*env\s*:\s*(?:undefined|null|process\s*\.\s*env)\s*[,}]/.test(code)
      || /\.\.\.\s*process\s*\.\s*env\b/.test(code);
```
Replacement:
```js
    const hasEnvKey = /[{,]\s*env\s*[:,}]/.test(code);
    const inheritsBare = /[{,]\s*env\s*:\s*(?:undefined|null)\s*[,}]/.test(code)
      || /\bprocess\s*\.\s*env\b(?!\s*(?:\.|\[|\?\.))/.test(code);
```
- Add unit cases to the F4 test, built with the `SPAWN` join trick: `env: process.env || {}`, `env: c ? childEnv(h) : process.env` and `env: Object.assign({}, process.env)`. Each expects 1 hit.
- Predicted and measured outcome, with all patches applied (scanner-p4.mjs in scratch):
  - Every N1 form is caught.
  - Real-tree hits are byte-identical to today (audit md5 4f09bd96..., the same 15 sites in 10 files).
  - The 1167b9a red is unchanged.

### N2 MEDIUM (blocking): R2's tripwire misses a desynced extent that re-closes within 40 lines, so an env-less node spawn passes silently

- Evidence: hooks.test.mjs:470-488 (`extractBalanced`) and :449-465 (`codeOnly`) still read a regex literal as code.
- Take `/won't/` inside an `execFile(NODE, ..., (err, out) => {...})` callback. Its `'` opens a phantom string, and the `'` of a later `// it's fine` comment closes it again. The extent then closes on the enclosing `});` six lines on and includes the next test line's `{ env: childEnv(...) }`.
- It closes with `)` and is under 40 lines, so the tripwire at :569 passes it, and `hasEnvKey` is true.
- Measured:
  - The appended-test mutation of test-home.test.mjs (desync4) is **green through the real N2 test** at 9e36a08.
  - desync.mjs gives `[]` for both shapes.
- R2's ruling was "fails loud, never silent". The tripwire is a symptom check (unclosed or too long), not a fix for the cause (regex literals are not recognized). The cause is cheap to fix.

Fix (mechanical): recognize regex literals, using the standard previous-significant-character rule, in both scanners.

Insert before hooks.test.mjs:446 (ahead of the `codeOnly` doc comment):
```js
/** Index of the closing `/` if `s[i]` opens a regex literal (the previous significant character is an
 * operator or opener, and the literal closes on the same line), else -1. */
function regexEnd(s, i) {
  let j = i - 1;
  while (j >= 0 && (s[j] === ' ' || s[j] === '\t')) j--;
  if (j >= 0 && !'(,=:[!&|?{};\n'.includes(s[j])) return -1;
  let inClass = false;
  for (let k = i + 1; k < s.length; k++) {
    const c = s[k];
    if (c === '\n') return -1;
    if (c === '\\') { k++; continue; }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return k;
  }
  return -1;
}
```
In `codeOnly`, insert after :460 (the `/*` line):
```js
    if (c === '/') { const e = regexEnd(s, i); if (e !== -1) { out += ' '.repeat(e + 1 - i); i = e; continue; } }
```
In `extractBalanced`, insert after :482 (the `/*` line):
```js
    if (c === '/') { const e = regexEnd(text, i); if (e !== -1) { i = e; continue; } }
```

The R2 unit test's regex half now parses correctly, so it no longer trips the wire. That is the one existing test that changes: measured in `gp/`, 35 of 36 pass and only `not ok 33` (R2) fails. Keep the unclosed half as it is. Replace hooks.test.mjs:837-843.

Current:
```js
  const regexLiteral = [
    "const NODE = process.execPath;",
    SPAWN + "(NODE, ['-e', /https?:\\/\\//.source], { stdio: 'ignore' });",
  ].join('\n');
  const regexHits = findEnvLessSpawns(regexLiteral);
  assert.equal(regexHits.length, 1, 'a regex literal containing // inside a call must not desync the call extent search into silence');
  assert.match(regexHits[0].target, /call extent not parsed/, 'the flag must name the parse failure, not a fake env gap (regex literal)');
```
Replacement:
```js
  const EXEC_FILE = ['exec', 'File'].join('');
  const regexLiteral = [
    "const NODE = process.execPath;",
    SPAWN + "(NODE, ['-e', /https?:\\/\\//.source], { stdio: 'ignore' });",
    "test('t', (t, done) => {",
    "  " + EXEC_FILE + "(NODE, ['x'], (err, out) => {",
    "    assert.match(out, /won't/); // it's fine",
    "    done();",
    "  });",
    "  " + SPAWN + "(NODE, ['y'], { env: childEnv(h) });",
    "});",
  ].join('\n');
  assert.deepEqual(
    findEnvLessSpawns(regexLiteral).map((h) => [h.line, h.target]),
    [[2, 'NODE'], [4, 'NODE']],
    'a regex literal holding // or a quote must neither end a line early nor stretch a call over a later env key',
  );
```
- Measured with fixture-check.mjs: 9e36a08 gives `[[2,"call extent not parsed ..."]]`, which misses line 4 (red). The patched scanner gives `[[2,"NODE"],[4,"NODE"]]` (green).
- The lead's sign-off is needed, because this changes ruling r2's "regex fixture trips the wire" into "regex fixture parses". The tripwire itself stays as a backstop.

### N3 LOW: R3's comment strip is not string-aware, so a `//` inside a string drops a later node token (regression)

- Evidence: hooks.test.mjs:581. The regex strips `//...` to the end of the line unless it is preceded by `:`, a quote, a backtick or a backslash, and it does this inside strings too.
- `execFileSync('sh', ['-c', `cd ${d}//sub && node x.mjs`])` is caught at 1135839 and silent at 9e36a08 (battery).

Fix. Give `codeOnly` a keep-strings mode and use it here.

Current, hooks.test.mjs:449:
```js
function codeOnly(s) {
```
Replacement:
```js
function codeOnly(s, keepStrings = false) {
```
Current, hooks.test.mjs:455-456:
```js
      if (c === '\\') { out += '  '; i++; continue; }
      if (c === inStr) { inStr = null; out += c; } else out += c === '\n' ? '\n' : ' ';
```
Replacement:
```js
      if (c === '\\') { out += keepStrings ? s.slice(i, i + 2) : '  '; i++; continue; }
      if (c === inStr) { inStr = null; out += c; } else out += keepStrings || c === '\n' ? c : ' ';
```
Current, hooks.test.mjs:581:
```js
    const noComments = call.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
```
Replacement:
```js
    const noComments = codeOnly(call, true); // comments blanked, string contents kept (R3)
```
Predicted and measured: the R3 unit test still passes, the `${d}//sub` form is caught, and the real tree is unchanged.

### N4 LOW: R1's ownership is line-granular, so it hides (b) on any line shared with spawn-shaped text (regression)

- Evidence: hooks.test.mjs:595 records `[firstLine, lastLine]`, and :631 skips whole lines. fnRe deliberately matches spawn text inside strings (native-continuation-smoke.test.mjs:17 is counted that way).
- So in ``const src = `spawn(process.execPath, [], { env: {} })`; runChild(process.execPath, ['-e', src], { env: process.env });`` the fake inner call owns the line, and (b) never sees `runChild`.
- This is caught at 1135839 and silent at 9e36a08 (battery).

Fix (mechanical): own character ranges, not lines.

Current, hooks.test.mjs:595:
```js
    ownedSpans.push([line, line + call.split('\n').length - 1]);
```
Replacement:
```js
    ownedSpans.push([m.index, openParenIdx + call.length]); // character range, not lines
```
Current, hooks.test.mjs:629-633:
```js
  const textLines = text.split('\n');
  for (let li = 0; li < textLines.length; li++) {
    if (ownedSpans.some(([a, b]) => li + 1 >= a && li + 1 <= b)) continue; // (a) already judged this call whole
    if (inheritRe.test(codeOnly(textLines[li]))) found.push({ line: li + 1, fn: 'inherits', target: 'process.env' });
  }
```
Replacement:
```js
  let offset = 0;
  for (const [li, raw] of text.split('\n').entries()) {
    for (const hit of codeOnly(raw).matchAll(new RegExp(inheritRe.source, 'g'))) {
      if (ownedSpans.some(([a, b]) => offset + hit.index >= a && offset + hit.index < b)) continue; // (a) judged this call
      found.push({ line: li + 1, fn: 'inherits', target: 'process.env' });
      break;
    }
    offset += raw.length + 1;
  }
```
- Measured (scanner-p4.mjs): the one-line form is caught, and the real tree is identical.
- All hooks.test.mjs tests pass except the R2 fixture that N2 replaces (gp4-hooks.tap: 35 of 36).
- If the lead adopts the item 4 simpler design, drop this patch: ownership disappears.

### N5 LOW: the N2 failure text drops the hit's reason, so a tripwire or inheriting hit says "passes no env key at all"

- Evidence: hooks.test.mjs:680 prints `[${hit.fn}] passes no env key at all` for every hit and discards `hit.target`.
- Measured: the R2 mutation reports `scripts/test-home.test.mjs:534 [execFileSync] passes no env key at all` for a call that passes `{ env }`.
- The loud failure ruling r2 asked for therefore tells the author to add a key that is already there.

Current, hooks.test.mjs:680:
```js
  const offenders = hits.map((hit) => `${key}:${hit.line} [${hit.fn}] passes no env key at all`);
```
Replacement:
```js
  const why = (hit) => (/^call extent not parsed/.test(hit.target ?? '') ? hit.target
    : hit.fn === 'inherits' ? 'hands the child the runner environment' : 'passes no env key at all');
  const offenders = hits.map((hit) => `${key}:${hit.line} [${hit.fn}] ${why(hit)}`);
```
Predicted outcome: the W1/F2 unit test still passes. Its hits carry no `target`, so `?? ''` guards that, and its assertions only use `includes` on the file:line and the count text.

## Item 3: can the R2 tripwire false-red? Is 40 principled?

- **Real tree: no.** 242 spawn-family matches across 71 files (audit.mjs): 0 unclosed, longest extent 11 lines (hooks/multi-inbox.test.mjs:163). There is about 3.6x headroom.
- **Plausible new files: yes, in three measured ways** (battery FRED rows). Each fails loud, never silent:
  1. A correctly sealed call over 40 lines, such as an inline multi-line `-e` script. It is flagged "call extent not parsed" even though the extent is correct.
  2. A comment holding an unbalanced `spawnSync(`. This false red is new at 9e36a08, because the tripwire runs before the node-reachability check and fnRe scans comments.
  3. A comment that quotes a call shape (`// spawnSync(process.execPath, [SCRIPT]) ...`). This is flagged as an env-less site at both commits (pre-existing), which is why this lane's own comments avoid writing call shapes.
- **40 is not principled.** It is a length heuristic for "the extent probably desynced". N2 shows it misses desyncs that re-close early, and (1) shows it can fire on correct extents. Once N2's regex fix removes the main desync cause, the unclosed check is the principled part. Keep 40 as a backstop, with N5's message so a false red explains itself.
- Optional, non-blocking fix for (2) and (3): skip fnRe matches that sit in a comment. Measured in wholefile.mjs: a whole-file, regex-aware `codeOnly(text, true)` pass (comments blanked, strings kept) shows no desync suspects on the tree. It places exactly 4 matches in comments, all real comments (hooks.test.mjs:553, review-run.test.mjs:58, :154, :168). The check is `if (codeOnlyKeep[m.index] === ' ') continue;` after computing `codeOnlyKeep = codeOnly(text, true)` once per file.

## Item 4: complexity (non-blocking note, except where it overlaps N1, N2 and N4)

- The scanner is now about 190 lines (hooks.test.mjs:446-636) plus 50 lines of exemption logic. It has two tokenizers with separate ad hoc comment handling (`codeOnly`, `extractBalanced`, and a third regex-based stripper at :581), a line-granular ownership table, a per-line second pass, and about 80 lines of comments narrating round history ("R1, fix round 2", "F5 follow-up"). The history belongs in the record, not in the gate's code.
- **A markedly simpler design with equal or better coverage** has two independent rules on one regex-aware tokenizer:
  - (A) Every node-reachable spawn-family call has an `env` key that is not `undefined`/`null`. This is today's (a) minus every environment-value branch.
  - (B) Across the whole file, in code only (a single `codeOnly(text)` pass, now sound with N2's `regexEnd`), there is no whole-object reference to the runner environment: `/(?<!(?:hasOwn|hasOwnProperty\.call)\(\s*)\bprocess\s*\.\s*env\b(?!\s*(?:\.|\[|\?\.))/g`.
  - This removes `ownedSpans`, the per-line pass, the per-line desync workaround and N4's patch. It also catches aliasing (`const env = process.env`), options variables holding the environment, and every N1 form, because (B) sees them wherever they are written.
  - Measured: (B) over the real tree gives exactly `scripts/native-continuation-smoke.test.mjs:20`, the same single (b) hit as today (ruleb.mjs), so the exemption table would not change.
  - Not measured: the battery and unit tests for this variant (the step stopped on the hook denial above). If the lead prefers it over N1 and N4's patches, the builder should run battery.mjs and the unit tests against it.
- If the lead keeps the current shape, N1 to N5 as patched are correct and complete for the measured battery. The remaining SLIP rows (aliasing, `process['env']`, argv0 or destructured or imported node paths, nested env keys, a callback holding a sealed spawn) should be written into the `findEnvLessSpawns` doc comment as known text-scanner limits, so nobody reads the gate as stronger than it is.

## Item 5: exemption table and the 1167b9a red

- **Exemption table matches the real tree exactly** (audit.mjs on `g/`): 10 files, counts 1/2/1/1/2/1/1/3/1/2, with no unlisted hits and no stale entries. The real N2 test is green in the three-file run.
- Docs nit: that sums to **15 sites**, not the "14 sites" in build-r2.md and the record's r1 log line (which also says "8 files"; the table has 10).
- **The 1167b9a red holds with the final scanner.**
  - Extracted scanner on 1167b9a's test-home.test.mjs: `[{"line":66,"fn":"spawn"},{"line":523,"fn":"execFileSync"}]`.
  - Whole N2 test with 9e36a08's hooks.test.mjs dropped into the 1167b9a tree: red, listing `scripts/run-tests.test.mjs:804` (sealed in round 1), `scripts/test-home.test.mjs:66` and `:523`.
  - This is unchanged under all the patches above.

## Minor (no count)

- `extractBalanced` returns the tail of the file when nothing closes (:487). An unclosed extent in a file whose last byte is `)` (no trailing newline) passes `call.endsWith(')')`, and is caught only if it runs over 40 lines. This is very narrow. If it is ever touched, return `null` on no close and test `call === null` in the tripwire (resolveIdentHasEnvKey would then need `?? ''`).

## C4 fields

Cause: The scanner's tokenizers do not recognize regex literals. A quote or `//` inside a regex therefore flips the string state, and a later odd quote can flip it back inside 40 lines, so the call extent re-closes over a later env key. R2's tripwire checks only the symptom (unclosed or over 40 lines). Separately, this delta moved inheriting-value detection from (b)'s loose per-line regex to (a)'s exact `env: <value>[,}]` form, and made (b) skip whole owned lines, which lost `process.env || {}` / `?? {}` and same-line wrapper calls. R3's string-unaware `//` strip lost node tokens after a `//` inside strings.

Discriminating check: Through the real N2 test on a mutated copy, `env: process.env || {}` at test-home.test.mjs:498 is red at 1135839 and green at 9e36a08. An appended test with `execFile(NODE, ..., cb)` holding `/won't/` and `// it's fine`, followed by a sealed call, is green at 9e36a08. After the patches, fixture-check.mjs gives `[[2,"NODE"],[4,"NODE"]]`, where 9e36a08 gives only the tripwire on line 2. Real-tree hits are identical before and after (md5 4f09bd96...), and 1167b9a still flags :66 and :523.

Fix location: skills/multi/scripts/hooks.test.mjs. That covers `regexEnd` (new, before :446), `codeOnly` (:449, :455-456, after :460), `extractBalanced` (after :482), the node-reach strip (:581), ownership (:595), the inherit test (:597-599), (b)'s loop (:629-633), the offender text (:680), and the R2 unit fixture (:837-843) plus three N1 unit cases. There are no edits outside the lane's territory.

Simplification: One regex-aware tokenizer (`codeOnly` with a keep-strings mode) replaces the third, regex-based comment stripper. One whole-object regex replaces three inheriting-value patterns. Going further (item 4), a whole-file rule (B) replaces `ownedSpans` and the per-line pass outright, with the same one real-tree hit.

## Scratch

Everything is under /var/tmp/l57r3-OAWV and left in place (no deletes):
- archives: `g/`, `r1135/`, `red1167/`, `gm/`, `gp/`
- extracted scanners: scanner.mjs, scanner-1135.mjs, scanner-patched.mjs, scanner-p4.mjs
- scripts: audit.mjs, classify.mjs, live.mjs, battery.mjs, desync.mjs, mutate.mjs, runmut.sh, wholefile.mjs, ruleb.mjs, mk-p4.mjs, fixture-check.mjs
- test output: three.tap, gp-hooks.tap, gp4-hooks.tap

Nothing from it is in a repo.
