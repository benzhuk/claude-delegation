DONE

# Lane 57 fix round 5 (small, mechanical) report

Worktree /var/tmp/lane-57/wt, branch build/test-ipc-57-1, started at HEAD cdecafa (record-only
commits on top of 486dbcb), committed e28f4f7 (not pushed). Only file touched:
skills/multi/scripts/hooks.test.mjs.

## Pre-check: reviewer's scratch copy matches the report

- `/var/tmp/l57r5-QjT1/g/skills/multi/scripts/hooks.test.mjs` (pristine archive of 486dbcb) is
  byte-identical (`diff` empty) to my starting worktree file.
- Ran the reviewer's own `docpatch.mjs` to regenerate `m/` (it applies R5-1's three pins, R5-2's
  regex widen + two assertions, and R5-3's doc text, matching review-r5.md's patches verbatim
  by inspection of the script's anchors and replacement strings) - the regenerated `m/` gave
  42/42 pass, matching the report's claim.

## Findings applied (verbatim, per review-r5.md)

- **R5-1** (F1/F2 had no discriminating fixture): inserted the reviewer's three pinned
  assertions before the "control: a top-level env key still seals the call" assertion - a
  wrapper-line regexEnd fixture, a callback-holds-a-regex-after-`=>` control that must parse
  cleanly (not trip), and a desync that swallows a later top-level env key which must trip
  `callShape.broken`.
- **R5-2** (`env: (null)` / `env: void(0)` silent): widened the inheriting-value regex in both
  `resolveIdentHasEnvKey` and the inline `inheritsBare` check, from
  `(?:undefined|null|void\s+0)\s*[,}]` to `[(\s]*(?:undefined|null|void[\s(]*0)[\s)]*[,}]`.
  Added the two assertions for `(null)` and `void(0)`.
- **R5-3** (Known limits wrapper clause inaccurate): replaced "silent; only a call's own text and
  a wrapper's own env value are judged" with the corrected clause naming `const { env } = process`
  and the exact-value/bare-spread limit on wrapper calls; added the ternary-options and
  extra-ignored-argument shapes to the R4-6 bullet.

## Verbatim-match check (post-edit)

`diff /var/tmp/lane-57/wt/skills/multi/scripts/hooks.test.mjs
/var/tmp/l57r5-QjT1/m/skills/multi/scripts/hooks.test.mjs` -> **empty, exit 0**. My patched file
is byte-identical to the reviewer's regenerated patched copy.

## Research line: revert proofs on a mktemp copy

Scratch: `mktemp -d /var/tmp/l57b4-XXXX` -> `/var/tmp/l57b4-FN0w`, full `git archive HEAD` tree
with the patched hooks.test.mjs dropped in (`full/`), baseline confirmed 42/42 green.

- **Reverted F1 alone** (regexEnd's `<>+-*%~^` operator set + keyword lookback, back to the
  bare `'(,=:[!&|?{};\n'` set): **41 pass / 1 fail** - the new "regexEnd operator set" wrapper-
  line assertion fails (`expected: [1], actual: []`). Restored and `cmp`-verified pristine.
- **Reverted F2 alone** (removed the `if (shape.broken) { ...; continue; }` line): **41 pass / 1
  fail** - the new "callShape.broken" desync assertion fails (`expected: [[3, true]], actual:
  []`). Restored and `cmp`-verified pristine.

Both match review-r5's own item-2 table (`not ok 40` on each single revert, with the pins in
place).

## Gates

- Three touched files, `TMPDIR=/var/tmp node --test skills/multi/scripts/hooks.test.mjs
  scripts/run-tests.test.mjs scripts/test-home.test.mjs`: **97 tests, 96 pass, 0 fail, 1 skipped
  (win32-only), exit 0** - unchanged count from round 4 (these are new assertions inside the
  existing r4 test, not new top-level tests).
- Full suite, `TMPDIR=/var/tmp node scripts/run-tests.mjs`: **3044 tests, 3039 pass, 0 fail, 5
  skipped, exit 0, "leak check: 0 new temp entries"** - unchanged from round 4, as expected.

## Commit

- `e28f4f7` on `build/test-ipc-57-1` (not pushed): "fix(hooks): pin the regex-context and desync
  fixes, widen void/null inheritance, correct the wrapper limits text (review-r5 R5-1/2/3)".
  One file changed: `skills/multi/scripts/hooks.test.mjs` (13 insertions, 4 deletions).

## Deviations / assumptions

- No lead-ruling-r5.md exists; the coordinator's dispatch message served as the ruling for this
  round (explicitly named as "small and mechanical", three verbatim LOW patches, no new
  mechanism).
- Commit message avoids the literal parent-environment-variable-name text, using "parent-process-
  environment" instead; no secret-guard denial encountered.
- Scratch under `/var/tmp/l57b4-FN0w` (from `mktemp -d /var/tmp/l57b4-XXXX`), left in place,
  nothing from it committed. TMPDIR=/var/tmp used throughout. No deletes, no git identity set,
  no --no-verify.

State file: /var/tmp/lane-57/test-ipc-57-state-r5.md
