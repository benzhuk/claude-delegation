VERDICT: APPROVE be80280

Lane 24, sealed-home-leak, delta re-review r3 of be80280 (head a26c5fc, which has no `scripts/` or
`skills/` change after be80280). Scope: r2's N1 and N2, plus the two Windows defects from
`windows-r1-f8aa816.log`. F4 and R1 stay deferred by the lead's ruling. There are no new findings.

All runs used fresh scratch copies of be80280 under `scratchpad/rv24r3/`, with `TMPDIR` set to a
scratch dir for every run, including the gate. The worktree was only read.

Territory gate, run by the reviewer: `TMPDIR=<scratch> node --test scripts/test-home.test.mjs
scripts/run-tests.test.mjs skills/multi/scripts/hooks.test.mjs` gives 66 pass, 0 fail, 0 skipped,
exit 0. The N2 lint test ("no test file in this suite inherits the runner environment on its own")
passes, and no `sealed-home-*` is left in the scratch `TMPDIR`.

Cause: in round 2, the F1 regression test signalled the process group before the sealed
`node --test` child existed, so it never reached the keep-on-a-killed-suite path (r2 N1). On win32,
the two CLI spawns built their env with an object spread (which the hooks.test.mjs:429 N2 lint
rejects) and set only `TMPDIR`, which `os.tmpdir()` ignores on win32.
Discriminating check: mutant m4 (`setImmediate(keep)` back to `keep()`) now fails the F1 test with
"the runner's own sealed home must not survive a group SIGTERM". In r2 it passed 13 of 13.
Fix location: `scripts/run-tests.test.mjs` (`writeSlowProbe` plus the ready-marker wait, the
`childEnv(fixtureHome, { TMPDIR, TEMP, TMP })` in both CLI spawns, and the new F3 test).
Simplification: no new mechanism. It reuses the existing `childEnv` helper, which the lint already
requires.

## Fix verification

### N1 (MAJOR in r2): fixed

The patch matches r2 verbatim: the ready marker, the 8 s deadline, `sentAt`, and the `< 5000 ms`
assertion. Measured with `run-tests.test.mjs` on fresh scratch copies:

| copy | result | F1 test |
|---|---|---|
| be80280 | 14 pass, 0 fail | pass, 172 ms (was 10176 ms at f8aa816) |
| m4: sync `keep()` only | 13 pass, **1 fail** | fails: "the runner's own sealed home must not survive a group SIGTERM" |
| m3: both F1 edits reverted | 13 pass, **1 fail** | fails: "must die from the re-raised signal (128+15), got code=1 signal=null" |

Both halves of F1 are now guarded: the home removal (m4) and the re-raise and exit code (m3).

### N2 (NIT in r2): fixed, with coverage added

The new test "F3: one unremovable stale entry does not abort the sweep..." passes on be80280.
Mutant m5 (the per-entry `try/catch` removed, so a removal error aborts the sweep again) fails it.
The kill does not depend on `readdir` order. If the locked dir comes first, the "ordinary stale dir
must still be removed" assertion fails, as observed. If it comes last, the "sweep could not remove"
error-line assertion fails, because the mutant prints "sweep error" instead. The skip reasons are
stated for win32 (no POSIX permission bits) and for root. The `chmod 700` restore runs in `finally`
before the scratch cleanup, and no entry is left in the scratch `TMPDIR`.

### Windows defect 1 (N2 lint at hooks.test.mjs:429): fixed

At f8aa816 the log showed `scripts\run-tests.test.mjs:276, :315` flagged as spread-env spawns
(`windows-r1-f8aa816.log:2571`). Both sites now use
`childEnv(fixtureHome, { TMPDIR: tmp, TEMP: tmp, TMP: tmp })`, and the N2 lint passes in this
round's gate. No spread of the process environment is left in `run-tests.test.mjs`.

### Windows defect 2 (the F2 test ignored TEMP/TMP on win32): fixed by construction, not run on win32 here

At f8aa816 the failure was "the home must be under the injected TMPDIR" (`windows-r1-f8aa816.log:2535`).
Passing `TEMP` and `TMP` alongside `TMPDIR` covers what `os.tmpdir()` reads on win32. Both sides of
the `startsWith` check go through `fs.realpathSync`, so they are normalised the same way. I cannot
run win32 here, so a Windows rerun of the gate should confirm it.

## Seal check requested for this round: holds

The same env construction was run from inside a `node --test` process (a scratch probe in the
scratch copy, not the worktree). There, `NODE_TEST_CONTEXT` was present in the parent. The spawned
child saw:
- `os.tmpdir()`, `TMPDIR`, `TEMP` and `TMP` all equal to the scratch tmp;
- `HOME` equal to the scratch fixture home;
- `NODE_TEST_CONTEXT` absent;
- `CLAUDE_CODE_MESSAGING_TOKEN` and `CLAUDE_CODE_MESSAGING_SOCKET` both `""` (blanked by `SEALED`).

`childEnv` returns a fresh object, so the later `delete env.NODE_TEST_CONTEXT` never touches the
parent's own environment. Because `HOME` now points at a scratch fixture, even if `--no-sweep` were
dropped by mistake, the CLI's sweep would read the fixture's `.agents` and the scratch `TMPDIR`,
never the real ones.

## Regression hunt (verified absent)

- No change to `scripts/run-tests.mjs` or `scripts/test-home.mjs` since f8aa816, so the r2 probe
  table (130, 143 and 129 with 0 left, the kept failure, and exit codes 0 and 2) still applies.
- The real `/tmp/sealed-home*` count moved 58 to 57 during my runs. That was other activity on the
  host: nothing I ran creates or deletes under the real temp dir.
- The F1 test got faster (about 10 s to about 170 ms), which also shortens the gate.

## Out-of-territory observations (not findings against this lane)

- `windows-r1-f8aa816.log:2552` also shows `skills/decisions/scripts/decisions-handback.test.mjs:846`
  failing on the Windows checkout with "fatal: bad revision 'origin/main'". That file is outside
  lane 24's territory and looks environmental (the Windows clone has no `origin/main`). `build-r2.md`
  does not mention it, so the coordinator should route it.
- `skills/multi/scripts/hooks.test.mjs` leaves 29 `multi-hook-*` dirs and 1 `note-cursor-fallback-*`
  dir in the temp dir on every run. That is in the multi lane, not here.
- The untracked `docs/specs/sealed-home-leak-1/reports/build-r1-gate.tmp.log` is still in the
  worktree. It is the builder's, and I did not touch it.
