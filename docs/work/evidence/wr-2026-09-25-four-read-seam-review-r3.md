VERDICT: APPROVE 5d8eccfdee7c0c759ef5e6a99bfb4768bcbcdedd

# Seam review r3 (delta 3a4f74f..5d8eccf): build/four-read-1 at 5d8eccfdee7c0c759ef5e6a99bfb4768bcbcdedd

JUDGMENT: the r2 MAJOR A (the backdated or mismatched `accept --at`) is fixed exactly as patched and pinned by mutation. The delta is one commit, `work-record.mjs` (+3/-3) and `work-record.test.mjs`, and it introduces no regressions. The seam is closed: an accept-time dogfood round trip copies real values, and the re-read reproduces them.

Counts: 0 BLOCKER, 0 MAJOR, 0 MINOR.

## Verified
- **Patch is verbatim.**
  - `scripts/work-record.mjs:1091`: `let fourNumberLines, parsed;`, with the inner `let parsed;` removed.
  - `:1107`: the lower bound is now `Math.max(lastLogMs, Date.now() - 600000)`, with the updated message.
  - `:1108`: new check that the `--four-read` `acceptAt` equals the stamped T (`four-read-invalid`).
  - Tests: the "--at stamps" test now uses `Date.now() - 60000`, and the two new tests (stale T; read/accept T mismatch) match r2 character for character.
- **Pinned by mutation.** Scratch clone, `mutate-r3.mjs`, restored clean afterwards:
  - Reverting the clock bound fails "--at refuses a stale T more than 10 minutes old…".
  - Disabling the equality check fails "a --four-read measured to one T refuses when accept stamps another".
- **Round trip on scratch (`rt.mjs`, real lead transcript and census):**

  | Case | Result |
  |---|---|
  | T = now | exit 0. Read gives `20827142 tokens…`, `3.5h; largest gap 78.6min…`, `0 commits…`, `2 gap(s) over 30min…`. All 4 copied lines verbatim; re-read SAME on all 4. |
  | T 3 min old, same T for read and accept | exit 0; re-read SAME |
  | Backdate: T 55 min old, after the last Log | refuses `invalid-at` (was exit 0 at 3a4f74f) |
  | Read at now-3min, accept at now | refuses `four-read-invalid … pass --at 2026-09-26T01:52:26Z` |
  | Read at T, accept with no `--at` | refuses `four-read-invalid` |
  | T 6 min ahead | refuses `invalid-at` |
- **Limits.**
  - `scripts/four-read.mjs` is 399 lines (under 400).
  - `git diff --numstat 931588a 5d8eccf`: build-census.mjs +72/-24, work-record.mjs +110/-13. Net +145, within +150.
- **Gate.** `node scripts/run-tests.mjs` on the scratch clone at 5d8eccf: 1662/1662, exit 0.
- **Reviewed tree untouched.** wt-int is at 5d8eccf, and `git status --short` shows only the lead's four untracked files.

## C4 fields
Cause: the `--at` guard bounded T by the record's last Log entry, not the clock. accept never compared the read's `acceptAt` with the T it stamped.
Discriminating check: `node rt.mjs 2026-09-26T01:00:01Z` exits 0 at 3a4f74f and refuses `invalid-at` at 5d8eccf. `node rt.mjs <now-3min> now` exits 0 at 3a4f74f and refuses `four-read-invalid` at 5d8eccf.
Fix location: scripts/work-record.mjs:1091 and :1107-1108; scripts/work-record.test.mjs (the "--at stamps" test's T, and two new tests).
Simplification: an equality check against the `acceptAt` the read already emits, plus a clock window on an existing line; 0 net lines.
