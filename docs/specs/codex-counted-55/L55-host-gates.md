VERDICT: PASS (sealed suites); OBSERVED (shared-host temp observer)

Candidate: `60ece109bc24eb03bc17c242472e9c105b063ca4`.

Windows sealed suite: native exit 0; 2,951 tests, 2,937 pass, 0 fail, 14 skip; raw receipt `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-counted-55/windows/60ece109bc24eb03bc17c242472e9c105b063ca4/suite.raw.log`.

Netcup sealed suite: native exit 0; 2,951 tests, 2,946 pass, 0 fail, 5 skip; `leak check: 0 new temp entries`; raw receipt `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/55/netcup/60ece109bc24eb03bc17c242472e9c105b063ca4/suite.raw.log`. Its bounded per-run root is absent after completion.

Windows emitted the existing report-only global observer line `leak check: 424 new temp entries`, named `codex-census-contract-*`. The shared-host `os.tmpdir()` snapshot is contaminated by concurrent unsealed work and does not attribute those entries to this sealed run. No temp entry was removed and no suite was rerun. This observation is disclosed for review; it does not change the native sealed exit.
