VERDICT: APPROVE 63996a6b35eb2a143092bb354f58e026f9981f77

# Lane 54 (four-read-json) delta review r2

Delta: `git diff 84e643e 63996a6`. The code is at b13f448 and the appendix at 63996a6. I checked it on a scratch `git archive` of 63996a6 under `scratchpad/lane-54/rv/`. The worktree was not modified.

Cause: the r1 gate required `stallNudges`, a key only lane-38+ censuses write. `--spec-census` still went through the silent `loadJson`. The appendix cells left out two unavailable parts.
Discriminating check: I reverted each r2 fix on a scratch copy. Each revert makes exactly one new test fail (table below). With the fixes in place, the four-read suites pass 119/119.
Fix location: scripts/four-read.mjs:901 (key list), scripts/four-read.mjs:926-929 (`--spec-census` gate), docs/census.md:508, docs/reports/census-0928/four-read.md:323-327, scripts/four-read.test.mjs:1585-1587 and :1649-1679.
Simplification: none further needed. The gate is one list of keys and one helper, used for both census flags.

## Prior findings

- F-1 (MAJOR): fixed exactly as specified. `stallNudges` is out of the key list, and the comment explains why. The committed collect-status census now exits 0 again. `validateCensusArg` accepts all 40 committed census JSONs, with 0 rejections. The regression test is at scripts/four-read.test.mjs:1651.
- F-2 (MAJOR): fixed exactly as specified.
  - `--spec-census` set to the markdown fixture: exit 2, `four-read: --spec-census must be the build-census --json data file, not the census markdown`.
  - `--spec-census` set to a missing path: exit 2, "--spec-census file not found or unreadable".
  - A real committed spec-census JSON (render-readback): exit 0.
  - The docs/census.md:508 wording is corrected.
  - The main-level test checks exit 2, the exact stderr line, and that no output files exist.
- F-3 (MINOR): fixed. All 5 appendix rows now carry the verbatim four-read cell, `ASKs unavailable (no --lead-slug)` and `stall nudges unavailable (no --lead-slug)` included. Each matches my r1 independent reruns character for character. The other appendix columns are unchanged, and the report diff is only those 5 rows.
- F-4 (MINOR): fixed as specified, with `lead: null` and `lead: []` assertions at :1585-1587.

## New tests discriminate (mutations on the scratch copy, four-read.test.mjs, 113 tests)

| Mutation | Result |
|---|---|
| put `stallNudges` back in the key list (the r1 state) | 1 fail |
| remove the `--spec-census` gate (the r1 state) | 1 fail |
| drop the `--census`→`--spec-census` message rewrite | 1 fail |
| `isBuildCensusJsonShape` lead check → `return true` | 1 fail |
| lead check without the `Array.isArray` guard | 1 fail |

The scratch file was restored after each run and `cmp` confirmed it.

## Regressions

None found.
- The four-read suites pass: 119/119 (117 before, plus 2 new).
- Markdown `--census` still exits 2 with the F1 message.
- The `.replace('--census', '--spec-census')` call rewrites only the first match, which is the flag prefix in both messages, so a path that contains `--census` is not affected.

## Scope

The code changes are only in scripts/four-read.mjs and its test file. The other changes are:
- one caller line in docs/census.md;
- the appendix rows;
- the lane's own record and spec folder, which are orchestrator writes.

scripts/build-census.mjs and docs/GOALS.md are untouched.
