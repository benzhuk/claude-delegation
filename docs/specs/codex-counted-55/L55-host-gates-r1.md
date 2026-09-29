VERDICT: BLOCKED

Candidate: `cd5fecccad1028298fb7811c77cff133c2d4c750`.

Windows sealed gate ran under `Global\claude-verify` from 2026-09-29T03:44:11Z
through 03:48:00Z. Native exit: `1`; 2,955 tests, 2,935 pass, 6 fail. The raw
receipt is `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-counted-55/windows/cd5fecccad1028298fb7811c77cff133c2d4c750-5dd90283ebf3436a8d8488c1298b95c0/suite.raw.log`.
Its dedicated temporary path was `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-counted-55/t/30e4c3ad`; the runner restored TMPDIR/TMP/TEMP in finally. The observer reported `leak check: 0 new temp entries`. `run-tests` retained its own sealed home after failure for root cleanup; no deletion was performed.

Netcup command native exit: `1` before the runner could start: tailnet policy refused SSH as `benzh` to `zhuk-netcup` (100.69.249.18). Therefore it has no suite count or runner receipt. The prior host report remains unchanged.

The Windows failures are in `scripts/collect-status.test.mjs` stall-nudge cases, each observing 0 where 1 was expected. This is a gate finding, not a Lane55 acceptance claim.
