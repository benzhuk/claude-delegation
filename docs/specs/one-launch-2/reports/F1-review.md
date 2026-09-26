VERDICT: APPROVE 8791423e37a85d2fee31854c7eade696fde2552e

# F1 review, round 2 (delta re-review): one-launch-2 (wr-2026-09-26-one-launch-fix)

Worktree /home/ben/Code/wt-one-launch-2-F1, HEAD `8791423e37a85d2fee31854c7eade696fde2552e` (from my own
`git rev-parse HEAD`). Range reviewed: `19bd5706c942bbcbb1488aea43c47916131fda47..HEAD`, one commit touching 5
files, all inside F1's territory: SKILL.md, accept-prep.mjs, accept-prep.test.mjs, build-loop-workflow.js
and build-loop-workflow.test.mjs. Nothing changed under scripts/, hooks/, .codex-plugin/, README.md or
docs/work/. `git status --short` in the worktree was empty before and after. Every mutation and fixture ran
on a `git archive HEAD` copy under the session scratchpad (`.../scratchpad/r2/`), never in the reviewed tree.

Counts: 0 BLOCKER, 0 MAJOR, 0 MINOR counted. There is one lead escalation (E1, round 1's M4). It is not
counted against the builder because no fix exists inside this territory's pinned scope. It is still open,
and it stands between this build and its goal of "doesn't refuse accept on census-stale". See E1.

Bug-fix fields (C4):
Cause: Round 1 found five causes. (1) accept-prep spliced new header lines without checking the EOL of the line they landed after. (2) Setup verification compared four sibling paths as exact strings. (3) The SKILL.md sentence predated R8. (4) The rendered helper command had no cwd anchor and quoted nothing. (5) Evidence splitting did not treat `none` as empty. All five are fixed at HEAD.
Discriminating check: For each fix I reverted it alone on a scratch copy and confirmed that a named test fails (table below). I also ran the real editRecord on five no-trailing-newline/CRLF edge records and inspected the output byte for byte.
Fix location: skills/team-build/references/accept-prep.mjs:101-113,211,224,231,243 (census call :316, edit call :307); skills/team-build/references/build-loop-workflow.js:302,354,360,527-530,722; skills/team-build/SKILL.md:337-340.
Simplification: A single `insertLine` helper covers both splice sites. The existing `samePath` and `splitEvidenceList` helpers are reused. No new mechanism was added.

## Gate (run myself)

`node --test skills/team-build/references/build-loop-workflow.test.mjs skills/team-build/references/accept-prep.test.mjs`
in the worktree gave `tests 100 / pass 100 / fail 0`, the same result the builder's report claims. A
`git archive HEAD` copy under the scratchpad also gave 100/100.

## Prior findings: verification of each fix

Each fix below was reverted alone on the scratch copy, the full territory gate was re-run, and then the
copy was restored (checked with `cmp`).

| Finding | Fix at HEAD | Revert-only-this-fix result |
|---|---|---|
| B1 BLOCKER | `insertLine` (accept-prep.mjs:106-113) used at :224 (Worktree) and :231 (Log) | 98/100; both `B1: editRecord on a no-trailing-newline record ...` tests fail |
| M1 MAJOR | build-loop-workflow.js:527-530, four `!samePath(pathBase, ...)` | reviewer path reverted: `M1: a correct but relative reviewerBriefPath ...` fails. integrator, seam and report reverted one at a time: `M1: ... integratorBriefPath, seamBriefPath and reportPath ...` fails each time |
| M2 MAJOR | SKILL.md:337-340 reworded | n/a (doc). Checked against R8 below |
| M3 MAJOR | build-loop-workflow.js:360 adds the working-directory anchor and says "three bracketed values (--plugin-root, --owner and --lead)" | `R5: accept-prep runs when seam is SKIPPED ...` fails |
| m1 | accept-prep.mjs:211 `splitEvidenceList(String(opts.evidence))` | `m1: --evidence none is never appended ...` fails |
| m2 | accept-prep.mjs:243 `fs.mkdirSync(path.dirname(outAbsPath), { recursive: true })` | `m2: runCensus creates the --census-out directory ...` fails |
| m3 | build-loop-workflow.js:354 single-quoted marker with `'\''` escaping | `R5: accept-prep runs when seam is SKIPPED ...` fails |
| m4 | build-loop-workflow.js:722 `seamBriefPath \|\| reviewerBriefPathFinal` | `m4: given mode with an EMPTY-STRING seamBriefPath ...` fails |
| m5 | build-loop-workflow.js:302 "report headSha as the full 40-character output of" | `S1: the integrate prompt names the integration worktree ...` fails |
| M4 MAJOR | not applied, correctly escalated | see E1 |

Every new or extended test discriminates: each fix, reverted alone, turns exactly its own test red. None of
them is a check that passes because it isn't looking.

### B1: direct byte check beyond the builder's tests
I ran the real `editRecord` at HEAD on five scratch records (`r2/b1.mjs`), each with `--evidence none` and
`--now 2026-09-26T11:00:00Z`. Output as JSON strings:
- It ends on its sixth Log line with no EOL. Result: `...Base: x\nWorktree: b\nLog: ...one\nLog: ...six\nLog: 2026-09-26T11:00:00Z reviewed o n`. The unowned last line is intact and is no longer glued to the new line. The file still has no trailing newline.
- It ends at `Base: x`, no EOL, no Log lines. Result: `...Base: x\nWorktree: b\nLog: ... reviewed o n`. The two chained `insertLine` calls hand the missing EOL along correctly.
- CRLF with no final EOL. Result: every inserted and repaired EOL is `\r\n`, and nothing is glued.
- `Worktree:` is the final line with no EOL. It is updated in place and the Log line follows cleanly.
- A trailing `\n` with no body. Result: `...Log: ... reviewed o n\n`, and the trailing newline is kept.

The only byte `insertLine` adds to an unowned line is the EOL on a final line that had none. Any insertion
after that line needs it. The line's text is never touched.

### R3b ORDER: negative re-demonstrated myself
On the scratch copy I moved main's census block (accept-prep.mjs:313-319) above the `editRecord` block (:305-311).
Result: 99/100 pass, and the one failure is `✖ R3b ORDER ...`, `actual: 'census sawReviewedLog=false'`,
`expected: 'census sawReviewedLog=true'`. The stub still reads the record's on-disk content
(accept-prep.test.mjs:322, `/^Log: .* reviewed /m`). The builder's quoted negative run is accurate.

### M2 against R8
SKILL.md:337-340 is still exactly one sentence (one full stop, at "never as a header line."). It says `Base:`
goes in the header and the two parents go in the body ("e.g. `Base parents: <sha>, <sha>` after the
header's blank line"), which is R8's own wording. No `Base-of` remains in SKILL.md (`grep -n "Base-of"`
finds nothing). This does not trip `check-acceptance`. `requireStrictRecordShape` (scripts/work-record.mjs:566-580)
checks labels only above the first blank line, and `requireObservedBody` (:528-563) accepts an `Observed:`
paragraph anywhere after a blank line. So a `Base parents:` paragraph at the start of the body is legal.

### m3: shell parsing checked
The rendered `--marker 'it'\''s LANE 7'` goes through bash word-splitting as the two words `[--marker]`
and `[it's LANE 7]`.

## E1 (lead escalation, not counted): round 1's M4 still reproduces at HEAD

I re-ran it end to end with the real scripts. Lead jsonl: last entry `queue-operation` at
2026-09-26T13:28:34.023Z. I ran accept-prep at HEAD with `--plugin-root` set to this worktree and
`--now 2026-09-26T13:33:00Z`. The census ran after the record edit, which is the correct R2 order. Its line 1
reads `leadLastMessageAt: 2026-09-26T13:28:34.023Z`. Then
`node scripts/work-record.mjs check-acceptance ... --census <that file>` printed
`[census-stale] census-stale: the census file predates the record's last review (Log: ... reviewed ... at 2026-09-26T13:33:00Z)`
and exited 1.

The builder was right not to fix this. Each of round 1's options (a) `--census` in step 3, (b) a second
SKILL.md sentence and (c) a scripts/ change would break a pinned limit: R2's CLI and step shape, F1.md's
one-sentence rule, and the scripts/ exclusion. contracts.md's mtime (09:59:07 -0400) shows no R9 ruling was
added. It is still a check that passes because it isn't looking. accept-prep's own step 3 runs
check-acceptance without `--census`, so the runner reports a result that looks accept-ready, and inside a
Workflow run the lead's `accept --census` then refuses it. **The lead must rule on this before the build
claims the goal of not refusing accept on census-stale.** The cheapest ruling is (b): the lead re-runs
build-census in its own accept turn, and that fresh lead message always postdates the reviewed Log. That
fits the existing accept-turn wording in the lead's SKILL.md and needs no code change in this territory.

## Regression hunt (delta): nothing found

- The `insertLine` guard fires only when `at === lines.length` and the previous line's `eol === ""`. That
  combination exists only with no blank line and no trailing newline, because `splitPreservingEol` gives
  every other last-line case a zero-length final entry. The other 98 accept-prep and workflow tests
  (R3a byte equality, CRLF) are unchanged and still green.
- M1 adds no leniency. `M1: no other leniency — a genuinely different reviewerBriefPath still fails` passes,
  and the earlier EVIL-path setup tests still pass at HEAD.
- m4's `||` changes behaviour only for `""`. The same falsy set was already treated as absent for setup mode.
  The `null`, absent and given cases are asserted by the existing R4 tests (green).
- The ACCEPT_PREP schema, R2's flags, step order and output fields are unchanged in this diff.

## Observations (not counted, carried over, still true)

- accept-prep.mjs:326 `censusError = null;` is dead code, because that branch is reached only when it is
  already null.
- Other values in the rendered command are still unquoted (`--record`, `--repo`, `--delivery-ref`, the
  `--evidence` list). Paths with spaces would split. This predates the change and today's inputs never
  contain spaces; m3 fixed only the marker, which is free text.
- The given-mode `seamBriefPath` arg is still missing from the args doc comment (build-loop-workflow.js
  header) and the SKILL.md args list. The SKILL.md side is the lead's call, since SKILL.md is limited to
  one sentence.
