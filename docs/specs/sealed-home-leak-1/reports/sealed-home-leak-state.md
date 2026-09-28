Territory: scripts/test-home.mjs, scripts/test-home.test.mjs, scripts/run-tests.mjs, scripts/run-tests.test.mjs (lane 24, sealed-home-leak)

Contracts I rely on:
- `makeTempHome` return shape used by every OTHER caller (`skills/decisions/scripts/*.test.mjs`, `scripts/prefix-test.test.mjs`, `scripts/collect-status.test.mjs`) must keep working unedited: `{ home, agentsHome, env, fixtureRoot, cleanup }` unchanged, plus two NEW fields `keep`/`unregister` (same function, alias) - additive only.
- `walkTestFiles` export from `run-tests.mjs`, used by `skills/multi/scripts/hooks.test.mjs` - unchanged.
- `childEnv`/`scratchHome`/`SEALED` from `skills/multi/scripts/test-child-env.mjs` (read-only import, not my territory). Every child spawn in `run-tests.test.mjs` now goes through `childEnv()` - never a bare `process.env` spread - because `hooks.test.mjs`'s N2 lint scans every test file for that literal.

Done (source, unchanged since round 1, f8aa816):
- Per-process registry + one-time exit/SIGINT/SIGTERM/SIGHUP handlers in test-home.mjs; `keep()`/`unregister()` alias.
- `run-tests.mjs`: `keep()` deferred via `setImmediate` and the CLI bootstrap uses `process.exitCode` + one more `setImmediate` turn (F1); `sweepStaleHomes` wraps each removal in its own try/catch and always prints the count (F3); `--no-sweep`, `main()` exported, `walkTestFiles` exported.
- Round 1 (review-r1.md, commit f8aa816): F1/F2/F3 fixed; F4 and the R1 residual NOT applied per the lead's ruling. Full detail: reports/build-r1.md.
- Round 2 (review-r2.md N1 + windows-r1-f8aa816.log, commit be80280, full detail reports/build-r2.md): only `run-tests.test.mjs` changed.
  - N1 (MAJOR): the F1 group-SIGTERM test could pass without reaching the keep()-on-a-killed-suite path - the signal was sent before the sealed `node --test` child existed, so it ran the probe to a harmless pass. Fixed with a ready-marker file the probe writes once running; the test waits for it, then asserts the signal took effect within 5s.
  - Windows defect 1: both new CLI-spawn tests built `{ ...process.env, TMPDIR: tmp }` directly, tripping `hooks.test.mjs`'s N2 lint. Fixed with `childEnv(fixtureHome, { TMPDIR: tmp, TEMP: tmp, TMP: tmp })`.
  - Windows defect 2: same fix - `os.tmpdir()` reads TEMP/TMP on win32, not TMPDIR, so the RT-18/F6 keep test's home landed outside the injected scratch dir there.
  - N2 (optional per r1's F3 finding, applied this round): new unit test for the per-entry try/catch - one unremovable stale dir (chmod 500 subdir) must not abort the rest of the sweep. Skipped on win32 and when running as root.
- Verified manually: `/tmp/sealed-home*` count was 129 before and 129 after both rounds' gate runs (no leak from this suite's own tests; this is a pre-existing host baseline, not caused by this lane).

Next: nothing pending in this territory pending the next review round. Live Netcup proof and second-host green are the reviewer/integrator's job per the spec, not this builder's.

Open questions: none.

How to run my gate:
`node --test scripts/test-home.test.mjs scripts/run-tests.test.mjs skills/multi/scripts/hooks.test.mjs`
(do NOT run `scripts/run-tests.mjs` over the whole repo - that's the integrator's full-suite job, not this territory's gate; always set TMPDIR to a scratch dir first)
