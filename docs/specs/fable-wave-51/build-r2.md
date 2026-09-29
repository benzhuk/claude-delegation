DONE e7f5f25c3e6f7b7351476358b311cbfb2d7d5d5b

# Lane 51 fix round 2 build report (wr-2026-09-28-fable-wave)

Applies every finding in `docs/specs/fable-wave-51/review-r2.md` (VERDICT: NEEDS_FIXES
6b95a2d), the delta review of round 1's fix (6b95a2d). Territory: `scripts/build-census.mjs`,
`scripts/build-census.wake-split.test.mjs`, `docs/census.md`, this report.

Cause: round 1's MINOR 3 fix (recording a pre-window RESULT wake line so it could start a
wave) recorded that line even when its own run straddled the window start. That run then
became a `wakeRunRecords` entry at the same timestamp, so both the pre-window copy and the
in-window record entered `eligible`; the pre-window copy sorted first, started the wave, and
the record 0 ms later fell into the `else` branch and counted itself coalescable — a run
coalescing into the wave it started. Riding along: the hold-window filter on
`preWindowResultAts` broke wave chaining (an old pre-window line outside the hold window could
still decide whether a nearer one starts a new wave or joins an existing one); the `!inWindowNow`
guard also captured wake lines after a `--to` end; and the MINOR 4 `liveWindowEntries` guard,
correct for the upper/lower bounds, was wrongly applied to the ceiling loop, where it can only
push a true ceiling down, never up.

Discriminating check: at 6b95a2d, before this round's fix, 5 of the round's new/extended tests
fail:
- the extended MINOR 2 test (`assert.equal(c.wakeSplit.coalescable.turns, 0)` — fails
  `1 !== 0`, the straddling run coalesces into its own wave);
- `W1b/window edge: a straddling RESULT run starts the wave an in-window RESULT joins, once`;
- `W1b/window edge: pre-window waves chain from their own start...`;
- `W1b/--to: a RESULT wake after the window ends never starts a wave...`;
- `W1b/ceiling: a request a later run re-used leaves the W1b bounds but stays in the RESULT
  ceiling` (fails `101 !== 111`, the ceiling guard wrongly drops the re-used request).
Verified by temporarily restoring 6b95a2d's `scripts/build-census.mjs` (via `git show
6b95a2d:...`, from a scratch backup, no git checkout/reset/stash) and running
`scripts/build-census.wake-split.test.mjs` alone: 8 pass, 5 fail, the 5 named above. Restored
the round-2 file from the scratch backup immediately after. All 5 pass after the patch.

Fix location: `censusLeadFile` in scripts/build-census.mjs — the `preWindowResultAts` push
guard (`!inWindowNow` -> `!windowStarted`), its declaring comment, the `preWindowEligible`
build (drops the hold-window filter, adds `resultRecordAtMs` to exclude a straddling run's own
timestamp), the `liveWindowEntries` comment, and the ceiling loop (drops the
`liveWindowEntries` guard). No change to docs/census.md — its existing wakeSplit paragraph
stays accurate.

Simplification: per the review's own note, no special window-edge bookkeeping is needed —
record every pre-window RESULT line unconditionally (no hold filter) and drop only the ones
whose timestamp exactly matches a `wakeRunRecords` entry's `at` (the straddling run's own
record), since a dropped line at that millisecond can never change the wave result (the record
itself occupies that same millisecond in `eligible` and starts the same wave).

## Per-finding status

- **MAJOR 1 (straddling run coalesces into its own wave)**: fixed via part (b) — a straddling
  run's wake-line timestamp is excluded from `preWindowEligible` via `resultRecordAtMs`, so it
  can no longer be counted twice (once as the wave starter, once as the record that joins it).
- **MINOR 2 (hold-window filter breaks wave chaining)**: fixed via part (b) — the
  `windowStartMsForHold`/hold filter is dropped; every pre-window RESULT line is eligible to
  chain waves, matching the unwindowed truth.
- **MINOR 3 (`!inWindowNow` also captures post-`--to` lines)**: fixed via part (a) — the guard
  is `!windowStarted`, which stays true only before the window starts (never after a `--to`
  end, since `windowStarted` does not un-set).
- **MINOR 4 (ceiling wrongly carries the liveWindowEntries guard)**: fixed via part (c) — the
  guard is dropped from the ceiling loop only; the upper/lower loops keep it.
- **MINOR 5 (unpinned rules)**: the test patch applied verbatim, adding the straddle-dedupe
  assertions to the extended MINOR 2 test plus four new tests (straddling-wave-join,
  pre-window chaining, `--to` end exclusion, and the ceiling's re-used-request behavior).
- Comment at (pre-edit) :571-572 updated verbatim: "Declared above both loops that need it
  (this one and the ceiling's)" -> "The ceiling below deliberately does not use it (R2)."
- `userPlain` was already present as a helper in the test file (added in round 1); no new
  helper was needed.

## Test counts

- `node --test scripts/build-census*.test.mjs`: 125 pass, 0 fail (matches the review's
  prediction).
- `node --test scripts/four-read*.test.mjs`: 109 pass, 0 fail.
- `node scripts/run-tests.mjs` (full suite): 2915 pass, 0 fail, 5 skipped (2920 total).

## Scope

Touched `scripts/build-census.mjs`, `scripts/build-census.wake-split.test.mjs`,
`docs/specs/fable-wave-51/review-r2.md` (copied in per the coordinator's instruction), and this
report. `docs/census.md` needed no change.
