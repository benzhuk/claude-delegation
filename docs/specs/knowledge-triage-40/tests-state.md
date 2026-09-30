# Lane40 T2 state

Status: READY

Final test SHA: `5b08cc38a0bcff0ade5facf3e7d7da69ca14182d`

Updated: 2026-09-29 America/New_York

- Four owned test paths complete. Verification-only source cherry-picks are present locally and are not test deliverables.
- Test-only contract/ruling changes supplied by root remain unstaged and are not part of T2 commits.
- Syntax/diff checks pass.
- Code-review regressions have discriminating red evidence against reviewed source `42e356b` and scoped green evidence against fixes `1317543` plus `bac4849`.
- Six planned scratch-copy mutants were killed; exact costs and the retained scratch path are recorded in `tests-report.md`.
- N2 grandchild environments are sealed in test commit `27b3846`; the native review marker was absent.
- The first five-file gate attempt stopped because the global mutex was busy. After the reviewing lane released it, the native comparison passed 308/308 with 0 skips and leak check 0; the 29 inherited role-classification failures did not reproduce.
- Native raw-output provenance is `functions.exec` chunk `4721cc`; no filesystem raw log exists because the completed command was streamed without redirection. Exact command and receipt are in `tests-report.md`.
- Review-r2 F1-F4 tests are committed in `5b08cc3`: all claim-preservation cases pass real source and both destructive mutants fail; F2-F4 fail real source at their intended assertions.
- Authorized fixture extraction: reusable setup moved from `scripts/knowledge-gather.test.mjs` to `scripts/knowledge-gather.test-fixtures.mjs`; assertions and the scanner-visible N2 spawn remain in the test file.
- Failed sealed-run fixture directories remain because `delete-guard` refused their recursive removal; paths are recorded in `tests-report.md`.
- Next owner action: integrate `5b08cc3`, apply the separately owned F2-F4 source fix, then run the bounded focused green gate and the two destructive F1 mutants.
