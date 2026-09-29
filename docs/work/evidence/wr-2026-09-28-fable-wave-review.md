VERDICT: APPROVE e7f5f25c3e6f7b7351476358b311cbfb2d7d5d5b

# Lane 51 fix round 2, delta review r3 (wr-2026-09-28-fable-wave), artifact e7f5f25

Diff reviewed: `git diff 6b95a2d e7f5f25`.
- The code commit, e7f5f25, touches scripts/build-census.mjs, scripts/build-census.wake-split.test.mjs and docs/specs/fable-wave-51/review-r2.md.
- The other commits in the range are 75cb394, 0f87b7f and f5cc396. They carry only build-r1.md, fable-lead-read-r1.md and the record, all orchestrator documents.

Checks ran on scratch copies under the lane-51 scratch dir:
- `rv3-2g3Y` is a git archive of e7f5f25;
- the mutants are in `rv3-mut-*`;
- the fixture scripts are in `rv2-fx/`.

The reviewed worktree is untouched: `git status --short` shows 0 entries.

Count: 0 findings. There is one scope note, which is not a defect.

Cause: at 6b95a2d, a pre-window RESULT wake line whose own run straddled the window start went into `eligible` twice: once as a wave starter and once as that run's record. The record then coalesced into its own wave. Waves also could not chain past the hold filter, lines after `--to` counted as pre-window, and the ceiling dropped re-used requests.
Discriminating check: fixture A (the MINOR 2 test's own lines) gives `coalescable.turns` 1 at 6b95a2d and 0 at e7f5f25. On this host's transcript, `--from 2026-09-27T18:21:30Z` gives coalescable 1 (upper 630025) at 6b95a2d and 0 at e7f5f25. The ceiling is unchanged at 630025.
Fix location: scripts/build-census.mjs censusLeadFile:
- the push guard at :488;
- the `resultRecordAtMs` dedupe and the unfiltered `preWindowEligible` at :545-558;
- the ceiling loop at :597-603.
The five tests are at scripts/build-census.wake-split.test.mjs:217-253.
Simplification: the hold-window filter and `windowStartMsForHold` are gone. The pre-window list is now every RESULT line before the window starts, minus the one line that is already a run's record.

## Each r2 finding

- **Code matches the r2 patches exactly.** `diff` of e7f5f25's build-census.mjs, wake-split test and docs/census.md against the copy r2 verified (`rv2-full2-gZwW`) shows only the two comment edits. r2 specified those edits but that copy had not applied them: the MINOR 3 comment at :392-395 and the MINOR 4 comment at :577. docs/census.md is unchanged, as r2 said it should be.
- **MAJOR 1 (straddle self-coalescing): fixed.**
  - Fixtures give A 0, B 0 and G 1; they gave 1, 1 and 2 at 6b95a2d.
  - On the host, `--from 18:21:30Z` and `--from 03:56:40Z` both give coalescable 0. At 6b95a2d they gave 1 and 1.
  - The lead's gap read fits this: 8 RESULT rows, row 1 the straddling run.
- **MINOR 2 (chaining): fixed.** Fixture K gives 0 windowed and 1 unwindowed, so the windowed count now matches the whole file.
- **MINOR 3 (post-`--to` lines): fixed.** The guard is `!windowStarted` at :488, and fixture L gives 0.
- **MINOR 4 (ceiling guard): fixed.**
  - The ceiling loop has no guard. Fixture J gives a ceiling of 10 where 6b95a2d gave 0.
  - The upper and lower loops keep their guard.
  - Host ceilings are identical to 6b95a2d in 7 windows (2609154, 1545943, 1063211, 630025, 2438570, and two empty).
- **MINOR 5 (unpinned rules): fixed.** All 9 mutants of e7f5f25 are killed:

  | mutant | failing tests |
  |---|---|
  | upper guard dropped | 1 |
  | lower guard dropped | 1 |
  | pre-window line may coalesce | 1 |
  | straddle dedupe removed | 2 |
  | hold filter restored | 1 |
  | `!inWindowNow` restored | 1 |
  | ceiling guard restored | 1 |
  | ceiling = coalescableRecords | 4 |
  | `>` boundary | 1 |

## Regressions: none found

- **Test suites.** Census 125 pass, 0 fail. four-read 109 pass, 0 fail.
- **Partition.** It holds exactly in 7 host windows: `wakeTurns + stopBlockTurns + otherTurns == leadTurns`, with 0 per-model token mismatches.
- **Dedupe safety.** The dedupe drops a pre-window line only when it has the same millisecond as a RESULT record's `at`. That record is itself in `eligible` at that millisecond, so dropping the line can never change which wave starts there.
- **Guard behaviour by mode.** With `--marker` and `--from`, `windowStarted` is false only before the window starts. Unwindowed or with `--to` only, it is true from line 1, so nothing is recorded.
- **Unwindowed output.** Host output is unchanged from 6b95a2d.

## Scope note

e7f5f25 also adds docs/specs/fable-wave-51/review-r2.md. It is byte-identical to the r2 report (`cmp`), the same review-input copy that 037d6c4 made for r1.
- On the three named files: build-census.mjs and the wake-split test changed, and docs/census.md needed no change.
- No other code, hook or record file changed.
- No action needed.
