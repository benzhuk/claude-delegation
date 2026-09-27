VERDICT: NEEDS_FIXES 2812595

Lane 24, sealed-home-leak, review round 1. Diff `0c92605..2812595 -- scripts/`, spec
`docs/specs/sealed-home-leak-1/spec.md`. Counts: 1 BLOCKER, 1 MAJOR, 1 MINOR, 1 NIT, 1 residual note.

Territory gate, run by the reviewer: `node --test scripts/test-home.test.mjs scripts/run-tests.test.mjs`
gives 37 pass, 0 fail, exit 0. The gate is green, but it never exercises the case the spec is about,
which is the runner process itself being killed (F1). All experiments ran on extracted copies of
2812595 (`n2`) and 0c92605 (`o2`) under the scratchpad with `TMPDIR` set to a scratch dir. The
worktree was only read.

Cause: the `run-tests.mjs` runner spends the whole suite blocked in `spawnSync`, so the new JS
signal handler cannot run while the suite runs. After the child returns, the sync `finally` calls
`keep()` on the non-zero status, and `process.exit(main())` then exits before the event loop can
deliver the deferred signal. The runner's own home still leaks, and the signal is swallowed.
Discriminating check: `setsid node scripts/run-tests.mjs --no-sweep slow.test.mjs`, wait 2 s,
`kill -INT -- -$pgid`. At 2812595 this gives rc=1 with 1 sealed home left. With the F1 patch it
gives rc=130 with 0 left.
Fix location: `scripts/run-tests.mjs:172` (`keep();`) and `scripts/run-tests.mjs:212`
(`process.exit(main());`), plus a new CLI-level test in `scripts/run-tests.test.mjs`.
Simplification: no new mechanism. Give the loop one turn before exit, and apply `keep()` on that
turn, so the handler already installed by `test-home.mjs` does the cleanup and the re-raise.

## F1 BLOCKER: the runner's own home still leaks on every kill, and the signal is swallowed (named bug class)

Evidence: `scripts/run-tests.mjs:155` (`spawnSync` of the suite), `:165-174` (`finally` then `keep()`),
`:212` (`process.exit(main())`). Probe: a test file that sleeps 15 s, run through the real CLI under
`setsid`, then signalled at 2 s. `left` counts `sealed-home-*` in the scratch `TMPDIR` after exit.

| build | signal, target | rc | elapsed | left |
|---|---|---|---|---|
| 0c92605 (old) | SIGINT, group | 130 | 2.0 s | 1 |
| 0c92605 (old) | SIGTERM, group | 143 | 2.0 s | 1 |
| 0c92605 (old) | SIGHUP, group | 129 | 2.0 s | 1 |
| 0c92605 (old) | SIGTERM, runner pid only | 143 | 2.0 s | 1 |
| 2812595 | SIGINT, group | **1** | 2.0 s | **1** |
| 2812595 | SIGTERM, group | **1** | 2.0 s | **1** |
| 2812595 | SIGHUP, group | **1** | 2.0 s | **1** |
| 2812595 | SIGTERM, runner pid only | **0** | **15.2 s** | 0 |
| 2812595 | SIGINT, runner pid only | **0** | **15.2 s** | 0 |

What goes wrong:
- `node --test` handles SIGINT, SIGTERM and SIGHUP itself and exits with status 1. The runner
  reads that as a failed suite, calls `keep()`, and prints "leaving the sealed home for
  inspection". Ctrl-C, a closed pane and a dropped ssh session all still leak the runner's home.
  That is the exact defect the spec names at `run-tests.mjs:101-106`, and the spec's goal ("never
  outlives its suite") is not met. Test-file homes are now cleaned: with a probe that makes 2
  homes, a group SIGINT leaves 3 on the old build and 1 on the new one. Only the runner's home is
  left.
- Regression: the exit code was 128+n and is now 1, so a Ctrl-C'd run looks like a test failure.
- Regression, and the named bug class ("an unknown rendered as a confident number"): when a SIGTERM
  reaches only the runner, the handler that makeTempHome now installs replaces the default action.
  The runner then waits for the whole suite and exits **0**. Before this change it died at once with
  143. A supervisor that sends SIGTERM to the gate process gets back a green exit code from a run it
  killed.
- The shipped signal tests (`test-home.test.mjs:417-433`) use a child with an idle event loop
  (`setInterval`). The runner never looks like that, so the tests pass without looking at the path
  that leaked.

Fix (mechanical, verified in a scratch copy `p3`). Exact current code, then its replacement:

`scripts/run-tests.mjs:172`
```js
      keep();
```
becomes
```js
      // Deferred one loop turn: a SIGINT/SIGTERM/SIGHUP that arrived while spawnSync blocked is
      // delivered on that turn first, and test-home's handler removes this still-registered home and
      // re-raises. With no signal, keep() runs and the failed home survives the exit handler (RT-18/F6).
      setImmediate(keep);
```

`scripts/run-tests.mjs:211-213`
```js
if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? "")) {
  process.exit(main());
}
```
becomes
```js
if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? "")) {
  process.exitCode = main();
  // One loop turn even when nothing is scheduled: signal handles are unref'd, so without this a
  // signal that arrived during spawnSync is never delivered and the run exits with the suite's code.
  setImmediate(() => {});
}
```

Measured result with both edits (scratch copy, Node 24.18.1, Linux):

| signal, target | rc | left |
|---|---|---|
| SIGINT, group | 130 | 0 |
| SIGTERM, group | 143 | 0 |
| SIGHUP, group | 129 | 0 |
| SIGTERM, pid only | 143 (after 15.2 s, see R1) | 0 |
| SIGINT, group, with a probe that makes 2 test homes | 130 | 0 |
| failing probe, no signal | 1 | 1 (kept, RT-18/F6 holds) |
| passing probe, no signal | 0 | 0 |
| unsupported flag | 2 | n/a (unchanged) |

Both edits are needed. Without the `setImmediate(() => {})` line, pid-only SIGTERM on a passing
suite still returned rc=0, because the loop had nothing ref'd and never polled. The programmatic
callers (`test-home.test.mjs:137`, the `runSealed` tests in `run-tests.test.mjs`) still see the
failed home right after the call, since `keep` runs one tick later.

Required regression test, to add to `scripts/run-tests.test.mjs` and skip on win32 with the existing
reason: spawn the real CLI with `spawn(NODE, [RUN_TESTS_MODULE, "--no-sweep", slowProbe], { detached:
true, env: { ...env without NODE_TEST_CONTEXT, TMPDIR: scratchDir(...) } })`, where `slowProbe` is a
test that awaits a 10 s timer. Read the home from stdout line 1, then call
`process.kill(-child.pid, "SIGTERM")` so the whole group gets it, as a pane close does. Assert that
the child's exit `signal === "SIGTERM"` (or that `code` is 143) and that the home is gone. At 2812595
this test fails: code 1, home present. With the patch it passes.

## F2 MAJOR: the keep-on-failure test does not test keep-on-failure

Evidence: `scripts/run-tests.test.mjs:97-104` checks `fs.existsSync(home)` in-process, right after
`runSealed` returns, which is before any `exit` handler could run. Mutation on a scratch copy
(`m1`): `scripts/run-tests.mjs:172` `keep();` changed to `// keep();`. Result: `run-tests.test.mjs`
passes 11 of 11. Running the mutant CLI on a failing probe gives rc=1 with **0** homes left, so the
failed suite's home is deleted and RT-18/F6 is broken while every test stays green. The companion
test at `test-home.test.mjs:435-450` proves that `keep()` works in isolation, not that `runSealed`
calls it.

Fix: add a CLI-level test next to the one at `run-tests.test.mjs:259`:
```js
test("the real CLI keeps a failed suite's home after the process has exited (RT-18/F6)", () => {
  const probe = writeProbe(false);
  const tmp = scratchDir("run-tests-keep-tmp-");
  const env = { ...process.env, TMPDIR: tmp };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(NODE, [RUN_TESTS_MODULE, "--no-sweep", probe], { env, encoding: "utf8" });
  assert.notEqual(r.status, 0);
  const home = r.stdout.split("\n")[0].trim();
  assert.ok(home.startsWith(fs.realpathSync(tmp)), "the home must be under the injected TMPDIR");
  assert.ok(fs.existsSync(home), "the exit handler must not delete a failed suite's kept home");
});
```
(`spawnSync` needs adding to the `node:child_process` import at `:13`.) Predicted result: passes at
2812595 and with the F1 patch; fails on the `m1` mutant, where the scratch run gave rc=1 with 0
left. `scratchDir`'s after-hook removes the kept home, so nothing leaks into the real `/tmp`.

## F3 MINOR: one directory it cannot remove aborts the whole sweep, and the partial count is not printed

Evidence: `scripts/run-tests.mjs:74-76` calls `rmSync` inside the single outer `try`. Scratch probe:
4 stale dirs a to d, where d is a `sealed-home-*` dir holding a `chmod 500` subdirectory (the same
thing a 0700 `sealed-home-*` owned by another user on a shared `/tmp` produces). Result:
`{"swept":1,"error":"EACCES ..."}`. Two removable stale dirs (c, d) were left, and the
`swept n stale sealed homes` line was never printed. `readdir` order is arbitrary, so on a host
with a foreign sealed home a fixed share of this user's stale homes is never swept, and on win32
the spec calls the sweep "the guarantee".

Patch. Current code:
```js
      if (stat.mtimeMs >= cutoff) continue; // younger than 6h - another suite may still own it
      fs.rmSync(full, { recursive: true, force: true });
      swept++;
```
Replacement:
```js
      if (stat.mtimeMs >= cutoff) continue; // younger than 6h - another suite may still own it
      try {
        fs.rmSync(full, { recursive: true, force: true });
        swept++;
      } catch (e) {
        console.error(`run-tests: sweep could not remove ${full}: ${e.code ?? e.message}`);
      }
```
Also, in the outer `catch` at `:78-82`, add `console.log(\`swept ${swept} stale sealed homes\`);`
before `return`, so the count is always reported. Predicted result on the same probe: 3 swept, one
error line for d, then `swept 3 stale sealed homes`. The existing unreadable-tmpDir test still
passes: readdir throws, so the output is `swept 0` plus the error. The "prints exactly one line"
test is unaffected because its fixture has no unremovable entries.

## F4 NIT: re-raising while another listener exists sends that listener the signal twice

Evidence: `scripts/test-home.mjs:67-71`. If another module in the same process also listens for the
signal, removing only our listener and then calling `process.kill` does not reach the default
action. The other listener runs a second time, which for a "press Ctrl-C again to force quit"
handler means a force quit. I measured no such listener today: inside a `node --test` file child,
the SIGINT and SIGTERM listener counts are 0 before `makeTempHome` and 1 after. Optional patch.
Current code:
```js
  process.removeListener(signal, onProcessSignal);
  process.kill(process.pid, signal);
```
Replacement:
```js
  process.removeListener(signal, onProcessSignal);
  // Another listener owns this signal's outcome; re-raising would deliver it to that listener twice.
  if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
```
The spec pins "remove its own listeners, then process.kill", so the spec session decides this one.
None of the shipped tests change behaviour: they have no other listener.

## R1 residual (not a finding against this diff): a SIGTERM sent only to the runner still waits for the suite

Even with the F1 patch, a SIGTERM sent to the runner pid alone takes effect only when `spawnSync`
returns (15.2 s in the probe). Before this change the runner died at once and left the child
orphaned. The exit code is now correct (143). Fixing the delay needs an async `spawn` with the
signal forwarded to the child. That is a larger change and is not required by the spec. Leave it
unless the spec session wants it.

## Verified absent (attack brief items that held)

- Symlinks and non-directories are never swept. Scratch probe: `sealed-home-link` (a symlink to an
  outside dir with a file in it) and a plain file `sealed-home-file`, both 10 h old. Neither was
  touched, and the target's file was still there. `Dirent.isDirectory()` is false for a symlink,
  checked at `:65`.
- The prefix is exact: `startsWith("sealed-home-")`, and the `sealed-homeXstale` case is tested at
  `run-tests.test.mjs:131`. The sweep reads only `readdirSync(tmpDir)`, never recursing, so nested
  paths are never considered. A dir younger than 6 h is kept (5 h case tested). If a stat fails
  between readdir and stat, the entry is skipped (`:69-71`).
- Kill switches: `ws-off-sweep` and `ws-off` are both honoured and both tested. A stat error other
  than ENOENT/ENOTDIR counts as "present" and skips the sweep, which fails safe. In production the
  home is `os.homedir()`, which is `$HOME` on POSIX, the same `~/.agents` base the other switches use
  (`project-config.mjs:40`, `decisions-handback.mjs:272`). Tests inject it.
- `swept n` counts only a `rmSync` that did not throw, so it counts removals, not attempts. The
  exception is the vanishing-dir race, where `force` makes a no-op count, which does no harm. F3
  covers the missing line on the error path.
- The exit and signal handlers only ever delete a `raw` path this process got from `mkdtempSync`,
  never a computed or matched path. `removeRegisteredHomes` catches every error and cannot throw.
- Handlers are installed once per process: the idempotence test checks exactly one listener per
  event after one home and after two. Removing `installHandlersOnce()` (mutation `m2`) makes all 3
  signal tests and the idempotence test fail. The SIGTERM child test therefore discriminates: with no
  handler, the child dies and leaves its home behind.
- Re-raise gives 128+n with no second `exit` event, as the builder claimed and the child tests assert
  (`gotSignal === signal`).
- The win32 skip reason is stated (`test-home.test.mjs:413-415`) and applied to all 4 signal tests.
- The tests never read the real `~/.agents` and never sweep the real `/tmp`. Every
  `sweepStaleHomes` call injects `tmpDir`/`homeDir`/`now`. The `main()` tests pass a stub `sweep`,
  and the one real CLI test passes `--no-sweep`. The territory gate left the real
  `/tmp/sealed-home*` count unchanged (84 before and 84 after).
- Exporting `main()` is safe: the only importer of `run-tests.mjs` outside the territory is
  `skills/multi/scripts/hooks.test.mjs:21` (`walkTestFiles`), and the CLI guard keeps imports from
  running `main`. Exit codes 0, 1 and 2 are unchanged on the non-signal paths (measured).
- Side benefit, measured: test files that never call `cleanup()` (for example
  `skills/decisions/scripts/decisions-pickup.test.mjs:62,84`) no longer leak on a normal exit. With a
  probe that makes 2 homes and passes, the old build left 2 and the new one leaves 0.

## Reviewer housekeeping

The `m2` mutation run (handlers removed, tests pointed at the real `os.tmpdir()`) leaked 3
directories into the real temp dir: `/tmp/sealed-home-Fy3ZUL`, `/tmp/sealed-home-EfTKmv` and
`/tmp/sealed-home-JWI86s`, all at 16:50:44 local, which is 4:50 PM NY. Removing them is not allowed
under this reviewer's deletion rules. The next real `run-tests.mjs` sweep will remove them once they
are more than 6 h old, or they can be removed by hand. The scratch copies (`rv24/` under the
scratchpad) are outside the worktree. The worktree is unmodified apart from this report.

Not verifiable in this review: the spec's live Netcup before/after count and the second-host green
run. Both belong in the orchestrator's record.
