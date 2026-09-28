# Lane 31 integration contract — sealed signal

Work: `wr-2026-09-27-sealed-signal`
Spec authority: `docs/specs/sealed-signal-1/spec.md` at
`b159e9d2ff29e4abb7cbc8e58aabd2e22aca6c63`
Base: `3dbe93567049ffc2fdd4fbe424226e57b7dc7ed0`

## Scope and commit boundary

The only implementation territory is:

- `scripts/test-home.mjs` and `scripts/test-home.test.mjs` for F4, in one commit;
- `scripts/run-tests.mjs` and `scripts/run-tests.test.mjs` for R1, in a separate commit.

Do not change sweep or `ws-off` behavior. Do not add a runner module, compatibility layer, or
deferred-exit workaround. Existing failure behavior remains authoritative: a non-zero canary,
suite, or child-start result leaves the runner's sealed home for inspection; successful runs
remove it. Preserve raw process exit/signal outcomes rather than translating a signal into a
confident success code.

## F4 — listener ownership after home cleanup

`test-home.mjs` must remove its own handler and remove registered homes when a handled signal
arrives. It must then re-raise only when no listener remains:

```js
process.removeListener(signal, onProcessSignal);
if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
```

This preserves the default signal outcome when this handler was the sole listener. If another
listener was already registered, that listener has already received the original delivery and
owns the remainder of the process outcome; it must not receive a second delivery. The F4 test
registers such a listener, triggers the signal, and asserts its one-delivery outcome. The process
is deliberately left to that listener. F4 source and test land together in exactly one commit.

## R1 — asynchronous sealed runner

`runSealed` and `main` return Promises. The CLI awaits `main()` and sets `process.exitCode`; it
does not call `process.exit()` and does not retain the old `setImmediate(keep)` or empty
`setImmediate` deferral/comments that existed solely for `spawnSync`.

Use asynchronous child execution for both canary and suite, so neither phase leaves an
unforwardable synchronous interval. While a child is live, a SIGTERM received by the runner is
forwarded to that child immediately. The runner's registered home is removed within five seconds
of a POSIX runner-pid SIGTERM. Child completion still supplies the raw exit result used by the
existing success/keep-on-failure decision. Startup errors remain errors and must not be
reclassified as success. Every programmatic call to `runSealed()` or `main()` in
`scripts/run-tests.test.mjs`, plus the existing `runSealed()` caller/helper in
`scripts/test-home.test.mjs`, must await its Promise.

On POSIX, the regression is an isolated-process test that sends SIGTERM to the runner PID, observes
the child-forwarded signal and runner exit, and checks that the printed runner home no longer
exists within five seconds. Preserve the native raw exit representation (`signal` or numeric
signal-derived exit where the platform exposes one); do not normalize it. On Windows, where
SIGTERM cannot supply this proof, expose the suite child PID through a controlled test-only
fixture/ready channel, kill that child PID with `taskkill` (never `/T`), and assert the runner's
home is retained because the resulting run is non-zero.

## Integration and proof contract

The focused gate comprises exactly the two territory test files:

```text
node --test scripts/test-home.test.mjs scripts/run-tests.test.mjs
```

It is executed once only when an explicit owner grant permits the local verification mutex. The
sealed suite is `node scripts/run-tests.mjs`, once per host after its checkout/HEAD and entrypoint
are asserted. Do not repeat unchanged gates.

The independent live proof runs on Netcup against an ordinary fresh clone under
`/home/ben/orca-gates`, never the dirty canonical checkout
`/home/ben/Code/claude-delegation`. Before the suite, explicitly `cd` to that checkout, assert the
intended full `HEAD`, and assert `scripts/run-tests.mjs` exists. No install, release, identity
configuration, force/reset/clean/stash, denial bypass, or filesystem deletion wrapper is part of
this lane.
