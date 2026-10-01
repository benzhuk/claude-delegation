Territory: seam fix round 2 (wr-2026-09-27-janitor-daily), applying docs/specs/janitor-daily-1/reports/seam-review.md findings B1, M1, m1.

Contracts I rely on:
- docs/specs/janitor-daily-1/contracts.md, "Seam contract between J1 and J2 (pinned)".
- seam-review.md's ready-to-apply fixes for each finding.

Done:
- B1 (BLOCKER, contracts.md:35): amended the file_fresh table — installed.json-absent
  is `info` (never counted against `ok`), matching the merged code, not `unknown`.
- M1 (MAJOR, scripts/install-janitor-timer.mjs): installed.json is now name-owned.
  `--remove` only deletes it when its recorded `name` equals the `--name` being
  removed (else `left-untouched-foreign`). Install refuses outright (exit 1, nothing
  written) when installed.json already records a different name. Added one
  regression test in scripts/install-janitor-timer.test.mjs (real install, refused
  --name janitor-record-test install, --remove --name janitor-record-test leaves
  installed.json intact).
- m1 (MINOR, scripts/required-wiring.default.json): reworded the janitor-last-run
  row's why/fix so an absent log right after install (before the first scheduled
  run, up to ~24h) isn't read as "schedule stopped firing"; fix text now says check
  the scheduler's own registration first.
- Live-verified M1's predicted outcome in a scratch home (not committed, cleaned up
  after): after the fix, removing a `janitor-record-test` install left the real
  `janitor-record` install's installed.json untouched, and wiring-check then
  correctly reported `stale` (not `info`) for a 30h-old log.
- Gate (node scripts/run-tests.mjs): tests 2040, pass 2037, fail 0, skipped 3, exit 0.
- Committed as 162d2b34ac26e2a61866c677e3757e5056228ffc on build/janitor-daily-1.

Next: none expected from this round. If the lead prefers option (b) for B1 (keep
`unknown`, accept uninstalled hosts as red), that reverts the contracts.md line and
requires a wiring-check.mjs code change plus test update — not done here since (a)
was already the merged behavior.

Open questions: none.

How to run my gate: `cd /home/ben/Code/claude-delegation-wt/janitor-daily-base && node scripts/run-tests.mjs`. Narrower: `node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs scripts/wiring-check.test.mjs`.
