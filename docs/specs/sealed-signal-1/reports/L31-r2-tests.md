VERDICT: READY

Cause: The F4 regression's generated program used literal backslash-n separators and had no referenced handle while awaiting SIGTERM; the Windows test subscribed to the runner exit after taskkill could already have produced it; `runChild` re-raised SIGTERM even when a pre-existing `runSealed` caller listener remained.
Discriminating check: The F4 fixture now parses and remains live until its signal. The Windows test registers `waitForExit` before taskkill. The new POSIX wrapper installs a foreign SIGTERM listener before `runSealed`, waits for the immediate-controller marker, signals only the wrapper PID, and requires one delivery, exit 73 within five seconds, the wrapper home absent, and the immediate controller gone. The old unconditional `runChild` re-raise produces `foreign-deliveries=2`.
Fix location: Apply `L31-r2-tests.patch` to `scripts/test-home.test.mjs` and `scripts/run-tests.test.mjs`; pair its foreign-listener regression with the separately reviewed conditional re-raise repair in `scripts/run-tests.mjs`.
Simplification: The wrapper reuses the existing 10-second forward probe, marker, bounded exit waiter, child environment, and owned-PID check. It does not assert signal delivery to a test worker.

Ready-to-apply patch: `docs/specs/sealed-signal-1/reports/L31-r2-tests.patch`.

Scope: test files only. The earlier `L31-F4-tests.patch` and `L31-R1-tests.patch` remain untouched as historical artifacts. No behavior tests, commits, or host execution were performed by this contract-test author. Syntax-only `node --check --input-type=module -` accepted both generated JS payloads: the repaired F4 child and the foreign-listener wrapper.
