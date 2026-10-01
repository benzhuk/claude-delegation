VERDICT: PASS

F4 commit: 1311df737ab46cf7570d47e6207799e5bc6233c0
R1 commit: c9e5029da51270fe59b29c8749f532c7ef8cde57
Gate HEAD: c9e5029da51270fe59b29c8749f532c7ef8cde57

Cause: test-home re-raised a handled signal even when another listener had already received it; run-tests used synchronous child launches, leaving its runner PID unable to forward a signal until the suite returned.
Discriminating check: F4 registers a prior SIGTERM listener and asserts one delivery; R1 uses a ready marker for the immediate node --test controller, signals only the runner PID on POSIX, and on Windows taskkills only that controller PID without /T.
Fix location: scripts/test-home.mjs; scripts/test-home.test.mjs; scripts/run-tests.mjs; scripts/run-tests.test.mjs.
Simplification: runSealed and main are async, one child helper owns launch completion and temporary signal forwarding, and the spawnSync-only deferred keep/CLI turn was removed.

The granted focused gate ran once under Global\claude-verify:

    node --test scripts/test-home.test.mjs scripts/run-tests.test.mjs

Native exit: 0. Full raw output: L31-builder-gate.log. The gate reported 43 tests, 35 passing, 0 failing, and 8 skipped. On this Windows host, the taskkill-only-child retention regression passed. POSIX-only F4 and runner-PID SIGTERM regressions were skipped, so their live signal behavior was not exercised here. No full suite or Netcup live proof was run.
