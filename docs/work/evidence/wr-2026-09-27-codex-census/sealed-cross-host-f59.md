VERDICT: PASS f59fb856a0f508d0e7fb6b74b6b7924ae5a3b6b9

# Sealed cross-host full-gate receipt

- Artifact/source: `f59fb856a0f508d0e7fb6b74b6b7924ae5a3b6b9`
- Command on each host: unchanged `node scripts/run-tests.mjs`

## Windows

- Integration checkout, start/end UTC `2026-09-27T13:19:36.0353697Z` / `2026-09-27T13:28:43.5520072Z`
- Origin ref: `origin/build/codex-census-1@f59fb856a0f508d0e7fb6b74b6b7924ae5a3b6b9`
- Native exit: `0`; 2,123 pass, 0 fail, 0 skipped.
- Raw: `sealed-windows-f59.log`, `sealed-windows-f59.exit`.

## Netcup

- Separate fetched-origin detached checkout `/home/ben/orca-gates/codex-census-1-f59fb856`, start/end UTC `2026-09-27T13:19:39Z` / `2026-09-27T13:19:59Z`
- Origin ref: `origin/build/codex-census-1@f59fb856a0f508d0e7fb6b74b6b7924ae5a3b6b9`
- Native test exit: `0`; 2,120 pass, 0 fail, 3 skipped.
- Raw: `sealed-netcup-f59.log`, `sealed-netcup-f59.exit`.
- Outer-wrapper diagnostic: `sealed-netcup-f59-outer-wrapper.md` records its distinct CRLF exit-format error; it did not alter the native test result and no rerun occurred.