VERDICT: NEEDS_FIXES d6f7c3b2ad99e275b031136af8ba2b27c052f841
W1: NEEDS_FIXES (1). All of round 3's patches landed verbatim. One false "no back-dating" claim is left in the re-run table row at evidence :271, and it contradicts the corrected r3b paragraph (:210-215).
W2: APPROVE. `git diff eca3682..d6f7c3b -- scripts skills hooks` is 0 bytes. The round-2 approval stands.

JUDGMENT: NEEDS_FIXES (1). The patch commit is faithful and adds nothing beyond the review's patches. The gate is clean apart from H6 and V4. One twin of round 3's Finding 1 survived in a row that round 3 did not patch. The fix is one line of text.

Scope: `git diff f925919..d6f7c3b` in /home/ben/Code/claude-delegation-wt/fresh-walk-1, which is 2 files, +44/-17. Reviewed against docs/work/evidence/wr-2026-09-25-fresh-project-walk-review-r3.md and the lane spec (origin/docs/lane-specs-0925).

## Patch fidelity (verified, no defect)

| patch | where | result |
|---|---|---|
| F1: evidence r3b paragraph | evidence :207-215 | Verbatim New text. States that check-acceptance ran, and names the invented 19:38:00Z `opened` line. |
| F1: optional prevention sentence | native-use.md :71-73 | Verbatim, placed after "…when the review lands." and before "Then take the census". Confirmed by a flattened-text match. |
| F2: native-use.md:11 | native-use.md :11 | Verbatim. `grep -c` on the full new sentence gives 1. |
| F2: evidence :192-197 | evidence :195-206 | Verbatim New text. The old "ask ~19:41:25 … not itself a doc defect." is fully removed. "It did spawn a real, independent reviewer…" follows on the same line; that is only cosmetic. |
| F2: F4 disposition cell | evidence :77 | Verbatim New text. |
| F3(a): r3/r3b step table | evidence :221-234 | All 12 data rows plus the header match the review byte-for-byte (`grep -qxF` per line: 13/13 ok). The table sits under the "Round 3's real end-to-end re-run" heading, before "### N2". |
| F3(b): F10 duration | evidence :83 | Verbatim. |
| F3(c): four citations | evidence :83 (:591, :197-201) and :245-246 (:680-682, :844-851) | All four now carry the "installed 0.20.11" prefix. |
| F3(d): fnm leftover | evidence :190-192 | Added to the r3 paragraph. Also added to the scratchpad builder report's leftover list (w1r3-report.md:47). |
| Builder-report patches (F1 cell, F2 row + Note) | scratchpad w1r3-report.md :26, :28 | Applied. This file is outside the branch. |

Nothing else changed. The diff contains only these hunks. Commit author is Ben Zhuk <benzhuk@gmail.com>, with no trailers. The worktree's only dirty file is the lead's own record edit, which was already present and was left untouched.

Earlier rounds: the diff does not touch any text resolved in r1 or r2, apart from the F4 cell (:77). That cell now reads consistently with N1 (:152-167) and with the table row fixed below.

## Finding 1: MED. Re-run table row still certifies r3b as "no back-dating"

This is the same bug class as round 3's Finding 1, which is itself round 2's N1. Round 3 patched the r3b paragraph but missed this row. Its Priority 4 checked the row only for round 2's claim.

Evidence :271, the F4/R2/R3 row, final sentence, current text:
```
This row does not verify F4/R3; round 3's `~/tmp/fresh-walk-2026-09-26-r3b` re-run does (see "Round 3" above) — first-attempt `accept`, no source read, no back-dating, a real independent reviewer subagent. |
```
Evidence :210-215, patched this round, says r3b "was **not** free of back-dating" and cites the invented `Log: 2026-09-26T19:38:00Z opened …` line. So the file now contradicts itself. Anyone checking the row against r3b's committed record (802dc9b) will find it false.

Patch, verbatim:
- Old: `— first-attempt \`accept\`, no source read, no back-dating, a real independent reviewer subagent. |`
- New: `— first-attempt \`check-acceptance\` and \`accept\`, no source read, a real independent reviewer subagent, but lead-built and with one invented back-dated \`opened\` Log line (19:38:00Z). |`

Predicted outcome: every r3b claim in the file (:77, :195-215, :233, :271) agrees with the transcript and with the committed record. After this fix, `grep -n 'no back-dating' docs/work/evidence/2026-09-25-fresh-project-walk.md` should return nothing.

Optional, not required: at :217-218, "r3b passed it clean on the first try" is accurate about the schema and census path. "Clean" could be misread next to the back-dated line. `passed it on the first try` would remove that ambiguity.

## W1 content bar (spec, Territory W1)

- The step table has step, command, result and minutes (:17-). The step-4 number is reported, and the r3b 113 s is correctly marked as not the step-4 route. The compliant-route lower bound (≥ ~560 s) is stated.
- Every finding F1-F10 has a file:line, a severity and a preventing sentence. The counts (5 high, 5 med, 0 low) and the dispositions (10) agree.
- Doc fixes are in native-use.md, and the README install section is updated. Each fix has a recorded re-run. F8's re-run is honestly labelled a simulation.
- The contradiction at :271 is the only thing blocking the bar. The goal-level gap is out of scope as briefed: no single run covered builder -> reviewer -> accept, and the evidence says so at :77.

## Gate

- I ran `node scripts/run-tests.mjs` once in the worktree at HEAD d6f7c3b.
- Result: 1564 tests, 1559 pass, 2 fail, 0 cancelled. The two failures are exactly V4 (mirror-shim.test.mjs) and H6 (note-send.test.mjs), both R12 and out of scope.
- Log: scratchpad/fw/w1r4-review-gate.log.
- The script left /tmp/sealed-home-Lf2QW3 for inspection, as it does on failure.

## Bug-fix fields

Cause: Round 3's Finding 1 patched the r3b "no back-dating" claim in the Round 3 paragraph only. The same claim is repeated in the re-run table's F4/R2/R3 row (:271), which the patch list did not cover. So the file still certifies a record that carries an invented `opened` Log line.
Discriminating check: `grep -n 'no back-dating' docs/work/evidence/2026-09-25-fresh-project-walk.md` at d6f7c3b returns line 271, while :210 states "It was **not** free of back-dating". After the fix, the grep should return nothing.
Fix location: docs/work/evidence/2026-09-25-fresh-project-walk.md:271, last sentence of the F4/R2/R3 re-run row.
Simplification: This is a one-phrase text replacement. It adds no mechanism and needs no new run.
