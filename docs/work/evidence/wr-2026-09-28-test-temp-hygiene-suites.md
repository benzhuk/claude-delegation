VERDICT: PASS 3ff71effc9cb9933edcb7446d1412e32bd2b8f98 (lead-run full suites, supporting evidence, not the deciding review)

# Lane 46 full suites

- Windows (ben-desktop), run by the lead from a bundle clone at 3ff71ef: exit 0, tests 2670, pass 2656, fail 0, skipped 14, `leak check: 0 new temp entries`.
- Netcup, run by the lead in the lane worktree (code identical to 3ff71ef, docs-only commits after it): exit 0, tests 2670, pass 2665, fail 0, skipped 5, `leak check: 0 new temp entries`.
- History: at 2455f1d the Windows suite passed every test on two runs (0 fail), but read `leak check: 56 new temp entries` and `1304 new temp entries`. The files run alone read 0, and a concurrent legacy full suite from another checkout was seen (reports/lead-finding-windows.md). That led to ruling R1: the check is a reader, not a gate.
