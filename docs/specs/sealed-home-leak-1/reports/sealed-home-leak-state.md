Territory: scripts/test-home.mjs, scripts/test-home.test.mjs, scripts/run-tests.mjs, scripts/run-tests.test.mjs (lane 24, sealed-home-leak)

Contracts I rely on:
- `makeTempHome` return shape used by every OTHER caller (`skills/decisions/scripts/*.test.mjs`, `scripts/prefix-test.test.mjs`, `scripts/collect-status.test.mjs`) must keep working unedited: `{ home, agentsHome, env, fixtureRoot, cleanup }` unchanged, plus two NEW fields `keep`/`unregister` (same function, alias) - additive only.
- `walkTestFiles` export from `run-tests.mjs`, used by `skills/multi/scripts/hooks.test.mjs` - unchanged.
- `childEnv` from `skills/multi/scripts/test-child-env.mjs` (read-only import, not my territory).

Done:
- Per-process registry (`registeredHomes`) in test-home.mjs; `makeTempHome` registers its dir and calls `installHandlersOnce()`.
- One-time handlers for `exit`, `SIGINT`, `SIGTERM`, (non-win32) `SIGHUP`: remove every still-registered dir (best-effort, never throws), then (signals only) remove their own listener and `process.kill(pid, signal)` to re-raise - proved exit code 128+n on POSIX, and that `exit` does NOT fire a second time on the re-raised path.
- `keep()`/`unregister()` on the return value: removes a dir from the registry without deleting it. `run-tests.mjs`'s `runSealed` now calls `keep()` in the non-zero branch of its `finally` (before `console.error`), so a failed suite's home still survives this process's own exit - keep-on-failure (RT-18/F6) unchanged in effect.
- `sweepStaleHomes` (exported from run-tests.mjs): removes `sealed-home-*` dirs (exact prefix, `entry.isDirectory()`, directly under `tmpDir`) older than 6h; prints `swept n stale sealed homes`; skipped when `<homeDir>/.agents/ws-off-sweep` or `<homeDir>/.agents/ws-off` exists; a read/stat error is caught, printed (`run-tests: sweep error: ...`), and returned as `{ error }` - never thrown. `tmpDir`/`homeDir`/`now` all injectable, default `os.tmpdir()`/`os.homedir()`/`Date.now`.
- `main()` (now exported, returns a code instead of calling `process.exit` itself - the CLI bootstrap at the bottom does that) parses `--no-sweep` (only new flag; any other `-`-flag still errors exactly as before) and calls an injectable `sweep` param (default `sweepStaleHomes`) unless `--no-sweep` is set.
- Tests (39, all passing after round 1): registry/handler/keep tests in test-home.test.mjs (real spawned children signalled with SIGINT/SIGTERM/SIGHUP - POSIX only, each with the win32 skip reason stated; idempotent-registration test via a fresh child asserting listenerCount === 1 after one AND after two homes); sweep/keep-on-failure/--no-sweep tests in run-tests.test.mjs (all with injected tmpDir/homeDir/now - never the real ones - plus one real end-to-end CLI smoke test using `--no-sweep` so it never touches the real temp dir/home for the dangerous part).
- Round 1 fixes (review-r1.md, commit f8aa816, full detail in reports/build-r1.md):
  - F1 (BLOCKER): the runner itself leaked its own home and swallowed the exit code on a
    group SIGINT/SIGTERM/SIGHUP, because `node --test` catches the signal and exits 1
    before this process's own handler ever gets a loop turn (it was blocked in
    `spawnSync`). Fixed by deferring `keep()` one turn (`setImmediate(keep)`) and by
    setting `process.exitCode` plus one more `setImmediate(() => {})` instead of calling
    `process.exit(main())` directly, so a pending signal is delivered and re-raised
    before the process actually exits. New CLI-level regression test spawns the real
    CLI, sends SIGTERM to the whole process group, asserts it dies from the re-raised
    signal and its home is gone.
  - F2 (MAJOR): the old keep-on-failure test only checked in-process, before any exit
    handler could run. New CLI-level test spawns the real CLI on a failing probe and
    checks the home survives after the *child process has actually exited*.
  - F3 (MINOR): one unremovable stale dir used to abort the whole sweep silently (no
    "swept n" line). Each removal now has its own try/catch (logs and continues), and
    the outer catch path also prints the swept count before returning.
  - F4 (NIT) and the R1 residual (pid-only SIGTERM still waits for spawnSync) were NOT
    applied, per the lead's explicit ruling - left for the spec session.
- Verified manually: `/tmp/sealed-home*` count was 129 before and 129 after the round-1
  gate run (no leak from this suite's own tests; higher baseline than earlier rounds,
  pre-existing on this host, not caused by this lane).

Next: nothing pending in this territory pending the next review round. Live Netcup proof
(`ls -d /tmp/sealed-home* | wc -l` before/after a real suite run) and second-host green
are the reviewer/integrator's job per the spec, not this builder's.

Open questions: none.

How to run my gate:
`node --test scripts/test-home.test.mjs scripts/run-tests.test.mjs`
(do NOT run `scripts/run-tests.mjs` over the whole repo - that's the integrator's full-suite job, not this territory's gate)
