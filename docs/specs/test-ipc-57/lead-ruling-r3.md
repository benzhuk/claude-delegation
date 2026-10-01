# Lane 57 lead ruling r3: review-r3 N1 to N5, the lead's intervention (round 3)

Input: docs/specs/test-ipc-57/review-r3.md, NEEDS_FIXES (5) at 9e36a08. Each finding has a ready patch, and the reviewer measured the combined patches on a scratch copy: the real tree still shows the same 15 sites in 10 files, and 1167b9a still flags :66 and :523.

Three review rounds in a row have found new false greens in a hand-built JS lexer. This round is the lead's intervention. It adopts the measured patches and makes one rule explicit: **when the scanner is unsure, it flags, never passes.**

- N1 (blocking): adopt the one-regex patch. Any use of the parent process environment as a whole object inside a node-reachable spawn call is inheriting. That covers `||`, `??`, ternaries, Object.assign, structuredClone and similar. This also removes most of what R1's line-level ownership did.
- N2 (blocking): adopt `regexEnd` in both string scanners, as the reviewer patched it. The lead signs off the change to the R2 regex fixture: it now asserts "parses correctly", not "trips the wire". The R2 tripwire stays as a backstop.
- N3: adopt. The comment strip becomes string-aware.
- N4: adopt, or better, remove R1's line ownership if N1 makes it redundant. Choose the version with fewer parts that still keeps every existing fixture green.
- N5: adopt. The failure text names each hit's own reason.
- The exemption table has 15 sites. Correct the count in the report.

Research (round 3, the five steps): the reviewer's report already holds the repro, the isolation and a measured discriminating check for each finding. Record in your report, per finding, that the fixture is red at 9e36a08 and green after.

Stop rule: this is the last fix round in this design. If the next review still finds a silent pass, the lead ships with the limit documented and opens a follow-up to replace the lexer with review-r3's simpler design (one key-presence rule plus one whole-file rule) after the bearings hold lifts.

Gates: the three touched files, then `TMPDIR=/var/tmp node scripts/run-tests.mjs` once.

Territory is unchanged.
