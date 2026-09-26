VERDICT: PASS

# F1 report, round 2 (fix round): one-launch-2 (wr-2026-09-26-one-launch-fix)

Worktree: /home/ben/Code/wt-one-launch-2-F1, branch build/one-launch-2-F1, HEAD
`8791423e37a85d2fee31854c7eade696fde2552e` (from my own `git rev-parse HEAD`, run after the
last commit, per instructions — never typed from memory).

Reviewer findings applied from: /home/ben/Code/wt-olfix/docs/specs/one-launch-2/reports/F1-review.md
(round 1, 1 BLOCKER + 4 MAJOR + 5 MINOR = 10 counted). Every reviewer-verified finding is
applied this round except M4, which the review itself flags as needing a lead ruling
before any fix can be chosen (explained below, not silently dropped).

## Files changed

- skills/team-build/references/accept-prep.mjs
- skills/team-build/references/accept-prep.test.mjs
- skills/team-build/references/build-loop-workflow.js
- skills/team-build/references/build-loop-workflow.test.mjs
- skills/team-build/SKILL.md

All within F1's territory list (contracts.md line 6-10). Nothing under scripts/, hooks/,
.codex-plugin/, README.md, or docs/work/.

## Findings applied

### B1 (BLOCKER) — header-only, no-trailing-newline record corruption
accept-prep.mjs: added an `insertLine(lines, at, text, eol)` helper (right after
`joinPreservingEol`) that detects the case `at === lines.length && lines[at-1].eol === ""`
(inserting after a final line that has no EOL) and, in that one case, gives the previous
last line the missing EOL before splicing in the new line with `eol: ""`, so the file's
"no trailing newline" property survives and the previously-last line is never glued to the
new one. Both splice sites (Worktree insert-if-absent, and the appended Log line) now go
through it — accept-prep.mjs, the two calls replacing the old `lines.splice(...)` calls the
review named.

Added two tests (accept-prep.test.mjs, right after the existing missing-field test):
"B1: editRecord on a no-trailing-newline record ending in a Log line inserts a new line,
never gluing it onto the last one" and "...with NO Log lines at all still inserts one
cleanly" — both are the review's own two named edge cases (a record ending on its sixth
Log line, and one ending at `Base: x` with no Log lines). Both pass; both assert the exact
resulting text and that the file still has no trailing newline.

### M1 (MAJOR) — sibling-path exact-string compares
build-loop-workflow.js:526-530 (pre-fix line numbers) compared
`setupResult.{reviewerBriefPath,integratorBriefPath,seamBriefPath,reportPath}` against the
computed values with `!==`, unlike the per-territory rows a few lines above, which already
use `samePath` (R7's own fix). Changed all four to `!samePath(pathBase, ..., ...)`.

Added three tests mirroring the existing R7 tests: "M1: a correct but relative
reviewerBriefPath ... passes setup verification", "M1: a correct but relative
integratorBriefPath, seamBriefPath and reportPath ... all pass", and "M1: no other
leniency — a genuinely different reviewerBriefPath still fails ... after normalising".

### M2 (MAJOR) — SKILL.md sentence contradicts R8
SKILL.md's one sentence (the R5-pinned sentence, ~line 337) said the record carries "a
`Base-of: <sha>, <sha>` line" — a HEADER line, which R8 (the later lead ruling) says
breaks `check-acceptance` (`unknown label: Base-of`). Reworded, still exactly one
sentence, to say the two parents go in the record's BODY (e.g. "Base parents: <sha>,
<sha>" after the header's blank line), never as a header line — per the review's own
suggested wording. This is the only SKILL.md edit; no restructuring elsewhere.

### M3 (MAJOR) — no working-directory anchor, "two" vs three placeholders
acceptPrepPrompt (build-loop-workflow.js) now says: "Then, with the delegation plugin root
(the same directory you pass as --plugin-root) as your working directory, run exactly
this one command, filling in only the three bracketed values yourself (--plugin-root,
--owner and --lead) and changing nothing else — ...". Added assertions to the existing
"R5: accept-prep runs when seam is SKIPPED..." test checking both the working-directory
phrase and the corrected "three bracketed values ... --lead" phrase.

### m1 (MINOR) — `--evidence none` appended as a literal path
accept-prep.mjs's `editRecord`: `newEvidence` now comes from the already-existing
`splitEvidenceList` helper (which treats `"none"` as empty) instead of a raw
split/trim/filter that let `"none"` through as a literal string. Added test "m1:
--evidence none is never appended as an evidence path..." covering both a record with
real existing evidence and one whose Evidence: is already "none".

### m2 (MINOR) — census output directory not created
accept-prep.mjs's `runCensus` now calls `fs.mkdirSync(path.dirname(outAbsPath), {
recursive: true })` before spawning build-census.mjs. Added test "m2: runCensus creates
the --census-out directory when it does not already exist", asserting the directory does
not pre-exist, then that it exists after a successful CLI run.

### m3 (MINOR) — unquoted `--marker`
build-loop-workflow.js's `markerFlag` now single-quotes the marker text (escaping any
embedded `'`), matching the review's suggested patch exactly. Verified inline in the
existing "R5: accept-prep runs when seam is SKIPPED..." test, which now passes
`censusMarker: "LANE SEVEN go"` and asserts the rendered command contains
`--marker 'LANE SEVEN go'`.

### m4 (MINOR) — empty seamBriefPath renders "Seam brief: ."
build-loop-workflow.js's given-mode fallback changed from `seamBriefPath ??
reviewerBriefPathFinal` to `seamBriefPath || reviewerBriefPathFinal`, so `""` now falls
back like `null`/`undefined` do. Added test "m4: given mode with an EMPTY-STRING
seamBriefPath falls back to the reviewer brief, same as absent", asserting both the
fallback text and the absence of "Seam brief: .".

### m5 (MINOR) — headSha length not mandated by the integrate prompt text
integratePrompt's rendered text now reads "...report headSha as the full 40-character
output of `git rev-parse HEAD` run in it." (was "report headSha from `git rev-parse
HEAD` run in it."). Added an assertion to the existing integrate-prompt test for this
exact phrase.

## M4 (MAJOR) — not applied, needs a lead ruling

The review is explicit: "MAJOR, lead ruling needed on R2". accept-prep's own step 3 (no
`--census` flag, per R2's pinned CLI/step order) cannot see the census-stale condition
that `work-record.mjs check-acceptance --census <file>` catches later at the lead's real
accept turn, because that check compares against the lead jsonl's last message time, not
the census's own run time. The review names three options:
(a) step 3 passes `--census <census-out>` so accept-prep itself reports census-stale —
    this changes R2's pinned step-3 flags, which is exactly the kind of change my brief's
    autonomy note says to check in on before making ("Check in before changing any flag
    name, output field, or step order R2 pins");
(b) SKILL.md/the accept-prep prompt tells the lead to re-run the census on its own accept
    turn — this would be a SECOND SKILL.md sentence, and my brief explicitly rules that
    out ("SKILL.md edits beyond the one sentence R5 pins — no restructuring, no other
    wording changes");
(c) a scripts/ change to how census-stale computes its comparison time — explicitly out
    of this lane ("Nothing under ... scripts/ ...").

All three options require either exceeding this territory's pinned scope or a ruling I am
not positioned to make unilaterally. I did not guess; I left R2's pinned CLI shape, and
SKILL.md's one sentence (already used up by M2's fix), untouched, and I am flagging this
explicitly for the lead/integrator rather than silently dropping it. It is noted in
docs/specs/one-launch-2/reports/F1-state.md's Open questions.

## Gate

`node --test skills/team-build/references/build-loop-workflow.test.mjs
skills/team-build/references/accept-prep.test.mjs` (run from
/home/ben/Code/wt-one-launch-2-F1): exit 0, `tests 100 / pass 100 / fail 0` (was 92/92 at
round 1; +8 new tests). Full tail in
docs/specs/one-launch-2/reports/F1-gate.log.

### Negative demonstration re-confirmed (R3b ORDER, per the evidence format's explicit
### instruction to quote both runs)

Positive run (this tree, unmodified) — from the gate log:
```
✔ R3b ORDER: census sees the reviewed Log: line already present, and check-acceptance runs strictly after census (0.x ms)
...
ℹ tests 100
ℹ pass 100
ℹ fail 0
```

Negative run (scratch copy of accept-prep.mjs with `runCensus` moved before `editRecord`
in `main`, and its matching test file pointed at that copy, both under the session
scratchpad, never committed):
```
✖ R3b ORDER: census sees the reviewed Log: line already present, and check-acceptance runs strictly after census (119.253097ms)
  AssertionError [ERR_ASSERTION]: census stub must see the reviewed Log: line already written
  + actual - expected
  + 'census sawReviewedLog=false'
  - 'census sawReviewedLog=true'
...
ℹ tests 17
ℹ pass 16
ℹ fail 1
```
Only the ORDER test fails on the reordered copy; the other 16 accept-prep tests still
pass. The test discriminates, confirmed again post-fix (the fixture and stub scripts are
unchanged from round 1; only the two header-splice call sites and the evidence-merge line
changed in the real accept-prep.mjs this round, and B1's `insertLine` change does not
touch step ordering).

## Verified absences

- Diff touches exactly the five files listed above, all within F1's territory list.
- No commit changed docs/work/, scripts/, hooks/, .codex-plugin/, or README.md.
- SKILL.md's edit is confined to the one pinned sentence — no restructuring, no other
  wording changes (M2's fix reworded that same sentence; it did not add a second one).
- R2's pinned accept-prep.mjs CLI shape (flags, step order, output fields) is unchanged;
  M4 was left unresolved rather than guessed at for exactly this reason.

## Deviations / assumptions

- M4 left unapplied by design, as explained above — flagged, not dropped.
- All eight new/extended tests were placed near their most closely related existing test
  (B1 near the missing-field test, M1 near the R7 tests, m1/m2 near R3a/R3c, M3/m3/m5
  inline in the existing accept-prep-runs test and the integrate-prompt test, m4 near the
  existing given-mode seamBriefPath tests) rather than in a new file, to keep the two test
  files' existing organization intact.

Report: this file. Gate log: docs/specs/one-launch-2/reports/F1-gate.log. State file:
docs/specs/one-launch-2/reports/F1-state.md.
