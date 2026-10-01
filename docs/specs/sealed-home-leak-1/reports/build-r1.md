STATUS: DONE f8aa816

Lane 24, sealed-home-leak, fix round 1. Took over mid-task from a builder stalled at a
permission prompt; its uncommitted edits in `scripts/run-tests.mjs` and
`scripts/run-tests.test.mjs` were verified against `review-r1.md` before anything else,
found already correct and complete, and committed as-is (plus a check that
`scripts/test-home.mjs` was untouched, per the lead's ruling not to apply F4). No new
code was written beyond what the stalled builder had left; this round's own work was
verification (line-by-line diff against the review's verbatim patches), two
discriminating checks in fresh scratch copies, and the gate run.

## F1 (BLOCKER, applied verbatim)

`scripts/run-tests.mjs:172` `keep();` -> `setImmediate(keep);`, and the CLI guard
`process.exit(main());` -> `process.exitCode = main(); setImmediate(() => {});`, both
with the exact comments from `review-r1.md`. Matches the review's patch character for
character.

Required regression test added at `run-tests.test.mjs:309`: spawns the real CLI
(`--no-sweep`, a 10s-sleep probe) detached, reads the sealed home path from stdout line
1, sends `SIGTERM` to the whole process group (`process.kill(-child.pid, "SIGTERM")`),
and asserts the child died from the re-raised signal (`signal === "SIGTERM"` or
`code === 143`) and that the home is gone. Skipped on win32 with the *existing* reason
text (copied verbatim from `test-home.test.mjs:413-415`, not reworded), assigned to
`WIN32_GROUP_SIGNAL_SKIP_REASON`.

Discriminating check (required by the brief): reverted both F1 edits in a fresh scratch
copy (`disc2-f1/`, made with `mkdir -p` + `cp`, never a git worktree) and ran only this
test. Result: **fails**, `code=0 signal=null` instead of the expected re-raised signal
— confirms the test discriminates on the F1 patch.

## F2 (MAJOR, applied verbatim)

New CLI-level test at `run-tests.test.mjs:273`, "the real CLI keeps a failed suite's
home after the process has exited (RT-18/F6)" — spawns the real CLI on a failing probe,
asserts non-zero exit and that the home printed on stdout still exists after the child
process has actually exited. Text matches `review-r1.md`'s F2 patch verbatim, plus
`spawnSync`/`spawn` added to the `node:child_process` import.

Discriminating check: in a second fresh scratch copy (`disc2-f2/`), replaced
`setImmediate(keep);` with a no-op comment (`keep` removed) and ran only this test.
Result: **fails**, `AssertionError: the exit handler must not delete a failed suite's
kept home` — confirms the test discriminates on `keep` being called.

## F3 (MINOR, applied verbatim)

`sweepStaleHomes`'s per-entry removal wrapped in its own `try`/`catch` so one
unremovable stale directory no longer aborts the whole sweep (logs
`run-tests: sweep could not remove <path>: <code>` and continues); the outer `catch`
path now also prints `swept ${swept} stale sealed homes` before returning, so the count
is always reported. Matches the review's patch verbatim.

## Not applied, per the lead's ruling

- F4 (NIT, re-raise while another same-signal listener exists): left alone.
  `scripts/test-home.mjs` has no diff from HEAD c294a5d — verified with `git status`/`git
  diff` before doing anything else.
- R1 residual (pid-only SIGTERM still waits for `spawnSync` to return): not acted on,
  as instructed.

## Gate

`node --test scripts/test-home.mjs scripts/test-home.test.mjs scripts/run-tests.test.mjs`
— actually run as specified: `node --test scripts/test-home.test.mjs
scripts/run-tests.test.mjs`, with `TMPDIR` set to a scratch dir
(`scratchpad/tmp-gate`), timeout-wrapped (120s; the new F1 test alone takes ~10.2s for
its slow probe).

Result: **39 pass, 0 fail** (was 37 pass before this round's two new tests). The `pass 0
fail 1` line visible mid-log is the *expected* inner failure of the deliberately-failing
probe fixture used by the existing "keeps the sealed home when the suite fails" test,
not a gate failure — the outer summary is 39/39.

## /tmp/sealed-home-* counts (real /tmp, not scratch)

Before this round's work: 129 (higher than the "84+3 recently" baseline in the brief —
pre-existing accumulation from other hosts/sessions, not from this round; every test in
the gate injects `TMPDIR`/uses `--no-sweep` and never touches the real `/tmp` or real
`~/.agents`, per the spec's own "verified absent" section in `review-r1.md`).
After the gate run: **129** — unchanged, confirming this round's tests and discriminating
checks never leaked into the real temp dir.

## Scratch artifacts left in place (not deleted, per instructions)

- `scratchpad/disc2-f1/` — copy with F1 reverted, used for the F1 discriminating check.
- `scratchpad/disc2-f2/` — copy with `keep` removed, used for the F2 discriminating
  check.
- `scratchpad/tmp-disc2-f1/`, `scratchpad/tmp-disc2-f2/`, `scratchpad/tmp-gate/` —
  injected `TMPDIR`s for the above and for the real gate run.
- `docs/specs/sealed-home-leak-1/reports/build-r1-gate.tmp.log` — full gate stdout,
  left untracked (never staged) inside the worktree; not part of the territory or the
  commit.

## Commit

`f8aa816` on `build/sealed-home-leak-1`, `scripts/run-tests.mjs` and
`scripts/run-tests.test.mjs` only. `docs/work/wr-2026-09-27-sealed-home-leak.record.md`
was left untouched (uncommitted, lead's file) — never staged or edited.
