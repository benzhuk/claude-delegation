STATUS: DONE ea16c1f

Lane 24, sealed-home-leak - builder report.

Goal card: serves "work lost or stalled" (a leaked sealed-home directory per abnormally-ended suite
run filled Netcup's inodes to 70 percent - a host that can't run the suite at all is work stalled, and
the 585 leaked dirs deleted this same day were work already lost once). Nearest NOT: "a new mechanism
while an existing one is unfed or unmeasured" - this fixes and extends the ALREADY-live sealed-suite
mechanism (`scripts/test-home.mjs`/`run-tests.mjs`, in place since C5), it adds no new mechanism.

## What changed

`scripts/test-home.mjs`
- Added a per-process registry (`registeredHomes`) and one-time handler installation
  (`installHandlersOnce`): `makeTempHome` registers its own directory and, once per process,
  installs handlers for `exit`, `SIGINT`, `SIGTERM`, and (non-win32) `SIGHUP`.
- Each handler removes every still-registered directory synchronously and best-effort (wrapped in
  `try`/`catch` so it can never throw from an exit/signal handler). The signal handlers then remove
  their own listener for that exact signal and call `process.kill(process.pid, signal)` to re-raise -
  proved empirically that this gives exit code 128+n on POSIX and that Node's `exit` event does NOT
  fire a second time on that re-raised path.
- `makeTempHome`'s return value gained `keep`/`unregister` (the same function, aliased): removes the
  directory from the registry without deleting it. `cleanup()` now also unregisters before deleting,
  so a home cleaned normally is never double-handled by the exit path. Every existing field
  (`home`, `agentsHome`, `env`, `fixtureRoot`, `cleanup`) is unchanged - the four other files that
  call `makeTempHome` outside this territory (`skills/decisions/scripts/*.test.mjs`,
  `scripts/prefix-test.test.mjs`, `scripts/collect-status.test.mjs`) need no edits and were not
  touched.

`scripts/run-tests.mjs`
- Added `sweepStaleHomes({ tmpDir, homeDir, now })` (all three injectable, defaulting to
  `os.tmpdir()`/`os.homedir()`/`Date.now`): removes `sealed-home-*` directories (exact prefix,
  directory entries only, directly under `tmpDir` - a plain `readdirSync`, no recursion) whose mtime
  is older than 6 hours; prints exactly one `swept n stale sealed homes` line; skips entirely (fail
  open) when `<homeDir>/.agents/ws-off-sweep` or the shared `<homeDir>/.agents/ws-off` exists; any
  read/stat/rm error is caught, printed as `run-tests: sweep error: ...`, and returned rather than
  thrown, so a sweep failure never blocks the suite.
- `runSealed`'s `finally` block now calls the new `keep()` in its non-zero branch (before the
  existing `console.error` line) - this is the only behavioral change to the keep-on-failure path,
  needed because the CLI process's own `process.exit` at the bottom now triggers test-home.mjs's
  `exit` handler, which would otherwise delete the very home this branch deliberately leaves for
  inspection.
- `main` is now exported and returns an exit code instead of calling `process.exit` itself (the CLI
  bootstrap `if` block at the bottom does that); it takes an optional `{ sweep }` override (default
  `sweepStaleHomes`) so tests can verify the sweep is/isn't called without touching real
  `/tmp`/`~/.agents`. It parses one new flag, `--no-sweep`; any other `-`-prefixed argument is still
  rejected with the original "flags are not supported" message and exit code 2.
- `walkTestFiles` is unchanged (still used externally by `skills/multi/scripts/hooks.test.mjs`).

`scripts/test-home.test.mjs` - added tests (appended, nothing existing removed or edited except the
import line for `spawn`/`readline`):
- `keep()`/`unregister()` alias + keep-then-cleanup shape.
- Three real spawned-child signal tests (SIGINT, SIGTERM, SIGHUP), each POSIX-only with the stated
  win32 skip reason (`child.kill(signal)` terminates a Windows process without running handlers -
  the run-tests.mjs sweep is the guarantee there instead): each child prints its sealed home path,
  is signalled for real, and the test asserts both the real exit signal and that the directory is
  gone.
- A companion test: a home that called `keep()` before the signal survives it (proves `keep()`
  actually removes it from the leak-fix registry, not just that the removal path exists).
- Idempotent-registration test: a fresh child process makes two homes and asserts
  `process.listenerCount(event) === 1` for every handled event, both after the first home and after
  the second (never 2).

`scripts/run-tests.test.mjs` - new file:
- `sweepStaleHomes`: removes old, keeps young, keeps a non-matching name, keeps a name that only
  starts with `sealed-home` but not the exact `sealed-home-` prefix (boundary case), prints the exact
  one-line message, honours both kill switches (`ws-off`, `ws-off-sweep`), never throws when the temp
  dir can't be read. Every test injects `tmpDir`/`homeDir`/`now` - none touch the real `/tmp` or
  `~/.agents`.
- `runSealed`: a passing suite removes its home; a failing suite keeps it (test cleans it up
  manually afterward, since `keep()` intentionally took it out of the auto-registry).
- `main()`: sweep is called by default, not called with `--no-sweep`, unknown flags still rejected -
  all via an injected `sweep` stub, never the real one.
- One real end-to-end CLI smoke test (`execFileSync` on the actual script) using `--no-sweep`, so the
  one CLI-level test that spawns the real file never touches the real temp dir/home for the sweep
  itself (the sealed home the suite itself creates is the normal, already-cleaned-up kind every other
  test in this repo also creates).

## Gate output

`node --test scripts/test-home.test.mjs scripts/run-tests.test.mjs`

```
ℹ tests 37
ℹ suites 0
ℹ pass 37
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Exit code 0. Full log at `docs/specs/sealed-home-leak-1/reports/sealed-home-leak-gate.log` (the one
visible `fail 1` inside that log is the INNER nested `node --test` summary of a deliberately-failing
probe file that `runSealed removes the sealed home when the suite passes`/`keeps the sealed home when
the suite fails` tests spawn on purpose to exercise the keep/remove contract - not a failure of this
gate's own 37 tests).

Manually verified `/tmp/sealed-home*` count was 72 both before and after the full gate run (matches
the work record's "72 sealed-home dirs at pickup" note) - this suite leaks nothing of its own into the
real temp dir, and none of the 72 pre-existing directories were touched (never in scope: "don't delete
anything under the real /tmp sealed-home-* dirs yourself").

## Deviations / assumptions

- The pinned design says the sweep runs "at run-tests start"; I placed the sweep call inside the
  exported `main()` (the CLI entry point) rather than inside `runSealed` itself, because `runSealed`
  is also called programmatically by tests (this file's own FIXTURE_ROOT-forwarding test, and by
  `run-tests.test.mjs`'s keep/remove tests) - embedding the sweep there would make every such
  programmatic call scan/delete from the REAL `os.tmpdir()`, which the spec explicitly says an
  injectable design must prevent. `main()` is the one place a real CLI invocation and only a real CLI
  invocation goes through, so that's where the real, un-injected default sweep runs.
- `main` was not exported/testable-without-`process.exit` before this change; exporting it (returning
  a code instead of calling `process.exit` directly, with the actual `process.exit` call moved to the
  bottom `if` bootstrap block) was necessary to test `--no-sweep`/flag-rejection in-process without
  either spawning a child for every case or monkeypatching `process.exit` globally. This is an
  additive/internal refactor only - the CLI's observable behavior (same flags, same exit codes, same
  stdout/stderr) is unchanged, verified by the one real end-to-end `execFileSync` smoke test.
- No other territory file needed a change; `walkTestFiles`'s export and behavior are untouched, and a
  grep of the whole repo confirmed no other file reaches into `run-tests.mjs`'s `main`/`runSealed`
  internals beyond what's listed above.

## Commit / push

Committed as `ea16c1f` on `build/sealed-home-leak-1` and pushed to origin (this file's STATUS line
above reflects that sha; the tiny follow-up commit that fills it in is a report-only edit).
