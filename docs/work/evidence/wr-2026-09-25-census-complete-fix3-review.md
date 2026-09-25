VERDICT: APPROVE 3b0b7f390ec1cd04591cc193eb88bb8facc2045e

# Delta re-review: census-complete fix round 4 (79cc1e3..3b0b7f3)

Worktree `scratchpad\census\wt-integrate`, HEAD 3b0b7f390ec1cd04591cc193eb88bb8facc2045e. It was read-only for this review, and `git status --short` is still clean afterwards. This file replaces the round-3 review of 79cc1e3, which found NEEDS_FIXES (4).

Commits reviewed:
- 4e160c9: F1 test
- df21cd0: F2 and F3 docs
- 6aa6e47: F3 comment
- 8bd564d: F4 test
- 3b0b7f3: `--no-ff` merge of main 28a222c

## Bug-fix fields (C4)

Cause: Round 3 left four problems:
- The workflows-root EACCES fix had no regression test.
- docs/census.md told leads to leave `Opened:` unset, although it is a required field and leaving it unset turns off gates.
- The docs and a code comment claimed a raced deletion counts as INCOMPLETE, but it raises ENOENT and is silent.
- Nothing pinned `extractCensusTimestamp` to reading line 1 only.

Discriminating check: In round 3 I ran each proposed test against a scratch mutant: the workflows catch turned into a no-op for F1, and `exec(text)` in place of `exec(firstLine)` for F4. Each mutant failed exactly the new test. Both tests are now committed verbatim, and the named files pass 175/175 at 3b0b7f3.

Fix location: `scripts/build-census.test.mjs:866-902` (F1), `docs/census.md:48,223-224` (F2, F3), `scripts/build-census.mjs:330` (F3), `scripts/work-record.test.mjs:1394-1401` (F4).

Simplification: None needed. The round is two appended tests plus three one-line text replacements, with no behaviour change.

## Prior findings

- **F1 FIXED.** `scripts/build-census.test.mjs:866-902` is the verbatim workflows/ root EACCES test. In round 3 it failed against the swallow-all mutant and passed on the real code, and it passes at HEAD.
- **F2 FIXED.** `docs/census.md:223-224` now reads "`Opened:` is required (`docs/work-record.md`); when the exact start is uncertain, use the ask's or spec's dispatch time and never a time after it." It matches `REQUIRED_FIELDS` (`scripts/work-record.mjs:12`).
- **F3 FIXED.** `docs/census.md:48` and `scripts/build-census.mjs:330` now list `EACCES, EPERM, ENOTDIR, EMFILE`. Those are the codes my round-3 probe showed are flagged. The "raced deletion" claim is gone, and both surrounding sentences still read correctly.
- **F4 FIXED.** `scripts/work-record.test.mjs:1394-1401` is the verbatim off-header test. In round 3 it failed against the `exec(text)` mutant, and it passes at HEAD.

## Main merge: only main's content, manifests at 0.20.8 (VERIFIED)
- The merge parents are 8bd564d and 28a222c, and 28a222c is also what `main` and `origin/main` point to. The merge base is 2869798.
- `git diff 8bd564d 3b0b7f3` is byte-identical to `git diff 2869798 28a222c`: there is no extra change inside the merge and no conflict resolution content.
- The merge changed exactly three lines, all `"version": "0.20.7"` → `"0.20.8"`: `.claude-plugin/marketplace.json:10`, `.claude-plugin/plugin.json:5` and `.codex-plugin/plugin.json:3`.
- README was not touched by the merge. The branch's 0.20.8 changelog block (`README.md:241` onward), which holds the census entry, is intact.

## Regressions
None found.
- The whole delta from 79cc1e3 to 3b0b7f3 touches 7 files: the 3 manifests, `docs/census.md` (3 lines), one comment line in `scripts/build-census.mjs`, and the two appended tests.
- No executable code changed.
- The record, the spec file and `scripts/work-record.mjs` are unchanged since 79cc1e3, so the round-3 checks on them still hold:
  - the spec's sha256 is fc80dc83…7e2b
  - `Opened:` is 2026-09-25T03:11:00.000Z
  - `validateRecord` returns `[]`
  - census-incomplete, census-stale and `--no-census` behave as reviewed in round 3

## Tests
`node --test scripts/work-record.test.mjs scripts/build-census.test.mjs` at 3b0b7f3: **175 tests, 175 pass, 0 fail**. That is 173 from round 3 plus the two new tests.

## Observation, not counted
The README 0.20.8 changelog entry describes `census-missing` and `census-stale`, but not the new `census-incomplete` refusal or the `leadLastMessageAt` header field. The spec requires only the 0.20.8 entry itself, so this is optional. Should you want it, add one sentence to that entry: "an INCOMPLETE census (an unreadable default subagent dir or file) refuses with `census-incomplete`; freshness reads only the header's `leadLastMessageAt`."
