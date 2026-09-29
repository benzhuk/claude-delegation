# review-run-53 — builder state

## Territory
`skills/team-build/scripts/review-run.mjs` + its test file. Branch `build/review-run-1`,
worktree `.../scratchpad/lane-53/wt`. HEAD `643a862` after fix round 4 (the lead's
intervention, per `lead-ruling-r4.md`).

## Contracts I rely on
- `EXIT` codes (review-run.mjs): 0 OK, 1 USAGE, 2 BAD_REPORT, 3 TIMEOUT, 4 HOST, 5 KILL_SWITCH,
  6 RECURSION, 7 INTERNAL. W1 this round: a synchronous `spawn()` throw is now HOST, not
  INTERNAL — do not regress that mapping.
- `sweepStaleRuns` never signals a pid (ruling r3/N1) and now also never probes a completed
  run's childPid once its `wt/` is already gone (F3, this round).
- `--report`'s `Edit(...)` allow rule: win32 drive-letter paths are already absolute
  (`Edit(C:/...)`), POSIX paths get a leading `/` (`Edit(//...)`); glob metacharacters
  (`* ? [ ] { }`) are refused by `validateReportPath` (N4, now covered by tests — F2).
- Every test needing the fixture fake `claude` (a shebang script) is `skip`ped per-test on
  win32 (`process.platform === 'win32' && '<reason>'`) — it cannot spawn there (W1/W2).

## Done
Fix round 4 delivered F1-F3 (review-r3.md, verbatim) and W1-W3 (lead-ruling-r4.md's Windows
Research). Full report + red/green evidence: `docs/specs/review-run-53/build-r4.md`.
- Linux: `review-run.test.mjs` 67/67; full suite 2998 tests, 2993 pass, 0 fail, 5 skip
  (pre-existing, unrelated).
- Windows (ben-desktop): `review-run.test.mjs` 67 tests, 48 pass, 0 fail, 19 skip (W2, as
  designed); full suite 2998 tests, 2965 pass, 0 fail, 33 skip, ~170s (was a 40-min hang before
  W1 at 1b62edb). No failure anywhere.

## Next
Nothing outstanding in this round's scope. review-r3.md's nits 1-11 and its live-probe items
(P5 win32, a Linux dontAsk probe, a sweep-after-hard-kill probe) are still open but were ruled
out of round 4's scope by lead-ruling-r4.md — pick them up only if a future round is opened for
them explicitly.

## Open questions
None blocking. Whether nits 1/6/7/8/9/10 (review-r3.md) warrant their own round is the lead's
call, not decided here.

## How to run my gate
```
node --test skills/team-build/scripts/review-run.test.mjs
node scripts/run-tests.mjs
```
If `/tmp`'s tmpfs is near its inode cap on this host (`df -i /tmp`), prefix both with
`TMPDIR=/var/tmp` — that's an environment workaround for shared-host inode exhaustion, not a
code dependency; see build-r4.md's Deviation section for the evidence.
