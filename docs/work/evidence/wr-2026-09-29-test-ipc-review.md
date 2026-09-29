VERDICT: APPROVE e28f4f7fd7d9fd03ab7966747fd22f8d17952e3a

# Lane 57 closing confirmation r6: e28f4f7 against review-r5 and lead-ruling-r4

- Reviewed 2026-09-29, finished about 4:32 PM America/New_York.
- Worktree /var/tmp/lane-57/wt, branch build/test-ipc-57-1, HEAD 9a3dff8.
  - `git diff --stat e28f4f7 9a3dff8` touches only docs/specs/test-ipc-57/build-r5.md and the work record, so the head commit is record-only.
  - The worktree was not modified. `git status --short` was byte-identical before and after (cmp), and `git diff` and `git diff --cached` are both empty.
- Scratch: /var/tmp/l57c-rNgM.
  - `t/` is `git archive e28f4f7`, `g486/` is `git archive 486dbcb`, and `old/` is `git archive 1167b9a`.
  - There is one full-tree copy per mutation, named M1_regexctx, M1a_ops_only, M1b_kw_only, M2_desync, M3_topkey, M4_r5widen_both, M4_r5widen_531, M4_r5widen_665 and M4_all_widen.
  - The other scratch files are mutate.mjs, the *.tap outputs, audit-e28.json, full.log and the sc-*.mjs extracted scanners.
  - Nothing was deleted, and no git identity was set.
- **Two commands were denied by the secret-guard hook, and each step was stopped there. I did not try to route around either denial.**
  - First: the criterion-3 fixture spot-check (details under criterion 3).
  - Second: a post-write `grep -n` on the scratch copy of hooks.test.mjs, to confirm the line numbers cited in this report. The hook reported "references a secret file".
  - Because of the second denial, the e28f4f7 line numbers :669, :592 and :1045-1049 are **derived, not re-read**. Each is the 486dbcb number that review-r5 cited, shifted by the +4 lines of the R5-3 doc change. :531, :579-596 and the `sed -n` excerpts were read directly before the denial.

## Summary

| # | check | result |
|---|---|---|
| 1 | the diff touches only hooks.test.mjs and matches review-r5's three patches | **holds, byte-exact** |
| 2 | each of the four named fixes goes red when reverted alone | **holds, all four red** (two sub-parts are unpinned; see N-1) |
| 3 | Known limits is complete and accurate | **text checked, fixture spot-check STOPPED by a hook denial**. Static reading agrees (see below). |
| 4 | no regression | **holds**: 15 sites in 10 files, 1167b9a flags :66 and :523, 3 files green, full suite green |

No blocking defect was found. Three non-blocking notes (N-1 to N-3) are left for the simpler-design follow-up.

## 1. The artifact is exactly the reviewed patch set

- `git diff --stat 486dbcb e28f4f7 -- skills/` shows skills/multi/scripts/hooks.test.mjs only, 17 lines changed.
  - The rest of that range is docs only: build-r4.md, review-r5.md, win-486dbcb.md and the record.
- `cmp` of `git show e28f4f7:skills/multi/scripts/hooks.test.mjs` against /var/tmp/l57r5-QjT1/m/skills/multi/scripts/hooks.test.mjs: **IDENTICAL**.
- `diff -rq` of the whole e28f4f7 tree against the reviewer's m/:
  - it differs only in docs, namely three spec files that m/ predates and the work record;
  - no code file differs.
- /var/tmp/l57r5-QjT1/g/ matches `git archive 486dbcb` exactly, so the reviewer's baseline is the claimed one.
- Read against review-r5, patch by patch:
  - R5-1: the three pins are inserted before the "control: a top-level env key still seals the call" assertion.
  - R5-2: the widened regex is at :531 and :669, and both of its assertions are present.
  - R5-3: both doc-comment replacements are in place.
  - All three are verbatim.

## 2. Discrimination: each fix reverted alone on its own full-tree copy

Each run was `TMPDIR=/var/tmp node --test --test-reporter=tap skills/multi/scripts/hooks.test.mjs`. The baseline copy `t/` gives 42 pass, 0 fail.

| revert (mutate.mjs, exact-match replacement, match count asserted) | result |
|---|---|
| **regex-context fix (F1), whole**: regexEnd back to `'(,=:[!&\|?{};\n'` with no keyword test | **red**: not ok 40, 41/1 |
| F1 operator characters only (`<>+-*%~^` removed) | red: not ok 40 |
| F1 keyword test only (the `return\|typeof\|...` clause removed) | **green, 42/42** (N-1) |
| **desync check (F2)**: `if (shape.broken)` becomes `if (false && shape.broken)` | **red**: not ok 40 |
| **top-level env key rule (F3)**: `hasEnvKey` back to `/[{,]\s*env\s*[:,}]/.test(code)` | **red**: not ok 40 |
| **undefined/null/void widening, R5-2 at both sites** (back to the 486dbcb regex) | **red**: not ok 40 |
| the whole widening, F5 plus R5-2 (back to the ae7dfce forms at :531 and :669) | red: not ok 40 |
| R5-2 at :669 (inline) only | red: not ok 40 |
| R5-2 at :531 (options variable) only | **green, 42/42** (N-1) |

All four named reverts go red, and in every case the failing test is the r4/r5 unit test (#40). No other test changed state.

## 3. Known limits paragraph (:579-596)

- **Stopped step.** My fixture spot-check was rejected by the PreToolUse hook `~/.claude/hooks/secret-guard.sh` with "SECRET-GUARD: blocked — command dumps the process environment".
  - The command did not dump the environment. It wrote a fixture script whose source text contained the property-access spelling the scanner looks for, and then ran it.
  - Nothing ran: the extraction, the covered-shape fixtures and the limit-shape fixtures all belonged to that one command.
  - Per the hard rules I stopped the step there and did not reformulate the command to get past the hook.
  - **I did not measure the fixture spot-check myself.** The lead should decide whether that is acceptable, or have it rerun through a route the hook allows, for example a fixture file written without a shell heredoc.
- **What stands without that measurement:**
  - The paragraph is byte-identical to the text review-r5 measured on m/:
    - with docpatch.mjs applied, 42/42 and the N2 real-tree test green, so the comment does not flag itself;
    - its battery rows m12, 2c/2d and 8f-8o, and the R5-2 edge cases, were measured on the same scanner logic.
  - e28f4f7 differs from the 486dbcb scanner only in the void/null regex, which none of those limit rows touch.
- **Static reading (not a measurement) of four shapes against the shipped code:**
  - Covered 1: `spawn(NODE, ['x'], { ...<parent env>, FOO: '1' })`. At :670 the whole-object test matches because no `.`, `[` or `?.` follows. inheritsBare is then true, so hasEnv is false and the call is flagged. Consistent with (a).
  - Covered 2: `runChild(NODE, ['x'], { env: <parent env> })`. It is not in fnRe, but the (b) per-line `inheritRe` at :701 matches it, so it is flagged. Consistent with (b).
  - Limit 1: `const { env } = process;` then `spawn(NODE, ['x'], { env })`. `{ env }` sets topEnvKey, no inheriting token is in the call text, so hasEnv is true and the call is silent. It is named in bullet 1 ("as is `const { env } = process`").
  - Limit 2: `runChild(NODE, ['x'], { env: Object.assign({}, <parent env>) })`. (b) matches only the exact value or a bare spread, so it is silent. It is named in bullet 1 ("a composite value there (`Object.assign`, a ternary)").
- The bullets agree with the code for every other shape I traced as well:
  - bullet 2: exec/execSync, spawn.call, argv0 and untracked variables, because fnRe and nodeDirect are fixed sets;
  - bullet 3: the ternary-chosen options object and the extra ignored argument, because callShape accepts a top-level key in any argument object at paren 1 / brace 1.
- One wording gap was found by reading. It is unmeasured, so it is N-3 below.

## 4. No regression

- **Real tree.** The scanner extracted from e28f4f7 (r5's extract.mjs) was run with r5's audit.mjs on `t/`. It found **10 files and 15 sites**:
  - codex-unsupported 1, bugfix-fields 2, collect-from-origin 1, janitor 1, native-continuation-smoke 2, prefix-test 1, work-record 1, decisions-read 3, goals-mirror 1, review-run 2;
  - these counts equal `N2_SPAWN_ENV_EXEMPTIONS` exactly;
  - the JSON is identical to r5's 486dbcb audit.json.
- **1167b9a.**
  - The e28f4f7 scanner on `old/` gives test-home `[[66,"spawn"],[523,"execFileSync"]]` and run-tests `[[804,"spawnSync"]]`.
  - e28f4f7's hooks.test.mjs copied into the 1167b9a scratch tree gives 41 pass, 1 fail. The failure is only `not ok 26 - N2: no test file in this suite inherits the runner environment on its own`, listing scripts/test-home.test.mjs:66, :523 and scripts/run-tests.test.mjs:804.
- **The three touched files, in the worktree with TMPDIR=/var/tmp:** tests 97, pass 96, fail 0, skipped 1, exit 0.
- **Full suite, run once** (`TMPDIR=/var/tmp node scripts/run-tests.mjs` in the worktree): tests 3044, pass 3039, fail 0, skipped 5, exit 0, "leak check: 0 new temp entries". This matches build-r4 and review-r5.

## Non-blocking notes (for the simpler-design follow-up; none is a silent pass inside the lane's accepted set)

### N-1 INFO: two sub-parts of the adopted fixes have no pin of their own
- Evidence: in the table above, the keyword-only revert of F1 and the :531-only revert of R5-2 each stay at 42/42.
- Static reading of what each sub-part closes (unmeasured, because the fixture step was stopped):
  - The keyword half closes `runChild(NODE, [function () { return /'/.source; }], { env: <parent env> })`. Without it, the `/` after `return` is read as division, the `'` opens a string, and (b)'s per-line codeOnly blanks the rest of the line.
  - :531 closes `const opts = { env: (null) };` followed by `spawn(NODE, ['x'], opts);`.
- The code is correct. Only a future regression in either sub-part would go unnoticed.
- Suggested pins, for the follow-up or any later touch of this test. Insert them before the `'control: a top-level env key still seals the call'` assertion:
```js
  assert.deepEqual(flagged("runChild(NODE, [function () { return /'/.source; }], { env: " + PARENT + ' });'), [1], 'a regex after return must not blank a later inheriting value (regexEnd keyword set)');
  assert.deepEqual(flagged([N, 'const opts = { env: (null) };', SPAWN + "(NODE, ['x'], opts);"].join('\n')), [3], 'an options variable with a parenthesized null inherits');
```
- Predicted result: green on e28f4f7. The first goes red with M1b_kw_only and the second with M4_r5widen_531. This prediction is not measured.

### N-2 INFO: the scratch copy in review-r5 is described as "restored to pristine", but m/ holds the patched file
- m/'s hooks.test.mjs is the patched file, byte-identical to e28f4f7. That matches the brief ("its m/ directory is the patched tree").
- review-r5's closing Scratch line, "`m/` (restored to pristine)", is stale.
- This is a record-accuracy nit only, and no code is affected.

### N-3 LOW, doc precision, unmeasured: an env value that is a composite with a bare `undefined` or `null` operand is named by one spelling only
- Static reading of :669-670: inheritsBare requires the token right after `env:`.
  - So `spawn(NODE, ['x'], { env: c ? childEnv(h) : undefined })` has topEnvKey true, inheritsBare false, and hasEnv true, and it is silent.
  - Bullet 3 names only `env: o.env ?? undefined`.
  - Bullet 1 names "a ternary" for wrapper calls only.
- It is the same class as the documented `?? undefined` shape, so it falls inside a documented limit. I therefore do not block on it.
- A one-line doc fix for the follow-up. At :592, change `` `env: o.env ?? undefined`, `` to `` an env value that only sometimes yields `undefined`/`null` (`o.env ?? undefined`, a ternary with an `undefined` branch), ``.

## C4 fields

Cause: Nothing new was found at e28f4f7. The round was review-r5's three LOW patches:
- R5-1: the F1 and F2 fixes had no pin of their own;
- R5-2: the inheriting-value regex rejected a parenthesized `(null)` or `void(0)`;
- R5-3: the limits text over-claimed what a wrapper's env value is judged on.

All three landed byte-exact.

Discriminating check: reverting each of the four named fixes alone on its own full-tree scratch copy turns hooks.test.mjs from 42/42 to `not ok 40`. The regex-context, desync, top-level key and void/null reverts were each measured. The same file in the 1167b9a tree flags exactly test-home :66 and :523, plus run-tests :804.

Fix location: skills/multi/scripts/hooks.test.mjs:
- :531 and :669 (the widened regex);
- :583-596 (the Known limits text);
- :1045-1049 (the five new assertions).

Simplification: none needed in this lane. N-1's pins and N-3's doc line carry over to the simpler-design follow-up, whose top-level key rule reuses the same fixtures.
