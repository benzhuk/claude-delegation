# C2 state — install-janitor-timer.mjs gains a job

## Territory
scripts/install-janitor-timer.mjs, scripts/install-janitor-timer.test.mjs
Worktree /home/ben/Code/wt-collect-status-1-C2, branch build/collect-status-1-C2.

## Contracts I rely on
- docs/specs/collect-status-1/contracts.md K1 (paths: `~/.agents/collect/installed.json`,
  `~/.agents/collect/last-run.log`, installed.json key order schema/repo/node/every/scheduler/
  name/to) and K3 (installer rulings: `--job`, `--every` 5-60 default 15, `--to` required/refused,
  `--apply` refusal covers collect args, `--remove --job collect-status` scoping).
- docs/specs/collect-status-1/briefs/scout-C2.md for exact line numbers (now shifted by my edits;
  re-grep symbol names, not line numbers, if picking this back up).
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
- Round 2 (docs/specs/collect-status-1/reports/C2-review-r1.md) applied in full: M1 (separate
  marker per job), m2 (`--out` resolve + control-char refusal), m3 (default job's stdout/JSON no
  longer drifts), m4 (the `--to` arm of the `--apply` test now actually exercises that code path).
  Advisory (Windows trigger child order) intentionally left untouched — reviewer marked it
  not-counted.
- 46/46 tests green (31 pre-existing untouched + 15 C2 tests, two added this round for M1/m2). Gate
  log: docs/specs/collect-status-1/reports/C2-gate.log
- Full round-2 report: docs/specs/collect-status-1/reports/C2.md (VERDICT: PASS)
- Verified byte stability by re-running the pre-C2 base test file (git show 31a23e2) unedited
  against this round's installer in a scratch copy: 31/31 pass.

## Next
- Nothing outstanding in this territory unless C3/C1 land with a different actual CLI shape for
  collect-status.mjs — if so, re-verify `scheduledCommandArgv`'s collect-status branch argv against
  the real flags (I could not do this: collect-status.mjs did not exist in this worktree yet).
- Live Netcup install/`systemctl --user list-timers` proof is explicitly the lead's job at
  acceptance (spec.md's Acceptance section), not mine — I only generate text, per the brief's
  un-agent-able note.

## Open questions
- None blocking. The Windows trigger child-order advisory (StartBoundary/Enabled/Repetition vs
  Repetition-first) is unresolved by design — reviewer said "not counted" and "if changed, adjust
  nothing else"; I read that as advisory-only and left it, not a verified finding.

## How to run my gate
`node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs`
(sealed home per run, no wrapper). Expect `tests 46 / pass 46 / fail 0`.
