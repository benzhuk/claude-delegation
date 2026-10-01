VERDICT: PASS 28fa29c71fbafedd1794e7cefdb4f5f439693ea6

# Lane 23 sealed cross-host gate

The reviewed integration artifact was pushed before either suite run. Its Lane 23
source and tests are byte-identical to approved
`89b219e52b2563550a81956fdb30b5898391e2fb`. Windows received one unchanged suite
invocation. Netcup's first transport failed before Node or a test process started;
its first actual suite invocation then ran once on the same artifact.

## Windows

- Integration checkout at exact `28fa29c71fbafedd1794e7cefdb4f5f439693ea6`.
- Non-deleting `Global\claude-verify` mutex; start/end UTC:
  `2026-09-27T21:02:43.9651826Z` / `2026-09-27T21:05:22.1966744Z`.
- Native exit: `0`; 2,358 passed, 0 failed, 2 skipped.
- Raw output and immediate exit: `L23-sealed-28fa-windows.log` and
  `L23-sealed-28fa-windows.exit`.

## Netcup launch preflight

- Fresh fetched-origin detached checkout:
  `/home/ben/orca-gates/record-closed-and-skip-1-28fa29c`, exact
  `28fa29c71fbafedd1794e7cefdb4f5f439693ea6`, origin
  `https://github.com/benzhuk/claude-delegation.git`.
- The LF-safe SSH payload used the existing remote verification lock. Its start/end
  UTC were `2026-09-27T21:02:45Z` / `2026-09-27T21:02:48Z`.
- The first LF-safe transport did not start a test process: both its launch exit and
  outer SSH-wrapper exit were `127`; raw output is exactly
  `bash: line 26: node: command not found`.
- Fetch proof separately verifies the checkout SHA and that `bash -lc 'node --version'`
  reports `v24.18.1`; the sealed payload was non-login and therefore lacked `node` on
  `PATH`. This is a host-environment launch failure, not a test result. The separate
  first actual suite invocation below used that verified existing Node directory.
- These launch-only native, native-exit, wrapper, and fetch-proof receipts are
  `L23-sealed-28fa-netcup.{log,exit}`, `L23-sealed-28fa-netcup-outer.{log,exit}`, and
  `L23-sealed-28fa-netcup-fetch-proof.{log,exit}`.

## Netcup sealed suite

- The first actual suite launch retained the same fetched checkout and artifact. It
  prepended the existing login-shell Node directory
  `/home/ben/.local/state/fnm_multishells/105464_1790543228098/bin` to the non-login
  `PATH`, under the same remote verification lock; no install occurred.
- Start/end UTC: `2026-09-27T21:07:30Z` / `2026-09-27T21:07:50Z`.
- Native test exit and outer SSH-wrapper exit: `0`; 2,356 passed, 0 failed, 4 skipped.
- Raw native, native-exit, wrapper, and path-proof receipts are
  `L23-sealed-28fa-netcup-r2.{log,exit}`,
  `L23-sealed-28fa-netcup-r2-outer.{log,exit}`, and
  `L23-sealed-28fa-netcup-node-path.{log,exit}`.

## Collector smoke

- Quiet candidate collector exit: `0`; isolated snapshot:
  `L23-collector-smoke/{status.md,status.json}`.
- It reports six build-only rows, `skipped: 12 (outside build/)`, and the explicit
  legend `lane: every non-terminal Status shows as owned`; the send was skipped by
  `--quiet`.
- `scripts/install-janitor-timer.mjs` and its test have no working-tree diff. No
  installed timer was changed.

No acceptance action is authorized by this receipt.
