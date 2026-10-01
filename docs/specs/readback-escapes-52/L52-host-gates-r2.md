VERDICT: PASS

Candidate: `47780b4a87a17d6056abaab3b964e6e8b783f1b0` (`origin/build/readback-escapes-52`). The integration checkout remained clean at this exact SHA after both gates.

Windows sealed gate: PASS, native exit 0. Actual totals: 2932 tests, 2918 pass, 0 fail, 14 skipped, and 0 new temp entries. Receipt set: `windows/47780b4a87a17d6056abaab3b964e6e8b783f1b0/{suite.raw.log,suite.exit.txt,suite.summary,preflight-diff.raw.log,preflight-diff.exit.txt}`. It ran from `2026-09-29T02:13:44.9376584Z` through `2026-09-29T02:17:18.3756508Z`.

Netcup sealed gate: PASS, native exit 0 and SSH exit 0. Actual totals: 2932 tests, 2927 pass, 0 fail, 5 skipped, and 0 new temp entries. Receipt set: `netcup/47780b4a87a17d6056abaab3b964e6e8b783f1b0/{suite.raw.log,suite.exit.txt,suite.summary,preflight-diff.raw.log,preflight-diff.exit.txt}` plus `netcup-gate-r2-ssh.raw.log` and `netcup-gate-r2-ssh.exit`. It ran from `2026-09-29T02:13:44Z` through `2026-09-29T02:14:05Z`.

The r1 remote configuration defect is corrected for this run: remote candidate HEAD was checked out clean at the stated SHA, `origin/main` resolves to `7ab59dbd496c062f1cbb8eb259dd5a95aa9f9088`, and `/tmp/claude-verify.lock` was a regular persistent lockfile. The Windows runner set its resolved repository as cwd before `scripts/run-tests.mjs`; the Netcup runner used the shared lock and absolute login-shell Node. No source, work-record, or index change was made by these gates.
