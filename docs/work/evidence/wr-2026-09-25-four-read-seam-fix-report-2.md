VERDICT: DONE 5d8eccfdee7c0c759ef5e6a99bfb4768bcbcdedd 1662/1662

# Seam fix report r2: build/four-read-1 (MAJOR A from seam-review-r2.md)

Goal served: the four goal measures print as a number or `unavailable (<reason>)`,
and a value copied into the record must be the real value, never a stale or
mismatched one written in permanently. Nearest NOT avoided: no new flag or
mechanism — one equality check against the `acceptAt` the read already emits,
and a clock-relative window on the existing bound, both 0 net lines.

Branch: build/four-read-1, worktree wt-int. Commit: `5d8eccfdee7c0c759ef5e6a99bfb4768bcbcdedd`.

## MAJOR A: `accept --at` accepted a stale/backdated T, and never checked it against the read's own `acceptAt` — fixed
Applied both patches from `pack/reports/seam-review-r2.md` verbatim:

- `scripts/work-record.mjs:1091-1093` — `let fourNumberLines;` / inner `let parsed;`
  merged into one `let fourNumberLines, parsed;` outside the `if`, so `parsed`
  (the `--four-read` JSON) is visible to the guard added below.
- `scripts/work-record.mjs:1108` — the existing `invalid-at` guard now also
  refuses a T more than 10 minutes older than `Date.now()` (`Math.max(lastLogMs,
  Date.now() - 600000)` as the lower bound, was `lastLogMs` alone), and a new
  second guard refuses (`four-read-invalid`) when `parsed?.acceptAt` is present
  and disagrees with the T `--at` is about to stamp, naming the correct `--at`
  value to re-run with.
- Both patches are 0 net lines, as specified.

Test changes, applied verbatim:
- "acceptRecord: --at stamps the accepted Log: line at the given timestamp"
  now uses a clock-relative `new Date(Date.now() - 60000).toISOString()`
  instead of a fixed past literal (the reviewer's proof that the old fixed-T
  test proved nothing about backdating).
- Added "acceptRecord: --at refuses a stale T more than 10 minutes old, even
  when it is after the record's last Log: entry (seam r2)".
- Added "acceptRecord: a --four-read measured to one T refuses when accept
  stamps another (seam r2)".

## Gate
- `node --test scripts/work-record.test.mjs`: **147/147 pass** (145 prior + 2
  new), matching the reviewer's own measurement.
- `node scripts/run-tests.mjs > pack/reports/seam-fix-suite-2.log 2>&1`:
  **1662/1662 pass, exit 0.**

## Limits (unchanged)
- `scripts/four-read.mjs`: not touched this round, still **399 lines** (< 400).
- `scripts/build-census.mjs` + `scripts/work-record.mjs` vs `931588a`:
  `git diff --stat` gives `182 insertions(+), 37 deletions(-)` = **+145 net**,
  unchanged from the prior round (this patch is 0 net lines, as predicted),
  within the +150 cap.

## Not done
- The reviewer's "optional docs addition" to `docs/census.md` (a sentence
  about the refusal windows) was not applied — the brief asked only for "the
  MAJOR patch and its tests", which this report covers in full; the docs note
  is explicitly optional with no code impact, so it was left out to keep this
  round's diff to exactly the specified patch.

## Files changed
- `scripts/work-record.mjs`
- `scripts/work-record.test.mjs`

## Untouched, as instructed
`docs/specs/2026-09-25-four-number-read.md`,
`docs/work/wr-2026-09-25-four-read*.record.md` — left untracked and uncommitted.
No push performed.
