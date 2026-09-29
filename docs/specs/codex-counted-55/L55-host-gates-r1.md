VERDICT: BLOCKED

Candidate: `cd5fecccad1028298fb7811c77cff133c2d4c750`.

Windows sealed gate ran under `Global\claude-verify` from 2026-09-29T03:44:11Z
through 03:48:00Z. Native exit: `1`; 2,955 tests, 2,935 pass, 6 fail. The raw
receipt is `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-counted-55/windows/cd5fecccad1028298fb7811c77cff133c2d4c750-5dd90283ebf3436a8d8488c1298b95c0/suite.raw.log`.
Its dedicated temporary path was `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-counted-55/t/30e4c3ad`; the runner restored TMPDIR/TMP/TEMP in finally. The observer reported `leak check: 0 new temp entries`. `run-tests` retained its own sealed home after failure for root cleanup; no deletion was performed.

The first Netcup invocation as `benzh` was refused by tailnet policy and is preserved as a failed invocation. The corrected authorized `ben@100.69.249.18` invocation fetched the pushed candidate into `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/55/r1-cd5fecc` and passed the existing remote runner: native exit `0`, 2,955 tests, 2,950 pass, 0 fail, 2026-09-29T03:52:48Z through 03:53:07Z. `origin/main` preflight resolved to real `c0818c99c171de3b7812acd20adbe4d4ea96297c`; the observer reported `leak check: 0 new temp entries`. Local retained copies are `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-counted-55/netcup/cd5fecc-r1-001/{suite.raw.log,suite.summary,suite.exit.txt}`. The suite retained its failure-inspection sealed home despite passing; it was observed at `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/55/delegation-test-run-1634135-SMDVN7/run-tests-foreign-listener-tmp-2TdHko/sealed-home-68VhOS`, and no deletion was performed.

The six Windows failures are one backlog route cadence test (`backlog route keeps its existing switches and cadence silent`) plus five `scripts/collect-status.test.mjs` stall-nudge cases, each observing 0 where 1 was expected. This is a gate finding, not a Lane55 acceptance claim.
