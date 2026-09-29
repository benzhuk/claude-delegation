VERDICT: NEEDS_FIXES af811810f4617ca07d3e0dca90ad8a775b0efb9b

# S1 seam review: lane 36 (lane-closeout), Opus

- Artifact: build/lane-closeout-1 at af811810f4617ca07d3e0dca90ad8a775b0efb9b.
- Diffs reviewed: the integration merge 0ff7f2b..103e636, and the seam fix 103e636..cfa1fc0.
- Finished 2026-09-28 20:47 EDT.
- Findings: 1, severity MEDIUM, in the test only. The production code is correct.
- Git status of the reviewed tree was identical before and after my runs. Every fixture and mutant went under `.../scratchpad/lane-closeout/S1-review/`, with TMPDIR pointed there.

## Bug-fix fields (C4)

Cause: lane 36's closeout and sweep-origin code (work-record.mjs, about lines 1830-2360) predates main's 7248ba5. Its 13 git child calls inherited GIT_DIR, GIT_WORK_TREE, GIT_COMMON_DIR and GIT_INDEX_FILE, so under a git hook the fetch, the probes and the origin-delete push could land on a different repo.
Discriminating check: in the new two-repo test, point GIT_DIR at repo B and remove the wrapper from one call site. The test must then fail. Measured: at cfa1fc0, 9 of the 13 single-site mutants fail it and 4 survive (F1). With the F1 patch, all 13 fail it.
Fix location: scripts/work-record.mjs lines 1835, 1852, 1863, 1867, 1870, 1873, 1875, 1936, 2182, 2195, 2243, 2339 and 2355 (the production fix is correct and complete), plus scripts/work-record-closeout.test.mjs:1667-1722 (the test, F1).
Simplification: the fix copies main's existing wrapper form, `env: withoutRepoLocatingGitEnv(process.env)`, verbatim. It adds no new helper and no second mechanism. The F1 patch changes only fixture setup and assertions in the one test.

## 1. Every git child call is wrapped: VERIFIED, no defect

- **scripts/work-record.mjs.** I grepped the whole file for `execImpl`, `spawnImpl`, `execFileSync`, `spawnSync`, `"git"` and `withoutRepoLocatingGitEnv`, and checked every hit's options object across lines.
  - There are 19 git call sites: 423/425, 662-665, 864/867, 1289/1292, 1318/1321, 1678, 1684, and the 13 seam-fix sites listed above.
  - All 19 pass `env: withoutRepoLocatingGitEnv(process.env)`.
  - The file makes no other child call.
  - resolveCommit passes the wrapper at 867. closeoutRecord reaches it at 2190.
  - closeRecord passes it at 1678 and 1684. closeoutRecord reaches it at 2167 and 2170.
- **Children that spawn git indirectly.** closeoutRecord and sweepOrigin reach git through janitor.mjs's `listWorktrees`, `closeoutWorktree` (which calls `applySafe`, `isTreeClean`, `refSha`, `git worktree remove` and `git branch -d`) and `isRemoteBranchMergedIntoOrigin` (work-record.mjs:1943).
  - All of these use janitor's `git()` helper at janitor.mjs:165-166, which is wrapped.
  - janitor.mjs has only two other child calls. `fetchOrigin` at 196-201 spreads the wrapper and then adds prompt suppression. `du` at 579 is not git.
  - `removeScratchDirectory` spawns nothing; it uses fs only.
- **hooks/delete-guard.mjs** has no child calls at all. It is pure string analysis.
- **Other lane-changed code.** The agents/*.md and codex/agents/*.toml files are one sentence each, and skills/janitor/SKILL.md is prose. None of them runs git.

## 2. The two-repo test is real for the push, but its B-side proof is vacuous: see F1

- **Push mutant, reproduced.**
  - I ran `git archive --format=tar -o .../S1-review/af81181.tar af81181`, then untarred it into `mut-push/` as a separate command.
  - I removed only the wrapper from line 1835.
  - Result: `ℹ pass 0 ℹ fail 1`, with `AssertionError: sweepOrigin must have deleted build/gitdir-leak-sweep-1 on A's own origin`.
  - The unmutated extract passes 1/1. The builder's claim holds.
- **Per-site sweep (my addition).** I removed the wrapper from each of the 13 sites, one at a time, on another extract. Four mutants survive the shipped test:

| Site | Call | Shipped test |
|---|---|---|
| 1835 push, 1852 show-ref, 1863 rev-list, 1867/1870 rev-parse, 1873 merge-base p2, 1936 merge-base, 2195 merge-base, 2355 for-each-ref | | killed |
| 1875 | `merge-base --is-ancestor <tip> <p1>` | **survives** |
| 2182 | closeoutRecord `fetch --prune origin` | **survives** |
| 2243 | closeoutRecord `ls-remote --exit-code` | **survives** |
| 2339 | sweepOrigin `fetch --prune origin` | **survives** |

- **The B-origin assertion can never fail.**
  - B's origin has no branch named like A's branches, so a leaked lease push is always rejected.
  - Even a lease-less leaked delete (`push origin :ref`) fails, because the remote ref does not exist.
  - I probed this: I dropped both the lease and the wrapper on line 1835 and moved `assert.equal(<B origin for-each-ref>, beforeB)` ahead of the A assertions. The probe still passed; only a later A-side assertion failed.
  - So "B's origin refs are identical" is true, but it proves nothing. The addendum's intent, "a leak is provable as B's origin ref set changed", is not met.

## 3. Three-way merge check: VERIFIED, no defect

- **Main's hunks landed intact.** For each of scripts/work-record.mjs, scripts/janitor.mjs and scripts/work-record.test.mjs, I compared the sorted +/- lines of main's own diff (7b00418..f7df941) with the merge's first-parent diff (0ff7f2b..103e636). The md5 sums are identical, so every one of main's hunks landed verbatim and none was dropped or split.
  - work-record.mjs: `8170d501...`
  - janitor.mjs: `af13ba61...`
  - work-record.test.mjs: `060f3670...`
- **No lane function main changed.** The lane's hunks sit in the header and field tables, validateRecord at old line 396 (scratch check), checkAcceptance at old lines 1086 and 1272 (none of them git calls), and new code after closeRecord and in the CLI.
- **The lane's new code reuses main-wrapped functions** (`resolveCommit`, `closeRecord`, janitor `git()`) rather than bypassing them.
- **Circular import.** work-record.mjs imports janitor.mjs, which imports work-record.mjs and transport.mjs. Both modules use each other's bindings only at call time, and the suites below load cleanly.

## 4. Other main changes since 7b00418 on the delete paths and delete-guard: VERIFIED, no defect

- **Codex delete-guard wiring.** main's b726ff9 and f4e0714 wire `hooks/delete-guard.mjs` as the Codex PreToolUse Bash hook (hooks/codex-hooks.json:8).
  - The lane changed only the guard's analysis: the SAFE_CMD_RE anchoring and the heredoc whitelist. It did not change input parsing or the output shape.
  - A Codex-shaped command that does not match the whitelist's line 1 (for example a `bash -lc` wrapper, or CRLF) fails closed, meaning it is checked in full as at base.
  - scripts/native-package.test.mjs passes 3/3 and hooks/codex-unsupported.test.mjs passes 8/8 on the merged guard.
- **Sealed fixture environment.** main's 0258858 makes `childEnv` and test-home strip GIT_DIR, GIT_WORK_TREE, GIT_COMMON_DIR and GIT_INDEX_FILE.
  - The lane's work-record-closeout.test.mjs fixtures all go through `fixtureEnv()`, which calls `childEnv`. Every `git(args, cwd, env)` call in that file passes an env; no two-argument call exists.
  - record-closed-and-skip.contract.test.mjs is the same.
- **Unaffected main changes.** Per-run temp root and leak check (e99955b, 3ff71ef): every suite below reports `leak check: 0 new temp entries`. `mainCheckout` bare-suffix fix (e044075): not used by the lane.
- **Non-blocking note, main-side residue, not counted.**
  - scripts/janitor.test.mjs:39-41, `git(args, cwd)`, passes no env. It is byte-identical on main at f7df941, so main's 42c3a20 missed it; the lane did not introduce it.
  - The lane added 13 new `git([...])` calls through it (the closeoutWorktree tests).
  - Under run-tests.mjs, test-home strips the locating vars, so it is safe there. A standalone `node --test scripts/janitor.test.mjs` under a poisoned GIT_DIR would build its fixtures in the wrong repo.
  - Route this to main's repo-env owner. If it is fixed here instead, the fix is `env: withoutRepoLocatingGitEnv(process.env)` in that helper; check it against hooks.test.mjs's inherit-environment rule first.

## 5. Territory tests

Each suite ran under `timeout 600`, one at a time, via `node scripts/run-tests.mjs <file>` from the worktree at af81181, with TMPDIR set to the scratch folder.

| Suite | tests | pass | fail | skipped |
|---|---|---|---|---|
| scripts/work-record.test.mjs | 245 | 245 | 0 | 0 |
| scripts/work-record-closeout.test.mjs | 68 | 68 | 0 | 0 |
| scripts/janitor.test.mjs | 95 | 93 | 0 | 2 |
| scripts/record-closed-and-skip.contract.test.mjs | 6 | 6 | 0 | 0 |
| hooks/delete-guard.test.mjs | 206 | 206 | 0 | 0 |
| scripts/native-package.test.mjs | 3 | 3 | 0 | 0 |
| hooks/codex-unsupported.test.mjs | 8 | 8 | 0 | 0 |
| agents/agents.test.mjs | 25 | 25 | 0 | 0 |

The first four suites total 414 tests: 412 pass, 0 fail, 2 skipped. That matches S1-gate.log. The GOALS.md STALE test in work-record.test.mjs passes. I did not run the full suite; the brief did not ask for it.

## Findings

### F1: MEDIUM. The GIT_DIR regression test leaves 4 of the 13 wrapped sites unguarded, and its B-side assertion is vacuous

- **Where:** scripts/work-record-closeout.test.mjs:1667-1722, the test "sweepOrigin and closeoutRecord never let an inherited GIT_DIR redirect their git calls at a different repo".
- **Measured evidence:** see §2.
  - Wrapper-removal mutants survive at work-record.mjs:1875, 2182, 2243 and 2339.
  - The `afterB === beforeB` assertion (line 1721) passes even under a leaked, lease-less delete.
- **Why it matters:** the two `fetch --prune origin` calls are the ones that write to, and prune refs in, whatever repo GIT_DIR names. As shipped, a future edit could drop their wrapper and CI would stay green.
- **Why the mutants survive:**
  - The `git push` fixture calls already update A's tracking refs, so the fetches are redundant in the fixture.
  - The ls-remote path is never reached.
  - The fixture has no fast-forwarded branch, so reachP1 is never discriminating.
  - B holds no same-named ref, so no leaked delete can ever touch it.

**Patch.** Keep the explanatory comment at 1658-1666. Replace the entire block from line 1667 (`test("sweepOrigin and closeoutRecord never let an inherited GIT_DIR ...`) through line 1722 (its closing `});`, just before the blank line and `after(() => {`) with the block below.

A verified copy is at `/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/S1-review/new-test.txt`.

Summary of the changes:
- Add a fast-forwarded branch. It kills the 1875 mutant.
- Drop A's tracking refs before each call, so only a real fetch of A's origin can restore them. This kills the 2339 and 2182 mutants.
- Re-run closeoutRecord to reach the ls-remote absence path. This kills the 2243 mutant.
- Give B's origin same-named branches and drop B's tracking refs. This makes the B-origin assertion live and adds a B-local-refs assertion.

```js
test("sweepOrigin and closeoutRecord never let an inherited GIT_DIR redirect their git calls at a different repo", () => {
  const envA = fixtureEnv();
  const { repo: repoA } = buildRepo(envA);
  const dropTracking = (repo, env, b) => git(["update-ref", "-d", `refs/remotes/origin/${b}`], repo, env);
  // A fast-forwarded branch: its tip sits on main's first parent under every later merge, so
  // tipBehindMergeCommit must keep it - a leaked `merge-base <tip> <p1>` would call it deletable.
  const ffBranch = "build/gitdir-leak-ff-1";
  cutBranch(repoA, envA, ffBranch);
  git(["merge", "--ff-only", "-q", ffBranch], repoA, envA);
  // A deletable branch for sweepOrigin: merged via --no-ff, safe by every evaluateOriginBranch check.
  const sweepBranch = "build/gitdir-leak-sweep-1";
  const { tip: sweepTip } = cutBranch(repoA, envA, sweepBranch);
  mergeNoFF(repoA, envA, sweepBranch);
  // A second, closeoutRecord-owned branch, with its own worktree and closed record.
  const closeBranch = "build/gitdir-leak-close-1";
  const { wt: closeWt, tip: closeTip } = cutBranch(repoA, envA, closeBranch);
  mergeNoFF(repoA, envA, closeBranch);
  pushMain(repoA, envA);
  for (const b of [ffBranch, sweepBranch, closeBranch]) pushBranch(repoA, envA, b);
  // Only a fetch of A's OWN origin can bring these tracking refs back; a fetch leaked to B leaves
  // them missing, and both verdicts below turn into keep/refused.
  dropTracking(repoA, envA, sweepBranch);
  dropTracking(repoA, envA, closeBranch);
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repoA, {
    work: "wr-2026-09-28-gitdir-leak-close", worktree: closeBranch, artifact: `${closeBranch}@${closeTip}`, leadSession: by, scratch: scratchPath,
  });

  // Repo B, with its own bare origin carrying SAME-NAMED branches at different tips: a leaked
  // ls-remote sees them present, and a leaked delete that ever lost its lease would remove them.
  // B's own tracking refs are all dropped: a leaked for-each-ref then lists nothing, and a fetch
  // leaked into B recreates them.
  const envB = fixtureEnv();
  const { repo: repoB, origin: originB } = buildRepo(envB);
  const branchB = "build/gitdir-leak-b-1";
  for (const b of [sweepBranch, closeBranch, branchB]) {
    cutBranch(repoB, envB, b, { worktree: false });
    pushBranch(repoB, envB, b);
    dropTracking(repoB, envB, b);
  }
  const beforeOriginB = git(["for-each-ref"], originB, envB);
  const beforeRepoB = git(["for-each-ref"], repoB, envB);

  const hadGitDir = Object.prototype.hasOwnProperty.call(process.env, "GIT_DIR");
  const prevGitDir = process.env.GIT_DIR;
  let sweepResult;
  let closeResult;
  let rerunResult;
  try {
    process.env.GIT_DIR = path.join(repoB, ".git");
    sweepResult = sweepOrigin({ repoRoot: repoA, apply: true, exclude: closeBranch });
    // sweepOrigin's own fetch just restored this tracking ref: drop it again, so closeoutRecord's
    // fetch is the only thing that can bring it back.
    dropTracking(repoA, envA, closeBranch);
    closeResult = closeoutRecord({ repoRoot: repoA, recordPath: recordRel, closeoutBy: by });
    // Re-run: the branch is gone from A's origin, so this one goes through the ls-remote check.
    rerunResult = closeoutRecord({ repoRoot: repoA, recordPath: recordRel, closeoutBy: by });
  } finally {
    if (hadGitDir) process.env.GIT_DIR = prevGitDir;
    else delete process.env.GIT_DIR;
  }

  // Repo A's own effect: both branches actually left A's origin; the fast-forwarded one stayed.
  assert.ok(sweepResult.applied.some((a) => a.name === sweepBranch && a.tip === sweepTip && a.ok === true), `sweepOrigin must have deleted ${sweepBranch} on A's own origin`);
  assert.equal(git(["ls-remote", "--heads", "origin", sweepBranch], repoA, envA).trim(), "");
  assert.notEqual(git(["ls-remote", "--heads", "origin", ffBranch], repoA, envA).trim(), "", `${ffBranch} was fast-forwarded and must be kept`);
  const closeSteps = stepsOf(closeResult);
  assert.equal(closeSteps["origin-branch"].result, "removed");
  assert.equal(closeSteps["origin-branch"].sha, closeTip);
  assert.equal(git(["ls-remote", "--heads", "origin", closeBranch], repoA, envA).trim(), "");
  assert.equal(fs.existsSync(closeWt), false);
  assert.equal(stepsOf(rerunResult)["origin-branch"].result, "absent");

  // Repo B's proof: neither its bare origin nor its own refs moved, even though GIT_DIR pointed
  // straight at it throughout.
  assert.equal(git(["for-each-ref"], originB, envB), beforeOriginB, "repo B's origin refs must be untouched");
  assert.equal(git(["for-each-ref"], repoB, envB), beforeRepoB, "repo B's own refs must be untouched (no leaked fetch)");
});
```

**Predicted outcome: already measured.** I spliced the block into a scratch extract (`S1-review/strong/`) and ran it there:
- Unmutated work-record.mjs: the test passes 1/1, and the whole closeout file passes 68/68.
- Each of the 13 single-site wrapper-removal mutants (1835, 1852, 1863, 1867, 1870, 1873, 1875, 1936, 2182, 2195, 2243, 2339, 2355) fails it, 13/13 killed.
- A lease-less leaked push (wrapper and `--force-with-lease` both removed at 1835) now visibly deletes B's `refs/heads/build/gitdir-leak-close-1`, so the B-origin assertion is live, confirmed with a probe.
- I restored every scratch file after each mutant.
- Test count does not change: it stays 68.

One thing this patch does not cover: `git worktree add` output such as "Preparing worktree" appears on stderr in the fixture. That is cosmetic and pre-existing.
