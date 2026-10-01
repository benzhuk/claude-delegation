VERDICT: APPROVE 5bc082a6e50f4073e9f500abd39c233b466021ae

# S1 seam delta review r2: lane 36 (lane-closeout), Opus

- Artifact: build/lane-closeout-1 at 5bc082a6e50f4073e9f500abd39c233b466021ae.
- Scope: a delta check of F1 from reports/S1-review.md. This is not a fresh review.
- Finished 2026-09-28 20:51 EDT.
- Findings: 0. The prior F1 is fixed.

## Bug-fix fields (C4)

Cause: the r1 regression test left 4 of the 13 wrapped git call sites unguarded: work-record.mjs:1875, 2182, 2243 and 2339. Its repo-B origin assertion could never fail, because B held no same-named ref and A's tracking refs made the fetches redundant.
Discriminating check: remove `env: withoutRepoLocatingGitEnv(...)` from each of the 13 call sites, one at a time, and run the test with GIT_DIR pointed at repo B. At 5bc082a all 13 mutants fail the test, and the unmutated code passes it.
Fix location: scripts/work-record-closeout.test.mjs, test "sweepOrigin and closeoutRecord never let an inherited GIT_DIR redirect their git calls at a different repo" (commit 5bc082a, 35+/13-).
Simplification: the change is test-only, inside the one existing test. It adds no new helper file, no production change and no new test.

## Delta scope

- `git diff --stat af81181 5bc082a -- scripts hooks skills agents codex` shows exactly one file: `scripts/work-record-closeout.test.mjs | 48 +++++-----` (35+/13-).
- Everything else in af81181..5bc082a is docs: 42eba17, 9090a2a, and the docs and log files in 5bc082a's range.
- `scripts/work-record.mjs` at 5bc082a is byte-identical (`cmp`) to af81181's. The production code I approved in r1 §1 and §3-4 is unchanged.

## 1. Inserted block is identical to new-test.txt: CONFIRMED

- `git show 5bc082a:scripts/work-record-closeout.test.mjs` is byte-identical (`cmp`) to my own r1 scratch splice at `S1-review/strong/scripts/work-record-closeout.test.mjs`.
- The block from `S1-review/new-test.txt` occurs in it exactly once, verbatim (a Python `str.count(block) == 1` check).

## 2. Mutants re-run on a fresh extract: all 13 killed

- **Extract.** I ran `git archive --format=tar -o .../S1-review/5bc082a.tar 5bc082a6e5...`, then untarred it, as separate commands, into `r2-base/` (unmutated) and `r2-mut/` (mutated one site at a time, restored from `r2-base/` after each run).
- **Unmutated extract.** The target test passes 1/1. The whole closeout file (`node --test`) passes 68/68.
- **Mutants.** Removing the wrapper at each site gives these results against the target test:

| Line | Call | Result |
|---|---|---|
| 1835 | push `--force-with-lease` (origin delete) | killed: "sweepOrigin must have deleted ..." |
| 1852 | show-ref | killed |
| 1863 | rev-list `--first-parent --merges` | killed |
| 1867, 1870 | rev-parse `^2`, `^1` | killed |
| 1873 | merge-base p2 | killed |
| **1875** | **merge-base p1** | **killed: "build/gitdir-leak-ff-1 was fast-forwarded and must be kept"** |
| 1936 | merge-base tip vs origin/main | killed |
| **2182** | **closeoutRecord `fetch --prune`** | **killed (strictEqual on the origin-branch step)** |
| 2195 | merge-base artifact | killed |
| **2243** | **closeoutRecord `ls-remote`** | **killed (strictEqual on the re-run's `absent`)** |
| **2339** | **sweepOrigin `fetch --prune`** | **killed: "sweepOrigin must have deleted ..."** |
| 2355 | for-each-ref | killed |

- In the shipped r1 test, the four bold sites were the survivors. All four are now killed.
- I restored the mutant copy after the loop and confirmed it with `cmp`.

## 3. Territory run in the worktree at 5bc082a

- `TMPDIR=<scratch> timeout 600 node scripts/run-tests.mjs scripts/work-record-closeout.test.mjs` gives 68 tests: 68 pass, 0 fail, 0 skipped, and `leak check: 0 new temp entries`.
- `git status --porcelain` of the worktree was identical before and after the run.
- The builder reports a full suite of 2907 tests, 2902 pass, 0 fail, 5 skipped. I did not re-run the full suite. This test-only delta cannot affect other files, and the brief asked for a delta confirm.

## Regressions hunted

- **Test length.** The test count is still 68, and the extra fixture branches and re-run add about 150 ms to this one test (roughly 600 ms in total).
- **Isolation of the new fixture calls.** The `dropTracking` calls inside the `try` use `envA`. `envA` was built by `childEnv` before GIT_DIR was set, and `childEnv` strips it, so they cannot leak into B.
- **GIT_DIR restore.** GIT_DIR is still restored in `finally`, exactly as before.

## Findings

None. The r1 non-blocking note about the main-side residue in `scripts/janitor.test.mjs:39-41` still stands for main's owner. It does not affect this lane.
