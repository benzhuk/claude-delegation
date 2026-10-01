# C2 state — install-janitor-timer.mjs gains a job

## Territory
scripts/install-janitor-timer.mjs, scripts/install-janitor-timer.test.mjs
Worktree /home/ben/Code/wt-collect-status-1-C2, branch build/collect-status-1-C2.

## Contracts I rely on
- docs/specs/collect-status-1/contracts.md K1 (paths: `~/.agents/collect/installed.json`,
  `~/.agents/collect/last-run.log`, installed.json key order schema/repo/node/every/scheduler/
  name/to) and K3 (installer rulings: `--job`, `--every` 5-60 default 15, `--to` required/refused,
  `--apply` refusal covers collect args, `--remove --job collect-status` scoping).
- docs/specs/collect-status-1/briefs/scout-C2.md for exact line numbers (now shifted well past its
  original numbers by three rounds of edits; re-grep symbol names, not line numbers, if picking
  this back up).
- Slug pattern borrowed (not imported) from skills/multi/scripts/envelope.mjs:34 (`SLUG_RE`).
- C1's `scripts/collect-status.mjs` CLI flags are ASSUMED to be `--repo`, `--to`, `--host`, `--out`
  per spec.md line 49 — it had not landed in this worktree as of this build (no such file existed).
  Once it lands, re-check its actual flags against `scheduledCommandArgv`'s collect-status branch.

## Done
- `--job janitor-record|collect-status` (default janitor-record, byte-identical to before).
- `--every <5-60>` (default 15), cross-refused against `--hour` and vice versa.
- `--to <slug>` required for collect job, refused for janitor job, slug-pattern validated.
- `--out <dir>` resolved to absolute + control-character-refused, passthrough for collect job,
  refused for janitor job.
- Job-scoped `~/.agents/collect/` vs `~/.agents/janitor/` dirs, installed.json, last-run.log.
- systemd/Windows/launchd generators branch on job; default branch bytes unchanged.
- `--remove --job collect-status` scoped to that job's own files AND its own marker string
  (COLLECT_MARKER, distinct from the janitor's MARKER — round 2, M1 fix).
- `--apply` refusal extended to cover `--to`/`--out`, with job-specific wording restored for the
  default job (round 2, m3 fix).
- Round 2 findings (docs/specs/collect-status-1/reports/C2-review-r1.md) applied in full: M1, m2,
  m3, m4 — all confirmed fixed by the round-2 review, none reopened.
- Round 3 (docs/specs/collect-status-1/reports/C2-review-r2.md) applied in full:
  - **N1** (major): on Windows, Task Scheduler's single task-name namespace let the collect job
    replace or delete the janitor's live scheduled task (and vice versa) through a shared `--name`,
    because the marker check never sees the other job's own artifact directory. Fixed with a
    win32-only pre-write refusal: if `~/.agents/<other-job>/<name>.task.xml` already exists,
    refuse before any write or exec. New test covers install, `--remove --enable`, and the reverse
    direction; mutation-proven (disabling the guard drops the gate to 47/48).
  - **N2** (major): on macOS, `--remove --job collect-status` without `--to` threw an uncaught
    `TypeError` (`launchdPlist` called `.replace` on a `null` argv element — `--to` is null on the
    remove path). Fixed with `String(a).replace(...)`, mirroring `systemdQuote`'s existing
    coercion. New test covers darwin and win32 remove-without-`--to`; mutation-proven (reverting
    the coercion reproduces the exact predicted TypeError).
  - Not applied (explicitly "Not counted" by the reviewer, not verified findings): the `--out`
    help-text nit, the m3 advisory (no regression test for `result.job` scoping), the pre-existing
    Windows `TimeTrigger` child-order note, the m2 test's cwd-whitespace caveat.
- 48/48 tests green (46 pre-existing, unedited, + 2 new for N1/N2 this round). Gate log:
  docs/specs/collect-status-1/reports/C2-gate.log
- Full round-3 report: docs/specs/collect-status-1/reports/C2.md (VERDICT: PASS)

## Next
- Nothing outstanding in this territory unless C3/C1 land with a different actual CLI shape for
  collect-status.mjs — if so, re-verify `scheduledCommandArgv`'s collect-status branch argv against
  the real flags (I could not do this: collect-status.mjs did not exist in this worktree yet).
- Live Netcup install/`systemctl --user list-timers` proof is explicitly the lead's job at
  acceptance (spec.md's Acceptance section), not mine — I only generate text, per the brief's
  un-agent-able note.
- The reviewer's stated residual on N1 stands: a live Windows task whose XML was deleted by hand
  cannot be detected without querying `schtasks` — out of scope (text-generation only, no live
  scheduler binary on this host).

## Open questions
- None blocking. The Windows trigger child-order advisory (StartBoundary/Enabled/Repetition vs
  Repetition-first) is unresolved by design — reviewer said "not counted"; read as advisory-only.

## How to run my gate
`node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs`
(sealed home per run, no wrapper). Expect `tests 48 / pass 48 / fail 0`.
