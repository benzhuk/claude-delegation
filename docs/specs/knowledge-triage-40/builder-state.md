# Lane40 builder state (source child)

Correction (fix round 1): the earlier milestone lines "M1 18:40 NY" and "M2 18:47 NY" were estimates, not real clock readings. Actual commits: source 3543078 at 18:36:37, report 4597f3c at 18:37:33 (America/New_York, per root's record). Those estimates were wrong; do not rely on them.

- M0: read brief, rev4, adjudications, probe-r4, installer, counts. No blockers.
- M1: all owned source written; scratch smoke passed; gate 1 had one self-caused failure, fixed.
- M2: gate 2 green (75 tests, 72 pass, 0 fail); source committed 3543078; report 4597f3c.
- Fix r1 (real clock 2026-09-29 18:48 -04:00): added validated optional `--first-run YYYY-MM-DD` to the installer (triage only, default = local date of now), carried as startDate to windowsTaskXml. Installer test file: 56 tests, 50 pass, 3 fail, 3 skipped; the 3 failures all stop at `writer host not found in triage skill` because the fixture's writer sentence ("Only `X` is the designated writer host") does not match the skill's real "designated writer: Windows host `X`" form; root said that fixture is being corrected independently.
- Fix r1b: removed the unrequested firstRun alias from windowsTaskXml (now startDate only); syntax check only, no test run.
