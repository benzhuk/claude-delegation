VERDICT: NEEDS_FIXES (15) 41c4d43950d545267c602d01afbad16d9b51b6c1

# Review: L1 (build-loop-workflow.js), round 1

Reviewed sha: 41c4d43950d545267c602d01afbad16d9b51b6c1 (read with `git rev-parse HEAD` in
/home/ben/Code/wt-one-launch-L1; tree clean). Base: fbd7cf6. One commit, 4 files, all
inside the L1 territory. scout-brief.md is untouched.
Gate: `node --test skills/team-build/references/build-loop-workflow.test.mjs`: 42/42 pass.

Counts: 0 BLOCKER, 6 MAJOR, 9 MINOR.

Line numbers refer to `skills/team-build/references/build-loop-workflow.js` (the script)
unless the finding names `build-loop-workflow.test.mjs` (the test).

## Verified: no defects found in these areas

- **Backward compatibility (attack brief item 1).** I ran the 0.20.9 script
  (`git show fbd7cf6:...`) and the new script side by side in a scratch harness, using 4
  given-path fixtures with no integrationWorktree:
  - two territories with rounds-exhausted;
  - build respawn plus a review returning the non-sha "HEAD", plus the integrator dying
    twice;
  - build FAIL with a string maxRounds;
  - a short-sha/full-sha match.

  In all 4, `{territories, integrator, blockers}` are byte-identical (JSON). The agent
  call count and the full `opts` sequence (agentType, model, schema, phase, label) are
  also identical. The only new keys are `seam: null`, `acceptance: null` and
  `setup: null`, which R7 allows. Rendered prompts differ only by the appended
  " Never send peer notes." (R9). The one intended behaviour change is that missing
  args now return `missing-args` instead of running (R2).
- **Setup verification looks at values, not just presence.** Lines 398-410 compare
  worktree, branch and briefPath with strict `!==` against the script's computed names,
  and headSha with `sameSha(headSha, baseSha)`. A missing row also fails. The tests at
  lines 632 and 643 exercise a headSha mismatch and a worktree mismatch.
- **Accept-prep is gated on integrator PASS and seam APPROVE/SKIPPED** (lines 688-691).
  Seam NEEDS_FIXES or BLOCKED, and integrator FAIL or BLOCKED, all skip it. The script
  never invokes `accept`: the word appears only as a prohibition in ACCEPT_MANDATE and
  in step 3 of the prompt.
- **S5 twins.** Every seam comparison (lines 610 and 656) and the setup headSha check
  use the shape-checked `sameSha`. Two equal non-sha strings cannot pass.
- **Runtime limits.** There is no Date.now, fs, process, require, import or shell in
  the script (grep, plus test L-C4.3). The path helpers are pure string code.
- **Header comment** is 42 lines (15-56), which is within the 45-line limit. `meta`
  is a pure literal with 7 phases in the right order.

## MAJOR

### M1. Accept-prep copies the BUILDER reports as the "deciding" evidence, not the reviewers' APPROVE reports
**Where:** line 694.

**Evidence:**
- `approved.map((r) => r.reportPath)`: `r.reportPath` is `build.reportPath` (lines 478
  and 518).
- R5 step 2 says "the deciding reports (last territory APPROVE per territory, last seam
  APPROVE)". That is the reviewer's findings file, which is `r.findingsPath`.
- Probe: builder reports `BUILDER-T1.md`, reviewer APPROVE files `REVIEW-APPROVE-T1.md`.
  The rendered prompt says "...original bytes: BUILDER-T1.md, BUILDER-T2.md, SEAM.md".
- Startfrom-APPROVE rows have `reportPath: null` and are silently dropped from the
  evidence, although their approving `findingsPath` is known.

This ships the wrong evidence into the record, so `Evidence:` would not carry the
APPROVE verdicts.

**Patch:**
```
-  const decidingReports = approved.map((r) => r.reportPath).filter(Boolean)
+  const decidingReports = approved.map((r) => r.findingsPath).filter(Boolean)
```
**Add a test:** in the full fixture (test line ~667), give the reviews distinct
findingsPaths and assert that the accept-prep prompt includes them and does not include
the builders' reportPaths.

**Predicted result:** the probe lists `REVIEW-APPROVE-T1.md, REVIEW-APPROVE-T2.md,
SEAM.md`, and startFrom-APPROVE territories contribute their findingsPath.

### M2. The seam delta re-review prompt leaks the current HEAD when the seam-fix builder made no commit (twin of T1 / MINOR 4)
**Where:** lines 271-281 (`seamPrompt`), called at lines 645 and 648.

**Evidence:**
- `reviewPrompt` only appends `Commit range: prior..HEAD` when
  `!sameSha(priorBuildSha, build.sha)` (line 245). That guard exists because a no-op fix
  round puts the exact sha the reviewer must derive into the prompt.
- `seamPrompt` has no such guard, and it never receives the fix builder's sha.
- Probe: seam-fix returns the same head E. The `seam:r2` prompt contains E. An echoing
  seam reviewer copies it, `sameSha(reReview.sha, seamFixBuild.sha)` passes, and the
  seam APPROVEs.

**Patch (script):**
```
-function seamPrompt(seamBriefPath, integrationWorktree, approvedIds, round, priorHead, priorFindingsPath) {
+function seamPrompt(seamBriefPath, integrationWorktree, approvedIds, round, priorHead, priorFindingsPath, fixSha) {
   const idsText = approvedIds.length ? approvedIds.join(', ') : 'none'
   let p = `Seam review round ${round}. ...unchanged... ${REVIEW_MANDATE}`
-  if (round >= 2 && priorHead && priorFindingsPath) {
-    p += ` Prior findings: ${priorFindingsPath}. Commit range: ${priorHead}..HEAD (run this in the worktree).`
-  } else if (round >= 2 && priorHead) {
-    p += ` Commit range: ${priorHead}..HEAD (run this in the worktree).`
-  } else if (round >= 2 && priorFindingsPath) {
-    p += ` Prior findings: ${priorFindingsPath}.`
-  }
+  // Same guard as reviewPrompt (MINOR 4): a no-commit seam-fix makes priorHead the live
+  // HEAD, so the range would hand the reviewer the sha it must derive itself.
+  if (round >= 2 && priorFindingsPath) p += ` Prior findings: ${priorFindingsPath}.`
+  if (round >= 2 && priorHead && !sameSha(priorHead, fixSha)) {
+    p += ` Commit range: ${priorHead}..HEAD (run this in the worktree).`
+  }
   return p
 }
```
**Patch (both calls, lines 645 and 648):** `seamPrompt(seamBriefToUse, integrationWorktree,
approvedIds, seamRound, priorHead, priorFindings)` becomes `seamPrompt(seamBriefToUse,
integrationWorktree, approvedIds, seamRound, priorHead, priorFindings, seamFixBuild.sha)`.

**Add a test:** seam-fix returns the same sha as integrate.headSha, and the `seam:r2`
prompt must not contain that sha. Also add the twin of the territory test at test line
423: when the commit is new, the r2 prompt contains the prior head and not the new sha.

**Predicted result:** the existing R4 tests still pass (e5 vs f6 differ, so the range is
kept), and the new no-commit test passes.

### M3. Accept-prep's returned `integrationHead` is never checked (R1: "checks what that agent returns (schema + sha shape)")
**Where:** lines 699-709 and 712-715.

**Evidence:**
- `acceptance = acceptResult` is taken on faith.
- Probe: the accept-prep runner returns `integrationHead: "HEAD"`, and `blockers: []`
  comes back clean.
- That runner writes `Artifact: <branch>@<head>` into the record. If the head it read
  is not the one the seam or integrator verified, the record claims review of an
  unreviewed head, and nothing in the return flags it.

This is the T1 class (an unverified sha) in the new stage.

**Patch:**
```
 phase('Accept')
 let acceptance = null
+let acceptHeadMismatch = false
 ...
   } else {
     acceptance = acceptResult
+    const expectedHead = seam && seam.verdict === 'APPROVE' ? seam.sha : integrate.headSha
+    if (!sameSha(acceptResult.integrationHead, expectedHead)) {
+      log(`accept-prep: integrationHead ${acceptResult.integrationHead} did not match reviewed head ${expectedHead}`)
+      acceptHeadMismatch = true
+    }
   }
 ...
 const blockers = [
   ...excluded.map((r) => ({ id: r.id, reason: r.blocker })),
   ...(seam && seam.blocker ? [{ id: 'seam', reason: seam.blocker }] : []),
+  ...(acceptHeadMismatch ? [{ id: 'accept-prep', reason: 'review-sha-mismatch' }] : []),
 ]
```
(Do not render the expected head into the accept-prep prompt; the runner must read it
from git itself.)

**Add a test:** accept-prep returns `integrationHead: "HEAD"`, and blockers must contain
`{id:'accept-prep', reason:'review-sha-mismatch'}`.

**Predicted result:** all current fixtures already return a matching head (d4..., e5...),
so they stay green.

### M4. Accept-prep runs, and writes `Status: reviewed`, when territories are blocked or none were approved
**Where:** lines 684-692.

**Evidence:** probe with one territory whose builder returned BLOCKED, the integrator
PASS (nothing to integrate) and seam SKIPPED (a single territory). `accept-prep` ran, and
its prompt tells it to write `Status: reviewed` and a `seam r<n> APPROVE` Log line.
Meanwhile `blockers: [{T1, builder-blocked}]`. The same happens with 2 of 3 territories
approved.

R5 step 2 ("last territory APPROVE per territory") presupposes that every territory has
an APPROVE, so running with an unapproved territory contradicts the contract's own
inputs. It also leaves a false header in the record.

**Patch:** insert after the `integrator-not-pass` branch:
```
 } else if (integrate.verdict !== 'PASS') {
   acceptance = { skipped: 'integrator-not-pass' }
+} else if (excluded.length > 0 || approved.length === 0) {
+  acceptance = { skipped: 'territory-blockers' }
 } else if (...seam...)
```
**Add a test:** one territory that is builder-BLOCKED with integrator PASS must give
`acceptance: {skipped:'territory-blockers'}` and no accept-prep call.

If the lead rules that R5 intentionally allows partial builds, downgrade this to MINOR
and instead make the prompt write the blocker ids into the Log line. I recommend the
skip.

### M5. The reviewer, integrator and seam brief paths are taken from the setup agent unverified, although R3 computes them in the script
**Where:** lines 416-418 (the computed values sit unused at lines 375-377).

**Evidence:**
- R3 says "Deterministic names computed IN THE SCRIPT ... never chosen by the agent",
  and it lists the reviewer, integrator and seam briefs.
- The script computes `setupReviewerBriefPath` and the others, then uses
  `setupResult.reviewerBriefPath` instead.
- Probe: setup returns `/tmp/EVIL-reviewer.md`, and every review prompt then carries
  `Reviewer brief: /tmp/EVIL-reviewer.md.` with no blocker.

**Patch:**
```
-  reviewerBriefPathFinal = setupResult.reviewerBriefPath
-  integratorBriefPathFinal = setupResult.integratorBriefPath
-  seamBriefPathFinal = setupResult.seamBriefPath
+  if (
+    setupResult.reviewerBriefPath !== setupReviewerBriefPath ||
+    setupResult.integratorBriefPath !== setupIntegratorBriefPath ||
+    setupResult.seamBriefPath !== setupSeamBriefPath
+  ) {
+    log('setup: returned reviewer/integrator/seam brief path differs from the computed one, nothing built')
+    return earlyReturn([{ id: '*', reason: 'setup-failed' }])
+  }
+  reviewerBriefPathFinal = setupReviewerBriefPath
+  integratorBriefPathFinal = setupIntegratorBriefPath
+  seamBriefPathFinal = setupSeamBriefPath
```
**Add a test:** setup returns a wrong seamBriefPath, which must give
`blockers [{id:'*', reason:'setup-failed'}]` and exactly 1 call.

**Predicted result:** `setupResultFor()` in the test already returns the computed paths,
so all existing tests stay green.

### M6. The fixture JOURNAL's "exactly one return" asserts a constant
**Where:** `build-loop-workflow.test.mjs` lines 706-719.

**Evidence:**
- `journal = [...stub.calls.map(...), { type: "return" }]` appends the literal return
  entry itself, and then asserts that the count of return entries is 1. That is always
  true, whatever the script does.
- The journal is built after `await`, so it cannot see ordering either: an un-awaited
  `agent()` call firing after the return would be invisible.
- The PANE_LEVEL_TYPES denylist (2 names) also passes for any typo'd or new agentType.

This is the "passes because it isn't looking" check the attack brief names.

**Fix (test-only; instruction plus sketch):**
```
const journal = [];
const inner = makeAgentStub({ ...same fixtures... });
const stub = async (p, o) => { journal.push({ type: "agent", agentType: o.agentType, model: o.model, label: o.label }); return inner(p, o); };
stub.calls = inner.calls;
const result = await runScript(args, stub).then((r) => { journal.push({ type: "return" }); return r; });
await new Promise((r) => setImmediate(r));   // let any stray un-awaited agent() land
assert.equal(journal.filter((e) => e.type === "return").length, 1);
assert.equal(journal.at(-1).type, "return", "no agent() call after the script returned");
for (const e of journal.filter((e) => e.type === "agent"))
  assert.ok(PINNED_PAIRS.some((p) => p.agentType === e.agentType && p.model === e.model), `unpinned ${e.agentType}/${e.model}`);
assert.deepEqual(journal.filter((e) => e.type === "agent").map((e) => e.label).sort(),
  ["accept-prep","build:L1:r1","build:L2:r1","integrate","review:L1:r1","review:L2:r1","seam:r1","setup"]);
```
Check that it discriminates: temporarily add a fire-and-forget `agent(...)` without
`await` at the end of the script, in a scratch copy. The `journal.at(-1)` assertion then
fails, while the current test stays green.

## MINOR

### m1. Trailing slash in integrationWorktree nests setup worktrees inside it
**Where:** lines 168-178.

**Evidence:** probe with `integrationWorktree: "/r/wt-int/"`. The computed worktree is
`/r/wt-int/wt-one-L1`, which is inside the integration worktree. A trailing slash on
`integrationBranch` gives an empty slug.

**Patch:** in both `baseName` and `dirName`:
`const s = String(p ?? '')` becomes `const s = String(p ?? '').replace(/\/+$/, '')`.

### m2. `startFrom` is not validated
**Where:** lines 432-457.

**Evidence:**
- `startFrom.sha` is not shape-checked. Probe: `sha: "HEAD"` reaches the integrator as
  `T1@HEAD`, the S5 class on lead input.
- An invalid `verdict` is silently ignored (the build runs from r1).
- NEEDS_FIXES without findingsPath renders the fresh-build prompt under a `Fix` phase
  with an `r2` label.
- startFrom on a setup territory is silently dropped (`finalTerritories` rebuilds rows
  without it), although R6 says "Only valid on given territories".

**Fix:** in the R2 validation block, return early with
`[{ id: t.id, reason: 'invalid-start-from' }]` when any of these hold:
- `setupMode` is true;
- `!/^[0-9a-f]{7,40}$/i.test(String(sha).trim())`;
- the verdict is not APPROVE or NEEDS_FIXES;
- the verdict is NEEDS_FIXES and findingsPath is missing.

The reason string is new vocabulary, so it needs the lead's OK. Otherwise fold it into
`missing-args`.

### m3. Phases are marked even when those stages never run
**Where:** lines 356, 588 and 681.

**Evidence:** `phase('Setup')`, `phase('Seam')` and `phase('Accept')` run
unconditionally. On the given path with no integrationWorktree, the UI shows
Setup/Seam/Accept as entered. This does not affect the return.

**Patch:** `if (setupMode) phase('Setup')`, and `if (integrationWorktree) phase('Seam')` /
`if (integrationWorktree) phase('Accept')`. Move the Setup call inside
`if (setupMode) {`.

### m4. The setup prompt lets headSha be echoed
**Where:** line 266.

**Evidence:** the prompt contains baseSha (necessarily, for `git worktree add`) but never
tells the runner to report rev-parse output verbatim, so `sameSha(headSha, baseSha)`
passes on an echo. Builders and reviewers downstream do catch a missing worktree, so
this is defence-in-depth only.

**Patch:**
`` then \`git -C <worktree> rev-parse HEAD\`, using exactly `` becomes
`` then \`git -C <worktree> rev-parse HEAD\`, reporting its full output verbatim as that territory's headSha (never copy the base sha from this prompt), using exactly ``.

### m5. The accept-prep prompt uses relative `node scripts/build-census.mjs` and `node scripts/work-record.mjs` with no cwd
**Where:** lines 295 and 298.

**Evidence:** R5 says "plugin `scripts/`". In a non-plugin target repo those paths do not
exist, and `--out docs/work/evidence/...` is relative to an unnamed cwd.

**Fix:** prefix step 1 with "From the integration worktree (cd there first), run the
delegation plugin's scripts/build-census.mjs (resolve the plugin root; not the target
repo's scripts/)". Do the same for work-record.mjs.

### m6. The Log-line template always says "seam r<n> APPROVE", even when seam was SKIPPED
**Where:** line 297.

**Evidence:** accept-prep also runs on SKIPPED (line 690). The script knows
`seam.verdict` and `seam.rounds`.

**Fix (needs the lead's call, since R5 pins the literal):** render
`seam ${seam.verdict === 'APPROVE' ? `r${seam.rounds} APPROVE` : 'SKIPPED'}` for the
fixed part. Keep `<sha>` and `<iso>` as runner-filled placeholders, per M3.

### m7. The seam row drops its sha on rounds-exhausted
**Where:** line 672.

**Evidence:** `sha: blocker ? null : currentHead` nulls the sha on `rounds-exhausted`.
A territory row keeps its last sameSha-verified sha in that case (line 544).

**Fix:** `sha: blocker && blocker !== 'rounds-exhausted' ? null : currentHead`, for
parity. This is cosmetic, because the lead reads the sha for a resume.

### m8. Brief paths are not required on the all-given path (builder deviation 1)
**Evidence:** R2 says reviewerBriefPath and integratorBriefPath are "required when every
territory is given". The script stays permissive and renders `Reviewer brief: undefined`.
Several given-path tests omit both. It matches 0.20.9 behaviour.

**Fix:** leave it for the lead to rule on. If strict, add
`if (!setupMode && territories.length && (!reviewerBriefPath || !integratorBriefPath)) return earlyReturn([{ id: '*', reason: 'missing-args' }])`
after the mode check, and add the brief paths to the given-path test fixtures.

### m9. Test gaps
**Where:** `build-loop-workflow.test.mjs`.

**Evidence:** no test covers any of these:
- setup dying twice (`id:'*'`);
- a branch, briefPath or missing-row mismatch (only worktree and headSha are covered);
- a seam round-1 sha mismatch against integrate.headSha;
- a seam agent dying twice;
- the accept-prep deciding-report list (which is why M1 shipped green).

**Fix:** add one small fixture test each, following the patterns already in the file.

## Notes on the builder's flagged deviations
- 2 (seam sha against integrate.headSha, then against the seam-fix sha): sound. It
  mirrors the build/review pairing.
- 3 (the seam findingsPath is the seam report): consistent. M1 applies the same rule to
  territories.
- 4 (the setup-failed id): acceptable.
- 5 (zero territories use the given path): acceptable.
