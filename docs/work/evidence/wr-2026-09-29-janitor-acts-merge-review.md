VERDICT: APPROVE e97587f2be1aa62897a28e3ab9205baca5f76301

# Merge review: e97587f (origin/build/janitor-acts-59-1 @ a578741 into origin/main @ a57e2ff)

Scope: the lead's conflict resolution and the two F12 tests re-gated in
scripts/mirror-shared-skills.test.mjs, plus a check that nothing else differs from a clean merge.
Read-only on /home/ben/Code/wt-ws-mainbase: `git status --porcelain` showed 0 lines before and
after the test run, and HEAD stayed at e97587f. All trial edits went to a scratch clone at
/var/tmp/merge-review.15h8o2 (see "Scratch left behind").

No blocking or medium findings. There is one optional LOW strengthening, with a verified patch, and one cosmetic nit.

## 1. Nothing else differs from a clean merge: verified

`git merge-tree --write-tree a57e2ff a578741` (in the scratch clone) gives tree 17cca1c. It has
exactly one conflict, in scripts/mirror-shared-skills.test.mjs.
`git diff --stat 17cca1c e97587f`:

    docs/decisions/history/2026-09-29.md  |  2 ++
    scripts/mirror-shared-skills.test.mjs | 27 ++++++++++++++-------------

Beyond the clean merge there is only the one history bullet, at `2026-09-29.md` +16..17, and the test file. No other file was touched.

## 2. Conflict resolution lost nothing: verified

- Against the conflicted clean tree, the resolution does three things. It removes the three
  conflict markers, keeps the whole `ours` block (lane 39 notion-writing, test body unchanged) and
  the whole `theirs` block (lane 59 header onward, through the trailing `test.todo`), and adds one
  blank line plus the `// ───` separator between them.
- `git diff e97587f^1 e97587f -- <test>` removes exactly one line: the import line, which the
  auto-merge extended with `isLinkedWorktree` (merged lines 24-25). Nothing from main is dropped.
- `git diff e97587f^2 e97587f -- <test>` contains only main's additions (header comment,
  `spawnSync` import, the lane 39 block) and the two re-gates. Nothing from the lane is dropped.
- I counted top-level `test(`/`test.todo(` calls on each side: base 14, main 15, lane 38, merged 39,
  which is 14 + 1 + 24. The sorted merged title list is identical to the union of main's and the lane's
  (`diff` is empty).

## 3. The re-gate matches the script's gate exactly: verified

The script has this at scripts/mirror-shared-skills.mjs:571:
`if (isDurablePath(REPO) && !isLinkedWorktree(REPO))`. At :582 the else branch prints
`say('SKIP reclaim shim', isDurablePath(REPO) ? `${REPO} is a linked git worktree` : `${REPO} is not durable`)`.
The manifest carry-forward at :1239 uses the same predicate.

- Test 1 (test file :322) is in-process: `collectSources()` and the test's predicate call the same
  imported functions with the same `os.tmpdir()`/`os.homedir()`, so they match exactly.
- Test 2 (:380-389) spawns a child through `runFull` → `fakeCodexEnv` → `childEnv`. The child
  inherits TMPDIR, and only HOME differs. On isDurablePath, HOME only enters through
  `<home>/AppData/Local/Temp`, and the `(tmp|temp|...)/` segment regex also catches that path. So
  test and child agree. The expected reason string is a byte-for-byte copy of :582's ternary.

## 4. The re-gated tests still discriminate: verified by mutation on scratch copies

To reach the durable branches, I made isDurablePath return true for paths under the scratch dir, in
the scratch copies only. I used a main clone (not linked) and a `git worktree add` of it (linked).

| Case | lead's tests (e97587f) | lane-side tests (a578741) |
|---|---|---|
| non-durable (/var/tmp scratch, today's lanes) | 2/2 pass | 2/2 pass |
| durable + linked (this integration checkout's shape) | 2/2 pass; full file 42 pass / 0 fail / 1 todo | **2/2 FAIL** (the reason for the re-gate) |
| durable + main checkout | 2/2 pass; full file 42/0/1 | **test 2 FAILS** (see 5) |

Mutations run against the lead's tests:
- M1, durable+linked: :571 gate drops `&& !isLinkedWorktree(REPO)` → both F12 tests fail.
- M2, durable+linked: :582 reason text changed to "is a linked worktree" → test 2 fails.
- M3, durable main: :571 gate is `if (false)` → both fail.
- M4, durable main: the reclaim entry drops `target:` and falls back to shimTarget() → test 1 fails.

The tests look at the real outcome and do not pass by being skipped. The real checkout's own run is below:

    TMPDIR=/var/tmp node --test scripts/mirror-shared-skills.test.mjs
    tests 43, pass 42, fail 0, todo 1

## 5. The early `return` in the durable main-checkout branch: no assertion that held was lost

Before the merge, `assert.equal(fs.existsSync(<home>/.local/bin/reclaim), false)` ran on both
branches. In a durable main checkout it could never hold. A full run writes that very file. I ran
the installer directly with a fake home, forced durable, from the main clone:
`install PATH shim: <home>/.local/bin/reclaim -> <repo>/scripts/reclaim.mjs`, and the file exists
with `note_script="<repo>/scripts/reclaim.mjs"`. The lane-side test 2 fails on exactly that
`assert.equal` there (table above). No scratch lane ever took that branch, so this was a latent false
failure. The lead's `return` removes a wrong assertion, not a correct one.

### F1 (LOW, optional): the durable-main branch of test 2 could assert the positive outcome

Now the branch checks only that the output has no SKIP line. A correct replacement for the old check
exists: the shim IS written and targets this repo. Test 1 already covers the entry's target in
`collectSources()`, so this is extra depth, not a gap in the gate's coverage. That is why it does not block.

Current code (scripts/mirror-shared-skills.test.mjs:380-383):

```js
  if (isDurablePath(REPO) && !isLinkedWorktree(REPO)) {
    assert.ok(!json.actions.some((a) => a.includes('SKIP reclaim shim')));
    return;
  }
```

Replacement:

```js
  if (isDurablePath(REPO) && !isLinkedWorktree(REPO)) {
    assert.ok(!json.actions.some((a) => a.includes('SKIP reclaim shim')));
    // The durable main checkout is the one place the shim IS written, aimed at this repo's reclaim.mjs.
    const shim = path.join(home, '.local', 'bin', 'reclaim');
    assert.ok(fs.existsSync(shim), `${shim} must be written from a durable main checkout`);
    const posixTarget = path.join(REPO, 'scripts', 'reclaim.mjs').split(path.sep).join('/');
    assert.ok(fs.readFileSync(shim, 'utf8').includes(`note_script="${posixTarget}"`), 'the shim must target THIS repo');
    return;
  }
```

I applied this in the scratch clone and checked it three ways. Forced durable main: 2/2 pass, full
file 42/0/1. With M4 (target dropped): both fail. Non-durable: 2/2 pass. On win32 the extensionless
`sh` shim is written too, and `shimContent` (script :613, :625) writes the target in posix form, so
the check holds there as well. I did not run it on Windows.

### F2 (NIT, cosmetic): stale test titles

Test 1's title says "gated by isDurablePath(REPO)". Test 2's title says "a run from this
(non-durable) checkout prints ... is not durable". Both now cover the linked-worktree case too.
Suggested titles: `'F12: the reclaim shim is gated by isDurablePath(REPO) && !isLinkedWorktree(REPO), ...'` and
`'F12: a run from a non-durable or linked checkout prints the exact "SKIP reclaim shim: <REPO> ..." reason and writes no reclaim shim file'`.
This is optional and does not affect behavior.

## Bug-fix fields (the re-gate)

Cause: the two lane 59 F12 tests branched on `isDurablePath(REPO)` alone. The script gates on `isDurablePath(REPO) && !isLinkedWorktree(REPO)` (mirror-shared-skills.mjs:571). A durable linked worktree (this integration checkout) therefore took the "publish" expectations while the script printed "is a linked git worktree" and published nothing.
Discriminating check: in scratch, with durability forced, the lane-side tests fail 2/2 in a linked worktree and the lead's pass 2/2. Mutations M1-M4 each turn the lead's tests red. The real checkout gives 42 pass / 0 fail / 1 todo.
Fix location: scripts/mirror-shared-skills.test.mjs:322 (test 1 predicate) and :380-389 (test 2 predicate, early return, reason ternary). No product code changed.
Simplification: the tests use the script's own predicate and reason ternary verbatim. The optional F1 would replace the removed (and wrong) file-absence check in the durable-main branch with the positive file-presence check, instead of leaving that branch with only a negative check.

## Scratch left behind (none in the reviewed tree)

The reviewed tree is untouched. Following "delete nothing", I left these scratch items in place:
- /var/tmp/merge-review.15h8o2/ holds the clone, the linked worktree, the mutated copies and the outputs.
- /var/tmp/mr-linked.bak is a backup copy made one directory above the mktemp dir by a relative-path slip.
- /var/tmp/mr-home.* are two fake HOME dirs from the direct installer runs.
All of them can be removed at will.
