VERDICT: NEEDS_FIXES (1) dcc9582ea41ac308f76a7a6e307d5fda4f0fcf1a

# loop67 review, round 1

Reviewed sha: dcc9582ea41ac308f76a7a6e307d5fda4f0fcf1a. I ran `git rev-parse HEAD` in `.claude/worktrees/wt-build-loop-fed-67-loop67` myself. Diff reviewed: `677c4a90e81f14cabd805679dcc5431d9a2ca93d..HEAD`, 11 files, +1589/-103.
Counts: 0 BLOCKER, 1 MAJOR, 6 MINOR. The worktree was left clean (`git status --short` empty after every run). Every trial edit was made in scratch copies under `scratchpad/lane-67/review-r1/`.

## Gate (run by me)
`node --test build-loop-workflow.test.mjs accept-prep.test.mjs work-record.test.mjs work-census.test.mjs` gave tests 432, pass 432, fail 0 (log: `scratchpad/lane-67/review-r1/review-gate.log`).
I also ran the other test files that read SKILL.md, work-record or team-build: agents, backlog-notice, delegation-reminder, bugfix-fields, collect-status, mirror-shared-skills, native-package, record-closed-and-skip.contract, work-record-closeout and multi hooks. Result: 320 tests, 316 pass, 0 fail (`review-dependents.log`).

## Brief checks

1. **Each item is in the diff and its test fails on the base tree.** I built a scratch copy of HEAD with the base (677c4a90) non-test files swapped in:
   - build-loop-workflow tests: 40 fail, 84 pass. The builder reported 41/83. The difference is immaterial.
   - Every new test that passes on base is a pin or a negative case: the 4a sha pin, a non-timeout builder-blocked, no recordPath, no state file, explicit startFrom, and a successful (h).
   - accept-prep: all 3 new tests fail on base.
   - work-census: the new test fails on base.
   - work-record: on base the import of WORKFLOW_FROM fails. With a shim export it gives 115 fail. All 8 new tests fail, and the fixture's default `Workflow:` line trips `unknown label` on the base parser.
   - Mutation runs on the scratch copy found that 14 of 16 guards are pinned:
     - startFrom precedence, the baseSha check and the specPath check
     - approvedKey, recorded-setup verification and the NEEDS_FIXES resume
     - the integrator agent-timeout and the namesTimeout behaviour
     - the agentMinutes positivity check
     - the Windows refusal, the acceptance-skipped guard and the second-host head check
     - the guarded report-path check, the empty recordChanged check and seamOrderText
     - isAbsolutePath, and sameSha set to exact match
   - Two guards survive mutation (MINOR-1, MINOR-2).
2. **Pinned tests hold.**
   - L-C4.3: grepping the script for `isolation|import|require(|Date.now` finds nothing.
   - L-C4.4: the new opts are flat consts with runner/sonnet: `stateOpts`, `stateReadOpts`, `secondHostOpts`.
   - L-C4.5 is unchanged.
   - meta.phases has "Second host" appended, and the test was edited deliberately (test:96-99).
   - STATE_MANDATE and SECOND_HOST_MANDATE end with `Never send peer notes.` (js:212, :214). The all-prompts test passes.
3. **`Workflow:`/`Measure:` round-trip.** FIELD_LABELS (work-record.mjs:93) feeds KNOWN_LABELS (:102), which both the parser (:230) and requireStrictRecordShape (:1023) use. The test at work-record.test.mjs:429 parses both lines and runs them through checkAcceptance. No unknown-label error.
4. **accept-prep byte preservation.** The insert goes through insertLine/lastSingletonIdx (accept-prep.mjs:201-223). The CRLF test with no trailing newline (accept-prep.test.mjs:268) passes, and the base tree fails it. `Status:` stays required.
5. **State file.** Each case has a test, and the matching mutation is killed:
   - an identical-args relaunch skips APPROVE territories
   - an args startFrom wins (M1 killed)
   - a different baseSha or specPath is ignored (M5 and M13 killed)
   - no recordPath means no state call
6. **Timeout honesty.**
   - The code comment at js:216-223 says plainly that this is a prompt-level limit with no per-agent API limit, and that a wedged agent is not ended.
   - The report's "Prompt-level limit" section and SKILL.md "Hung agents" say the same.
   - The test with two territories and one builder timeout shows the other territory carrying on.
7. **Second host.** `secondHost` is optional (js:274). A Windows-looking alias spawns nothing (test passes; M3 killed). It is skipped when acceptance skipped (M17 killed).
8. **Territory boundary.** All 11 changed files are in the territory list. The Codex paragraph and the pinned census paragraph are untouched; I checked the hunk ranges against base SKILL.md lines 437-441.

Verified absences:
- No banned tokens.
- No agent type or model outside the four pinned pairs.
- The return shape changed only by adding `secondHost` (plus the `error` field on ACCEPT_PREP).
- No state call without recordPath.
- No edit outside the territory.

## Findings

### MAJOR-1: SKILL.md gives a false reason for the record-commit timing, the reason addendum (g) required
- **Where:** skills/team-build/SKILL.md:451-454.
- **What the brief requires:** (g) says the record and evidence are committed only after `accept` succeeds, "because a commit moves HEAD off `Artifact:` and live check-acceptance then fails". The lead addendum asks for "exactly when the record is committed relative to Artifact". The observed failure was `Artifact X does not match delivery Y`.
- **What the doc says:** "accept-prep and `accept` both read the record's bytes, and a commit in between only makes `census-stale` and a moved `Spec-from:` harder to read." That is wrong on both counts:
  - A commit has no bearing on census-stale, which compares the census timestamp with the last `Log: reviewed` line, or on Spec-from.
  - "only ... harder to read" understates the effect. The real consequence is that live check-acceptance and `accept` fail on the Artifact/delivery mismatch, and the doc never names that failure.
- **Placement:** the sentence also sits after "merge into main ... send ONE RESULT", so it can be read as "commit after the merge".
- **Why the test misses it:** work-record.test.mjs:4017 pins only the phrase "committed only after `accept` succeeds, never between accept-prep and `accept`", so the false reason passes.
- **Shown by:** reading SKILL.md:446-454 against addendum-lead.md bullet 4 and the territory brief's item (g).
- **Fix (mechanical patch).** Current text, SKILL.md:451-454:
  ```
  then send ONE RESULT. The record and its evidence are committed only after `accept`
  succeeds, never between accept-prep and `accept`: accept-prep and `accept` both read the
  record's bytes, and a commit in between only makes `census-stale` and a moved `Spec-from:`
  harder to read.
  ```
  Replacement:
  ```
  then send ONE RESULT. The record and its evidence are committed only after `accept`
  succeeds, never between accept-prep and `accept`, and before the push and merge above:
  accept-prep pins `Artifact:` to the reviewed integration head, and a commit on the
  integration branch in between moves HEAD off `Artifact:`, so live check-acceptance and
  `accept` refuse with `Artifact <sha> does not match delivery <sha>`.
  ```
  Optionally extend the assertion at work-record.test.mjs:4017 with `assert.match(text, /moves HEAD off `Artifact:`/)`.
- **Predicted outcome:** the existing regex at :4017 still matches, because the replacement keeps the exact words "committed only after `accept`" + line break + "succeeds, never between accept-prep and `accept`" (the `\s+` in the regex allows the line break), and the gate stays green.

### MINOR-1: the stale-seam guard is untested (mutation survives)
- **Where:** js:1025, `sameSha(priorSeam.integrateHead, integrate.headSha)`.
- **Mutation:** I replaced it with `true` on the scratch copy. All 16 "lane 67 item 3" tests still pass (`muts1` M7).
- **Test gap:** the only seam-resume test (test:2175) covers the positive case. Nothing shows that a recorded seam APPROVE over a different integrator head is not reused.
- **Fix:** add a test where the state has `seam: { verdict: 'APPROVE', sha: X, integrateHead: OLD }`, the integrator runs again (a different approvedKey, so not skipped) and returns NEW. Assert that a `seam:r1` call happens.
- **Predicted:** passes at HEAD and fails with the M7 mutation.

### MINOR-2: the coalescing test does not test coalescing
- **Where:** test:2039-2053.
- **Problem:** the test title claims "fewer writes than one per territory per phase", but the assertion is `buildReviewWrites <= 4` with 2 territories and 2 phases, which is exactly one per territory per phase. Deleting `if (stateFlight) return stateFlight` (js:~606) still passes (`muts2` M21).
- **Measured counts** (scratch harness `count-writes.mjs`): 4 or 5 territories over 2 rounds make 11 state writes, while a single territory makes 7. So coalescing does work under lockstep stubs.
- **Under real agents:** territories finish minutes apart, so writes approach one per territory per phase. SKILL.md:419 says "one runner write after each of Setup, Build, Review, Fix, Integrate, Seam and Accept", which overstates it.
- **Fix:**
  - Tighten the assertion to `buildReviewWrites < 4` (lockstep stubs give 2 Build + 2 Review today; the mutation gives 4). Check the exact number first.
  - Reword SKILL.md:419-420 to "writes after each phase, coalesced across territories that finish together (about one per territory per phase when they finish apart)".

### MINOR-3: every territory blocks on the shared state write
- **Where:** js:873, 899, 920 and 946 (`await flushState(...)` inside runTerritory), and js:345-367.
- **Problem:** each territory awaits the shared flight. A state runner that hangs, for example on a permission prompt, stalls every territory. That is the hung-agent failure this lane targets, and it contradicts the comment that the state file is "a convenience, never a gate" (js:342-343). Each write also adds one runner spawn of latency per phase per territory.
- **Fix (judgment):** in runTerritory call `flushState(...)` without `await`, and `await stateFlight` once after `parallel()` and at the end. Alternatively, keep the current behaviour and state the trade-off in the comment and the report.
- **Predicted:** the ordering-sensitive state tests may need their awaits adjusted; the work-call journals are unchanged.

### MINOR-4: the reviewer and seam prompts give contradictory first-line rules
- **Where:** js:199-200 and js:224-226.
- **Problem:** REVIEW_MANDATE says the first line is "exactly `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`". The new deadline line in the same prompt says "write your report with VERDICT: BLOCKED". A reviewer at its limit gets two incompatible rules. The script reads the schema `verdict`, so the script side works, but the findings file may contradict it.
- **Fix:** add one clause to deadlineLine's parenthetical, for example "(a reviewer or integrator returns verdict BLOCKED with timeout in its note field; for a reviewer this overrides the APPROVE/NEEDS_FIXES first-line rule)".

### MINOR-5: a relaunch after a crash mid-seam-fix fails closed with review-sha-mismatch
- **Where:** js:991-1008, 1018-1025 and the seam stage.
- **Problem:** stateSeam is written only after Seam completes (js:1136-1139). Suppose a run dies after a seam-fix commit but before the seam re-review. The relaunch skips the integrator (it records head H0), runs seam round 1, and the reviewer reports the live HEAD H1. That is not equal to H0, so the result is the `review-sha-mismatch` seam blocker, and the lead has to work it out by hand.
- **Severity:** this fails closed, which is why it is MINOR.
- **Fix (judgment):** either write a state row after each seam round (seam.sha and rounds) and resume the seam re-review from it, or document in SKILL.md's resume paragraph that a mid-seam relaunch needs the integrator re-run.

### MINOR-6: builder report numbers
- **Where:** reports/loop67.md item 6.
- **Problem:** the report says "41 of 124 fail, 83 pass". My run of the same check gives 40 fail, 84 pass. This does not change any conclusion. The report also says the 4c refusal cause is "inferred from the prompts", while the code comment at js:398-401 states it as fact ("Lane fourteen's integrator refused...").
- **Evidence for 4c:** the only in-tree evidence is docs/work/wr-2026-09-27-measure-truth.record.md:19, "the loop's integrator refused on seam order". The refusing brief is not in the tree.
- **Fix:** soften the comment to "refused on seam order (wr-2026-09-27-measure-truth.record.md:19); the brief that caused it is not in the tree".

## Open questions for the lead (the spec leaves these open; not findings)
- **Second host after a failed accept-prep:** the second-host suite still runs when accept-prep failed (`accept-prep-failed`) or reported a head mismatch, because acceptance did not "skip" (js:1251). Should those also suppress it?
- **Windows host when acceptance skipped:** the `windows-host` blocker is returned only when acceptance did not skip. With a Windows alias and a skipped acceptance, nothing is reported.
- **Broad timeout match:** `namesTimeout` (js:229-231) matches any BLOCKED note containing "timeout" or "timed out", for example "ssh timed out" or "gate timed out". That gets labelled `agent-timeout`, as the spec's wording implies.
- **Resuming exhausted rounds:** a `rounds-exhausted` row (verdict NEEDS_FIXES with findings) resumes on relaunch as a fresh `startFrom` NEEDS_FIXES at round 2, which grants more fix rounds.
- **Re-running accept-prep:** a relaunch after a successful Accept runs accept-prep again, which adds a second `Log: ... reviewed` line. The spec does not ask for an Accept skip.
- **Relative state path:** with `recordPath` but no `integrationWorktree`, the state path is relative (js:303-305).

## Summary
Items 1 to 6 and (d) to (h) are present and tested, the gate is green, the pinned script tests hold, no file outside the territory changed, and the timeout limitation is stated honestly. One MAJOR stands: the SKILL.md accept-turn sentence for (g) gives a false reason and leaves out the Artifact/delivery failure the addendum named. The fix is a ready-to-apply 4-line patch.
