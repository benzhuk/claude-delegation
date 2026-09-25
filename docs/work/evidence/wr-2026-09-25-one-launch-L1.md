VERDICT: APPROVE c3a97b102716b632132bcb78506edbb141e6640e

# Review: L1 (build-loop-workflow.js), round 2 (delta re-review)

Reviewed sha: c3a97b102716b632132bcb78506edbb141e6640e (my own `git rev-parse HEAD` in
/home/ben/Code/wt-one-launch-L1; tree clean). Range: 41c4d43..c3a97b1, one commit, 2 files
(build-loop-workflow.js, build-loop-workflow.test.mjs), both inside L1.
Gate: `node --test skills/team-build/references/build-loop-workflow.test.mjs`: 61/61 pass
(re-run in the worktree and on a scratch copy).

Counts: 0 BLOCKER, 0 MAJOR, 3 MINOR (none gating). Line numbers refer to
`skills/team-build/references/build-loop-workflow.js` unless marked `test`.

## Prior findings: verified with mutation checks

I reverted each fix on a scratch copy outside the reviewed tree (git archive of HEAD) and
re-ran the suite. Every fix except one has a test that fails when the fix is reverted.

| Finding | Fix at | Result with the fix reverted |
|---|---|---|
| M1 deciding reports = reviewer findingsPath | 750 | 1 fail |
| M2 seam range guard `!sameSha(priorHead, fixSha)` | 281, 686/689 | 1 fail |
| M3 accept-prep integrationHead checked | 768-772, 779 | 1 fail (the "HEAD" echo); see m-1 for the seam branch |
| M4 skip on territory blockers | 739-743 | 2 fail |
| M5 setup brief paths verified | 446-456 | 1 fail |
| M6 live journal | test ~818-883 | an un-awaited stray agent() before return: 4 fail (label set, count); a setTimeout-deferred stray: 1 fail (`journal.at(-1)`) |
| m1 trailing slash | 171, 177 | 2 fail |
| m2 startFrom validation | 362-375 | 4 fail |
| m3 phases | 390, 633/637, 728 | not asserted; read and correct (the SKIPPED seam still marks Seam, which is acceptable because the return then carries seam SKIPPED) |
| m4 setup prompt verbatim headSha | 268 | text present |
| m5 plugin-root script paths | 298, 301 | text present |
| m7 seam sha kept on rounds-exhausted | 711-718 | 1 fail |
| m9 gaps (setup died twice, branch/brief/missing row, seam r1 mismatch, seam died twice) | test | all present and asserting values |

m6 and m8 are left for the lead, as the r1 review allowed. The report flags both.

## Verified: no defects found in these areas

- **Backward compatibility.** Every r2 hunk is in one of these places:
  - the Setup block;
  - the Seam block;
  - the Accept block;
  - the helpers baseName, dirName and workIdFromRecordPath, which only Setup and Accept
    call;
  - the startFrom loop, which `continue`s on every territory without startFrom.

  A given-path launch with no integrationWorktree and no startFrom therefore runs the same
  code as in r1, which r1 showed is byte-identical to 0.20.9 on `{territories, integrator,
  blockers}`. The given path no longer calls phase('Setup'/'Seam'/'Accept'), so it is now
  closer to 0.20.9 than r1 was.
- **T1/S5 twins in the new code.** Every new sha comparison goes through the shape-checked
  `sameSha`:
  - the M3 accept head, at 769;
  - the seam range guard, at 281;
  - the startFrom sha, which is shape-checked at 368 before it can reach the integrator.

  No new prompt renders a sha that the agent must derive itself. The seam r2 prompt with a
  new commit carries only the prior head, and the test asserts that the fix sha is absent.
- **The script can never call accept.** The accept stage only spawns `accept-prep`, and
  it is now also gated on no territory blockers.
- **Runtime limits.** There is no Date, setTimeout, require, process, import or fs in the
  script (grep).

## MINOR

### m-1. The M3 "seam sha" test does not discriminate the seam branch of expectedHead
**Where:** the test "M3: accept-prep is checked against the seam's (longer) APPROVE sha"
(test ~1181). The code is at 768.

**Evidence:** I mutated `expectedHead` to `integrate.headSha` only, and 0 tests failed. The
test's integrate head `e5e5e5e` is a 7-hex prefix of the seam sha, so `sameSha` matches
either operand.

The branch that matters is the one where a seam-fix moved HEAD: seam APPROVE at `f6…`,
integrate at `e5…`. That case is untested.

**Fix (test only):** add a case where the seam has a NEEDS_FIXES round:
- seam:r1 NEEDS_FIXES at `e5…40`;
- seam-fix:r2 PASS at `f6…40`;
- seam:r2 APPROVE at `f6…40`;
- accept-prep returns integrationHead `f6…40`.

Assert `blockers` is `[]`. In a second run, accept-prep returns `e5…40`, and `blockers`
must equal `[{id:'accept-prep', reason:'review-sha-mismatch'}]`.

**Predicted result:** both pass on HEAD, and the second fails under the mutation above.

### m-2. The m1 twin: worktreeRoot is not normalized, and it falls back to a relative "."
**Where:** line 393 (and 397).

**Evidence** (probe on HEAD):
- `worktreeRoot: "/r/"` gives `worktree /r//wt-spec-L1`. A runner that reports the
  git-normalized `/r/wt-spec-L1` fails the strict `!==` at 428 and gets a spurious
  `setup-failed`.
- With neither worktreeRoot nor integrationWorktree, the result is
  `worktree ./wt-spec-L1`. That path is relative, so it resolves differently for each
  agent's cwd.

**Patch:**
```
-  const worktreeRoot = a.worktreeRoot ?? dirName(integrationWorktree ?? '')
+  const worktreeRoot = a.worktreeRoot != null ? String(a.worktreeRoot).replace(/\/+$/, '') : dirName(integrationWorktree ?? '')
+  if (!a.worktreeRoot && !integrationWorktree) {
+    log('build-loop: setup territories need worktreeRoot or integrationWorktree, nothing spawned')
+    return earlyReturn([{ id: '*', reason: 'missing-args' }])
+  }
```
Put it as the first thing inside `if (setupMode) {`, before `phase('Setup')`, so nothing is
marked. The missing-args part tightens R2, which does not list either field as required, so
it is the lead's call. The trailing-slash strip is mechanical.

**Predicted result:** all existing setup tests pass a non-slashed integrationWorktree, so
they stay green.

### m-3. The accept-prep prompt never says where integrationHead comes from, or that nothing is committed
**Where:** lines 297-302. This is a T1-class twin: defence in depth, now that M3 checks
the value.

**Evidence:**
- Step 3 says `Artifact: <branch>@<40-hex head>`, and the schema asks for
  `integrationHead`. Unlike setup (after m4) or review, the prompt never tells the runner
  to run `git rev-parse HEAD` in the integration worktree and report the output verbatim.
- It also never says not to commit the record edit.
- If the runner commits the record in the integration worktree, HEAD moves. M3 then
  correctly flags `review-sha-mismatch`, but the run fails for an avoidable reason, and
  check-acceptance's `Artifact == delivery-ref tip` rule (scripts/work-record.mjs:810)
  pulls toward writing the unreviewed post-commit head.

**Patch** (insert at the start of step 3, text only):
```
-  p += `3) Write exactly these header lines of ${recordPath} ...
+  p += `3) Run \`git -C ${integrationWorktree} rev-parse HEAD\` yourself and report its full output verbatim as integrationHead and as the Artifact head; commit nothing. Write exactly these header lines of ${recordPath} ...
```
**Predicted result:** there is no sha literal in the prompt, so R9 and the existing prompt
tests are unaffected.

## Notes for the lead (not counted)
- `acceptance.skipped: 'territory-blockers'` (M4) adds an extra gate on top of R5's literal
  run condition and a new skip reason. If L2's SKILL.md lists skip reasons, the seam review
  should check that it includes this one.
- A startFrom APPROVE row with no findingsPath is valid under R6. It contributes no
  evidence file to accept-prep, and this is silent. Consider requiring findingsPath on
  startFrom when recordPath is given.
- m6 (the Log-line literal on seam SKIPPED) and m8 (strict brief paths on the given path)
  remain open for the lead, as the builder flagged.
