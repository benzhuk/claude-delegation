# Focused load-run capture index — gate under load

The two TSV files beside this index are byte-preserved manifests from the atomic Windows harness. They record each scoped file run's start and end UTC time, direct exit, and the active full-suite PID. Runs 01–06 overlapped full-suite PID 73596; runs 07–10 overlapped PID 71244. Both suites have direct exit 0 in the same manifests.

The first manifest retains a non-counted `file 7` row marked `load-ended-before-run`; it records the observed race and is not claimed as an under-load pass. The second manifest starts the replacement full-suite process before the counted run 07. All counted file rows 01–10 carry direct exit 0.

The three prechange idle focused runs are documented in `wr-2026-09-26-gate-under-load-G1-report.md` as 43/43 exit-0 runs lasting 27.003s, 19.899s, and 12.181s. Individual raw stdout and exit sidecars are unavailable in retained evidence, and UTC start/end timestamps were not retained; only builder-reported counts, exits, and durations remain.
