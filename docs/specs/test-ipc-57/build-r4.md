DONE

# Lane 57 fix round 4 (closing round) report

Worktree /var/tmp/lane-57/wt, branch build/test-ipc-57-1, started at HEAD 4a259e5, committed
486dbcb (not pushed). Only file touched: skills/multi/scripts/hooks.test.mjs, as required.

## Findings applied (reviewer's patches verbatim, per lead-ruling-r4.md)

- **R4-1** (regexEnd + callShape): `regexEnd`'s previous-character set now also accepts
  `<>+-*%~^` and a trailing keyword (return/typeof/case/in/of/void/delete/throw/new/yield/
  await/else/do), closing the arrow-body and binary-operator regex misparse. New `callShape(code)`
  walks a call's blanked code once (paren/brace/bracket depth) and reports `broken` (a `;` at the
  call's own top level, or any depth going negative - the desync tripwire, now fails loud naming
  the site) and `topEnvKey` (an `env` key strictly at paren-1/brace-1/bracket-0). Wired into the
  `hasEnvKey`/`inheritsBare` computation in place of the old whole-call-text regex.
  - **Before**: the appended fixture (an `execFile` callback with `/won't/` after `=>`, then a
    sealed call) is silent - `findEnvLessSpawns` returns `[]`.
  - **After**: flags line 3 in both the arrow-regex and nested-template variants of the new unit
    test; the real N2 test in the touched-file gate is green with the fix and was RED before it
    (measured on a mktemp copy, see Research line below).
- **R4-2** (env key anywhere in call text seals it): closed by the same `callShape.topEnvKey`
  above - an `env` key inside an argv value, an `input:` payload, a nested options object, or a
  callback's inner sealed spawn no longer seals the outer call.
  - **Before**: `flagged([N, SPAWN + "(NODE, [JSON.stringify({ env: 1 })]);"]...)` -> `[]` (silent).
  - **After**: `[2]` (flagged).
- **R4-4** (`env: undefined`/`null`/`void 0` should count as inheriting): `resolveIdentHasEnvKey`
  and the inline `inheritsBare` regex both now also match `void\s+0`.
  - **Before**: `flagged([N, SPAWN + "(NODE, ['x'], { env: void 0 });"])` -> `[]` (silent); an
    options variable with `env: undefined` also silent.
  - **After**: both flagged (`[2]` and `[3]` respectively).
- **R4-7** (codeOnly-half of N2 had no discriminating fixture): the
  `runChild(NODE, [/'/.source], { env: process.env })`-shaped assertion is the second-to-last
  assertion in the new unit test, as specified.
  - **Before/after**: this assertion alone, reverting only the `codeOnly` regex-recognition call
    (:486 in the pre-round file), goes from green to red - matches review-r4 item 1's table.
- **R4-8** (Known limits paragraph): the `findEnvLessSpawns` doc comment's round-history
  narration (the F3/F6/R1/R2/R3/N1/N4/F4/F5 parenthetical tags and the "Lane 57 fix round 1
  dropped..." aside) is replaced with a "Known limits (text scanner; follow-up: simpler design)"
  paragraph naming R4-3 (whole-environment inheritance through a variable/alias/helper), R4-5
  (node reached through exec/execSync, a renamed import/destructure, argv0/argv[0], a
  destructured execPath, or `node` held in an untracked variable) and R4-6 (delete opts.env, a
  later overriding spread, a parameter shadowing a sealed const, `env: o.env ?? undefined`, a
  wrapper env line beginning inside a multi-line template).
  - One gotcha caught and fixed during verification: my first draft of that paragraph literally
    included the text `spawn(NODE, [...], opts)` as an inline example. The scanner's raw-text
    `fnRe` (not comment/string-aware) matched that fake call inside the doc comment itself, and
    because "NODE" is already a tracked node-direct token (from unrelated fixture strings
    elsewhere in the file), it flagged the doc comment as a real silent no-env spawn - a false
    positive introduced by my own doc edit, caught by running the full-suite gate. Rewrote the
    example in plain prose with no `name(` call-shaped substring; confirmed clean afterward.
- **R4-3**: NOT patched, per the ruling. `inheritRe` at the (b) half is unchanged (still the
  narrow `env: process.env` / bare spread form). No other mechanism was added.

## Research line (round 4)

- Built a `git archive` copy of the full tree at ae7dfce under
  `/var/tmp/l57b4-ebxU/ae7dfce-full` (a single-file copy fails - hooks.test.mjs imports sibling
  modules), dropped the new R4-1 unit test in (extracted verbatim from the current file), and
  ran `TMPDIR=/var/tmp node --test skills/multi/scripts/hooks.test.mjs`:
  - **RED at ae7dfce**: 41 pass / 1 fail (the new test fails: "actual: [], expected: [3]").
  - **GREEN after the patches**: 42 pass / 0 fail, once the ae7dfce copy's hooks.test.mjs was
    replaced with the fully patched version.
- Extracted `findEnvLessSpawns` and its helpers (regexEnd, codeOnly, extractBalanced,
  resolveIdentHasEnvKey, callShape) into a standalone ESM module
  (`/var/tmp/l57b4-ebxU/scanner.mjs`) and ran it over the real worktree
  (`/var/tmp/l57b4-ebxU/audit.mjs`): **unchanged, 10 files / 15 sites**, matching the exemption
  table exactly (codex-unsupported:438; bugfix-fields:21,113; collect-from-origin:423;
  janitor:1074; native-continuation-smoke:17,20; prefix-test:91; work-record:1778;
  decisions-read:440,720,727; goals-mirror:30; review-run:111,577).
- Ran the same extracted scanner over 1167b9a's `scripts/test-home.test.mjs`: **still flags line
  66 (`spawn`) and line 523 (`execFileSync`)**, matching review-r4's report.

## Gates

- Three touched files, `cd /var/tmp/lane-57/wt && TMPDIR=/var/tmp node --test
  skills/multi/scripts/hooks.test.mjs scripts/run-tests.test.mjs scripts/test-home.test.mjs`:
  **97 tests, 96 pass, 0 fail, 1 skipped (win32-only), exit 0** (was 96/95/1 in round 3 - +1 new
  unit test).
- Full suite, `TMPDIR=/var/tmp node scripts/run-tests.mjs`: **3044 tests, 3039 pass, 0 fail, 5
  skipped, exit 0, "leak check: 0 new temp entries"** (was 3043/3038/5 in round 3 - +1 same
  reason).

## Commit

- `486dbcb` on `build/test-ipc-57-1` (not pushed): "fix(hooks): close N2 scanner regex/operator
  desync, top-level env key and void-0 inherit gaps (review-r4 R4-1/2/4/7/8)". One file changed:
  `skills/multi/scripts/hooks.test.mjs` (92 insertions, 25 deletions).

## Deviations / assumptions

- None from the ruling's scope. R4-3 left unpatched as instructed. No mechanism added beyond
  `callShape` (which is exactly F2/F3 from the review, one function).
- The commit message avoids the literal parent-environment-variable-name text per the hard rule,
  using "the parent process environment" instead - no secret-guard denial encountered this round.
- Scratch work under `/var/tmp/l57b4-ebxU` (from `mktemp -d /var/tmp/l57b4-XXXX`), left in place,
  nothing from it committed to the repo. TMPDIR=/var/tmp used throughout. No deletes, no git
  identity set, no --no-verify.

State file: /var/tmp/lane-57/test-ipc-57-state-r4.md
