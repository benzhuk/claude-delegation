VERDICT: NEEDS_FIXES dd99ae1f67a88bfc06163fad27f4591762d33b4d

# C1 review, round 4 (lane 36, lane-closeout): delta 0fcd686..dd99ae1

Reviewer: Opus, high tier, delta review. It covers R3-1 to R3-7, the lead's idempotent-closeout ruling, and a regression hunt on the new `absent` paths.

Artifact: wt/lane-closeout-1-C1 at dd99ae1f67a88bfc06163fad27f4591762d33b4d, in /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1. I left it untouched: when I finished, `git status --short` was empty and HEAD was dd99ae1.

## Summary

- **R3-1 is closed.** The scratch step's fail-closed `git worktree list` refusal is now held by a test. Both mutant forms are killed on a scratch copy.
- **R3-2 and R3-4 to R3-7 are applied as written.**
- **R3-3 is not applied as the lead ruled.** Both R2-2 shim tests are now skipped on win32. The addendum says "Do not skip them on win32" (R4-1).
- **The idempotent ruling holds for bare-name `Worktree:` values.** A second closeout exits 0, with every step `absent`.
- **For path-form `Worktree:` values it has two holes (R4-2):**
  - A stale path whose branch is still live in a registered worktree elsewhere now passes silently: exit 0, `worktree: absent`. Before this round it was refused. This is the "real refusal turned into a silent pass" the lead asked about.
  - A path-form value whose local branch survived reports `branch: absent` and leaves the branch in place.
- **The new dry-run guard is held by no test (R4-3).**
- **Three minor findings:** a win32 twin of R2-10 (R4-4), an origin `absent` that trusts a missing tracking ref (R4-5), and a stale doc (R4-6). Plus one nit (R4-7).
- **No wrong delete found on any new path.** Every origin rule still applies to a branch that is absent locally but present on origin (C7a-c).

## Method

- **Scratch location:** everything is under `.../scratchpad/lane-closeout/C1-review-r4/`. Every fixture is fresh and has a local bare origin. The real origin was never touched.
- **Copies (all by `git archive dd99ae1`):**
  - `mut/`: the mutation copy. `mutate.mjs` makes one exact-match edit, runs `work-record-closeout.test.mjs` and `janitor.test.mjs` with the TAP reporter, then writes the original bytes back. Afterwards `cmp` shows `mut/scripts/{work-record,janitor}.mjs` byte-equal to the artifact.
  - `fixsim/`: the proposed patches, applied and simulated.
  - `t4/`: the proposed tests, run against the unpatched code, the patched code and the mutant.
- **Probe:** `probe.mjs`, with results in `probe.out`. It contains no shell or git deletion command. States like "branch exists, never checked out" and "branch only on origin" are built with `commit-tree`, `update-ref` (no `-d`) and `push <sha>:refs/heads/<b>`. The only deletes are the ones `closeoutRecord` itself makes on the fixtures.
- **Commands denied:** none.

## Territory tests and counts

- Territory run (in the worktree): `node --test scripts/work-record.test.mjs scripts/work-record-closeout.test.mjs scripts/janitor.test.mjs scripts/record-closed-and-skip.contract.test.mjs`.
  - Result: **406 tests, 403 pass, 1 fail, 2 skipped.**
  - The one failure is the pre-existing `docs/GOALS.md ... STALE regexes` test.
  - The two skips are janitor.test's pre-existing platform skips.
  - This matches the builder's numbers. Log: `C1-review-r4/territory.log`.
- Full gate: `reports/C1-r4-gate.log:2927-2932` shows 2684 tests, 2678 pass, 1 fail (STALE), 5 skipped. That matches the builder's report. I did not re-run it.

## Task 1: R3-1 mutation proof (scratch copy)

| Mutant (work-record.mjs, scratch step) | Result | Test that caught it |
|---|---|---|
| `const worktrees = listWorktrees(root) ?? [];` (fail-open) | KILLED | `closeoutRecord: R2-2 - a failed git worktree list refuses the origin-branch step ...` |
| the three-line `if (worktrees === null) { return ... refused ... }` removed | KILLED | the same test |

Results: 156 tests, 153 pass, 1 fail, 2 skipped, for each mutant. The five assertions round 3 asked for are present, verbatim, at work-record-closeout.test.mjs:1205-1209. The "kills mutant M-c" comment is corrected at :1173-1176.

A small inaccuracy in the builder's report: it says `listWorktrees` "throws on a failed git worktree list". It returns `null` (janitor.mjs:282-288). The proof itself is sound.

## Task 2: R3-2 to R3-7

| Item | Status | Evidence |
|---|---|---|
| R3-2 | APPLIED | janitor.mjs:1276 returns `branch: refused (worktree-unresolved (not checked))`. Reverting it fails 2 tests. |
| R3-3 | **NOT AS RULED** | See R4-1. The R2-10 half is correct: on win32 it synthesizes `/tmp/<by>/r210-lane` and drives it through `platform: "win32"`. |
| R3-4 | APPLIED | A closed record with a matching basename was added. Mutant M15 (closed/withdrawn filter removed) is now **KILLED**. It survived in round 3. |
| R3-5 | APPLIED | work-record.mjs:2285-2286 returns `{ lines, exitCode: 2 }` and no longer throws. Reverting to `throw` fails the R2-9 test. |
| R3-6 | APPLIED | docs/work-record.md:373-375 and skills/janitor/SKILL.md:50-51 are as given. A twin at docs/work-record.md:300 remains (R4-6). |
| R3-7 | APPLIED | work-record.mjs:2244 and :2374. No test covers it; that is acceptable for a nit. The new code has a twin (R4-7). |

## Task 3: the idempotent ruling on fixtures

Probe results. `C1-review-r4/probe.out` has the full lines.

| Case | Result | Ruling |
|---|---|---|
| C1: bare-name `Worktree:`. Run 1, run 2, then a dry run 3. | run 1 exit 0, all `removed`. Run 2 exit 0, `worktree: absent \| branch: absent \| origin-branch: absent \| scratch: absent`. Dry run 3 exit 0, all `would absent`. | as ruled |
| C2: path-form `Worktree:` of a real worktree, run twice | run 2 exit 0, every step `absent` | as ruled |
| C3: path exists on disk but is not a registered worktree | exit 2, `worktree: refused (worktree-unresolved)`, `branch: refused (worktree-unresolved (not checked))`; directory and branch intact | as ruled |
| Foreign `C:/...` value on Linux | refused worktree-unresolved, exit 2 (the builder's tests; the mutant is killed) | as ruled |
| C6: bare name, directory gone, the local branch has an unmerged commit | `worktree: absent`, `branch: refused ... not fully merged`, exit 2; branch intact | real refusal kept |
| C11: bare name, branch survives, `--dry-run` | refs and record byte-identical before and after; scratch intact | correct, but untested (R4-3) |
| **C4: path-form `Worktree:` gone, the record's local branch survives** | exit 0, `worktree: absent \| branch: absent`, yet `local branch still exists: true`, on both runs | **violates ruling case 2 (R4-2)** |
| **C5: path-form `Worktree:` gone, a live registered worktree elsewhere holds the record's branch** | exit 0, `worktree: absent \| branch: absent`, a closeout Log line written; the live worktree and its branch still exist | **violates ruling case 1 ("no registered worktree holds its branch"). Before round 4 this was exit 2 (R4-2).** |
| C13: bare name `build/c13-1` where `<repo>/build/c13-1` exists as an ordinary directory | exit 2, worktree-unresolved | a wrong refusal only (O4) |

## Task 4: regression hunt, origin-branch `absent`

`absent` is taken only when `verdict.reason === "not found on origin"`. That reason is returned only when `refs/remotes/origin/<name>` is missing after `fetch --prune`. Every other keep-reason stays `refused`. Branches that are absent locally but present on origin, built with no local branch at all:

| Case | Result |
|---|---|
| C7a: fast-forward merged, tip = origin/main | `refused (tip equals origin/main's current sha)`, exit 2; origin keeps it |
| C7b: origin tip moved past the merged artifact | `refused (tip is not an ancestor of origin/main)`, exit 2 |
| C7c: named by another open record as `origin/build/...` | `refused (named by wr-c7c-other (Status: owned) ...)`, exit 2 |
| C7d: control, merged through a merge commit | run 1 `removed` with a restore line; run 2 `absent`, exit 0 |
| **C9: a non-default fetch refspec (`+refs/heads/main:refs/remotes/origin/main`), the branch merged on origin** | `origin-branch: absent`, exit 0, and **`origin still has true`**. Before round 4 this was `refused (not found on origin)`, exit 2 (R4-5). |

So a branch that is absent locally but present on origin goes through every origin rule. The one gap is C9, where the tracking ref is never created at all.

## Findings

### R4-1. MAJOR (it breaks a binding ruling): the two R2-2 shim tests are skipped on win32, which the lead ruled out; R3-1's guard is then untested on the second-host gate

- **Where:**
  - work-record-closeout.test.mjs:1177, `sweepOrigin: R2-2 ...`;
  - work-record-closeout.test.mjs:1194, `closeoutRecord: R2-2 ...`, which now holds R3-1.
  - Both carry `{ skip: process.platform === "win32" ? "PATH-shim git wrapper needs a POSIX shell" : false }`.
- **Why it matters:** addendum-C1-r4.md, R3-2 to R3-7: "The two tests that fail on Windows are required, not optional: the Windows suite is this lane's second-host gate. Make them platform-correct. Do not skip them on win32."
  - The builder applied round 3's suggested skip. The lead had overruled it.
  - The builder's report also calls it a replacement for "being unconditionally skipped", which it never was.
  - On the Windows host, no test holds the scratch step's `listWorktrees === null` refusal (the R3-1 blocker), nor the two origin-branch null guards.
- **Why no mechanical fix exists:** `withFailingWorktreeList` (work-record-closeout.test.mjs:155-172) cannot run on Windows:
  - `which git` does not exist there;
  - a `#!/bin/sh` shim will not run;
  - Node's `execFileSync("git")` does not resolve `git.cmd` on PATH (libuv tries only `.com` and `.exe`).
- **Fix (a judgment call for the lead):** add a test seam and drop the PATH shim.
  - Add an optional `opts.listWorktreesImpl` to `closeoutRecord` and `sweepOrigin`, defaulting to janitor's `listWorktrees`.
  - Thread it into `buildWorktreesByPath(root, impl)`, `removeScratchDirectory({ ..., listWorktreesImpl })` and `closeoutWorktree({ ..., listWorktreesImpl })`.
  - In both tests, pass `listWorktreesImpl: () => null` instead of `withFailingWorktreeList`, and remove the `skip`.
  - Predicted: both tests run and pass on Linux and on win32, and M3 stays killed on both hosts.
- **Alternative:** if the lead would rather not add a seam in round 5, the lead must re-rule and allow the skip. The builder cannot decide that.

### R4-2. MAJOR (ruling non-compliance, a silent pass): for a path-form `Worktree:`, the new `absent` path checks the wrong branch name

- **Where:**
  - janitor.mjs:1249 (`branchField` is derived from the raw `Worktree:` text);
  - janitor.mjs:1258-1273 (the new absent / branch-survives block);
  - work-record.mjs:2213 (`closeoutWorktree` is never given the record's derived branch).
- **Cause:** for a path-form value, `branchField` is the path string itself, such as `/home/.../lane-x-1`. Two consequences:
  - `worktrees.find((w) => w.branch === branchField)` can never match;
  - `refSha(root, "refs/heads//home/...")` is always null.
- **What goes wrong:** the ruling's condition, "no registered worktree holds its branch", is never checked for the record's real branch. `closeoutRecord` already derives that branch before step 3 (`ownBranchName`, from `Artifact:`, work-record.mjs:2208), but never passes it on.
  - **C5 (silent pass):** a stale path `Worktree:`, with a live worktree at another path holding `build/c5-1`, gives exit 0 and `worktree: absent \| branch: absent`. The Log line records a completed closeout. The live worktree stays and is no longer tracked by anything. At base 0fcd686, janitor.mjs:1249 refused this with exit 2.
  - **C4 (false absent):** a path `Worktree:` that is gone, with the local branch `build/c4-1` surviving and merged, reports `branch: absent`. The branch is never removed, on any re-run. Ruling case 2 says to go on to the branch step.
- **Fix (mechanical; it also carries R4-4 and R4-7).**

  janitor.mjs:1222:
  ```js
  // old
  export function closeoutWorktree({ root, worktreeField, mainBranch = "main", cwd = process.cwd(), dryRun = false }) {
  // new
  export function closeoutWorktree({ root, worktreeField, branchName = null, mainBranch = "main", cwd = process.cwd(), dryRun = false }) {
  ```

  janitor.mjs:1256-1259:
  ```js
  // old
      const isForeignPath = (path.posix.isAbsolute(String(worktreeField)) || path.win32.isAbsolute(String(worktreeField)))
        && !path.isAbsolute(String(worktreeField));
      if (!isForeignPath && !existsSync(target)) {
        const branchSha = branchField ? refSha(root, `refs/heads/${branchField}`) : null;
  // new
      const wf = String(worktreeField);
      const hostAbsolute = process.platform === "win32" ? /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/])/.test(wf) : path.posix.isAbsolute(wf);
      const isForeignPath = (path.posix.isAbsolute(wf) || path.win32.isAbsolute(wf)) && !hostAbsolute;
      if (!isForeignPath && !existsSync(target)) {
        // A path-form Worktree: names no branch itself: use the one closeoutRecord derived from
        // Artifact:. A registered worktree still holding it means the value is stale, not absent.
        const ownBranch = hostAbsolute ? (branchName || null) : branchField;
        if (ownBranch && worktrees.some((w) => w.branch === ownBranch)) {
          return { steps: [{ step: "worktree", result: "refused", detail: "worktree-unresolved" }, { step: "branch", result: "refused", detail: "worktree-unresolved (not checked)" }] };
        }
        const branchSha = ownBranch ? refSha(root, `refs/heads/${ownBranch}`) : null;
  ```

  janitor.mjs:1266-1272. Replace every `branchField` in the three `return` rows and in the `git(["branch", "-d", "--", branchField], root)` call with `ownBranch`, and change the catch detail:
  ```js
  // old
          return { steps: [{ step: "worktree", result: "absent" }, { step: "branch", ref: branchField, result: "refused", detail: String(err.message || err) }] };
  // new
          return { steps: [{ step: "worktree", result: "absent" }, { step: "branch", ref: ownBranch, result: "refused", detail: String(err.message || err).replace(/\s+/g, " ").trim() }] };
  ```

  work-record.mjs:2213:
  ```js
  // old
        root: repoRoot, worktreeField: record.fields.worktree, mainBranch, cwd: process.cwd(), dryRun,
  // new
        root: repoRoot, worktreeField: record.fields.worktree, branchName: ownBranchName, mainBranch, cwd: process.cwd(), dryRun,
  ```

- **Tests to add** to work-record-closeout.test.mjs, before `after(`. Verified in `t4/`: both fail on dd99ae1 and pass with the patch.
  ```js
  test("closeoutRecord: idempotent - a path-form Worktree: that no longer exists, while a registered worktree elsewhere still holds the record's branch, stays refused worktree-unresolved (exit 2)", () => {
    const env = fixtureEnv();
    const { repo } = buildRepo(env);
    const branch = "build/idem-stale-1";
    const { wt, tip } = cutBranch(repo, env, branch);
    mergeNoFF(repo, env, branch);
    pushMain(repo, env);
    pushBranch(repo, env, branch);
    const { scratchPath, by } = mkScratchFixture();
    const stale = path.join(path.dirname(wt), `moved-away-${by}`, "idem-stale-1");
    const recordRel = writeClosedRecord(repo, {
      work: "wr-2026-09-27-idem-stale", worktree: stale, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
    });
    const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
    const steps = stepsOf(result);
    assert.equal(steps.worktree.result, "refused");
    assert.equal(steps.worktree.detail, "worktree-unresolved");
    assert.equal(result.exitCode, 2);
    assert.equal(fs.existsSync(wt), true, "the live worktree holding the record's branch must survive");
  });

  test("closeoutRecord: idempotent - a path-form Worktree: that no longer exists, with the record's own local branch surviving, goes on to remove that branch with -d", () => {
    const env = fixtureEnv();
    const { repo } = buildRepo(env);
    const branch = "build/idem-pathbranch-1";
    git(["branch", branch], repo, env);
    const tree = git(["rev-parse", `${branch}^{tree}`], repo, env).trim();
    const tip = git(["commit-tree", tree, "-p", branch, "-m", `work on ${branch}`], repo, env).trim();
    git(["update-ref", `refs/heads/${branch}`, tip], repo, env);
    mergeNoFF(repo, env, branch);
    pushMain(repo, env);
    pushBranch(repo, env, branch);
    const { scratchPath, by } = mkScratchFixture();
    const gone = path.join(os.tmpdir(), `never-existed-${by}`, "idem-pathbranch-1");
    const recordRel = writeClosedRecord(repo, {
      work: "wr-2026-09-27-idem-pathbranch", worktree: gone, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
    });
    const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
    const steps = stepsOf(result);
    assert.equal(steps.worktree.result, "absent");
    assert.equal(steps.branch.result, "removed");
    assert.equal(steps.branch.ref, branch);
    assert.equal(git(["branch", "--list", branch], repo, env).trim(), "", "the record's local branch must actually be gone");
    assert.equal(result.exitCode, 0);
  });
  ```
- **Predicted, verified on `fixsim/`:**
  - C5 gives exit 2, `worktree: refused (worktree-unresolved)`, and the live worktree survives.
  - C4 gives `branch: removed build/c4-1`, the branch is gone, and run 2 has every step `absent` with exit 0.
  - C1, C2, C6 and C11 are unchanged.
  - The territory suite gives 406/403/1 (STALE)/2 before the new tests are added.

### R4-3. MINOR (a delete guard held by no test, the same class as R3-1): the dry-run early return in the new branch-survives path

- **Where:** janitor.mjs:1266-1268. `if (dryRun) { return ... }` sits in front of the live `git branch -d`.
- **Repro (scratch copy):** remove those three lines. `closeoutWorktree` and `closeoutRecord` then delete the local branch on `--dry-run`. Result: 156 tests, 154 pass, 0 fail. **Mutant SURVIVED.** On the unmutated artifact the behavior is correct (C11: refs and record byte-identical).
- **Why only minor:** `-d` only removes a merged branch. But the brief says "`--dry-run` must change nothing".
- **Fix (mechanical).** Add to janitor.test.mjs before `after(`. Verified in `t4/`: it passes on the patched code and fails with the guard removed.
  ```js
  test("closeoutWorktree: idempotent - --dry-run on a gone directory whose local branch survives deletes nothing", () => {
    const root = initRepo();
    writeProjectConfig(root);
    git(["branch", "idem-dry-1"], root);
    const result = closeoutWorktree({ root, worktreeField: "idem-dry-1", cwd: root, dryRun: true });
    assert.deepEqual(result.steps, [
      { step: "worktree", result: "absent" },
      { step: "branch", ref: "idem-dry-1", result: "removed" },
    ]);
    assert.notEqual(git(["branch", "--list", "idem-dry-1"], root).trim(), "", "--dry-run must not delete the branch");
  });
  ```

### R4-4. MINOR (a win32 twin of R2-10): on a Windows host, a POSIX `Worktree:` is read as a native path and reported `absent`

- **Where:** janitor.mjs:1256-1257. On win32, `path.isAbsolute` is `path.win32.isAbsolute`, and that returns `true` for `/home/ben/...` (checked: `path.win32.isAbsolute("/home/ben/x") === true`).
- **Effect:** `isForeignPath` is false, `existsSync` is false, and the step reports `worktree: absent` instead of R2-8's `worktree-unresolved`. The builder's own comment and report say a foreign-shaped value "stays ambiguous".
- **Scope:** records written on this Linux host carry `/home/...` paths, so the Windows host hits this. The same trap was fixed for Scratch in R2-10 (work-record.mjs:1981-1983).
- **Fix:** the `hostAbsolute` regex is already in R4-2's patch; it reuses R2-10's exact pattern. On Linux it changes nothing (verified on `fixsim/`: suite and probe unchanged).
- **Test (optional):** give `closeoutWorktree` a `platform = process.platform` parameter, as `pathWithin` has. Then a Linux-hosted test can pass `platform: "win32"` with `worktreeField: "/nonexistent/x"` and expect `worktree-unresolved`.

### R4-5. MINOR (a silent pass in a narrow config): origin-branch `absent` trusts a missing tracking ref

- **Where:** work-record.mjs:2228-2233.
- **Repro (C9):** set `remote.origin.fetch` to `+refs/heads/main:refs/remotes/origin/main` (a single-branch clone), with the record's branch merged and present on origin.
  - `origin-branch: absent`, exit 0; the origin still has the branch.
  - Before round 4 this was `refused (not found on origin)`, exit 2.
  - Nothing is deleted, but the closeout claims origin is clean.
- **Fix (mechanical).** Confirm absence against the remote itself only on this path; a normal re-run costs one `ls-remote`.
  ```js
  // old
          results.push({ step: "origin-branch", result: "absent", ref: branchName });
        } else if (verdict.verdict !== "delete") {
  // new
          const ls = spawnImpl("git", ["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${branchName}`], { cwd: repoRoot, encoding: "utf8", stdio: "pipe" });
          if (!ls.error && ls.status === 2) {
            results.push({ step: "origin-branch", result: "absent", ref: branchName });
          } else {
            results.push({ step: "origin-branch", result: "refused", ref: branchName, detail: ls.status === 0 ? "on origin, but no refs/remotes/origin tracking ref (check the fetch refspec)" : "UNVERIFIABLE: git ls-remote failed" });
          }
        } else if (verdict.verdict !== "delete") {
  ```
- **Predicted, verified on `fixsim/`:**
  - C9 gives exit 2 with `refused (on origin, but no refs/remotes/origin tracking ref ...)`.
  - The C1 and C7d re-runs stay `absent`, exit 0.
  - Territory: 406/403/1 (STALE)/2.
- **Test:** optional; a C9-shaped fixture using `git config remote.origin.fetch`.

### R4-6. MINOR (docs): docs/work-record.md still states the pre-ruling behavior, and the doc never mentions re-runs

- **Where:** docs/work-record.md:361-367 still says an unmatched value is reported `refused worktree-unresolved` (exit 2), "never a silent `absent`". The ruling changed that. Fix:
  ```
  old: and reports an unmatched value `refused worktree-unresolved` (exit 2), never a silent
  `absent` — a record naming a branch genuinely never checked out anywhere and a record whose
  `Worktree:` failed to match a real, still-live worktree can no longer be told apart from
  the closeout's own point of view, so both now stop for a human rather than one of them
  completing silently.
  new: and reports an unmatched value `refused worktree-unresolved` (exit 2) when it names a
  directory that exists but is not a registered worktree, a value written on the other OS,
  or a path whose record branch a registered worktree still holds. A value naming a path
  that no longer exists, with no registered worktree holding the record's branch, is
  `absent` (round 4: closeout is safe to re-run); if that branch still exists locally it is
  deleted with `-d` as usual. A second closeout of a fully cleaned-up record exits 0 with
  every step `absent`, and appends one more `Log:` line.
  ```
- **Also at docs/work-record.md:300** (a twin of R3-6): `git push origin --delete` becomes ``git push --force-with-lease=refs/heads/<name>:<tip> origin :refs/heads/<name>``.

### R4-7. NIT (a twin of R3-7 in new code): the branch-refused detail carries raw multi-line git stderr

- **Where:** janitor.mjs:1272. In C6 the line breaks across four physical lines (`Command failed: git branch -d ...` / `error: ...` / `If you are sure ...`).
- **Fix:** already in R4-2's patch: `.replace(/\s+/g, " ").trim()`.

## Verified absent (first-class)

- **No wrong delete on any new round-4 path.**
  - The new branch step is only ever `-d`. Mutating it to `-D` is killed by the source-scan test.
  - A path that exists but is not registered is never removed (C3; mutant killed).
  - A foreign value is never treated as absent on Linux (mutant killed).
- **Origin rules apply in full to a branch that is absent locally but present on origin** (C7a-c). `absent` is never reached while the tracking ref exists. Disabling the `absent` branch is killed by the idempotent test.
- **A second closeout** exits 0 with every step absent: C1 (bare name), C2 (path of a registered worktree), and a dry run 3.
- **R3-5:** the restore lines survive a refused Log write.
- **R3-4:** M15 is now killed.
- **Worktree state:** the reviewed worktree is untouched (`git status --short` empty; HEAD dd99ae1).

## Observations for the lead (no builder action this round)

- **O1 (pre-existing, not in the delta):** the worktree step never checks that the worktree it matched belongs to this record.
  - C12: `Worktree: build/c12-other-1`, naming another lane's live, clean worktree, gives `would removed <other wt>` and `branch: would removed build/c12-other-1`.
  - Committed work survives, because `-d` refuses unmerged branches. But the other lane's checkout would be torn down.
  - Suggested for a later lane: refuse unless the matched `entry.branch` equals `ownBranchName`, or is not named by another open record.
- **O2:** C6u. `git branch -d` honors a set upstream, so a local branch that is not merged to main but equals its pushed upstream is deleted (`branch: removed`). The origin step then refuses (`tip is not an ancestor`), exit 2. Nothing is lost; the commit stays on origin. This is the same semantics as the pre-existing `applySafe` path.
- **O3:** every re-run appends one more `closeout` Log line (C1: two after two live runs). The ruling doesn't forbid this; R4-6's doc text states it.
- **O4:** C13. A bare-name `Worktree:` whose `<repo>/<name>` exists as an ordinary directory (for example a `build/` output dir) is refused worktree-unresolved even though nothing is ambiguous. It is a wrong refusal only.
- **O5 (process):**
  - Line 1 of the builder's report is `VERDICT: PASS`; the addendum asked for `DONE <sha>` on line 1.
  - The R3-3 disposition says DONE, but it skipped the tests against the ruling.

## C4 fields

Cause: the idempotent `absent` path in `closeoutWorktree` (janitor.mjs:1256-1273) checks "does a registered worktree hold the branch?" and "does the local branch exist?" against `branchField`. For a path-form `Worktree:`, `branchField` is the path string, not a branch. So a stale path whose branch is live elsewhere, or whose local branch survived, reports `absent`. `closeoutRecord` derives the real branch (`ownBranchName`) before step 3, but never passes it on (work-record.mjs:2213).
Discriminating check: on a fresh fixture with a bare origin, write a closed record whose `Worktree:` is a non-existent absolute path, and keep a registered worktree at another path holding `build/c5-1`, merged. dd99ae1 gives exit 0 with `worktree: absent`. With the R4-2 patch it gives exit 2 with `worktree: refused (worktree-unresolved)`. The two new tests fail on dd99ae1 and pass with the patch (`C1-review-r4/t4/`).
Fix location: janitor.mjs:1222 and 1256-1273 (the `branchName` parameter, `hostAbsolute`, and the `ownBranch` check before `refSha`); work-record.mjs:2213 (pass `branchName: ownBranchName`); two tests in work-record-closeout.test.mjs and one dry-run test in janitor.test.mjs.
Simplification: no new helper or state. It reuses the branch name `closeoutRecord` already derives and R2-10's existing host-absolute regex. The fix is one extra `worktrees.some(...)` check inside the existing absent block.
