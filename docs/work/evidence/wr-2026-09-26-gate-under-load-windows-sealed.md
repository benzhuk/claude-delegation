VERDICT: PASS 99c7c0110f4f5933e580e1c2a42ff1dfaf5d2f64

Host: Windows local integration worktree. Exact source: $sha.

The first final-suite attempt began 2026-09-26T23:34:32.2348307Z and retained a 1777/1777 stdout result, but its Start-Process wrapper did not persist the native exit; it is retained at docs/work/evidence/wr-2026-09-26-gate-under-load-windows-first-capture-unavailable.log as CAPTURE_UNAVAILABLE and is not this gate.

Authorized capture repair ran once on the unchanged SHA. Native exit: 0. Start: 2026-09-26T23:38:48.5565310Z. End: 2026-09-26T23:41:36.4384805Z. Runner duration: 166835.6895 ms. Counts: 1777 tests, 1777 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo. Stderr was empty. Durable stdout: docs/work/evidence/wr-2026-09-26-gate-under-load-windows-sealed.log; stderr: docs/work/evidence/wr-2026-09-26-gate-under-load-windows-sealed.stderr.log.