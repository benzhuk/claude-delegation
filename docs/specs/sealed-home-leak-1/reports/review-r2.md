VERDICT: NEEDS_FIXES f8aa816

Lane 24, sealed-home-leak, delta re-review r2 of f8aa816 (branch head 742946b, which has no
`scripts/` change after f8aa816). F4 and R1 are deferred by the lead's ruling and not counted here.
Counts: 1 MAJOR (new), 1 NIT (new). F1, F2 and F3 are fixed in the source.

All runs used fresh scratch copies of f8aa816 under `scratchpad/rv24r2/`, with `TMPDIR` set to a
scratch dir for every run, including the gate. The real `/tmp/sealed-home*` count was 129 before and
129 after my runs. The worktree was only read.

Territory gate, run by the reviewer: `TMPDIR=<scratch> node --test scripts/test-home.test.mjs
scripts/run-tests.test.mjs` gives 39 pass, 0 fail, exit 0, and leaves 0 homes in the scratch
`TMPDIR`.

Cause: the new F1 regression test signals the process group as soon as the runner prints its home
path, which is before the sealed `node --test` child exists. That child never gets the signal and
runs the 10 s probe to a pass. `cleanup()` then removes the home and the deferred signal re-raises.
The test goes green without ever reaching the keep-on-a-killed-suite path, which is the one that
leaked.
Discriminating check: mutant m4 (only `setImmediate(keep)` changed back to `keep()`) passes all 13
tests in `run-tests.test.mjs`, yet the setsid probe on m4 gives rc=143 (group SIGTERM) and rc=130
(group SIGINT) with 1 home left each time.
Fix location: `scripts/run-tests.test.mjs`, `writeSlowProbe` and the F1 group-SIGTERM test (the
lines after `// F1 (review r1)` near the end of the file).
Simplification: no new mechanism. The probe drops a ready-marker file, and the test waits for it
before signalling.

## Prior findings: fix verification

### F1 (BLOCKER in r1): fixed in the source

`scripts/run-tests.mjs` now has `setImmediate(keep)` plus the `process.exitCode = main();
setImmediate(() => {});` bootstrap, as patched in r1. Probe table for f8aa816: a 15 s sleeping
probe run under `setsid`, signalled at 2 s, with `left` counting homes in the scratch `TMPDIR`:

| signal, target | rc | elapsed | left |
|---|---|---|---|
| SIGINT, group | 130 | 2.0 s | 0 |
| SIGTERM, group | 143 | 2.0 s | 0 |
| SIGHUP, group | 129 | 2.0 s | 0 |
| SIGTERM, pid only | 143 | 15.2 s (R1, deferred) | 0 |
| SIGINT, pid only | 130 | 15.2 s (R1, deferred) | 0 |
| failing probe, no signal | 1 | n/a | 1 (kept, RT-18/F6 holds) |
| passing probe, no signal | 0 | n/a | 0 |
| `--bogus` flag | 2 | n/a | n/a |

This matches the r1 prediction on every row. Mutant m3 (both F1 edits reverted) fails the new F1
test. The test still fails to guard half of F1: see N1.

### F2 (MAJOR in r1): fixed

The new test "the real CLI keeps a failed suite's home after the process has exited (RT-18/F6)"
matches the r1 patch. Mutant m1 on f8aa816 (`setImmediate(keep);` commented out): the CLI run gives
rc=1 with 0 homes left, and `run-tests.test.mjs` goes 12 pass, 1 fail. The one failure is this new
test, so it discriminates. The kept home sits under the injected `TMPDIR`, and `scratchDir`'s
after-hook removes it (0 left).

### F3 (MINOR in r1): fixed

The r1 scratch probe was rerun on f8aa816: stale dirs a to d, with b holding a `chmod 500` subdir,
plus a stale symlink `sealed-home-link` and a stale file `sealed-home-file`. Output: one line
`sweep could not remove .../sealed-home-b: EACCES`, then `swept 3 stale sealed homes`, returning
`{"swept":3,"skipped":false}`. Only b, the file and the symlink remain, and the symlink target's
file is intact. The outer-catch path now prints the count too. This matches the r1 prediction.

## N1 MAJOR: the F1 regression test does not guard the leak half of F1 (named bug class)

Evidence:
- In the gate, the F1 test takes **10176 ms**, which is the full probe timer, where a real signal
  path takes about 170 ms. The signal is sent before `node --test` is spawned (the home path is
  printed at `run-tests.mjs` `console.log(home)`, ahead of the canary). The suite therefore
  passes, and `cleanup()` removes the home no matter what the keep logic does.
- Mutant m4, where only `setImmediate(keep);` goes back to `keep();` and the CLI bootstrap fix stays:
  - setsid probe: SIGINT group gives rc=130 with **left=1**, SIGTERM group gives rc=143 with
    **left=1**. That is the r1 leak again: `node --test` exits 1, sync `keep()` unregisters the
    home, and the deferred signal then finds nothing to remove.
  - `run-tests.test.mjs` on m4 gives **13 pass, 0 fail**.
- This is "a check that passes because it isn't looking" again: the test only covers the half of F1
  that restores the exit code.

Fix: a mechanical patch to `scripts/run-tests.test.mjs`, verified on scratch copies.

1. `writeSlowProbe`. Current code:
```js
function writeSlowProbe() {
  const dir = scratchDir("run-tests-slow-probe-");
  const file = path.join(dir, "slow.test.mjs");
  fs.writeFileSync(
    file,
    [
      "import test from 'node:test';",
      "test('slow', async () => { await new Promise((r) => setTimeout(r, 10000)); });",
      "",
    ].join("\n"),
  );
  return file;
}
```
Replacement:
```js
function writeSlowProbe() {
  const dir = scratchDir("run-tests-slow-probe-");
  const file = path.join(dir, "slow.test.mjs");
  const ready = path.join(dir, "ready");
  fs.writeFileSync(
    file,
    [
      "import test from 'node:test';",
      "import fs from 'node:fs';",
      `test('slow', async () => { fs.writeFileSync(${JSON.stringify(ready)}, ''); await new Promise((r) => setTimeout(r, 10000)); });`,
      "",
    ].join("\n"),
  );
  return { file, ready };
}
```

2. In the F1 test. Current code:
```js
    const slowProbe = writeSlowProbe();
```
Replacement:
```js
    const { file: slowProbe, ready } = writeSlowProbe();
```

3. Current code:
```js
    process.kill(-child.pid, "SIGTERM"); // the whole group, as a closed pane / dropped ssh session does
```
Replacement:
```js
    // Signal only once the sealed suite child is really running the probe: sent earlier, the
    // signal lands before `node --test` exists, the suite then passes and cleanup() removes the
    // home anyway, so the keep()-on-a-killed-suite path this test guards is never reached.
    const deadline = Date.now() + 8000;
    while (!fs.existsSync(ready)) {
      if (Date.now() > deadline) throw new Error("the slow probe never started");
      await new Promise((r) => setTimeout(r, 20));
    }
    const sentAt = Date.now();
    process.kill(-child.pid, "SIGTERM"); // the whole group, as a closed pane / dropped ssh session does
```

4. Current code:
```js
    const { code, signal } = await exited;
```
Replacement:
```js
    const { code, signal } = await exited;
    assert.ok(Date.now() - sentAt < 5000, "the runner must die from the signal, not after the suite ran to completion");
```

Measured with this patch applied to scratch copies:
- f8aa816 plus patch: 13 pass, 0 fail. The F1 test drops from 10176 ms to **170 ms**, and 0 homes
  are left in the scratch `TMPDIR`.
- m4 (sync `keep()`) plus patch: 12 pass, **1 fail**. The F1 test fails with "the runner's own
  sealed home must not survive a group SIGTERM" (true !== false).
- m3 (both F1 edits reverted) plus patch: 12 pass, **1 fail**, on the F1 test.

The marker is written to an absolute scratch path from inside the sealed child. That works because
the seal redirects HOME and related vars, not absolute paths. Nothing touches the real `/tmp`: the
probe dir and `TMPDIR` both come from `scratchDir`. The existing SIGKILL group cleanup still covers
a hung child.

## N2 NIT: F3's per-entry continue has no unit test

The F3 fix is correct (measured above), but no test in `run-tests.test.mjs` would catch a revert.
r1 asked only for the patch, so this does not block. Optional: in `makeAgeSet`-style scratch
fixtures, add a stale `sealed-home-locked` dir holding a `chmod 500` subdir plus one more stale
removable dir. Assert that the removable one is gone, the output includes
`swept 2 stale sealed homes`, and an error line names the locked dir. Restore `chmod 700` in the
after-hook so `scratchDir` cleanup can remove it, and skip on win32 and when running as root, since
chmod does not deny root.

## Regression hunt (verified absent)

- The CLI exit codes 0, 1 and 2 are unchanged on the non-signal paths (measured above). If `main()`
  throws, it is still an uncaught exception and exits 1, as before.
- Programmatic `runSealed` callers are unaffected: the in-process keep test and
  `test-home.test.mjs:137` still pass. A failed home still exists when the call returns, because
  `keep` runs one tick later and nothing in the process exits in between.
- A signal that arrives during the canary `spawnSync` takes the same path. The canary exits
  non-zero or by signal, `keep` is deferred, and the handler removes the home and re-raises.
- The new F1 test runs a detached child with a SIGKILL group cleanup, and the F2 test uses a scratch
  `TMPDIR`. Neither reads the real `~/.agents`, and both pass `--no-sweep`.
- No `scripts/` change between f8aa816 and 742946b.

## Housekeeping

There is an untracked `docs/specs/sealed-home-leak-1/reports/build-r1-gate.tmp.log` in the
worktree. It is the builder's, and I did not touch it. The r1 leftovers `/tmp/sealed-home-Fy3ZUL`,
`/tmp/sealed-home-EfTKmv` and `/tmp/sealed-home-JWI86s` are still as reported in r1. This round's
runs added nothing to the real temp dir.
