VERDICT: APPROVE 3ff71ef

# Lane 46 (test-temp-hygiene) delta review r2

Scope: `git diff 2455f1d..3ff71ef`, read against lead-ruling-r1.md (R1, R2, and "apply as patched") and reports/build-r1.md. The commits after 3ff71ef are docs only; `git diff --stat 3ff71ef..HEAD -- scripts` is empty.

I worked on a `git archive 3ff71ef` copy in `lane-46/rev2-QBmmt1`. Its temp dir was `lane-46/tmp2-6jKMYC`, and the mutation harness and pristine copy were in `lane-46/mut2-*`. All three were made with mktemp -d. The worktree was never touched.

Baseline on the copy: `node --test scripts/run-tests.test.mjs scripts/test-home.test.mjs`, with TMPDIR pointed at the scratch dir, gave 54 tests: 53 passed, 0 failed, 1 skipped. The scratch temp dir was empty afterwards.

## Prior findings, one by one

- **M1 (symlinked temp dir deleted the kept home): fixed.** It is verbatim at run-tests.mjs:339-353, and the regression test is at run-tests.test.mjs:770-793. Reverting `full = path.join(realRoot, name)` to the old `path.resolve(path.join(root, name))` fails exactly `P2: a failing run under a SYMLINKED temp dir still keeps the sealed home` (25 pass / 1 fail).
- **M2 (regex missing prefix families): fixed.** A `grep -F` confirms the extended alternation at run-tests.mjs:299 is byte-identical to the r1 patch. The doc comment lists the added families.
- **M3 (Windows leak red): resolved by the lead** as concurrent runs (lead-finding-windows.md). R1 removes its effect on the gate. Nothing further to check from Linux.
- **m1 (EPERM untested): fixed.** The EPERM test is verbatim. Replacing `isPidAlive`'s catch with `return false` now fails the P3 test (25 / 1). In r1 that mutation survived.
- **m2 (empty root left when no home was made): fixed.** The `else if (home) … else removeRootBestEffort()` branch is verbatim at run-tests.mjs:459-461. There is no test for it, and the ruling asked for none. Reaching it needs `makeTempHome` to throw.
- **m3 (only directories snapshotted): fixed.** The `isDirectory()` guard is dropped at run-tests.mjs:310. See NIT 1: the change is not pinned by a test.
- **m4 (comment understated false-red sources): fixed.** The comment above `LEAK_PREFIX_RE` now names both concurrency sources, legacy runners and a direct `node --test <file>` from another session. It also states that the unit tests are the gate.
- **n2 (pin "directly under"): fixed.** It is `assert.equal(path.dirname(root), fs.realpathSync(tmp))`.
- **n3 (skipped return missing a field): fixed.** The skipped return now has `sweptRoots: 0`, and both ws-off tests pin the new shape.
- **R1 (leak check becomes a reader):**
  - `main` now contains no statement that assigns `code` after `runSealed` returns. The only assignments are `code = await runSealed(...)` and `code = 1` in the throw catch, and both run before the leak check. The leak line is a plain `console.log` at run-tests.mjs:472.
  - A failing suite's own code is returned unchanged, and a leak cannot change a 0.
  - The CLI test now asserts `r.status === 0` together with the red line.
  - Mutation: adding back `if (!nestedRun && describeLeak(before, after).leaked && code === 0) code = 1;` fails exactly that test (25 / 1).
  - docs/census.md is updated as ruled.
- **R2 (nested run is not checked):**
  - `nestedRun = TEST_RUN_ROOT_RE.test(path.basename(os.tmpdir()))` is computed before this run's own root exists.
  - Both snapshots are skipped (`before`/`after` are null and are never passed to `describeLeak`). Exactly `leak check: nested run, not checked` is printed.
  - Mutation: `nestedRun = false` fails exactly the new R2 test (25 / 1).

## Regression hunt

- **Can R2 wrongly fire on a top-level run? No.** It fires only when the last component of the caller's own temp dir starts with `delegation-test-run-<digits>-`.
  - That name comes only from this runner's `mkdtempSync`. The top-level cases never match: `/tmp` gives `tmp`, Windows gives `Temp`, and a Claude-session temp dir gives `claude-1000`/session dirs. `os.tmpdir()` strips any trailing separator, and `path.basename` is platform-aware on win32.
  - A run nested one level deeper (TMPDIR = `<root>/sub`) is not flagged. It snapshots `sub`, where siblings do not mkdtemp, so it is not a false red either.
  - The in-process `main()` tests run under `withInjectedTmp` (`run-tests-main-tmp-*`), so they stay unnested and are still checked.
  - The planted-leak CLI test is itself a top-level-shaped run (TMPDIR = `run-tests-leak-cli-tmp-*`). It still prints the counted line, which proves a normal run is not misclassified.
- **Does R1 leave any exit-code coupling? No.** See the R1 item above.
- **Does anything else change behaviour?** The removal paths, the signal guard, the sweep and the seal are unchanged apart from the patched lines. `realRoot` falls back to the raw spelling only if `realpathSync` throws right after a successful `readdirSync`, which is the old behaviour. `path.join(realRoot, name)` still addresses only direct entries of the root, so r1's check that removal never escapes the root still holds.
- **Do the new tests touch the real /tmp?** No. The R2 test's `delegation-test-run-999999-*` is created inside a `scratchDir`, which is the outer root under the runner or a `run-tests-nested-outer-*` subdir when the file is run directly. It is never a top-level entry the sweep could see, and it is cleaned in `test.after`. The symlink test uses scratch dirs only.

## NIT

1. m3 is not pinned. Mutating `snapshotLeakNames` back to `entry.isDirectory() && LEAK_PREFIX_RE.test(...)` still passes the whole file (26 pass / 0 fail). build-r1.md says this openly ("only ever plants a directory"). The ruling did not ask for a test, so this does not block. Optional patch in `the leak check is silent when clean and goes red on a planted leak…`. Before the `fs.rmSync(leakDir, …)` line, add:
   ```js
   const leakFile = path.join(tmpDir, "goal-file-leak.json");
   fs.writeFileSync(leakFile, "{}");
   assert.match(describeLeak(before, snapshotLeakNames(tmpDir)).line, /goal-file-leak\.json/, "a leaked FILE must be seen too (m3)");
   fs.rmSync(leakFile, { force: true });
   ```
   Predicted result: it fails under the directories-only mutation and passes at 3ff71ef.

## Commands run

- `git log --oneline -6`, `git status --short`, `cat lead-ruling-r1.md`, `git diff --stat 2455f1d..3ff71ef`, `git diff 2455f1d..3ff71ef -- scripts/ docs/census.md`
- `git -C wt archive 3ff71ef | tar -x -C lane-46/rev2-QBmmt1`
- `git -C wt show 3ff71ef:scripts/run-tests.mjs | grep -F -c '<r1 regex tail>'`, which returned 1
- `TMPDIR=<tmp2> node --test scripts/run-tests.test.mjs scripts/test-home.test.mjs` on the copy: 54 tests, 53 pass, 1 skip, and the temp dir was empty afterwards
- `lane-46/mut2-*/mut.sh` with seven mutations. Each one copied the pristine file back and confirmed the restore with `cmp`.
  - R2-revert: caught
  - M1-revert: caught
  - R1-reforce: caught
  - m1-eperm-dead: caught
  - m3-dirs-only: survived (NIT 1)
  - One m2 mutation of mine had a syntax error. I discarded its result and the file was restored. m2 has no test, by the ruling.
- `grep` of build-r1.md for its m3, R1 and R2 claims, and `git diff --stat 3ff71ef..HEAD -- scripts` (empty)

Denied commands: none this round.
