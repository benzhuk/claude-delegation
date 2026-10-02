VERDICT: APPROVE 8da75eab31507962a13f3a17cae9e823b6633086

# states73 review, round 2 (scope add F1: maxRounds on the Workflow line), lane 73, wr-2026-10-01-report-states

Worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-73. I ran `git rev-parse HEAD` there myself and got 8da75eab31507962a13f3a17cae9e823b6633086. Range 0c7b14fe..HEAD is six commits. The builder's code is one commit, 24291a15 (8 files). 8da75eab adds the builder report. The other four (9ddd8308, 98ca5aac, 3349cd83, 57cbfdf0) are the lead's record, scope, merge and report commits.

Report path: the brief's path for round 2, `reports/states73-review-r2.md`, already exists. It is committed (57cbfdf0) and holds the earlier APPROVE review of 0c7b14fe. I did not overwrite it, because the rules forbid overwriting work I did not write. This report is at `reports/states73-review-r2-f1.md` instead. It is the only file I wrote in the worktree.

Worktree state: `git status --short` showed ` M docs/work/wr-2026-10-01-report-states.loop-state.json` before and after the review. The lead or the loop changed that file, not me. I edited no code. The mutation checks ran on a `git archive HEAD` copy in scratch (`lane-73/r2f1/copy`).

This is a delta review. Scope: the F1 scope add in rounds-findings.md, plus a hunt for regressions against round 1's APPROVE.

Counts: 0 BLOCKER, 0 MAJOR, 5 MINOR.

## Gate and focused tests (run by me)

- Territory gate, redirected to `scratchpad/lane-73/review-gate.log`: exit 0, tests 1140, pass 1140, fail 0.
- `node --test skills/team-build/references/accept-prep.test.mjs skills/team-build/references/build-loop-workflow.test.mjs` (log `review-r2-focused.log`): exit 0, tests 154, pass 154, fail 0. This includes "lane 73 F1: accept-prep's command carries --max-rounds with the value the loop used" and "maxRounds omitted passes the default 3 to accept-prep".
- Mutation checks, run on the scratch copy:
  - I replaced the guard at work-record.mjs:247 with `if (false)`. 2 of the 4 "lane 73 F1" work-record tests then failed: the refusal test and the cutoff test.
  - I replaced the guard at accept-prep.mjs:256 with `if (false)`. 4 of the 5 F1 accept-prep tests then failed.
  - Both regression tests are real.

## F1 requirements, checked one by one

1. **accept-prep writes `Workflow: <run id> maxRounds=<n>` with the value used, default 3.** Met.
   - accept-prep.mjs:250-269. The loop passes `--max-rounds ${maxRounds}` (build-loop-workflow.js:454, 1199), where `maxRounds` comes from build-loop-workflow.js:476-477 and defaults to 3.
   - My probes: a plain run id gives `wf_a maxRounds=3`; CRLF line endings are kept (`crlfAll=true`); a bold-prefixed `- **Workflow:** wf_a` gives `wf_a maxRounds=2` and parseRecord reads it back; `none, <reason>` and an empty `Workflow:` are left alone.
2. **work-record accepts the form and refuses a run-id line without `maxRounds=<n>` from the cutoff on.** Met.
   - work-record.mjs:247-260. checkWorkflowField is called only from checkAcceptance (work-record.mjs:1352), which runs for `accept`, `check-acceptance` and acceptRecord (:1685, :2824). merge-check and validateRecord do not call it.
   - Regression sweep: I parsed all 140 `docs/work/*.record.md` at HEAD and ran checkWorkflowField on each. 0 hit `workflow-maxrounds-missing`. No existing record is newly refused.
3. **Documented once in skills/team-build/SKILL.md.** Met. "never a peer message" appears once (SKILL.md:391). The refusal code is also listed at SKILL.md:86-87 and in docs/work-record.md (the field section and the codes table).
4. **Tests for with/without maxRounds, accept-prep writes the value, default 3.** Met. There are 4 new work-record tests, 5 new accept-prep tests and 2 new build-loop tests.
5. **No consumer breaks on the longer Workflow value.** Verified:
   - I grepped every reader of the record's `Workflow:` field in scripts, hooks, skills and bin. The only readers are work-census.mjs:118 and :163, which print the value verbatim.
   - four-read.mjs and build-census.mjs get run ids from transcripts (`toolUseResult.runId`), never from the record. So a run id followed by ` maxRounds=3` breaks no lookup.
6. **Scope.** The builder commit touches only the 8 files the scope add names or implies. accept-prep.mjs and build-loop-workflow.js (and their tests) are not in the original territory list, but the lead's scope add rules them in by name. No change under agents/ or docs/decisions/. The only docs/work changes are lead commits (9ddd8308, 98ca5aac, 57cbfdf0).

## Findings

### MINOR 1: accept-prep without `--max-rounds` replaces an existing recorded bound with the default 3
- **Evidence:** accept-prep.mjs:259 is `const rounds = opts.maxRounds !== undefined ? Number(opts.maxRounds) : DEFAULT_MAX_ROUNDS;`.
- **Probe:** start from `Workflow: wf_a maxRounds=5` and pass no `--max-rounds`. The result is `Workflow: wf_a maxRounds=3`, so the record now states a bound that was never used.
- **Impact:** the loop always passes the flag, so only a hand run hits this.
- **Patch** (accept-prep.mjs:259):
  - current: `    const rounds = opts.maxRounds !== undefined ? Number(opts.maxRounds) : DEFAULT_MAX_ROUNDS;`
  - replacement: `    const recorded = /(?:^|\s)maxRounds=(\d+)(?:\s|$)/i.exec(existingWorkflow);`
    `    const rounds = opts.maxRounds !== undefined ? Number(opts.maxRounds) : recorded ? Number(recorded[1]) : DEFAULT_MAX_ROUNDS;`
- **Predicted outcome:** the existing F1 tests still pass. The "second accept-prep replaces" test passes `maxRounds: 4` explicitly, and the "default 3" test starts with no bound.

### MINOR 2: the run-id strip only removes a bound at the very end, so a second token can appear
- **Evidence:** accept-prep.mjs:257-258, `.replace(/\s+maxRounds=\S*\s*$/i, "")`.
- **Probe:** `Workflow: wf_a maxRounds=3 (rerun)` with `--max-rounds 4` gives `Workflow: wf_a maxRounds=3 (rerun) maxRounds=4`. checkWorkflowField accepts that, since any one token passes.
- **Patch:**
  - current: `      .replace(/\s+maxRounds=\S*\s*$/i, "").trim();`
  - replacement: `      .replace(/(^|\s+)maxRounds=\S*/gi, "").trim();`
- **Predicted outcome:** that probe gives `wf_a (rerun) maxRounds=4`, and all current tests are unchanged.

### MINOR 3: the check accepts a Workflow value that is only a bound, with no run id
- **Evidence:** work-record.mjs:247.
- **Probe:** `checkWorkflowField({fields:{workflow:"maxRounds=3",specFrom:"2026-10-03T00:00:00Z"}})` returns no refusal. Through accept-prep the same input becomes `Workflow: maxRounds=3 maxRounds=2`.
- **Spec wording:** the record line is `<run id> maxRounds=<n>`.
- **Fix:** in the `if (workflow !== "")` branch, before the maxRounds test, refuse `workflow-invalid` when the first whitespace-separated token matches `/^maxRounds=/i`. In accept-prep, throw `missing-field` when `runId` comes out empty.
- **Predicted outcome:** no existing test or record is affected (the sweep above found 0 such values).

### MINOR 4: the loop accepts a maxRounds that accept-prep refuses, but only fails at the very end of the run
- **Evidence:**
  - build-loop-workflow.js:476-477 takes any finite number, including `2.5` and `-1`.
  - accept-prep.mjs:80-82 refuses anything that does not match `/^\d+$/`. Probes: `-1` and `2.5` give `bad-args`; `07` passes.
  - So a run launched with `maxRounds: 2.5` does all its build, review and integrate work, then dies at accept-prep.
- **Fix:** validate at launch. Make line 477 `Number.isInteger(maxRoundsCandidate) && maxRoundsCandidate >= 0 ? maxRoundsCandidate : 3`, or refuse the args up front the way the other arg checks do.
- **Predicted outcome:** the existing explicit and default tests are unchanged.

### MINOR 5: the builder report misstates the lane record's Spec-from
- **Evidence:** states73-fix-r2.md says "lane 73's own record (Spec-from 02:50Z ...)". docs/work/wr-2026-10-01-report-states.record.md:14 reads `Spec-from: 2026-10-02T00:50:00Z`.
- **Impact:** none on the conclusion; the lane is still before MAXROUNDS_FROM and is not stranded.
- **Fix:** correct the sentence in the report.

## Open question (not a finding; the lead decides)

The scope add says the check refuses "once this lands". The builder implemented it as a fixed Spec-from cutoff, MAXROUNDS_FROM = 2026-10-02T03:00:00Z (work-record.mjs:226), which is the same discipline as WORKFLOW_FROM and SCRATCH_FROM. As a result, a record opened before 03:00Z and accepted by hand after the merge is not refused. Loop-run accepts are unaffected, because accept-prep always writes the bound. I judge this the narrowest reading that satisfies "records already accepted are not rewritten or refused". If the lead wants every accept after landing to be checked, the cutoff would need to be judged on the accept time instead.

## C4 fields

- Cause: the build loop's round bound (`maxRounds`, build-loop-workflow.js:476-477) was not visible on the record, so a lead could not check it and could take a bound from a peer message instead.
- Discriminating check: the "lane 73 F1" tests in scripts/work-record.test.mjs and accept-prep.test.mjs. They fail on the scratch copy with the fix removed (2 of 4 and 4 of 5 failed) and pass at HEAD (1140/1140 gate, 154/154 focused).
- Fix location: skills/team-build/references/accept-prep.mjs:250-269 (writes the bound), build-loop-workflow.js:454 and :1199 (passes it), scripts/work-record.mjs:226 and :247-260 (checks it).
- Simplification: none needed. The check reuses checkWorkflowField's existing Spec-from cutoff pattern, and the writer reuses editRecord's matchField/insertLine path rather than adding a new writer.
