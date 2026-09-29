VERDICT: NEEDS_FIXES 22964783b1e26331ce3c3a503ee38028e1a09188

# C1 review, round 5 (lane 36, lane-closeout): delta dd99ae1..2296478

Reviewer: Opus, high tier, delta review of R4-1..R4-7, W1 and W2, plus a regression hunt.

Artifact: wt/lane-closeout-1-C1 at 22964783b1e26331ce3c3a503ee38028e1a09188, in /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1. I left it untouched: at the end, `git status --short` was empty and HEAD was 2296478.

## Summary

- **The code matches every ruling.** R4-1 through R4-7 and W2 are applied as ruled. Both R4-2 holes are closed on fresh fixtures (C5 is refused, C4 is removed). The R4-5 `ls-remote` confirm fails closed on every failure shape I tried. The seam cannot be reached from the CLI.
- **The builder's mutation table is real.** I re-ran all four mutants on my own `git archive` extracts. Each one is killed by the test the builder named.
- **R5-1 (MAJOR; needs a lead re-ruling): W1's code is right, but W1's spec test will still fail on the Windows gate.**
  - Both W1 "spec" tests use `C:/Users/benzh/...` as their foreign value, not a `/`-rooted one. On a Windows host that value is native.
  - At 2296478, janitor.test.mjs:2575 still returns `absent/absent` on win32. I reproduced this on a scratch copy forced to classify as win32.
  - work-record-closeout.test.mjs:1531 (it was :1556) now passes on win32, but only through R4-2's `ownBranch` check, not through the classifier.
  - The addendum forbids editing either test, so the builder could not fix this. The lead's W1 diagnosis blamed a posix-shaped value; the failing tests hold a drive-letter one.
- **R5-2 (MINOR, advisory): no test holds the R4-5 confirm.** Two mutants survive: ls-remote ignored, and a failed ls-remote treated as absent. The code is correct today. I give two tests, verified on scratch copies.

## Method

All scratch work is under `.../scratchpad/lane-closeout/C1-review-r5/`.
- **Extract:** `git archive --format=tar -o src-2296478.tar 2296478`, written to a file and then untarred, never piped. The copies are `ext/` (probe), `mA`..`mF` (mutants), `sim-win/` (win32 simulation) and `t5b/` (proposed tests). `ext/scripts/{janitor,work-record}.mjs` are `cmp`-equal to the worktree.
- **Fixtures:** `probe.mjs` builds fresh repos, each with its own local bare origin, under `fx/`. It contains no shell or git deletion command. The only deletes are the ones `closeoutRecord` and `closeoutWorktree` make on those fixtures. The real origin was never touched.
- **Mutants:** `mutate.mjs` makes exact-match edits, and only inside the scratch extracts (it refuses any path outside the scratch dir).
- **Commands denied:** none.

## Territory tests and counts

- **Worktree run:** `timeout 900 node --test --test-reporter=tap scripts/work-record.test.mjs scripts/work-record-closeout.test.mjs scripts/janitor.test.mjs scripts/record-closed-and-skip.contract.test.mjs`.
  - Result: **410 tests, 407 pass, 1 fail, 2 skipped.**
  - The one failure is the pre-existing `docs/GOALS.md ... STALE regexes` test (tap #329).
  - The two skips are janitor.test's pre-existing Linux platform skips (#23, #33).
  - This matches the builder's numbers. Log: `C1-review-r5/territory.log`.
- **Clean extract `ext/`:** `work-record-closeout.test.mjs` plus `janitor.test.mjs`, run serially, gave 160 tests, 158 pass, 0 fail, 2 skipped.
- **Full gate:** `reports/C1-r5-gate.log:2933-2938` shows 2688 tests, 2682 pass, 1 fail (STALE), 5 skipped. That matches the builder's report. I did not re-run it.

## Task 1: each ruling

| Item | Status | Evidence |
|---|---|---|
| R4-1 | APPLIED AS RULED | `opts.listWorktreesImpl ?? listWorktrees` at work-record.mjs:2124 and :2315. It is threaded into `buildWorktreesByPath` (:1750), `removeScratchDirectory` (:1967, :2064, :2260) and `closeoutWorktree` (:2214; janitor.mjs:1222/1226). Both R2-2 tests pass `listWorktreesImpl: () => null` with no `skip` (work-record-closeout.test.mjs:1152, :1169). `withFailingWorktreeList` is gone. The production default is still janitor's `listWorktrees`. |
| R4-2 (with R4-4 and R4-7) | APPLIED VERBATIM | janitor.mjs:1256-1282 is byte-for-byte the patch in C1-review-r4.md. work-record.mjs:2214 passes `branchName: ownBranchName`. Both tests are added verbatim (work-record-closeout.test.mjs:1567-1611). |
| R4-2, my round-4 repros on fresh fixtures | BOTH HOLES CLOSED | **C5** (a stale path, with a live worktree elsewhere holding `build/c5-1`): now `worktree: refused (worktree-unresolved)`, `branch: refused (worktree-unresolved (not checked))`, exit 2, dry run exit 2. The live worktree and its local branch survive. At dd99ae1 this was exit 0, `absent/absent`. **C4** (a path that is gone, with the merged local branch surviving): the dry run is `would absent / would removed build/c4-1` and leaves refs, worktree list and record byte-identical. Run 1 gives `branch: removed build/c4-1` and the branch is gone. Run 2 has every step `absent`, exit 0. At dd99ae1 it said `branch: absent` and the branch stayed. |
| R4-3 | APPLIED VERBATIM | janitor.test.mjs:2599-2610. |
| R4-5 | APPLIED VERBATIM | work-record.mjs:2238-2243. **C9** (a narrow fetch refspec) now gives `refused (on origin, but no refs/remotes/origin tracking ref ...)`, exit 2, and origin keeps the branch. C1 and C7d re-runs are still `absent`, exit 0. No test holds it (R5-2). |
| R4-6 | APPLIED VERBATIM | docs/work-record.md:300-301 and :364-370 are as given. |
| R4-7 | APPLIED | janitor.mjs:1280. The C4u refusal detail is one line (probe: no line contains `\n`). |
| W1, the code | CORRECT | See the reading below. |
| W1, its spec tests | **WILL STILL FAIL ON WIN32** | R5-1. |
| W2 | APPLIED | janitor.test.mjs:2498 compares `path.resolve(result.steps[0].ref)` with `path.resolve(wt)`. Both sides are full paths, so it is not loosened to a basename. On win32, `path.resolve("C:/Users/.../build/p9-1")` gives the backslash form, which matches the failure in the lead's log. |
| W1 classifier test | PRESENT, HOLDS BOTH FORMS ON LINUX | janitor.test.mjs:2616-2645. It forces `platform: "win32"` and `"posix"` on both a posix value and a win32 value, four asserts in all. It kills my win32-faithful mutant (m2 below). |

**W1, read from the code (janitor.mjs:1256-1259):**
- On win32, `hostAbsolute` is `/^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/])/.test(wf)`.
- A value starting with a single `/`, such as `/home/ben/x`, has no drive letter. Its second character is not a separator, so the regex is false.
- Then `path.posix.isAbsolute(wf)` is true, so `isForeignPath` is true. The `if (!isForeignPath && !existsSync(target))` absent block is skipped, and :1285 returns `refused worktree-unresolved` / `refused worktree-unresolved (not checked)`.
- Probe `W1-direct`, with `closeoutWorktree` called using `platform: "win32"`:
  - `/home/ben/x`, `/x`, `///x` and `\x\y` are all refused.
  - `C:\Users\x`, `C:/Users/x`, `\\server\share\x` and `//server/share/x` are all native (`absent`).
  - With `platform: "linux"`, `C:\Users\x` and `\\server\share\x` are refused, and `/home/ben/x` is native.
- No second classifier was added.

## Task 2: the mutation table, re-run independently

These are my own extracts, run serially. The command was `timeout 600 node --test --test-reporter=tap scripts/work-record-closeout.test.mjs scripts/janitor.test.mjs`. The baseline `ext/` gave 160 tests, 158 pass, 0 fail.

| Mutant | Edit | Result | Test that caught it |
|---|---|---|---|
| m1 (R4-2) | janitor.mjs:1263-1265, the `ownBranch && worktrees.some(...)` refusal, removed | KILLED (157/1) | `closeoutRecord: idempotent - a path-form Worktree: that no longer exists, while a registered worktree elsewhere still holds the record's branch ...` |
| m2 (hostAbsolute) | janitor.mjs:1257 becomes `platform === "win32" ? path.win32.isAbsolute(wf) : path.posix.isAbsolute(wf)`. This is the exact W1 bug, and stricter than the builder's collapse-to-posix. | KILLED (157/1) | `closeoutWorktree: classifier - hostAbsolute forced to win32 and to posix ...` |
| m3 (R4-3) | janitor.mjs:1273-1275, the dry-run guard, removed | KILLED (157/1) | `closeoutWorktree: idempotent - --dry-run on a gone directory whose local branch survives deletes nothing` |
| m4 (seam) | both `opts.listWorktreesImpl ?? listWorktrees` become `listWorktrees` | KILLED (156/2) | `sweepOrigin: R2-2 ...` and `closeoutRecord: R2-2 ...` |
| m5 (R4-5, extra) | `if (!ls.error && ls.status === 2)` becomes `if (true)` (dd99ae1 behavior) | **SURVIVED** (158/0) | none (R5-2) |
| m6 (R4-5 fail-open, extra) | the same condition becomes `if (ls.status !== 0)`, so a failed ls-remote counts as absent | **SURVIVED** (158/0) | none (R5-2) |

The builder's four rows reproduce exactly, including the tests it named.

Side note: my first attempt ran the six copies in parallel and produced 4 to 15 unrelated failures per copy. The suites share fixed-name fixtures under `os.tmpdir()` (O3). I discarded those numbers. The table above is from serial runs only.

## Task 3: regression hunt

### R4-5: `ls-remote` fails closed

I ran each case on a fresh fixture. Run 1 is live and removes the origin branch. Run 2 has `spawnImpl` pass everything through except `git ls-remote`.

| ls-remote result in run 2 | origin-branch | exit |
|---|---|---|
| status 128 (remote unreachable) | `refused (UNVERIFIABLE: git ls-remote failed)` | 2 |
| `error` set (ENOENT), status null | refused UNVERIFIABLE | 2 |
| killed by signal, status null | refused UNVERIFIABLE | 2 |
| status 1 | refused UNVERIFIABLE | 2 |
| status 2 **and** `error` set | refused UNVERIFIABLE | 2 |
| **real** git failure: origin re-pointed at a missing path just before ls-remote, after a successful fetch | refused UNVERIFIABLE | 2 |
| real status 2 (control, C7d) | `absent` | 0 |

- `absent` requires `!ls.error && ls.status === 2`; everything else refuses.
- The pattern is `refs/heads/<name>`, so an option-shaped branch name cannot reach ls-remote as a flag.
- A tail-match false positive (ls-remote pattern semantics) can only produce "present", so it can only refuse.
- **Verified: no fail-open.**

### The seam cannot be reached from the CLI

- `acceptanceMain` refuses each of these with exit 1, `unknown or incomplete option`:
  - `close ... --closeout --listWorktreesImpl x`;
  - `close ... --closeout --list-worktrees-impl x`;
  - `sweep-origin --listWorktreesImpl x`;
  - `sweep-origin --spawnImpl x`.
- `parseCloseArgs` and `parseSweepOriginArgs` build `opts` only from fixed `Map`s: close gives the keys `command,main,recordPath,closeout,closeoutBy`, sweep-origin gives `command,repoRoot`.
- Any value would be a string anyway, never a function.
- **Verified.**

### Other new-path cases (probe.out)

| Case | Result |
|---|---|
| C4u: a path that is gone, with the local branch one unmerged commit ahead | `branch: refused build/c4u-1 (... not fully merged ...)`, on one line; exit 2; the branch is intact. Only `-d` is used. |
| C16: a path that is gone, with `Artifact: main@<sha>` | `ownBranch = main`, which the main worktree holds, so `refused worktree-unresolved`. Local `main` survives. |
| C15: a path that is gone, a bare-sha `Artifact:`, and a live worktree elsewhere holding the branch | `worktree: absent \| branch: absent \| origin-branch: refused (no branch name could be derived ...)`, exit 2. Nothing is deleted except scratch. Not a silent pass (O1). |
| C1, C2, C3 (regression) | These are unchanged from round 4. C1 and C2 give exit 0 on run 1, then every step `absent` on run 2. C3 gives exit 2 with the unregistered directory intact. |

- **No wrong delete was found on any path in the delta.**
- The one new local delete is the path-form `ownBranch` `-d`. It runs only when no registered worktree holds that branch, and it never uses `-D`.

## Findings

### R5-1. MAJOR (it fails the second-host gate; the fix needs the lead to re-rule, because the ruling says "do not edit them"): the W1 spec test's foreign value is native on Windows, so janitor.test.mjs:2575 still fails on win32 at 2296478

- **Where:**
  - janitor.test.mjs:2578: `worktreeField: "C:/Users/benzh/orca/workspaces/x/idem-foreign-1"`;
  - work-record-closeout.test.mjs:1536: the same value.
- **Evidence:**
  - The lead's log, `docs/work/evidence/wr-2026-09-28-lane-closeout-win-suite-cee1daf.log:3053-3095`, shows exactly these two tests failing (`janitor.test.mjs:2579`, `work-record-closeout.test.mjs:1566`). Both use the `C:/` value, not a `/`-rooted one.
  - On win32, `C:/...` passes the `hostAbsolute` regex, so it is native. It does not exist, so the code takes the ruling's `absent` case.
- **Repro, on a scratch copy `sim-win/` where `closeoutWorktree`'s default `platform` is forced to `"win32"`:** `node --test --test-name-pattern="foreign-OS-shaped" scripts/janitor.test.mjs scripts/work-record-closeout.test.mjs` gives:
  - `not ok 1 - closeoutWorktree: ... foreign-OS-shaped ...`: actual `absent/absent`, expected `refused`;
  - `ok 2 - closeoutRecord: ... foreign-OS-shaped ...`. It passes only because `closedFixtureForScratch` leaves a live worktree on `build/scratch-fixture-1`, so R4-2's `ownBranch` check refuses. The classifier is not what holds it there.
  - Probe `W1-direct` shows the same: `"C:/Users/x" on win32: worktree=absent branch=absent`.
- **The code is not at fault.** For a Windows host, a native `C:/` path that is gone, with no worktree holding the record's branch, is `absent` under the round-4 ruling. The test encodes "`C:/` is foreign", which is true only on a posix host.
- **Fix (exact; the lead must first allow these two test edits).**

  janitor.test.mjs:2578:
  ```js
  // old
    const result = closeoutWorktree({ root, worktreeField: "C:/Users/benzh/orca/workspaces/x/idem-foreign-1", cwd: root });
  // new
    // Foreign to THIS host: a Linux-written value read on win32, a Windows-written value read elsewhere.
    const foreign = process.platform === "win32" ? "/home/ben/orca/workspaces/x/idem-foreign-1" : "C:/Users/benzh/orca/workspaces/x/idem-foreign-1";
    const result = closeoutWorktree({ root, worktreeField: foreign, cwd: root });
  ```

  work-record-closeout.test.mjs:1536:
  ```js
  // old
      work: "wr-2026-09-27-idem-foreign", worktree: "C:/Users/benzh/orca/workspaces/x/idem-foreign-1",
  // new
      work: "wr-2026-09-27-idem-foreign", worktree: process.platform === "win32" ? "/home/ben/orca/workspaces/x/idem-foreign-1" : "C:/Users/benzh/orca/workspaces/x/idem-foreign-1",
  ```

- **Predicted outcome:**
  - On Linux both tests are byte-for-byte the same as today, and they pass.
  - On win32 both pass through the `hostAbsolute` classifier (foreign, refused) before `existsSync`.
  - Verified on `sim-win/` with the win32-branch value swapped in: `ok 1`, `ok 2`.
- **Alternative if the lead keeps "do not edit the spec tests":** accept that janitor.test.mjs:2575 fails on the Windows gate by design. It cannot pass there under the ruled `hostAbsolute`.

### R5-2. MINOR (advisory; the ruling asked for no test, so this is not non-compliance): the R4-5 `ls-remote` confirm is held by no test, and its fail-closed branch can regress silently

- **Where:** work-record.mjs:2238-2243.
- **Repro:** mutants m5 (`if (true)`) and m6 (`if (ls.status !== 0)`, fail-open) both survive the territory tests (158/158, 0 fail).
- **Fix (mechanical):** add the two tests below to work-record-closeout.test.mjs, just before `after(`.
  - They pass on 2296478 (`t5b/`).
  - m5 fails both of them (`mE/`). m6 fails the second (`mF/`).
  - They use only the file's existing helpers, plus the `spawnSync` it already imports.

  ```js
  // R4-5 (C1 round 5): the origin-branch `absent` path is confirmed against the remote with
  // `git ls-remote --exit-code`; absent only on its exit 2. These pin both halves.
  test("closeoutRecord: R4-5 - a narrow fetch refspec (no refs/remotes/origin tracking ref) with the branch still on origin is refused, never reported absent", () => {
    const env = fixtureEnv();
    const { repo } = buildRepo(env);
    const branch = "build/r45-narrow-1";
    git(["config", "remote.origin.fetch", "+refs/heads/main:refs/remotes/origin/main"], repo, env);
    git(["branch", branch], repo, env);
    const tree = git(["rev-parse", `${branch}^{tree}`], repo, env).trim();
    const tip = git(["commit-tree", tree, "-p", branch, "-m", `work on ${branch}`], repo, env).trim();
    git(["update-ref", `refs/heads/${branch}`, tip], repo, env);
    mergeNoFF(repo, env, branch);
    pushMain(repo, env);
    pushBranch(repo, env, branch);
    const { scratchPath, by } = mkScratchFixture();
    const recordRel = writeClosedRecord(repo, {
      work: "wr-2026-09-28-r45-narrow", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
    });
    const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
    const steps = stepsOf(result);
    assert.equal(steps["origin-branch"].result, "refused");
    assert.match(steps["origin-branch"].detail, /on origin, but no refs\/remotes\/origin tracking ref/);
    assert.equal(result.exitCode, 2);
    assert.notEqual(git(["ls-remote", "--heads", "origin", branch], repo, env).trim(), "", "the branch must still be on origin");
  });

  test("closeoutRecord: R4-5 - a failed git ls-remote on the absent path refuses UNVERIFIABLE (exit 2), never reports absent", () => {
    const env = fixtureEnv();
    const { repo, branch, tip } = closedFixtureForScratch(env);
    const { scratchPath, by } = mkScratchFixture();
    const recordRel = writeClosedRecord(repo, {
      work: "wr-2026-09-28-r45-lsfail", worktree: branch, artifact: `${branch}@${tip}`, leadSession: by, scratch: scratchPath,
    });
    const first = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by });
    assert.equal(stepsOf(first)["origin-branch"].result, "removed");
    const spawnImpl = (cmd, args, opts) => (cmd === "git" && args[0] === "ls-remote"
      ? { status: 128, stdout: "", stderr: "fatal: simulated ls-remote failure", error: undefined }
      : spawnSync(cmd, args, opts));
    const result = closeoutRecord({ repoRoot: repo, recordPath: recordRel, closeoutBy: by, spawnImpl });
    const steps = stepsOf(result);
    assert.equal(steps["origin-branch"].result, "refused");
    assert.equal(steps["origin-branch"].detail, "UNVERIFIABLE: git ls-remote failed");
    assert.equal(result.exitCode, 2);
  });
  ```

## Verified absent (first-class)

- **No wrong delete on any delta path:**
  - C5 keeps the live worktree and its branch.
  - C4u keeps an unmerged branch.
  - C16 keeps local `main`.
  - C3 keeps an unregistered directory.
  - Every dry run I ran (C4, C5, C1 run 3) changed nothing.
- **R4-5 has no fail-open:** all six failure shapes refuse, including a real git failure.
- **The seam cannot be reached from argv.**
- **The W1 spec tests are unchanged:** their bodies are md5-identical to dd99ae1. W2 was not loosened.
- **The reviewed worktree was not modified.** It stayed clean at 2296478 throughout.

## Observations (no builder action this round)

- **O1 (C15):** a path-form `Worktree:` that is gone, plus a bare-sha `Artifact:`, gives `ownBranch = null`. So the worktree and branch steps report `absent` even though a live worktree elsewhere holds the lane's branch. Exit is still 2, because the origin step cannot derive a name. The step lines misreport, but nothing passes silently. It is the same root as R4-2, with no branch source available.
- **O2 (pre-existing, not in the delta):**
  - The origin-branch step still runs and deletes (with a restore line) when the worktree step refused. This happens in C5 and C3, and at dd99ae1 too.
  - The local `-d` on a derived `ownBranch` does not check "named by another open record", which the origin step does. This is round 4's O1 class.
- **O3 (test hygiene, pre-existing):** the closeout and janitor suites use fixed-name fixtures under `os.tmpdir()`, for example `mkScratchFixture`'s `closeout-test-by-N`, and remove them in `after()`. Two gate runs of this suite at once on one host (say, two worktrees gating in parallel) interfere. I measured 4 to 15 spurious failures per copy. A `mkdtemp` parent for the `by` directories would fix it.
- **O4 (builder report):** it says line 1 of the gate log totals is at `:2932-2937`. They are actually at `:2933-2938`. This is cosmetic.

## C4 fields

Cause: W1's lead diagnosis blamed a posix-shaped value on win32. The two failing spec tests, janitor.test.mjs:2578 and work-record-closeout.test.mjs:1536, actually use `C:/Users/benzh/...`, which is native on win32. The ruled `hostAbsolute` classifier (janitor.mjs:1257) correctly calls it native, and a native path that is gone, with no worktree holding the branch, is `absent` under the round-4 ruling. So the janitor test cannot pass on win32, and the closeout test passes there only through R4-2's `ownBranch` check.
Discriminating check: on a scratch copy with `closeoutWorktree`'s default `platform` forced to `"win32"`, `--test-name-pattern="foreign-OS-shaped"` gives `not ok` for janitor (`absent` vs `refused`) and `ok` for closeout. With the tests' value swapped to `/home/ben/...`, both give `ok`.
Fix location: janitor.test.mjs:2578 and work-record-closeout.test.mjs:1536 (the host-foreign ternary). No code change: janitor.mjs:1256-1259 is correct.
Simplification: no new classifier, helper or parameter. Each test picks the value that is foreign to the host it runs on, so on every host the real, un-injected classifier is what makes it pass.
