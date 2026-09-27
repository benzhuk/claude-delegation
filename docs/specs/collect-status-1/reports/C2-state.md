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
- `--out <dir>` passthrough for collect job, refused for janitor job (my own call).
- Job-scoped `~/.agents/collect/` vs `~/.agents/janitor/` dirs, installed.json, last-run.log.
- systemd/Windows/launchd generators branch on job; default branch bytes unchanged.
- `--remove --job collect-status` scoped to that job's own files.
- `--apply` refusal extended to cover `--to`/`--out`.
- 44/44 tests green (31 pre-existing untouched + 13 new). Gate log:
  docs/specs/collect-status-1/reports/C2-gate.log
- Full report: docs/specs/collect-status-1/reports/C2.md (VERDICT: PASS)
- Own-defect fix: `--to` required check was wrongly blocking `--remove --job collect-status`;
  guarded with `!removeFlag`, re-tested, documented in the report.

## Next
- Nothing outstanding in this territory unless C3/C1 land with a different actual CLI shape for
  collect-status.mjs — if so, re-verify `scheduledCommandArgv`'s collect-status branch argv against
  the real flags (I could not do this: collect-status.mjs did not exist in this worktree yet).
- Live Netcup install/`systemctl --user list-timers` proof is explicitly the lead's job at
  acceptance (spec.md's Acceptance section), not mine — I only generate text, per the brief's
  un-agent-able note.

## Open questions
- None blocking. If a reviewer wants `--out` accepted-and-ignored for `--job janitor-record` instead
  of refused, that's a one-line change (remove the refusal, keep everything else) — flagged as an
  autonomous call in the report, not a contract violation.

## How to run my gate
`node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs`
(sealed home per run, no wrapper). Expect `tests 44 / pass 44 / fail 0`.
