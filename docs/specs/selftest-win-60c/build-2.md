VERDICT: DONE bfb5cd4447077b9e4fbc11143f35136674f45aef

# Lane 60c round 2 fix report

Territory: `dot_claude/hooks/executable_secret-guard-selftest.sh` only, in
`/var/tmp/lane-60c/dot` (branch `build/selftest-win-60c-1`).
Base before this fix: `2ddcbf5` (round-1 commit). New HEAD:
`bfb5cd4447077b9e4fbc11143f35136674f45aef`.
The hook `dot_claude/hooks/executable_secret-guard.sh` is unchanged since
base `6f183eb` (`git diff --quiet 6f183eb...HEAD -- .../executable_secret-guard.sh`
exits 0).

Applied the reviewer's patches from `/var/tmp/lane-60c/review.md` verbatim
(F1 parts 1+2, F2, F3), plus updating the stale comment block above
`paths_match` to describe the new Windows-only scoping.

## F1 (HIGH) — payload-builder abort guard didn't actually abort
- Cause: `_py_json`'s `exit 1` only terminated the `$(...)` command
  substitution the caller wrapped it in, not the top-level script. With
  `set -u` (no `set -e`), the caller proceeded with an empty payload, the
  hook allowed on malformed/empty stdin, and every "should allow" case
  passed vacuously while every "should deny" case failed for real.
- Fix location: added `SELFTEST_PID=$$` + `trap ... USR1` right after the
  interpreter-resolution block (before "platform detection"), and in
  `_py_json` changed the failure condition to `[ "$status" -ne 0 ] ||
  [ -z "$out" ]`, sending `kill -USR1 "$SELFTEST_PID"` before `exit 1`.
- Simplification: no changes needed at any of the 87 call sites — the
  signal propagates from inside the subshell to the top-level shell.
- Discriminating check: built a `python3` shim (`/var/tmp/delegation-l60c2-JCFt/shimpath-f1/python3`)
  that exits 0 only when its args contain `version_info` (passing the
  interpreter-resolution probe) and exits 1 for every real payload build,
  placed first on a PATH built from `/usr/bin` symlinks with no
  `python3`/`python`/`py` entries at all
  (`/var/tmp/delegation-l60c2-JCFt/nopython-path`).
  Result: one builder `FATAL: JSON payload builder failed` line, then
  `FATAL: a JSON payload builder failed -- aborting the whole run.`, no
  summary line printed, exit 1 — no case is ever counted as passed.
  Also ran with the same no-python PATH alone (no shim at all): `FATAL: no
  Python 3 interpreter found on PATH (tried python3, python, py -3).`,
  exit 1, no tests run.
  Confirmed the EXIT trap still tears down the fixture in both cases: no
  `/var/tmp/secret-guard-selftest-*` directory was left behind.

## F2 (MEDIUM) — `paths_match` tail fallback weakened the Linux assertion
- Cause: the `path_tail` (basename-only) fallback in `paths_match` ran
  unconditionally on every platform, so on Linux a logged field 5 in the
  wrong directory but with the same basename (or a bare basename) would
  still match.
- Fix location: `paths_match` now returns 1 immediately unless
  `IS_WINDOWS_BASH` is 1; the `cygpath -m` normalization and the tail
  fallback (used only when `cygpath` is absent) apply only on MSYS/Cygwin.
  Also updated the stale comment block above it to describe the new
  Windows-only scoping.
- Simplification: exact match everywhere except Windows-family Git Bash.
- Discriminating check: copied the hook to
  `/var/tmp/delegation-l60c2-JCFt/hook-mutant.sh` and mutated
  `write_denial_log` to rewrite any logged path-shaped text to
  `/wrong/dir/<basename>` right before the log line is written. Ran the
  selftest with `HOOK_BIN` pointed at that mutant, on Linux (no
  IS_WINDOWS_BASH override): result `73 passed, 1 failed, 0 skipped (of
  74)`, with the failure being exactly `phase1: a denied Write logs the
  file path, never the file content -- field5=/wrong/dir/selftest-f1-write-target.md`.
  The mutant hook was never written into the worktree (only a scratch
  copy), so there was nothing to revert there; the worktree's
  `executable_secret-guard.sh` was confirmed untouched throughout
  (`git status --short` shows only the selftest file modified).

## F3 (LOW) — Windows mode branch could pass (SKIP) on empty stat output
- Cause: when `stat` fails on both the plain-umask and umask-000 runs,
  `dmode`/`dmode2`/`fmode`/`fmode2` are all empty strings, and the old
  equality check (`"$dmode2" = "$dmode"`) is vacuously true, producing a
  SKIP instead of a FAIL.
- Fix location: added `[ -n "$dmode" ] && [ -n "$fmode" ]` to the
  Windows-branch condition before the equality checks, so all-empty stat
  output now falls into the `else` branch and is reported as FAIL.
- Simplification: none needed beyond the two `-n` guards; no change on
  Linux (branch never taken there) or on a working Git Bash `stat`.
- Discriminating check: built a scratch PATH
  (`/var/tmp/delegation-l60c2-JCFt/f3-path`) with `uname` forced to print
  `MSYS_NT-10.0` and `stat` forced to always exit 1 (so both stat forms
  produce empty output). Ran two copies of the selftest under this PATH
  against the real hook (`HOOK_BIN` explicit):
  - unfixed copy (F3 line reverted, F1/F2 fixes intact): the mode-check
    test line is `SKIP: phase1: dir is 700 and file is 600 ... (dir=->
    file=->)` — a false SKIP on empty data.
  - fixed copy (current worktree state): the same scenario gives `FAIL:
    phase1: log dir/file are written under plain umask and umask 000, and
    umask 000 does not widen the measured mode (Windows mode-check SKIP
    path) -- ... dir=-> file=->`.
  Both scratch copies live only under the scratch dir; nothing was written
  into the worktree for this check.

## Linux gate proof (final, on the committed file)
```
secret-guard-selftest: 74 passed, 0 failed, 0 skipped (of 74)
```
Run as: `bash dot_claude/hooks/executable_secret-guard-selftest.sh` from
`/var/tmp/lane-60c/dot`.

## Commit
- `bfb5cd4447077b9e4fbc11143f35136674f45aef` —
  `fix(secret-guard): selftest aborts on payload failure, strict paths off
  Windows (lane 60c r2)`.
- Only file changed: `dot_claude/hooks/executable_secret-guard-selftest.sh`
  (19 insertions, 9 deletions).
- Hook file confirmed unchanged since base `6f183eb`.

## Scratch dir
`/var/tmp/delegation-l60c2-JCFt` — left in place per instructions (no
deletion performed). Contains: `shimpath-f1/` (failing python3 shim),
`nopython-path/` (PATH with no python at all), `f3-path/` (forced
MSYS uname + failing stat shims), `hook-mutant.sh` (F2 mutant hook copy),
`selftest-fixed.sh` / `selftest-unfixed-f3.sh` (comparison copies for F3),
and the run logs (`f1-shim-run.log`, `nopython-run.log`,
`f2-mutant-run.log`, `f3-unfixed-run.log`, `f3-fixed-run.log`).

## Deviations / assumptions
None — all three patches were applied as specified in the review, plus the
one documentation-comment update the review explicitly called out ("The
comment block at lines 274-284 should be updated to match").
