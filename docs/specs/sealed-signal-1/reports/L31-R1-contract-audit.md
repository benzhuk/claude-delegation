# L31 R1 contract audit

- `runSealed` invokes `node --test ...` directly at `scripts/run-tests.mjs:160`; that spawned process is the contract’s child.
- Local Node is v24.18.0. Its `--test-isolation` default is `process`: each test file runs in a separate child process ([Node v24 test-runner docs](https://nodejs.org/download/release/v24.15.0/docs/api/test.html)).
- Therefore a ready fixture’s `process.ppid` is the direct `node --test` controller PID, not the fixture worker PID; it is the correct Windows `/PID` target without `/T`.
- R1’s pinned rule requires runner-PID SIGTERM forwarding to that immediate controller and runner-home removal within 5 seconds.
- The proposed POSIX `received` marker is an unsupported extra assertion: Node documents process isolation, but not controller SIGTERM forwarding to every test-file worker.
- Keep the ready marker only as a bounded proof that the controller exists before runner-PID SIGTERM; assert controller/runner prompt termination and runner-home removal, not worker receipt.
