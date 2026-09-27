VERDICT: PASS 255bfd34d25a35c1932e5c048a7be9f1a2dcace3

# Lane 23 sealed cross-host gate

Both hosts ran the unchanged `node scripts/run-tests.mjs` once against the pushed,
independently approved artifact. The earlier `28fa` receipts remain historical evidence;
they were not reused as this changed candidate's gate.

## Windows

- Integration checkout at exact `255bfd34d25a35c1932e5c048a7be9f1a2dcace3` under the
  non-deleting `Global\claude-verify` mutex.
- Start/end UTC: `2026-09-27T21:17:58.7203477Z` /
  `2026-09-27T21:20:23.9723139Z`.
- Native exit: `0`; direct PowerShell process exit: `0`; 2,377 passed, 0 failed,
  2 skipped.
- Raw output and native receipt: `L23-sealed-255bfd-windows.log` and
  `L23-sealed-255bfd-windows.exit`.

## Netcup

- Separate fetched-origin detached checkout:
  `/home/ben/orca-gates/record-closed-and-skip-1-255bfd3` at exact
  `255bfd34d25a35c1932e5c048a7be9f1a2dcace3`.
- Fetch proof records the exact detached HEAD and origin
  `https://github.com/benzhuk/claude-delegation.git` in
  `L23-sealed-255bfd-netcup-fetch-proof.{log,exit}`.
- The existing Node executable was resolved through `bash -lc` before launch and its
  directory was prepended to the non-login payload `PATH`; no install occurred.
- Start/end UTC: `2026-09-27T21:18:00Z` / `2026-09-27T21:18:24Z`.
- Native exit: `0`; outer SSH-wrapper exit: `0`; 2,375 passed, 0 failed, 4 skipped.
- Raw native output, native receipt, wrapper output, wrapper receipt, and Node-path
  proof are `L23-sealed-255bfd-netcup.{log,exit}`,
  `L23-sealed-255bfd-netcup-outer.{log,exit}`, and
  `L23-sealed-255bfd-netcup-node-path.{log,exit}`.

## Final collector smoke

- Quiet smoke exit receipts: `L23-collector-smoke-final.exit`; snapshots and the two
  raw invocation logs are under `L23-collector-smoke-final/` and
  `L23-collector-smoke-final-run{1,2}.log`.
- Both runs observed the same change key for identical listed rows: six `build/` rows,
  12 skipped outside `build/`, and no non-build row.
- In `status.md`, `lane: every non-terminal Status shows as owned` is immediately below
  the table header. `--quiet` suppressed notification delivery.

No acceptance action is represented by this gate receipt.
