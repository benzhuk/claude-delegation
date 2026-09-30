VERDICT: APPROVE d2fb5ccf93dd04239e7edc25faae3231e318e567

# Lane 60b delta confirm, review r4 (b426e8a..d2fb5cc)

All execution happened in a new scratch clone, /var/tmp/l60b-r4-LCrY/c, checked out at d2fb5cc. I did not write to the worktree /var/tmp/lane-60b/wt, and `git status --short` there is empty. For the mutation run I overwrote the scratch clone's work-record.mjs with the b426e8a version, then restored it with `git checkout`. The scratch clone is clean.

## 1. Is the diff exactly the R3-F1 patches? Yes.
- The code commit d2fb5cc touches exactly two files: scripts/work-record.mjs (+9/-1) and scripts/work-record.test.mjs (+26).
- work-record.mjs carries Patch 1's three hunks from review-r3.md exactly: (a) hoists `let artifactCommonDir = null;`, (b) turns `const artifactCommonDir =` into an assignment, and (c) adds the common-dir guard and its comment directly before `const worktreeGitDir`. I read them line by line against the patch.
- work-record.test.mjs: I extracted Patch 2's Replacement block from review-r3.md and diffed it against lines 1373 onward at d2fb5cc. The result is TEST-MATCH, byte-identical, inserted before the "Lane 60b review round 1" banner.
- b426e8a..d2fb5cc also contains docs-only commits, 69151b2 and 9ef85b9 (review-r2/r3, windows-gate-r2, the work record). No other code changed.

## 2. Probes rerun at d2fb5cc (scripts under /var/tmp/l60b-r3-W7UO/probe, new repos under /var/tmp/l60b-r4-LCrY/probe)

| Probe | Mode and Worktree: | r3 (b426e8a) | r4 (d2fb5cc) |
|---|---|---|---|
| P1 | pinned, Worktree = B | REFUSED | REFUSED (ancestry, unchanged) |
| P2 | pinned, Worktree = clone C | ACCEPTED | REFUSED sha-not-in-git, "is not a worktree of Artifact-repo:" |
| P3 | live, Worktree = B | REFUSED | REFUSED (freshness, unchanged) |
| P4 | live, Worktree = clone C | ACCEPTED | REFUSED sha-not-in-git, new guard |
| P5 | pinned, Worktree = `../C` | ACCEPTED | REFUSED sha-not-in-git, new guard |
| P6 | pinned, Worktree = `feat` (branch in B) | ACCEPTED | ACCEPTED (legitimate, unchanged) |
| Q1 | pinned, Worktree = B, X reachable from no ref in B | REFUSED | REFUSED (unchanged) |
| Q2 | pinned, Worktree = `main`, same X | REFUSED | REFUSED (unchanged) |
| Q3 | pinned, Worktree = clone C, same X | ACCEPTED | REFUSED sha-not-in-git, new guard |
| Q4 | live, Worktree = clone C, same X | ACCEPTED | REFUSED sha-not-in-git, new guard |

Every outcome matches r3's prediction. The new test covers the positive case, a linked worktree of B, which passes live mode.

## 3. Does the new test go red without the source fix? Yes.
- With the source at d2fb5cc, the new test run alone gives 1 test, 1 pass.
- With scripts/work-record.mjs replaced by the b426e8a version (test file kept at d2fb5cc), it gives 1 test, 0 pass, 1 fail: `not ok 1 - checkAcceptance: r3 - a Worktree: directory outside the Artifact-repo: repository refuses; its linked worktree passes`.
- I restored the file afterwards.

## 4. Full suite at d2fb5cc (`TMPDIR=/var/tmp node scripts/run-tests.mjs`)
tests 3148, pass 3143, fail 0, cancelled 0, skipped 5, todo 0. Leak check: 0 new temp entries.

## Regressions: none found
- The guard is gated on `artifactRepoRaw && worktreeIsDir`. Records without the field never enter it, and neither do branch-named Worktree: values (P6, Q2).
- `artifactCommonDir` is non-null wherever the guard can run, because the earlier refusal at `artifactCommonDir === null` sees to that. A non-git Worktree: directory therefore fails closed.
- The prior fixes F1-F5 and r2's test are untouched, and the suite is green.

## C4 fields
Cause: checkAcceptance ran freshness and ancestry inside whatever repository a Worktree: directory belonged to, and never tied that directory to Artifact-repo:'s git-common-dir. The fix at d2fb5cc adds that tie.
Discriminating check: probe2 Q3/Q4, where artifact X is reachable from no ref in B and Worktree: names clone C. Both were ACCEPTED at b426e8a and are REFUSED sha-not-in-git at d2fb5cc. The new test is red with the b426e8a source and green with the d2fb5cc source.
Fix location: scripts/work-record.mjs, checkAcceptance: the hoisted `artifactCommonDir` and the guard before `const worktreeGitDir`. Test in scripts/work-record.test.mjs, before the "Lane 60b review round 1" banner.
Simplification: one equality check that reuses `gitCommonDirReal` and the already-computed `artifactCommonDir`. It is gated on the field, adds no new helper, and leaves the no-field path unchanged.
