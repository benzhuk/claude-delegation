VERDICT: APPROVE a1be58949d77617e19f462a8277a89e0ca849281

APPROVE

# L1 review, round 3 (reviewed at a1be58949d77617e19f462a8277a89e0ca849281)

Scope: delta re-review of `ffc882f..a1be589` in `/home/ben/Code/wt-linux-green-1-L1`. The delta is one commit that touches only `skills/multi/scripts/transport.mjs` (+11/-14, all inside `mainCheckout`). I checked it against round 2's two findings (`reports/L1-review-2.md`) and hunted for regressions across the nine attack points. I read HEAD with `git rev-parse HEAD`. `git status --short` shows 0 lines, and no stray scratch worktree appears in `git worktree list`.

Result: both prior findings are closed, and the patch is round 2's patch applied verbatim. There are 0 blockers, 0 majors and 0 minors. One coverage question is still open for the lead (see Open question).

## Prior findings, verified

1. **MAJOR 1 (the UNC-start branch skipped normalisation): fixed.** `transport.mjs:437-448` now matches round 2's "New" block character for character (`git diff ffc882f..HEAD`). I measured it against the live module:
   - `mainCheckout('\\\\host\\share\\repo\\a\\b', () => '../../.git\n')` returns `//host/share/repo`. It returned `//host/share/repo/a/b/../..` at ffc882f.
   - `//host/share/repo/a/b/` with `../../.git` also returns `//host/share/repo`.
2. **MINOR 2 (an absolute common dir was not normalised): fixed.** `mainCheckout('C:/wt', () => 'C:/repo/x/../.git')` returns `C:/repo`. A UNC absolute common dir with backslashes and `..` (`\\host\share\repo\x\..\.git` from a `C:/wt` start) returns `//host/share/repo`.

## Bug-fix fields (mainCheckout half)

Cause: base `transport.mjs` composed a relative git common dir with the OS-native `path.resolve(start, c)`. On Linux, `path.resolve` does not treat a drive-lettered (`C:/...`) or UNC `start` as absolute, so it prefixed the process cwd and returned `<cwd>/C:/Users/benzh/Code/Zhuk Projects`.
Discriminating check: in a scratch copy of a1be589 (made with `git archive`, outside the reviewed tree), I swapped in base `4c29a2b`'s `transport.mjs` and ran `note-send.test.mjs`. It gave pass 113, fail 2. Both L1 H6 tests failed with actual `<scratch>/C:/Users/benzh/Code/Zhuk Projects`. With a1be589's `transport.mjs` in place, it gives 115/115. The fix is what turns them green.
Fix location: `skills/multi/scripts/transport.mjs:435-448`, inside `mainCheckout` only. It has three parts: the `normalise()` helper at :438, the absolute-common-dir branch at :440-441, and composition onto `start`'s own string at :442-445. The relative-`start` `path.resolve` fallback at :446-447 is unchanged.
Simplification: one UNC-safe `normalise()` serves both the already-absolute branch and the composed branch. It replaces the nested `cIsAbsolute` if/else, the UNC string-concatenation special case and the redundant `toPosix(path.posix.normalize(...))` wrapper. The function has three fewer lines, no platform branch and no new import.

Cause or compensation: this fixes the **cause**. `path.resolve` now runs only for a genuinely relative `start`, which is the one case where resolving against cwd is correct. Nothing hides the symptom. The UNC `'/'` re-prefix is not a compensation. It exactly inverts a known, deterministic `path.posix.normalize` behaviour (collapsing `//x` to `/x`), and it applies only when the input matches `^//[^/]`.

## The nine attack points (re-run at a1be589)

1. **Relative `start`**: `some/rel` + `.git` returns `<cwd>/some/rel`, and `some/rel/a` + `../.git` returns `<cwd>/some/rel`. This is still `toPosix(path.resolve(start, c))` (`:447`), unchanged.
2. **UNC `start` (the landmine)**: I traced the code. Every UNC string that reaches `path.posix.normalize` goes through `normalise()`, which restores the leading `/` when `isUNC(p)` holds. No other `path.posix.*` call touches `c` or `start`: `isAbsolute` is only a predicate. As the scout said, `path.posix.normalize('//host/share/foo/')` prints `/host/share/foo/` on this host. Measured: `\\host\share\repo\a\b` and `//host/share/repo/` with a trailing slash both return `//host/share/repo`, and the extended-length `//?/C:/repo/a` + `../.git` returns `//?/C:/repo`.
3. **Already-absolute common dir**: POSIX `/home/r/.git/` returns `/home/r`, drive `C:/repo/x/../.git` returns `C:/repo`, UNC `//host/share/repo/.git/` returns `//host/share/repo`, and `/home/r/.git/worktrees/wt/../..` returns `/home/r`. Each is used as-is (never composed onto `start`), normalised and stripped of its trailing slash. No `path.resolve` runs for any of them.
4. **Trailing slash**: stripped on every branch. Measured: drive start `C:/repo/`, UNC start `//host/share/repo/`, absolute `.git/`, and relative-resolve (`path.resolve` drops trailing slashes).
5. **V4 positive control**: `mirror-shim.test.mjs` is untouched this round (`git diff ffc882f..HEAD --stat` shows only transport.mjs). Round 2's two mutation checks (forced copy mode, and a no-op `publishSymlink`) still hold. Both failed as expected.
6. **H6 worktree case**: `note-send.test.mjs:363-365` is unedited. The diff from base only adds lines 371-376. `mainCheckout('C:/wt', () => 'C:/Users/benzh/Code/bto_nucleus/.git')` returns `C:/Users/benzh/Code/bto_nucleus`, and the test passes.
7. **New H6 test** (`note-send.test.mjs:371-376`): unchanged since ffc882f. It has no platform branch, uses the drive-lettered start with a bare `.git\n` runner, and fails at base (see the discriminating check).
8. **Diff scope**: `git diff --stat 4c29a2b..HEAD` shows only `mirror-shim.test.mjs` (+37/-7), `note-send.test.mjs` (+7) and `transport.mjs` (+16/-1). `scripts/mirror-shared-skills.mjs` is untouched.
9. **N2**: `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs` gives tests 1, pass 1, fail 0.

My own gate run at a1be589: `node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/mirror-shim.test.mjs` gives tests 137, pass 137, fail 0. The full `run-tests.mjs` suite is not mine to run; that belongs to the integrator.

Other edge cases, all clean: an empty or whitespace-only common dir returns `start`, a throwing runner returns `start`, and an empty `dir` returns `null`. These are unchanged from base.

## Open question for the lead (not counted; not a builder defect)

**The UNC landmine guard has no test.** On the scratch copy, I mutated `:438` to `const normalise = (p) => path.posix.normalize(p);`, which deletes the `//` restore. `mainCheckout('//host/share/repo/a/b', () => '../../.git')` then returned `/host/share/repo`, the landmine the scout named, yet `note-send.test.mjs` still passed 115/115. So the only line that defuses the scout's landmine could regress silently.

The builder was right not to add the test: `briefs/L1.md:83` says "Add exactly one new H6 test", and round 2 routed the exception to the lead. I recommend the lead allow round 2's proposed second test. It has no platform branch, fails under the mutation above and passes at a1be589:
```js
test('H6: a UNC checkout run from a subdirectory keeps its leading // and is normalised (L1)', () => {
  assert.equal(mainCheckout('\\\\host\\share\\repo\\a\\b', () => '../../.git\n'), '//host/share/repo');
});
```

## Observations (not counted)

- The builder report's line 1 is still `VERDICT: PASS`, which is outside the APPROVE/NEEDS_FIXES vocabulary. `L1-gate.log` still holds only the N2 run, because the brief's gate redirects only the second command. Both were already noted in round 2 and are process issues, not code issues.
- There is a pre-existing issue that neither base nor L1 introduced: the unchanged final line `c.replace(/\/?\.git\/?$/, '')` treats the slash as optional, so a checkout or bare repo whose name ends in `.git` loses the suffix. Measured: `C:/bare.git` + `.` returns `C:/bare`. It is outside L1's scope and a candidate for a later lane.
- Also out of map: round 2's `note-send.mjs:453` `path.posix.join` UNC collapse still stands.
- Scratch copies live only in the session scratchpad. Nothing was written to the reviewed tree.
