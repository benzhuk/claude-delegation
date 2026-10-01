# L31 scout — sealed signal lifecycle

## Files and symbols
- `scripts/test-home.mjs` exists: `onProcessSignal` at 66–70 removes homes/listener then unconditionally `process.kill`; F4 patch is exactly `if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);` after removal. Premise holds.
- `scripts/test-home.test.mjs` exists: `spawnAndSignal` (64–81) supports child signal tests; POSIX signal loop is 417–433 and idempotence is 453–471. No existing other-listener case.
- `scripts/run-tests.mjs` exists: imports `spawnSync` (13); synchronous `runSealed` (122) blocks in canary (139) and suite (160); deferred `setImmediate(keep)` is 180 and CLI deferral 220–223; sync `main` is 206. R1 premise holds.
- `scripts/run-tests.test.mjs` exists: synchronous in-process `runSealed` calls 99/108, `main` calls 301/315/331, CLI helpers at 339–454. Its POSIX group test is obsolete for the pid-forward contract and already has ready-marker ordering.

## Helpers to reuse
- Reuse `childEnv` from `skills/multi/scripts/test-child-env.mjs:33–40` for every spawned test child; it seals credentials and accepts `TMPDIR`, `TEMP`, `TMP` overrides.
- Reuse `scratchDir`, `writeSlowProbe`, `cleanups`, stdout-first-line and `exited` patterns in `run-tests.test.mjs:42–45,382–453`; do not add an unbounded polling loop.
- Reuse `spawnAndSignal` for F4, but provide a child script with a second listener that records one delivery and remains alive long enough for `onProcessSignal` to run.

## Tests that police this area
- `scripts/test-home.test.mjs:417–433` requires POSIX signal exit plus home removal; add F4 assertion that an existing listener runs once, and documented semantics are “that listener owns outcome,” so no synthetic re-raise/default exit may be asserted.
- `scripts/test-home.test.mjs:453–471` enforces exactly one installed handler per event; F4 must remove only its own listener.
- `scripts/run-tests.test.mjs:353–364` enforces failed-suite home retention after process exit; Windows `taskkill /PID <suite-child-pid> /F` can assert runner exits nonzero and its printed home remains, but `/T` would kill runner too and cannot prove this contract.
- `skills/multi/scripts/hooks.test.mjs` scans test spawns for `childEnv`; direct `{ ...process.env }` test environments fail N2.

## Open questions for the spec
- Must the canary also migrate from `spawnSync` to async `spawn`? R1 says `runSealed` async/forward immediately, but only names the suite child; leaving synchronous canary leaves a short unforwardable window.
- What child PID/ready protocol is permitted for the Windows assertion? `node --test` PID is not exposed by current stdio, and taskkill must target that child only, never `/T`.
- Async migration reaches `scripts/test-home.test.mjs:156` too; should it be included despite the map’s “ten sites in run-tests.test.mjs” wording? Also make `captureLog` and `withoutNodeTestContext` async-safe or their `finally` restores console/env before awaited work completes.
