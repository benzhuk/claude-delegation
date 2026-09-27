VERDICT: APPROVE 121eb52fbf073643511f4fd8e528c3ef92c4865a

# collect-status-1 seam review r2 (delta: m1 fix)

Scope: `git diff 1542f8c..121eb52 -- scripts/` only. Two files changed:
`scripts/collect-status.mjs` (+10 -1) and `scripts/collect-status.test.mjs` (+17 -0).
Worktree HEAD at review time: 121eb52fbf073643511f4fd8e528c3ef92c4865a. Nothing in the worktree was
modified. The mutation check ran on a `git archive` extract in the session scratchpad.

Findings: 0 blocking, 0 major, 0 minor, 1 info.

## (1) Is the patch exactly m1's? YES, byte for byte

- `scripts/collect-status.mjs:40-42` adds the comment and the `NOTE_STATE_TOKENS` Set. The text is
  identical to seam-review-r1.md:144-146, and it sits right after the `assertFieldSafe` import (`:38`),
  where m1 said to put it.
- `scripts/collect-status.mjs:190-195` replaces the old one-line `kv` builder with the `safeByState`
  loop plus the new `kv`. The text is identical to seam-review-r1.md:158-163.
- The allowlist matches the source of truth exactly. `computeState` (`scripts/collect-from-origin.mjs:111-117`)
  returns only accepted-merged, accepted-unmerged, withdrawn, rejected and owned, and `noRecordRow`
  (`:129`) returns no-record. Those are the six tokens in the Set. None is missing and none is extra,
  so no real state is renamed to "other".

## (2) Does the test discriminate? YES, measured

New test: `scripts/collect-status.test.mjs:445-460`. It injects `collectMain` with one row whose
state is `"evil;$(id)"`, then checks that `--text` matches `/other=1/` and does not match `/evil/`.

Mutation run: I extracted 121eb52 with `git archive` into the scratchpad, overwrote only
`scripts/collect-status.mjs` with its 1542f8c content (`diff` confirmed the only difference was the
m1 hunks), and ran `node --test scripts/collect-status.test.mjs`:

```
✖ K2 allowlist: a state outside collect-from-origin's names reaches --text only as other (seam m1)
ℹ pass 24
ℹ fail 1
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /other=1/. Input:
    actual: '1 lanes on origin: evil;$(id)=1, attention 0',
```

So without the fix the test fails, and it fails on exactly the leak m1 described. The other 24 tests
still pass without the fix, as m1 predicted. Afterwards I put the 121eb52 content back into the
scratch copy and confirmed it with `diff -q`.

## (3) Can any other origin-supplied string still reach --text or --goal? NO

These are every value that enters the note argv (`scripts/collect-status.mjs:189-201`, `buildNoteArgv` `:161-169`):

- `--text` = `${n} lanes on origin: ${kv || "none"}, attention ${m}`.
  - `n = rows.length` and `m = attention.length` are array lengths, so they are integers.
    `computeAttention` (`:97`) always returns an array.
  - `kv` keys are now only allowlisted tokens or the literal `other`. Its values are
    `Number.isInteger(v) ? v : 0`, so no string value survives. Before the fix, a prototype-named
    state could smuggle in a non-integer value; see i1.
- `--goal` = `status at ${statusMdPath}`, with `statusMdPath = path.join(outDir, "status.md")` (`:322`).
  `outDir` comes from operator `--out` or from `home` plus `basename(repo)` (`:65-66`). No origin
  data is involved, and `safeGoalOrNull` (`:152-159`) still runs it through `assertFieldSafe`.
- The other argv fields are `--from` (the sanitized host), `--to` (an operator flag), and
  `--recipient-repo` (the resolved operator `--repo`). They are fixed literals or operator input,
  not origin data.
- Branch names, record paths and tip SHAs reach only `computeChangeKey` and `computeAttention`
  entries. They never reach `sendNote`'s string building.

Verified absence: no origin-supplied string reaches `--text` or `--goal` at 121eb52.

## (4) Did any existing test expectation change? NO

`git diff 1542f8c..121eb52 -- scripts/collect-status.test.mjs` has 17 additions and 0 removed lines.
It is purely additive: one new `test(...)` block, inserted between two existing tests.

## (5) Does `node --test scripts/collect-status.test.mjs` pass? YES

Run in the worktree at 121eb52: tests 25, pass 25, fail 0, duration about 4.2 s. That is the 24
tests from r1 plus the new one.

## Info

### i1 (info, non-blocking): prototype-named states are undercounted, but nothing leaks

`computeByState` (`scripts/collect-status.mjs:80-84`) builds its counts on a plain `{}`. I probed
this in the scratchpad by running the real `computeByState` and a verbatim copy of the patch's loop:

- state `"constructor"` or `"toString"`: raw byState gets `"function Object() { [native code] }1"`.
  After the patch this becomes `other=0`: it is counted as zero, and nothing leaks.
- state `"__proto__"`: the assignment sets the prototype instead of an own key, so the row
  disappears from byState. `other` is not emitted at all. Nothing leaks.

The fix does its K2 job, because no string reaches `--text`. Only the "other" count is wrong, and
only for a state that `computeState` cannot produce today. If anyone wants to tidy it later, change
`const out = {};` at `:81` to `const out = Object.create(null);`. The predicted outcome is that the
"constructor" row counts as `other=1` and the "__proto__" row counts as `other=1`, with no change to
any existing test, because those tests use only real states. This does not block approval.

## C4 fields

Cause: `sendNote` built `--text` from every key of `byState`, which is taken directly from collect-from-origin's `r.state`, with no K2 allowlist (1542f8c `scripts/collect-status.mjs:186`).
Discriminating check: with only `scripts/collect-status.mjs` reverted to 1542f8c in a scratch extract, the new test fails with actual `'1 lanes on origin: evil;$(id)=1, attention 0'`. At 121eb52 it passes (25/25).
Fix location: `scripts/collect-status.mjs:40-42` (NOTE_STATE_TOKENS) and `:190-195` (safeByState fold before `kv`).
Simplification: a single fixed Set of six token names plus a fold into "other" replaces trusting the upstream state vocabulary. There is no new abstraction and no change to the note format for real states.
