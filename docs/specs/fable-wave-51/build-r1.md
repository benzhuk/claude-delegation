DONE 6b95a2d6d0396000472b69ee5e4b9a36d74f3e28

# Lane 51 fix round 1 build report (wr-2026-09-28-fable-wave)

Applies every finding in `docs/specs/fable-wave-51/review-r1.md` (VERDICT: NEEDS_FIXES 828dc30)
that was assigned to the builder. Territory: `scripts/build-census.mjs`,
`scripts/build-census.wake-split.test.mjs`, `docs/census.md`, this report.

Cause: the review's root cause stands as stated — W1b's "upper bound" (:537-549) only models
a leading-edge RESULT-to-RESULT wave and is not an upper bound of the ruled M2/debounce design,
so a true ceiling (every RESULT, non-Done-tick wake-opened turn) is needed before the lead can
re-read the Fable window. Three smaller defects rode along: a request re-used by a later run
could be double-bucketed into the coalescable upper/lower sums (MINOR 4), a RESULT wave that
starts just before the window boundary lost its wave-starter role for an in-window RESULT less
than the hold window later (MINOR 3), and two mutants (the exact-hold-minute boundary, and a
rolling-vs-leading-edge wave) passed the full suite undetected (MINOR 5).

Discriminating check: the new straddle2 test (MINOR 3) — `W1b/window edge (straddle2): a
RESULT wave that starts just before the window still absorbs an in-window RESULT less than N
minutes later` — fails before the fix (`0 !== 1`, `coalescable.turns` stayed 0 because the
pre-window RESULT wake line never entered the wave computation) and passes after it. Verified
by temporarily restoring the pre-fix `scripts/build-census.mjs` (via `git show HEAD:...`, then
restored from a scratch backup copy — no git checkout/reset/stash used) and re-running just
that test. Also spot-checked one of MINOR 5's named mutants (`>= holdMs` -> `> holdMs`): the
new "wake exactly N minutes after the wave start" test catches it (`1 !== 0`).

Fix location: `censusLeadFile` in scripts/build-census.mjs — the RESULT-wave block
(~:536-608 after edits): the `eligible`/`coalescableRecords` loop, the new
`preWindowResultAts` list (declared with the other per-run state near `wakeRunRecords`, and
populated in the user-line branch alongside `pendingTag`), the `upperByModel`/`lowerByModel`
loop, and the new ceiling (`resultRecords`/`resultByModel`) block just before `return {`. Also
the markdown line at (pre-edit) :1599, and `docs/census.md`'s `wakeSplit` paragraph.

Simplification: none beyond what the findings already specified — MAJOR 1's ceiling loop
needs no simulation (per the review's own "Simplification" note), just a filtered sum over
every RESULT, non-Done-tick wake-opened turn's tokens.

## Per-finding status

- **MAJOR 1, part (a) — the ceiling patch**: applied verbatim (the `resultRecords`/
  `resultByModel` block, the `coalescable.resultTurns`/`resultByModel` fields, and the
  markdown line). Part (b) (the lead's judgment re-read of the Fable window against the new
  ceiling) is explicitly out of scope for this builder, per the task brief.
- **MINOR 2**: the verbatim test added (`W1/--from: a run opened by a wake before --from and
  still running at --from is wake-opened...`). It needs `toolResult` and the `wake`/`asst`/
  `run` helpers, which are defined once (shared with MINOR 5) rather than duplicated.
- **MINOR 3**: implemented as instructed — `preWindowResultAts` records each out-of-window
  RESULT, non-Done-tick wake line's timestamp (set in the user-line branch, guarded by
  `!inWindowNow`); after the loop, entries within `WAKE_SPLIT_HOLD_MINUTES` of `windowStartAt`
  are merged into the wave-start sort as `preWindow: true` entries that can start a wave but
  are never pushed into `coalescableRecords`. The straddle2 test (windowed at T gives `turns:
  1`) was verified to fail before the fix and pass after.
- **MINOR 4**: the patch applied verbatim to the `upperByModel`/`lowerByModel` loop
  (`liveWindowEntries` guard on both the per-entry loop and the `firstEntry` check), and the
  same guard applied to MAJOR 1's ceiling loop, with the `liveWindowEntries` declaration moved
  above both loops, as the finding instructs.
- **MINOR 5**: both tests added verbatim (the wave-measured-from-its-start test, and the
  exact-N-minute boundary test). `WAKE_PREFIX` was merged into the file's existing
  `./build-census.mjs` import rather than added as a second import line. No helper names
  collided with the file's existing ones (`wake`/`asst`/`toolResult`/`envR`/`run`/`M` were all
  new), so nothing needed renaming.
- **NIT 6**: `docs/census.md`'s `wakeSplit` paragraph replaced with the given text (the
  heading-pointer fix, the window-edge +1 sentence, and the MAJOR 1 ceiling clause appended
  after "RESULT-only wakes").

## Test counts

- `node --test scripts/build-census*.test.mjs`: 121 pass, 0 fail (117 at 828dc30 + 4 new:
  MINOR 2's test, MINOR 3's straddle2 test, MINOR 5's two tests).
- `node scripts/run-tests.mjs` (full suite): 2911 pass, 0 fail, 5 skipped (2916 total).

## Scope

Touched only `scripts/build-census.mjs`, `scripts/build-census.wake-split.test.mjs`,
`docs/census.md`, and this report. No change to note-flush, note-send, four-read.mjs, hooks/,
or any record file.
