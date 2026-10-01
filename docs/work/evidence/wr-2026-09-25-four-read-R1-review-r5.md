VERDICT: APPROVE 57661bfa1238aacfe05872a48585519bd92566a0

# R1 review, round 5: the four-number read (delta re-review)

Reviewed: `C:/Users/benzh/Code/four-read/wt-r1` at `57661bfa1238aacfe05872a48585519bd92566a0` (from my own `git rev-parse HEAD`), range `5de29b2..HEAD` (one commit, 57661bf).
JUDGMENT: correctness of a measurement script against its spec definitions.

The round-4 MAJOR patch is in verbatim, and all three minors are addressed. Every pin, old and new, holds under mutation. The gate is green, and the evidence reproduces byte for byte. I found no regressions.

Counts: 0 BLOCKER, 0 MAJOR, 0 MINOR.

## Measured facts
- **Gate, run by me in the worktree.** `node --test scripts/four-read.test.mjs scripts/build-census.test.mjs`: 136 pass, 0 fail.
- **four-read.mjs size.** 399 lines by `wc -l`, under 400.
- **Line budget.** build-census.mjs is 1084 lines against a base of 1036, so +48 net, inside +150. work-record.mjs is 1072, unchanged.
- **Paths touched.** `git diff --stat 5de29b2..HEAD` shows only docs/census.md, scripts/four-read.mjs and scripts/four-read.test.mjs. All are inside the territory. `git status --short` is clean before and after my run.
- **Evidence reproduces.** I regenerated all four builds into scratch with the main-checkout ledger and the same slugs and lead-session. All four JSONs are byte-identical to the committed files. The `.md` files are identical apart from the hand-written "Census window" line.
- **Method.** All mutations and probes ran on a `git archive HEAD` copy under my scratchpad (`.../scratchpad/r5/src`). Nothing was written to the worktree.

## Round-4 findings: status
| # | Status |
|---|---|
| MAJOR 1 (`--spec-census` unchecked) | **Fixed verbatim** at `four-read.mjs:82-85`, matching my r4 patch 1 character for character. Comment merges are at `:39`, `:121` and `:129`. The test replacement at `four-read.test.mjs:150-163` is verbatim too. **Pinned:** removing each disjunct in turn (the `!combined` check, the `sFile` session match, the `sStart` bound, the `sEnd` bound, the null guard) fails 1 test each. On census-complete's real inputs, both r4 probes now read `44771654 tokens: build 44771654 (claude-opus-5-5); partial (no spec slice): spec-census is not Spec-session:'s Spec-from:..Opened: window`. They used to read `+ spec slice 0` and a doubled 89543308. |
| MINOR 1 (test title) | **Fixed** at `four-read.test.mjs:453`, with my wording. |
| MINOR 2 (`docs/census.md:301-302`) | **Fixed** with my wording. |
| MINOR 3 (double colon, dead field) | **Fixed.** `:321` strips a trailing colon from the reason. Reverting that change fails the updated `:471` assertion, so it is pinned. `rawAcceptedMs` is removed from all five returns, and a grep of scripts/ finds no consumer left. |

The r3 and r4 pins still hold: I re-ran all eight earlier mutations (MA1, MA2, MA3a, MA3b, M4, M5, M6, M8) on this HEAD, and each still fails 1 or 2 tests.

## Checked, and no defect found
- **`numberTwo.reason.replace`** is always given a string. Every path that leaves `openedMs` or `acceptedMs` null sets `reason`: no Opened, no accepted, unparseable, and opened-at-acceptance. The success path never reaches it.
- **Committed evidence** does not change. No evidence file uses `--spec-census` or the no-`Opened:` path.
- **A spec census file that is missing or unreadable** still takes the existing `partial (no spec slice)` path, and never prints a number for the slice.
- **Unchanged this round:** the first-accepted rule, the strict `>30` minute gaps, ASK/`re` matching, the merge/release exclusion, and the whole-window-equals-unwindowed test.
