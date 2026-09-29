# Lead finding, lane 46 at 2455f1d: the leak check false-reds on a shared host

Windows full suite at 2455f1d, run twice from a bundle clone at C:\Temp\tth-2455:
- Run 1: tests 2668, pass 2655, fail 0. `leak check: 56 new temp entries: four-read-accept-at-..., four-read-build-...`, so the run exits 1.
- Run 2: tests 2668, pass 2655, fail 0. `leak check: 1304 new temp entries: backlog-home-...`, so the run exits 1.

Discriminating runs, each file alone under the new runner on Windows:
- `run-tests.mjs --no-sweep scripts/four-read.test.mjs`: 103 tests, 0 fail, `leak check: 0 new temp entries`.
- `run-tests.mjs --no-sweep hooks/backlog-notice.test.mjs`: 21 tests, 0 fail, `leak check: 0 new temp entries`.

During run 2, a process listing showed another session's full suite running at the same time from C:\Users\benzh\Code\census-completeness (`node scripts/run-tests.mjs` and `node --test ...census-completeness\merge\...`). That checkout's runner does not have the per-run root, so its tests' temp dirs land in the real %TEMP%. Windows %TEMP% holds 7,964 `four-read-*` dirs in batches of 56 and 28, one batch per legacy run.

Conclusion: the per-run root works on Windows. P4's hard fail turns any concurrent run of an older runner on the same host into a red gate on a green suite. It happened on 2 of 2 Windows runs. Many sessions share each host, so this breaks other lanes' merge gates until every checkout carries the new runner. Even after that, one real escape in a single run reds every concurrent run. That worsens hours from ask to accepted and rework, and a spec is not allowed to worsen either.
