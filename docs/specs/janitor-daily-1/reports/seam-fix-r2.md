VERDICT: PASS

# Seam fix, round 2 (wr-2026-09-27-janitor-daily)

Applied every seam-reviewer-verified finding from docs/specs/janitor-daily-1/reports/seam-review.md
(VERDICT: NEEDS_FIXES (3), reviewed at e5aec8f68d935e6fa44fe9c0a016d712a4ec68ef) in one round, in
the integration worktree /home/ben/Code/claude-delegation-wt/janitor-daily-base, branch
build/janitor-daily-1.

## Findings applied

### B1 (BLOCKER) — docs/specs/janitor-daily-1/contracts.md:35
Applied the finding's own "ready to apply" fix verbatim: the `file_fresh` table now says
`installed.json` absent is state `info` (its reason text says unknown / never installed), never
`missing`, never counted against `ok` — matching the merged code (option a) instead of the stale
`unknown` promise. No code change, as the finding predicted.

### M1 (MAJOR) — scripts/install-janitor-timer.mjs
Applied both patches from the finding, mechanically as specified:
1. `--remove` now reads installed.json's `name` before deleting it, and only deletes when that
   name equals the `--name` being removed (or the file is absent). Otherwise it reports
   `left-untouched-foreign` and leaves it alone.
2. Install now refuses outright (exit 1, nothing written, before `mkdirSync`) when installed.json
   already records a different `name` than the one being installed.
3. Added the regression test the finding specified in scripts/install-janitor-timer.test.mjs:
   install default name, attempt `--name janitor-record-test` install (expect exit 1, installed.json
   byte-identical), `--remove --name janitor-record-test` (expect installed.json still present,
   `left-untouched-foreign`).

Live-verified the finding's predicted outcome in a scratch home (created and torn down under my own
scratchpad, never the real `~`, `--apply` never passed):
```
== 1 real install
  created: .../home/.agents/janitor/installed.json  (name=janitor-record)
== 3 test-name install
refused: refusing: .../installed.json already records name=janitor-record; --remove --name janitor-record first
== installed.json after refusal: unchanged (name=janitor-record)
== 4 test-name remove
  left-untouched-foreign: .../home/.agents/janitor/installed.json
== installed.json after remove: unchanged (name=janitor-record)
== units present: janitor-record.service janitor-record.timer   (real unit still installed)
== wiring check (log forced 30h old): {"id":"janitor-last-run","state":"stale", ...}
```
Before the fix this last state printed `info` (the "never installed" state) even though the real
timer was still installed and its log was 30h stale — exactly the failure mode M1 described. After
the fix it correctly reports `stale`.

### m1 (MINOR) — scripts/required-wiring.default.json
Reworded the `janitor-last-run` row's `why` and `fix` text as specified: `why` now says a log still
absent more than 26h after install means the schedule stopped firing, but an absent log right after
install is expected (no earlier trigger to catch up on, up to ~24h until the first scheduled run);
`fix` now says to check the scheduler's own registration first (`systemctl --user list-timers
janitor-record.timer`, the Windows task, or the launchd agent) and only rerun the installer with
`--enable` if the timer isn't registered. No test asserted the old string (grepped first).

## Verification

- `node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs`: 24/24 pass, including the
  new M1 regression test.
- Full gate, `node scripts/run-tests.mjs` (run twice, before and after commit): tests 2040, pass
  2037, fail 0, skipped 3, exit 0. Log tail saved at
  docs/specs/janitor-daily-1/reports/seam-fix-r2-gate.log.
- `git status --short` before/after matches expectation: only the four tracked files touched, plus
  the pre-existing untracked briefs/ and reports/ directories (not mine, left alone).

## Deviations / assumptions

- B1 said "Owner: the lead (contracts.md), not a territory. No code change is recommended," and
  flagged this as a decision for the lead (option a vs b). My dispatch instruction was explicit —
  "Apply every seam-reviewer-verified finding in one round" — so I applied the finding's own
  ready-to-apply text (option a, matching the code already merged). If the lead later prefers
  option (b) instead, that is a revert of this one contracts.md line plus a real code/test change
  in J2's wiring-check.mjs, not done here.
- No other findings in seam-review.md were BLOCKER/MAJOR/MINOR scoped to this round; the two
  "Notes for the orchestrator" items (missing joint test coverage, the `-wt/` isDurablePath gap,
  hooks.json L1) are explicitly out of scope ("outside the seam, not counted" / routing-only) and
  were left untouched.

## Files changed
- docs/specs/janitor-daily-1/contracts.md
- scripts/install-janitor-timer.mjs
- scripts/install-janitor-timer.test.mjs
- scripts/required-wiring.default.json

Commit: 162d2b34ac26e2a61866c677e3757e5056228ffc on build/janitor-daily-1
("fix(janitor-daily-1-seam): close seam review round 1 findings (B1, M1, m1)").

`git rev-parse HEAD` (post-commit, worktree /home/ben/Code/claude-delegation-wt/janitor-daily-base):
162d2b34ac26e2a61866c677e3757e5056228ffc

## Cleanup
No servers started. No processes started that needed killing. My scratch verification directory
under my own scratchpad (seam2/) was removed with a standalone `rm -rf` after its productive use,
per the janitor-daily rule about not chaining cleanup after work — it held only fixture files I
created (a scratch $HOME, $XDG_CONFIG_HOME, and a throwaway `git init` repo), never the project
worktree or any shared directory. No worktree or repo directory was touched or removed.
