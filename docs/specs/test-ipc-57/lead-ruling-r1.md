# Lane 57 lead ruling r1: review-r1 F1 to F8, plus the Windows N2 failure

Inputs:
- docs/specs/test-ipc-57/review-r1.md: NEEDS_FIXES (8) at 0824e76. Each finding carries a ready patch.
- docs/specs/test-ipc-57/win-0824e76-fail.md: on Windows, N2 fails because every exemption misses.

The scanner is now the gate for every future test file, so a false green is the defect that matters. The simplest correct design wins over the smallest diff (goal card: no more parts than the simplest design).

## Scope of this round

- **W1: path separators.** On win32, all 9 exemptions miss: the keys use `/`, and the scanner reports `\` paths. Normalize every reported path to `/` before matching and before printing. Add a unit test that feeds a backslash path and expects the match.
- **F1: adopt the reviewer's patch.** Comments and string/template contents are blanked before the call's extent is found. A measured false green on real code (note-inbox.test.mjs:369) becomes a unit-test fixture.
- **F2: key exemptions by file, with an exact count per file,** not by `file:line`. Each entry is `{ file, count, reason }`. N2 fails when a file has more no-env sites than its count (a new site) or fewer (a stale entry: lower the count, or drop the entry). Unrelated edits that move lines never turn N2 red. Unit-test both directions.
- **F3: widen the rule.** A spawn is in scope if `process.execPath`, `NODE` or `'node'` appears anywhere in its argv, including behind `sh -c`. That is what "can reach the runner's session" means. Git, taskkill and mkfifo children with no node in their argv stay out of scope, with that reason written next to the check. `collect-from-origin.test.mjs:423` is outside this lane: add an exemption entry, and list it in the report as a follow-up.
- **F4: an env value of `undefined`, `null`, `process.env`, or a bare spread of `process.env` counts as no env.** `native-continuation-smoke.test.mjs:20` is outside this lane: add an exemption entry, list it as a follow-up, and correct build.md's citation of that file in your report (do not edit build.md).
- **F5: delete the "provably inert `-e` literal" special case.** It adds parts and proves little. Its four sites become ordinary exemption entries with their reasons. Fewer parts is the point.
- **F6: include `fork(`.** A bare `'node'` is covered by F3.
- **F7: adopt the reviewer's patch.** Resolve the options variable to the nearest declaration before the call, and match `env` only as an object key.
- **F8: adopt.** Remove the scratchHome dirs in the tests' own `after`/`finally` hooks, the way that file's other tests already clean up.
- **Ruling-letter sign-off (F3):** the lead accepts "node reachable" as the rule's scope. skills-fable's ruling says "a spawn in a test file that passes no env key". A child with no node in its argv cannot report into the runner or reach the session's messaging environment. The RESULT to skills-fable says this explicitly.

Territory is unchanged: the N2 scanner and its unit tests in skills/multi/scripts/hooks.test.mjs, scripts/test-home.test.mjs and scripts/run-tests.test.mjs. Out-of-territory sites get exemption entries only, never edits.

Red and green: at 0824e76, the new unit tests for W1, F1, F2 (both directions), F4 and F7 must fail, each proved on a mktemp copy. After the fix they pass. The existing red at 1167b9a still flags test-home.test.mjs:66 and :523, re-checked with the final scanner applied to that commit's tree.

Gates:
1. `node --test` on the three files.
2. `TMPDIR=/var/tmp node scripts/run-tests.mjs` once.
