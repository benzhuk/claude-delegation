# Sealed cross-host gate receipt — failed

- Artifact: `f1908a0b1a52426fe440bdcffa590431f9bc1ce0`
- Branch/origin ref at admission: `build/codex-census-1` / `origin/build/codex-census-1@f1908a0b1a52426fe440bdcffa590431f9bc1ce0`
- Command on both hosts: unchanged `node scripts/run-tests.mjs`
- Overall verdict: **REJECTED**. Both hosts failed the same existing consumer-test expectation; no baseline exception, rerun, production edit, acceptance, or main merge occurred.

## Windows sealed gate

- Host: Windows integration checkout `C:/Users/benzh/orca/workspaces/claude-delegation/codex-census-1`
- Tested SHA: `f1908a0b1a52426fe440bdcffa590431f9bc1ce0`
- Raw runner-log filesystem capture (UTC): `2026-09-27T12:40:36Z` through `2026-09-27T12:50:35Z`; the sealed runner itself emitted no start/end markers.
- Native exit: `1`
- Counts: 2,031 tests; 2,030 pass; 1 fail.
- Failure: `scripts/work-record.test.mjs:1622` expected `/^VERDICT: UNSUPPORTED\b/`, but the current native fixture correctly produced `VERDICT: PARTIAL Codex census (unknown model attribution …; usage rows have unknown model attribution)`.
- Raw output: `sealed-windows.log`; immediate native exit: `sealed-windows.exit`.

## Netcup sealed gate

- Host: Netcup Linux, separate fetched-origin detached checkout `/home/ben/orca-gates/codex-census-1-f1908a0` at exact `f1908a0b1a52426fe440bdcffa590431f9bc1ce0`; its dirty shared checkout was untouched.
- Origin ref: `origin/build/codex-census-1@f1908a0b1a52426fe440bdcffa590431f9bc1ce0`
- Start/end UTC: `2026-09-27T12:40:39Z` / `2026-09-27T12:40:57Z`
- Native exit: `1`
- Counts: 2,031 tests; 2,027 pass; 1 fail.
- Failure: the same `scripts/work-record.test.mjs:1622` obsolete `UNSUPPORTED` expectation against the new, correctly refusing `PARTIAL` producer result.
- Raw output: `sealed-netcup.log`; immediate native exit: `sealed-netcup.exit`.

`reports/work-record-contract-review.md` subsequently classified the issue as `STALE_TEST_EXPECTATION`: acceptance remains refused for `PARTIAL`; the narrowly authorized repair is test-only in `scripts/work-record.test.mjs`. This receipt preserves the failed artifact before that repair.