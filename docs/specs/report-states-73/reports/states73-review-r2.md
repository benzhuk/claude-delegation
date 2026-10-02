VERDICT: APPROVE 0c7b14fec626fd432b3c4e90cf4a1cae09f341cd

# states73 review, round 2 (delta re-review, lane 73, wr-2026-10-01-report-states)

Worktree wt-report-states-73-states73, branch build/report-states-73-states73. I ran `git rev-parse HEAD` there myself and got 0c7b14fec626fd432b3c4e90cf4a1cae09f341cd. The range 658efde1..HEAD is one commit, 0c7b14fe. `git status --short` printed nothing before and after the review. I edited nothing in the worktree. Mutation checks ran on a `git archive HEAD` copy in scratch (`lane-73/r2copy`).

Counts: 0 BLOCKER, 0 MAJOR, 3 MINOR.

## Gate (run by me)
The territory Gate command, redirected to scratch `lane-73/review-gate-r2.log`: exit 0, 1136 tests, 1136 pass, 0 fail, 0 `not ok` lines. That is round 1's 1132 plus the 4 new tests, and matches the builder's figure.
Extra consumer run (`lane-73/review-consumers-r2.log`): collect-status, collect-from-origin, four-read (including completeness), skills/team-build/references/*.test.mjs, skills/delegate/references/*.test.mjs and bugfix-fields. Exit 0, 386 of 386.
I did not run the full suite (Windows; the lead runs it).

## Prior findings, verified

Mutation method: on the scratch copy I put back each changed file's 658efde1 version, ran its test file, then restored the HEAD version. After restoring, a control run passed 58 of 58.

- **M1, fixed.** The VERDICT group now covers "reviewer, integrator, seam, builder or suite/census runner ... anything that can be listed as `Evidence:`". The progress group is "a status report on a long-running thing ... never an `Evidence:` file". The wording matches in all four places: docs/subagent-contract.md:19-23, skills/team-build/SKILL.md:149-150, skills/delegate/SKILL.md:67-68 and docs/mandate-template.md:66-67. `grep -c "First-line rule:"` is still 1 in each skill. The anchor regexes are updated (report-check.test.mjs:122 and :138). One stale twin remains in the script itself: see n1.
- **m1, fixed.** report-check.mjs:114-119 names the missing label. Test "line 2 names which field is missing..." is at report-check.test.mjs:52. Mutation: with report-check.mjs reverted, 1 test fails.
- **m2, fixed.** A pipe inside Now or To finish is refused, in report-check.mjs:42 and in decisions-render-core.mjs:485. Tests are at report-check.test.mjs:59-60 and decisions-render-progress.test.mjs:70-73. Mutation: with decisions-render-core.mjs reverted, 2 tests fail (this covers m4 too).
- **m3, fixed.** work-record.mjs:35 refuses `NEEDS ben`, and it is now in the bad list (work-record-states73.test.mjs:50). Mutation: with work-record.mjs reverted, 1 test fails.
- **m4, fixed.** checkWaitingProgressLine checks every `<summary>` (decisions-render-core.mjs:494-510). A two-item test is at decisions-render-progress.test.mjs:57. An over-refusal edge remains: see n2.
- **m6 (hook part), fixed, and the edit is within the territory rule.** hooks/backlog-notice.js:217/226/314 accepts `parser.isKnownStatus` when the parser exports it. With an older parser that has no export, `isKnown` is undefined and the old behaviour stands. The territory brief allows a consumer edit only when a test proves the break. That proof holds: with backlog-notice.js reverted, the new test at backlog-notice.test.mjs:183 fails (1 fail), so the stderr "malformed" note was a real, test-proven break. The round-2 section of the builder report states which file was edited and why. The computeState mapping is left to the lead, which is correct.
- **m8, fixed.** skills/delegate/SKILL.md:70 now qualifies the path ("in the claude-delegation checkout").
- **m5, m7, m9:** not changed. These are lead decisions, carried below as open questions. Correct.

## Regression hunt, verified absences
- Records: I ran parseRecord and validateRecord (now = 2026-10-01T23:00Z) over all 140 docs/work/*.record.md, once with HEAD's work-record.mjs and once with base 7233aa7f's. Findings: 58 and 58. Parse errors: 0 and 0. Per-file differences: none. `git diff --stat 7233aa7f..HEAD -- docs/work docs/decisions docs/specs agents skills/team-build/references` prints nothing.
- Renderer: HEAD's renderer on the scratch repo (base docs plus one Now line under each of the six `<summary>` lines) renders 154 lines, byte-identical to the round-1 render (`diff` prints nothing). Round 1's page-lint result therefore still holds: 12 `em-dash-arrow` hits, all pre-existing. The tightened pipe rule refuses nothing on the live page.
- Live waiting files: each has exactly 1 `<summary>`. A scan of the last 200 commits touching docs/decisions/waiting found no waiting file with more than one, so the new every-summary loop changes nothing on existing sources.
- Scope: the changed files from base to HEAD are the round-1 territory list plus hooks/backlog-notice.js and its test. That edit is the proven-broken consumer case, disclosed in the builder report. No change under docs/work, docs/decisions, docs/specs, agents or build-loop-workflow.js.

## MINOR

### n1. report-check.mjs still states the round-1 grouping (an M1 twin I did not list in round 1).
Evidence:
- scripts/report-check.mjs:1-2 says it "checks a PROGRESS report (runner, lead, or any long-running thing)".
- scripts/report-check.mjs:59 refuses a `VERDICT:` line with "VERDICT is for reviewer, integrator and seam reports, not progress reports. Use DONE, NEEDS BEN, NEEDS <peer slug> or FAILED". scripts/report-check.test.mjs:78 asserts that text.
- Consequence: a lead who runs the check on a suite runner's or builder's report is told to rewrite it to `DONE`. That is the exact M1 consequence, but it only fires when the check is pointed at the wrong kind of report. The canonical rule text in the contract and the skills is now correct.

Patch, scripts/report-check.mjs:1-2. Current:
```
// Lane 73 (report-states-73, spec item 1): checks a PROGRESS report (runner, lead, or any
// long-running thing) carries the pinned first-line state and, for anything not DONE, the
```
Replacement:
```
// Lane 73 (report-states-73, spec item 1): checks a PROGRESS report (a status report on a
// long-running thing, never an `Evidence:` file) carries the pinned first-line state and, for anything not DONE, the
```

Patch, scripts/report-check.mjs:59. Current:
```
    return { state: null, fatal: true, errors: [`first line is a VERDICT: line${partial}; VERDICT is for reviewer, integrator and seam reports, not progress reports. Use DONE, NEEDS BEN, NEEDS <peer slug> or FAILED`] };
```
Replacement:
```
    return { state: null, fatal: true, errors: [`first line is a VERDICT: line${partial}; VERDICT is for reviewer, integrator, seam, builder and suite/census runner reports (anything listed as Evidence:), which this check does not cover. A progress report opens DONE, NEEDS BEN, NEEDS <peer slug> or FAILED`] };
```

Patch, scripts/report-check.test.mjs:78. Current:
```
  assert.match(r.stdout, /VERDICT is for reviewer, integrator and seam reports/);
```
Replacement:
```
  assert.match(r.stdout, /VERDICT is for reviewer, integrator, seam, builder and suite\/census runner reports/);
```
Predicted outcome: the gate stays at 1136 of 1136. A VERDICT report is still refused (exit 1), but the message no longer tells a runner to switch to DONE.

### n2. A `<summary>` inside a fenced block in a waiting item is now treated as a title.
Evidence: the probe (`lane-73/fence-probe.mjs`) inserts a tab-indented fenced block containing `<summary>quoted html</summary>` into progress-73/waiting-with-line.md.
- checkWaitingItem passes it, because decisions-read.mjs skips fences (decisions-read.mjs:129-135, :338).
- checkWaitingProgressLine refuses it: "waiting/a.md:7 lacks the line directly under the title".
- The failure is closed and names file and line, and no live or historical waiting file has this pattern. It is still an over-refusal that round 1's first-match version did not have for a fence placed after the title.

Patch, skills/decisions/scripts/decisions-render-core.mjs:496-497. Current:
```
  lines.forEach((line, summaryIdx) => {
    if (!/<summary>/.test(line)) return;
```
Replacement:
```
  let inFence = false;
  lines.forEach((line, summaryIdx) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence || !/<summary>/.test(line)) return;
```
Predicted outcome: the fence probe passes both checks. The existing 9 progress tests and the two-item test pass unchanged, since no fixture has a fence. Optionally add the probe as a test.

### n3. The builder report contradicts its own round-2 section.
Evidence, in states73-builder.md:
- "Readings taken" item 1 (line 18) still reads "Progress reports only (runner, lead, long-running). Reviewer, integrator and seam reports keep `VERDICT:`".
- "Consumers (not edited)" (lines 27-28) says no consumer was edited.
- Line 5 gives HEAD as 658efde1.
- The round-2 section (lines 36-49) supersedes all three, but a reader of the top half gets the old facts.

Fix (report text only, no code):
- Amend reading 1 to the M1 grouping.
- Retitle the consumers section, or point it at the round-2 m6 entry. It should say backlog-notice.js was edited because backlog-notice.test.mjs:183 proves the break.
- Update the HEAD sha on line 5.

Predicted outcome: no gate effect.

## Open questions for the lead (carried, not decided here)
1. Session bullets that are in progress but do not start with "In progress", for example "Running: ..." (r1 m5).
2. Withdrawing a record whose Status is open, NEEDS or FAILED (r1 m7). Mapping NEEDS and FAILED in collect-from-origin computeState and in the stall nudge (r1 m6, remainder).
3. Merge-day items (r1 m9):
   - The six live waiting files need a Now line before the next publish.
   - PROGRESS_LINE_FROM 2026-10-02T04:00Z against the merge time.
   - The Log-line grammar for spaced status words.
