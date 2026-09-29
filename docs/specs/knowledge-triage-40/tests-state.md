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
- The requested five-file sealed gate was not run because the global mutex was busy on the required immediate acquisition; no retry was attempted.
- Failed sealed-run fixture directories remain because `delete-guard` refused their recursive removal; paths are recorded in `tests-report.md`.
- Next owner action: integrate test commit `27b3846` after the earlier Lane40 test commits, then run the requested sealed scope when root owns the global verification mutex.
