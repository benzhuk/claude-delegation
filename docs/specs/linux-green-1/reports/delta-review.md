VERDICT: NEEDS_FIXES de019ecec82499fe6c09e821f033d272a5998e25

# Delta review: d93e3f2..de019ec (registered-pickup.contract.test.mjs)

Scope: `git diff d93e3f2 de019ecec82499fe6c09e821f033d272a5998e25`, one file, +3/-1, test-only.
HEAD of /home/ben/Code/wt-lg was verified at de019ec. The reviewed tree was not written to. All
mutation work ran on a `git archive` copy in the session scratchpad.

Findings: 1 (Medium). The comparator change is correct and it does fix the integrator flake. It
should stay. The one finding is about question (2): the "ordinal selects canonical order, not
creation order" assertion still has only about a 5-10% chance per run of catching a creation-order
implementation. The test is not tautological, but it is mostly toothless, and a one-line fixture
change (verified below) makes it deterministic.

## C4 fields

Cause: The test built its expected order with `String.prototype.localeCompare` (ICU collation, case-insensitive at the primary level). The implementation sorts with a code-point `<`/`>` compare of `${canonicalPathKey(repo)}\0${page}` (decisions-pickup.mjs:649-653, canonicalPathKey at :573-576). The two repo dirs share `registered-project-` and then differ at mkdtemp's random `[A-Za-z0-9]` suffix versus the literal `two-`. When the first-created repo's suffix begins with `U`-`Z` (and some `T` cases), code-point order puts it before `two-` (uppercase is below `t`), while locale order puts it after. The test's `canonical[1]` then names the wrong entry. That is roughly 6/62, about 10%, per run. The integrator's 1-in-5 is within sampling variance of that.
Discriminating check: A scratch script (fixed-name repo dirs, the real `runRegisteredPickup`, `selectIndex: () => 1`) compared which entry the implementation picked with each comparator. Suffix `Vabcde`: old DISAGREE / new agree. `Tzzzzz`: old DISAGREE / new agree. `Uqrstu`: old DISAGREE / new agree. `aBcdef`, `zzzzzz`, `0abcde`: both agree. The old comparator disagrees with the implementation exactly on the predicted uppercase-U-Z/T suffixes, and the new comparator agrees on every case. This is the cause, not a compensation. After the fix, the real tree passed 30/30 runs of `node --test skills/decisions/scripts/registered-pickup.contract.test.mjs`.
Fix location: skills/decisions/scripts/registered-pickup.contract.test.mjs:108-110 (expected-order construction). The implementation is correct and needs no change.
Simplification: The random suffix is the only thing that decides the order. If the second fixture's prefix sorts before `registered-project-` under both collations (for example `a-registered-project-two-`), canonical order is always `[second, fx.entry]`, the reverse of creation order. The comparator question then stops mattering, and the creation-order mutant is killed on every run (see F1).

## Answers to the brief's questions

(1) Cause or compensation: the cause. See the Discriminating check above. The new comparator uses
the implementation's exact key and relation (`<`/`>` on the `\0`-joined string), so it matches the
implementation's semantics rather than papering over them.

(2) Is it still a test? It is not tautological. `canonical` is computed from the fixture inputs,
not from the implementation's output, so a wrong implementation order can fail it. But it rarely
does. Mutation on a scratch copy (decisions-pickup.mjs:649 changed to `return entries;`, which is
creation order) failed only 2 of 40 runs. That is because creation order and canonical order agree
whenever the first repo's suffix sorts before `two-`, which is about 90% of suffixes. This was
already true at d93e3f2 and was not introduced by the delta, but it is the property the brief says
"must" hold, and it does not hold reliably. See F1.

(3) Windows: matches exactly. The test's key is
`process.platform === 'win32' ? path.normalize(e.repo).toLowerCase() : path.normalize(e.repo)`,
which is character-for-character the body of `canonicalPathKey` (decisions-pickup.mjs:573-576).
The implementation applies it to `boundRepo = fs.realpathSync(path.resolve(repo))` (:54-59). The
test applies it to `e.repo`, which is `mkdtempSync(path.join(fixtureRoot, ...))`, and `fixtureRoot`
is already `fs.realpathSync`'d by makeTempHome (scripts/test-home.mjs). The two strings are
therefore identical on Linux and macOS (the /var to /private/var move is already absorbed), and
equal after lowercasing on win32. Any short-name expansion or case change realpath could make on
Windows would fall in the shared prefix, which cannot affect the relative order. The page
tiebreak is never reached because the repos always differ. Residual: the key is duplicated rather
than imported (`canonicalPathKey` is not exported). That is acceptable for an independent contract
test, and F1 makes it irrelevant.

(4) Same pattern elsewhere in skills/decisions and skills/multi: none. `localeCompare` appears
once, in implementation code (skills/multi/scripts/transport.mjs:1044, sorting ISO `createdAt`
strings, where locale and code-point order agree for uniform ISO-8601). No test builds an expected
order with it. Every other `.sort()` in the tests of those two trees is a default (code-point)
sort compared against a fixed literal array, i.e. set-equality checks with no comparator mismatch.
Listed for completeness: decisions-archive.contract.test.mjs:97,99; decisions-read.test.mjs:583,625,645;
decisions-pickup.test.mjs:683; pane-binding.test.mjs:163,661; hooks.test.mjs:70,446;
note-inbox.test.mjs:104,345; note-flush.test.mjs:285; envelope.test.mjs:299;
inbox.test.mjs:251,279,296,300,310,323.

## F1 (Medium): the ordinal assertion kills a creation-order implementation only about 5-10% of the time

Evidence: registered-pickup.contract.test.mjs:104 creates the second repo with the prefix
`registered-project-two-`. It sorts against `fx.repo` (`registered-project-XXXXXX`) purely by the
random first suffix character. Scratch mutation (implementation returns entries in creation order):
2 of 40 runs failed. The assertion message at :118 claims "not fixture creation order", which the
test only checks probabilistically. The held-claim block at :131-137 carries a matching comment
saying the random suffix decides ordinal 0.

Fix: give the second repo a prefix that sorts before `registered-project-` under both code-point
and locale collation, so canonical order is always the reverse of creation order. Keep the delta's
comparator; it stays correct and becomes belt-and-braces.

Current (line 104):
```js
  const repo2 = fs.mkdtempSync(path.join(fx.fixtureRoot, 'registered-project-two-'));
```
Replacement:
```js
  // Prefix sorts before fx.repo's 'registered-project-' under any collation, so canonical order is
  // always [second, fx.entry] — the reverse of creation order — and the ordinal assertion bites every run.
  const repo2 = fs.mkdtempSync(path.join(fx.fixtureRoot, 'a-registered-project-two-'));
```
Also update the now-stale comment at the claim pre-seed (the two lines just above the
`receiptPaths(...)` call):
Current:
```js
  // Pre-seed the claim for whichever entry canonical sort actually placed at ordinal 0 —
  // mkdtempSync's random fixture-directory suffix, not creation order, decides that.
```
Replacement:
```js
  // Pre-seed the claim for the entry canonical sort places at ordinal 0 (the second-created repo).
```

Measured outcome of this exact patch on the scratch copy: with the creation-order mutant, 15/15
runs failed with `ordinal selects canonical repo/page order, not fixture creation order` (actual
`fedcba98...`, expected `01234567...`). With the real implementation at de019ec, 15/15 runs passed.
Nothing else in the file references the `registered-project-two-` prefix.

## Verified absent

- The delta introduces no regression: the diff is confined to the expected-order computation, and
  the claim pre-seed (`canonical[0]`) now consistently names the entry the implementation places at
  ordinal 0. The whole file passed 30/30 on the reviewed tree.
- No other test in skills/decisions or skills/multi mirrors an implementation order with a
  mismatched collation.
