VERDICT: PASS 1727 of 1727

Second-host (Windows) gate for lane eight (build/merge-on-acceptance-1).

- Windows host: benzh@ben-desktop.tail219acd.ts.net
- Commit under test: f3ec5333b9e91847fc86be4c4f7f98e9ea951a26 (origin/build/merge-on-acceptance-1)
- Base for comparison: 6d8ba95a33019e30adf4ecb4c5367c4b756f3e1e (origin/main, release 0.20.11) — not needed; no failures occurred.
- Windows HEAD sha printed after checkout: f3ec5333b9e91847fc86be4c4f7f98e9ea951a26
- Node version on Windows: v24.18.0

## Method

1. Built a bundle on Linux from `/home/ben/Code/wt-moa` containing refs `build/merge-on-acceptance-1` and `main` (both shas verified as present/ancestors before bundling); bundle verified okay.
2. scp'd the bundle to `C:\Temp\moa.bundle`, cloned it to `C:\Temp\moa-suite`, and checked out `f3ec5333b9e91847fc86be4c4f7f98e9ea951a26` detached. `git rev-parse HEAD` confirmed the exact sha.
3. Repo has no package.json/node_modules — `node scripts/run-tests.mjs` runs directly with Node's built-in test runner. Ran it with output redirected to `C:\Temp\moa-suite-gate.log`.
4. No failing tests occurred, so no second (base) clone or comparison run was needed.
5. scp'd the full, unedited log back to `docs/work/evidence/wr-2026-09-26-merge-on-acceptance-windows-gate.log`.
6. Removed `C:\Temp\moa-suite`, `C:\Temp\moa.bundle`, and `C:\Temp\moa-suite-gate.log` on the Windows host in a separate ssh command from the test run; confirmed via `dir C:\Temp` that none of the three remained.

## Result

Totals line from the log:
```
ℹ tests 1727
ℹ suites 0
ℹ pass 1727
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 189258.5227
```

- Failing test names: none.
- Wall time: duration_ms 189258.5227 (~189.3 seconds / ~3 minutes 9 seconds) reported by the test runner itself.

PASS: no failing test name occurred at all on Windows at f3ec5333, so trivially no failing test name lacks a matching base failure.

## Evidence

- Full sealed-suite log: `/home/ben/Code/wt-moa/docs/work/evidence/wr-2026-09-26-merge-on-acceptance-windows-gate.log`
