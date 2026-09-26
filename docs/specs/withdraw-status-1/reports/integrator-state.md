# Integrator state — withdraw-status-1

Status: DONE — PASS reported.

- Integration worktree: `/home/ben/Code/wt-withdraw`, branch `build/withdraw-status-1`.
- Merged: `build/withdraw-status-1-W1` (fast-forward, no conflict) at
  `481b6d736e2ab8f45277a382a883796aea2616a3`, matching the reviewer's APPROVE sha and the
  task's approved-territory list exactly.
- Gate run once: `node scripts/run-tests.mjs` ->
  `docs/specs/withdraw-status-1/reports/integrator-gate.log`. 1777 tests, 1772 pass,
  2 fail (`V4` mirror-shim, `H6` note-send), 3 skipped.
- Base comparison done against a clean `b7ddf11`-pinned worktree
  (`/home/ben/Code/wt-ws-mainbase`): base has 3 failures (`V4`, `H4` note-flush, `H6`);
  both of integration's failures are in that set. No new failing test name.
- Report written: `docs/specs/withdraw-status-1/reports/integrator-report.md`, verdict
  `PASS`.
- Nothing left to do on this job. Next steps (second-host suite, push, accept) are the
  lead's, out of scope here.
