# Lane40 T2 state

Status: READY

Final test SHA: `27b384620dd9d22b24e9dd508190437a8889aaf6`

Updated: 2026-09-29 America/New_York

- Four owned test paths complete. Verification-only source cherry-picks are present locally and are not test deliverables.
- Test-only contract/ruling changes supplied by root remain unstaged and are not part of T2 commits.
- Syntax/diff checks pass.
- Code-review regressions have discriminating red evidence against reviewed source `42e356b` and scoped green evidence against fixes `1317543` plus `bac4849`.
- Six planned scratch-copy mutants were killed; exact costs and the retained scratch path are recorded in `tests-report.md`.
- N2 grandchild environments are sealed in test commit `27b3846`; the native review marker was absent.
- The first five-file gate attempt stopped because the global mutex was busy. After the reviewing lane released it, the native comparison passed 308/308 with 0 skips and leak check 0; the 29 inherited role-classification failures did not reproduce.
- Native raw-output provenance is `functions.exec` chunk `4721cc`; no filesystem raw log exists because the completed command was streamed without redirection. Exact command and receipt are in `tests-report.md`.
- Failed sealed-run fixture directories remain because `delete-guard` refused their recursive removal; paths are recorded in `tests-report.md`.
- Next owner action: retain the passing native comparison alongside the prior mid-tier full-gate failure when adjudicating the role-marker diagnosis and the pending review-r2 findings.
