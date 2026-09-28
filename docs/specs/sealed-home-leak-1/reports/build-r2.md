STATUS: DONE be80280

Lane 24, sealed-home-leak, fix round 2 of f8aa816 (HEAD at start: efc5201). Two findings
sources this round: `docs/specs/sealed-home-leak-1/reports/review-r2.md` (N1, MAJOR) and
the Windows full-suite run at f8aa816, log
`docs/specs/sealed-home-leak-1/reports/windows-r1-f8aa816.log` (two lane defects: N2's
lint at `hooks.test.mjs:429`, and the RT-18/F6 test's win32 TMPDIR/TEMP mismatch). N2 (the
optional F3 unit test) was applied too, per the coordinator's instruction. Only
`scripts/run-tests.test.mjs` changed - review r2 confirmed F1/F2/F3 are fixed in
`scripts/run-tests.mjs` itself, and this round found nothing wrong with the source, only
with the round-1 tests.

## N1 (MAJOR, applied verbatim)

Cause (review-r2.md): the F1 group-SIGTERM test signalled the child process group as soon
as the runner printed its sealed home path on stdout, which happens before the sealed
`node --test` grandchild even exists. That grandchild then ran the 10s-sleep probe to a
harmless pass, ordinary `cleanup()` removed the home, and the deferred signal re-raised on
an already-clean process - the test went green without ever exercising the
keep()-on-a-killed-suite path it exists to guard. Mutant m4 (sync `keep()` restored,
everything else from round 1 kept) still passed all of `run-tests.test.mjs` for exactly
this reason.

Applied `review-r2.md`'s patch verbatim: `writeSlowProbe` now writes a ready-marker file
from inside the probe once it is actually running; the test waits for that marker (8s
bounded poll) before sending the group SIGTERM, records `sentAt`, and asserts
`Date.now() - sentAt < 5000` in addition to the existing signal/home assertions.

Discriminating check (required): built mutant m4 in a fresh scratch copy
(`scratchpad/disc3-n1/`, made with `mkdir -p` + `cp`) - only `setImmediate(keep);` changed
back to `keep();`, nothing else touched. Ran only the F1 test with `TMPDIR` pointed at
`scratchpad/tmp-disc3-n1/`. Result: **fails**, `AssertionError: the runner's own sealed
home must not survive a group SIGTERM (true !== false)` - confirms the ready-marker/timing
patch now reaches the leak it is supposed to catch.

## Windows defect 1: both new CLI spawns built their own env, tripping N2's lint

`skills/multi/scripts/hooks.test.mjs:429` ("N2: no test file in this suite inherits the
runner environment on its own") flagged `scripts/run-tests.test.mjs:276` and `:315` - both
built `{ ...process.env, TMPDIR: tmp }` directly instead of going through `childEnv()`.
Fixed by importing `childEnv` from `../skills/multi/scripts/test-child-env.mjs` and
building both envs as `childEnv(fixtureHome, { TMPDIR: tmp, TEMP: tmp, TMP: tmp })`, where
`fixtureHome` is a fresh `scratchDir(...)` per test (never the real `HOME`). `NODE_TEST_CONTEXT`
is still deleted from the built env afterward, since `childEnv` does not itself drop it.

One self-inflicted follow-up: my first draft's explanatory comment for the new import
contained the literal spread pattern the N2 lint scans for (in a code comment, not code),
which the lint's line-scan does not distinguish from real code - it flagged
`scripts/run-tests.test.mjs:18` on the first gate run. Reworded the comment to describe the
pattern in prose instead of quoting it; the gate is clean on the rerun.

## Windows defect 2: the RT-18/F6 keep test wrote its home outside the injected TMPDIR on win32

`os.tmpdir()` reads `TEMP`/`TMP` on win32, never `TMPDIR`, so the old
`{ ...process.env, TMPDIR: tmp }` env left the sealed home under the real Windows temp dir
even though the test asserted against a `TMPDIR`-derived path. The same `childEnv(...,
{ TMPDIR: tmp, TEMP: tmp, TMP: tmp })` fix above resolves this - all three env vars now
point at the same scratch dir, so `os.tmpdir()` resolves there on every platform. The
`assert.ok(home.startsWith(fs.realpathSync(tmp)), ...)` assertion is unchanged, as
instructed.

## N2 (optional per r1's F3 finding, applied per this round's instruction)

Added `"F3: one unremovable stale entry does not abort the sweep, and the partial count is
still printed"` to `run-tests.test.mjs`. Fixture: the existing `makeAgeSet()` stale dir,
plus a new `sealed-home-locked` stale dir whose `sub` subdirectory holds a file and is
`chmod 500` (denies unlinking that file, the same shape a foreign `sealed-home-*` on a
shared `/tmp` produces), plus one more removable stale dir. Asserts the ordinary stale dir
and the removable one are gone, the locked one survives, `result.swept === 2`, an error
line names `sealed-home-locked`, and the printed line is exactly `swept 2 stale sealed
homes`. `chmod 700` is restored on the locked subdirectory both inline (in the test's own
`finally`, before `makeAgeSet`'s own scratch-dir cleanup - registered earlier - would
otherwise try and silently fail to recursively remove it) and in the suite-wide after-hook
as a safety net. Skipped on win32 (no POSIX permission bits; the sweep's own guarantee
there is the 6h age check per the spec) and when `process.getuid?.() === 0` (root ignores
the chmod 500 deny).

Discriminating check (required): in a second fresh scratch copy (`scratchpad/disc3-n2/`),
reverted the F3 patch in `run-tests.mjs` (the per-entry `try`/`catch` around `rmSync`
removed, back to a bare call) and ran only the new N2 test with `TMPDIR` pointed at
`scratchpad/tmp-disc3-n2/`. Result: **fails** -
`AssertionError: the ordinary stale dir must still be removed (true !== false)` - the
locked-dir error now propagates out of the whole loop via the outer `catch`, aborting the
sweep before the ordinary stale dir is ever reached. Confirms the test discriminates on the
per-entry `try`.

## Gate

`node --test scripts/test-home.test.mjs scripts/run-tests.test.mjs
skills/multi/scripts/hooks.test.mjs`, `TMPDIR` pointed at `scratchpad/tmp-gate-r2b/`,
timeout-wrapped (180s).

Result: **66 pass, 0 fail** across all three files (test-home.test.mjs: 20, run-tests.test.mjs:
15 - up from 14, with the new N2/F3 test added - hooks.test.mjs: 31, N2's lint included).
The one visible `fail 1` mid-log is the expected inner failure of the deliberately-failing
probe fixture used by the pre-existing "runSealed keeps the sealed home when the suite
fails" test, not a gate failure.

## /tmp/sealed-home-* counts (real /tmp)

129 before this round's work, 129 after (unchanged) - every test and discriminating check
this round used an injected `TMPDIR`/`childEnv`-built fixture home, never the real ones.

## Scratch artifacts left in place (not deleted, per instructions)

- `scratchpad/disc3-n1/`, `scratchpad/disc3-n2/` - fresh copies for the two discriminating
  checks (mutant m4, F3-try-removed).
- `scratchpad/tmp-disc3-n1/`, `scratchpad/tmp-disc3-n2/`, `scratchpad/tmp-gate-r2/`,
  `scratchpad/tmp-gate-r2b/` - injected `TMPDIR`s for the above and for two gate runs (the
  first gate run caught my own comment tripping the N2 lint; the second, after the reword,
  is the one reported above).
- `scratchpad/gate-r2-full.log`, `scratchpad/gate-r2b-full.log` - full gate stdout for both
  runs, left under the scratchpad (not the worktree, not staged).
- `docs/specs/sealed-home-leak-1/reports/build-r1-gate.tmp.log` (from round 1) - left
  untracked, untouched, per this round's instruction.

## Commit

`be80280` on `build/sealed-home-leak-1`, `scripts/run-tests.test.mjs` only.
`docs/work/wr-2026-09-27-sealed-home-leak.record.md` was not touched or staged this round
(no local edits to it were present at the start of this round).
