VERDICT: APPROVE c94f4b21f68f34adf975372770cf34c4c97cd9e8

Independent delta review A; no outstanding findings in assigned scope.

Cause: the earlier candidate coupled the prior artifact range to the optional findings path.
Discriminating check: inspected the exact delta and its behavior regression at build-loop-workflow.test.mjs:379. The test executes NEEDS_FIXES with an empty findingsPath, a replacement SHA, then null/retry APPROVE; it asserts there are exactly two round-two review calls and that BOTH contain the concrete sha1..sha2 range. This discriminates the independently reproduced defect in the prior candidate. Inspected A-gate.log: 26 passed, zero failed; execution is builder evidence, not an independent rerun.
Fix location: build-loop-workflow.js:90-93 now gates range only on round >= 2 and captured priorBuildSha. Empty, null or omitted priorFindingsPath affects only the optional findings sentence. Both review attempts pass the same captured prior SHA. The range is independent of the optional path.
Simplification: separates two independent prompt facts with no new state, helper or schema.

All SHA comparison, explicit verdict rejection, retry dispatch, positional normalization, and integration filtering code is unchanged from independently probed 19d3630. The earlier mismatch/malformed review SHA and surviving parallel approval evidence therefore still applies. Verified HEAD is c94f4b21f68f34adf975372770cf34c4c97cd9e8 and worktree is clean. No runtime probes or suites run in this delta review; E's verification slot was not used. No source/config/records edits, live actions or lingering processes.

The following is historical evidence for the previous candidate; its sole finding is resolved above.
VERDICT: NEEDS_FIXES — 19d3630bb911335f406378713aee62c266c4a155

Independent review A; base 78cb46e; work wr-2026-09-23-harness-a. No source or records edits.

## Medium: fix-review range still disappears for a schema-valid empty findings path

Location: skills/team-build/references/build-loop-workflow.js:90.
Cause: reviewPrompt couples the commit range to `priorFindingsPath` truthiness. REVIEW requires a string but allows the empty string. After a matching NEEDS_FIXES review with findingsPath '', the replacement build runs and both the first and retry review prompts omit the captured previous SHA. This violates the requirement to supply the previous/current artifact range in both attempts; a valid schema result silently loses the comparison context.
Discriminating check: independent AsyncFunction execution of the actual workflow: build first; NEEDS_FIXES first with findingsPath ''; build second; review null then APPROVE second. Both round-two prompts lack `Commit range: first..second`. Control with findingsPath 'findings.md' includes the correct range in both attempts. Observed presence arrays: empty path [false,false], nonempty path [true,true]. Existing test only covers a nonempty findings path and checks the first attempt.
Fix location: reviewPrompt lines 90-92 and the existing build-loop-workflow.test.mjs. Append the round-two commit range independently of whether priorFindingsPath is present; append prior findings separately when provided. Add a behavior regression with the empty string and a null-then-success review, asserting the concrete captured range in both prompts. If a findings path is mandatory operationally, explicitly block with an accurate reason instead of silently withholding the range.
Simplification: split the two independent prompt facts; no helper, schema expansion, or new state required.

## Evidence and test assessment

- Read complete workflow and patch; inspected its existing executable test harness. No full suite or scoped suite rerun; builder reports 25 scoped tests passing.
- Ran independent temporary probes against exact candidate source. Twenty-four cases exercised mismatch, missing, null, number, object and empty review SHA in rounds one/two, both direct and after null retry. Each produced review-sha-mismatch and no integration approval.
- Six unexpected-verdict cases (UNKNOWN, empty string, null across both rounds) produced review-not-approved. Two additional attempted undefined-verdict cases used the probe helper default and therefore are NOT counted as missing-verdict coverage.
- Three sparse parallel cases removed each position among three actual executed territories. Each retained all three identities, one blocker, and both surviving matching approvals in the integration prompt. Existing committed null/omitted test has no surviving success and cannot alone establish this property.
- Two prior-range cases inspected both fix-review attempts, yielding the finding above.
- Zero territories still invokes the integrator exactly once with approved none and returns empty territories/blockers, preserving the existing explicit test/contract. All-blocked mismatch cases also invoke integration with approved none. The separate integrator PASS output is not evidence of territory approval.
- Current committed tests positively reproduce stale-review exclusion, but do not cover malformed/missing SHA, mismatch after retry, retry range text, or surviving approvals beside missing slots. Independent probes cover these except the noted undefined-verdict helper limitation. No claim of real-agent execution or provider behavior.

Verification slot released to parent immediately after probes. Temporary probe removed after recording results; no source edits, configuration changes, live actions, nested agents, or lingering processes.

