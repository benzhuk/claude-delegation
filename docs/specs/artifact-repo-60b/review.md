VERDICT: NEEDS_FIXES 08dbe6f14b6bd930d9d31712460c365145bfceee (5)

# Lane 60b review: Artifact-repo:

Reviewed: diff a57e2ff411c174ef9b6a40e51820602d5a47e7c7..08dbe6f, against docs/specs/artifact-repo-60b/spec.md and build.md.
Everything below was checked in scratch copies under /var/tmp/delegation-l60brv-5kzF. The worktree was only read. Mutation and patch runs wrote the original bytes back afterwards, and `git status` in the scratch clone is clean.

## Gate: full suite (scratch clone at 08dbe6f, `TMPDIR=/var/tmp node scripts/run-tests.mjs`)
tests 3137, pass 3132, fail 0, cancelled 0, skipped 5, todo 0. Leak check: 0 new temp entries.

## Areas checked with no defect found
- **Records without the field behave as before.** When the field is absent, `artifactRoot === repoRoot` and `mergeProofRoot === repoRoot`. The new closeout `else if (artifactRepoRaw)` branch is never entered, and validateRecord's new block only runs when the field has a value. The pinned-mode "unrelated repository" ancestry guard is unchanged. Removing it (mutant M7) still turns 2 existing tests red. The existing sha-not-in-git paths are also unchanged, and spec test 2 guards them.
- **Same-repo detection holds for every path spelling I tried.** A live probe (real repos, real checkAcceptance) refused all of these with `artifact-repo-same`:
  - the literal path;
  - a symlink to repo A;
  - a subdirectory (`A/docs`);
  - `A/docs/..`;
  - a trailing slash;
  - `A/.git`;
  - a linked worktree of A (`git worktree add`);
  - `--repo` given as a symlink while Artifact-repo: is the real path.

  This works because git 2.47 reports `--git-common-dir` relative to the `-C` directory (`../.git` from a subdirectory), and the result is realpath'd.
- **Relative paths and missing or non-git directories are refused.** A relative value is refused in checkAcceptance (`artifact-repo-not-absolute`), in validateRecord (a finding), and in closeout (a blockedReason on every step). A missing or non-git directory fails closed as `sha-not-in-git`.
- **Artifact and Worktree mismatches in repo B are refused.** In live mode, a B HEAD that differs from the artifact refuses. In pinned mode, an artifact that is not an ancestor of B's Worktree: refuses (spec test 6; mutant M7 goes red).
- **Evidence, census and four-read inputs stay in the record repo.** Evidence and the record are still read through `readConfinedRegularFile(repoReal, repoRoot, …)`, and the census through `opts.censusPath`. None of them is ever read from the artifact repo. Only the VERDICT line's sha is resolved in artifactRoot. That is required for cross-repo acceptance to work at all, and a refusing verdict for the artifact is still counted.
- **Close keeps the plugin-side merge check.** closeRecord (`--merge`) is untouched by the diff. The merge proof fetches and runs `merge-base` in `mergeProofRoot` (work-record.mjs:2283, 2295), and a fetch failure there becomes `UNVERIFIABLE: fetch failed`.
- **Missing objects render as unknown.**
  - four-read: a missing Artifact-repo: makes runGit throw, and the value becomes `unavailable (git: …)`. I checked this live.
  - collect-from-origin: a missing directory, a missing origin/main or a missing object all give `null`. Mutant M15 goes red.
- **Git env hygiene is clean.** Every new git child uses `withoutRepoLocatingGitEnv`: gitCommonDirReal, resolveCommit, the worktree rev-parse, the closeout fetch and merge-base, collect's `git` helper and four-read's `runGit`. The new tests go through the existing childEnv-based helpers.
- **sweep-origin cannot delete a plugin-repo branch because of this field.** It only fetches and deletes in repoRoot, and records only ever protect branches ("keep"). A cross-repo record can never cause a delete.

## Findings

### F1 — MAJOR: the closeout scratch step can delete a worktree that belongs to the Artifact-repo: repository
Evidence: work-record.mjs:2317 (at 08dbe6f). In the Artifact-repo branch, `removeScratchDirectory` still gets the default `listWorktreesImpl`, which lists only repoRoot's worktrees. The step's "contains or lies inside a path in git worktree list" guard is therefore blind to the artifact repo.

Probe:
- repo B has a registered linked worktree with uncommitted work inside the lane's `Scratch:` directory. The record has `Artifact-repo: B` and `Worktree: <that worktree>`, and the merge proof passes.
- `close --closeout --dry-run` prints `scratch: would removed <scratch>`.
- The same layout without the field is refused with `contains a path in git worktree list`. So the new field weakens an existing protection.

This breaks the spec rule "Cleanup steps must never delete branches or worktrees in the Artifact-repo: repository." It loses data: uncommitted work is removed, and repo B is left with a dangling worktree admin entry.

Patch (work-record.mjs, the Artifact-repo cleanup branch):

Current:
```js
    results.push({ step: "origin-branch", result: "refused", detail: manualReason });
    results.push(removeScratchDirectory({ scratchPath: record.fields.scratch, record, root: repoRoot, by, dryRun, fsImpl, platform: opts.platform, listWorktreesImpl }));
```
Replacement:
```js
    results.push({ step: "origin-branch", result: "refused", detail: manualReason });
    // The scratch step must also see the Artifact-repo: repository's own worktrees, or a scratch
    // directory that contains (or lies inside) one of them is removed along with it.
    const bothWorktreeLists = (root) => {
      const own = listWorktreesImpl(root);
      const foreign = listWorktreesImpl(mergeProofRoot);
      return own === null || foreign === null ? null : [...own, ...foreign];
    };
    results.push(removeScratchDirectory({ scratchPath: record.fields.scratch, record, root: repoRoot, by, dryRun, fsImpl, platform: opts.platform, listWorktreesImpl: bothWorktreeLists }));
```
Tried on a scratch copy:
- The probe now prints `scratch: would refused … (contains a path in git worktree list)`.
- work-record.test.mjs passes 252/252 and work-record-closeout.test.mjs passes 70/70. Test 8's unrelated scratch is still removed.
- The main worktree of repo B shows up in its own list, so an Artifact-repo: clone inside the scratch directory is protected too.

Add a closeout test that reproduces the probe: a repo B worktree under Scratch:, merge proof passing, and a scratch step expected `refused` with the directory still present. It is red at 08dbe6f.

### F2 — MEDIUM: a bare repository (or a `.git` directory) is accepted as Artifact-repo:
Evidence: work-record.mjs:1304–1319. The only check is that `--git-common-dir` resolves.

Probe: `git clone --bare B` as Artifact-repo: is accepted with `Worktree: main` (a branch). It is also accepted with `Worktree: <the bare dir>`, a directory, where the "live HEAD" is simply the bare repo's default branch, so no working tree ever exists.

The spec defines the field as "a directory inside a git worktree of the repository". Live-mode freshness ("the worktree's live HEAD really is the delivered sha") means nothing without a real worktree.

Patch: see the combined F2+F3 patch under F3.

### F3 — MINOR: the same-repository check is skipped when `--repo` itself is unreadable as git
Evidence: work-record.mjs:1315, `if (repoCommonDir !== null && repoCommonDir === artifactCommonDir)`. This contradicts the helper's own contract at :888 ("callers treat null as fail-closed … never as 'assume different'").

Probe: `--repo` is a plain directory, not a git repo, and Artifact-repo: is B. The result is `ok: true`. Before this diff, a non-git `--repo` could never accept anything, because every commit was resolved there.

Combined F2+F3 patch (work-record.mjs):

Current:
```js
    const repoCommonDir = gitCommonDirReal(repoRoot, spawnImpl, fsImpl);
    if (repoCommonDir !== null && repoCommonDir === artifactCommonDir) {
```
Replacement:
```js
    const insideWorkTree = spawnImpl("git", ["-C", artifactRepoRaw, "rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
      stdio: "pipe",
      env: withoutRepoLocatingGitEnv(process.env),
    });
    if (insideWorkTree.error || insideWorkTree.status !== 0 || String(insideWorkTree.stdout ?? "").trim() !== "true") {
      throw acceptanceError(
        `sha-not-in-git: Artifact-repo: ${artifactRepoRaw} is not inside a git worktree (a bare repository or a .git directory)`,
        "sha-not-in-git",
      );
    }
    const repoCommonDir = gitCommonDirReal(repoRoot, spawnImpl, fsImpl);
    if (repoCommonDir === null) {
      throw acceptanceError(`--repo ${repoRoot} is not a readable git repository, so Artifact-repo: cannot be proven to be a different one`, "artifact-repo-same");
    }
    if (repoCommonDir === artifactCommonDir) {
```
Tried on a scratch copy:
- The bare-repo and bare-dir cases now refuse with `sha-not-in-git`.
- A non-git `--repo` refuses with `artifact-repo-same`.
- `A/.git` still refuses, now as `sha-not-in-git` (before this patch it was `artifact-repo-same`).
- Every other same-repo spelling still refuses with `artifact-repo-same`.
- work-record.test.mjs passes 252/252.

Add one test for a bare Artifact-repo: (refuses) and one for a non-git `--repo` (refuses).

### F4 — MEDIUM: the tests do not cover three of the promised behaviors
I ran the relevant test file against each mutant in a scratch clone and wrote the original bytes back each time. Survivors, meaning the test file still passes with the mutation in place:

| Mutant | Change | Result |
|---|---|---|
| M9 | closeout `git fetch` run in `repoRoot` instead of `mergeProofRoot` (work-record.mjs:2283) | closeout 70/70 green |
| M10 | closeout fetch result ignored (`fetchFailed = false`) | closeout 70/70 green |
| M3 | same-repo check replaced by a literal `path.resolve(artifactRepoRaw) === repoRoot` | work-record 252/252 green |
| M4 | `Worktree:` branch name resolved in `repoRoot` instead of `artifactRoot` (`worktreeGitDir = … : repoRoot`) | work-record 252/252 green |

Killed (the file went red), as a sanity check that the harness works: M1, M2, M5, M6, M7, M8, M11, M12, M13, M14, M15.

The reasons:
- Test 7 refuses as "not an ancestor" whether or not a fetch ran.
- Test 8's `pushMain` already updates repo B's local `refs/remotes/origin/main`.
- Test 3 uses only the literal path.
- Tests 1 and 6 name Worktree: only as a directory.

So "after a fetch there", "a fetch failure is UNVERIFIABLE" (for the artifact repo), realpath/common-dir identity, and "or a branch name, in that repo" are all unproven by the suite.

Tests to add (each red on its mutant):
1. **Stale ref (kills M9 and M10), in work-record-closeout.test.mjs.**
   - Clone originB into a second checkout, commit there, merge `--no-ff` and push main.
   - Repo B's local `origin/main` is now stale. Point the record at that new commit, with `Artifact-repo: repoB`.
   - Expect the merge proof to pass: `steps.worktree.detail` matches `/artifact-repo: cleanup is manual/`, not `/not an ancestor/`.
2. **Fetch failure (kills M9), in work-record-closeout.test.mjs.**
   - After test 8's setup, run `git remote set-url origin <nonexistent path>` in repo B.
   - Expect every step refused with `/UNVERIFIABLE: fetch failed/`. Repo A's own fetch still succeeds.
3. **Same repo through other spellings (kills M3), in work-record.test.mjs.**
   - Run test 3 again with Artifact-repo: set to a symlink to `f.repo`, and again with a `git worktree add` path of `f.repo`.
   - Expect `artifact-repo-same` both times.
4. **Worktree as a branch in repo B (kills M4), in work-record.test.mjs.**
   - Test 1 with `Worktree: <B's branch name>`, the output of `symbolic-ref --short HEAD` in B.
   - Expect `ok: true`.

### F5 — LOW: four-read and collect-from-origin trust a relative Artifact-repo:
Evidence: four-read.mjs:837 (`fields['artifact-repo'] || opts.git`) and collect-from-origin.mjs:158. Neither checks that the path is absolute, so a relative value runs `git -C <relative>` (or `cwd`) against the process's current directory, whatever repository that happens to be. collect reads that value from an origin branch's blob, which is not trusted input.

In practice a mismatch almost always falls through to unavailable/null, because the shas are content-addressed. But these checks should not depend on which directory the process happens to run in. Mirror validateRecord's absolute rule.

four-read.mjs:837
Current:
```js
  const numberThree = computeReworkAfterAcceptance(fields, logs, fields['artifact-repo'] || opts.git, opts.branch || 'HEAD');
```
Replacement:
```js
  const artifactRepo = fields['artifact-repo'];
  const reworkGit = artifactRepo === undefined ? opts.git
    : (path.posix.isAbsolute(artifactRepo) || path.win32.isAbsolute(artifactRepo)) ? artifactRepo : null; // null -> unavailable (no range)
  const numberThree = computeReworkAfterAcceptance(fields, logs, reworkGit, opts.branch || 'HEAD');
```
collect-from-origin.mjs, in `computeMergedInArtifactRepo`:
Current:
```js
  if (!artifactSha) return null;
  const mainFull = "refs/remotes/origin/main";
```
Replacement:
```js
  if (!artifactSha) return null;
  if (!(path.posix.isAbsolute(artifactRepo) || path.win32.isAbsolute(artifactRepo))) return null;
  const mainFull = "refs/remotes/origin/main";
```
With these, a relative value renders as `unavailable (no range)` or `merged: null`, and absolute values behave exactly as now. The existing tests use absolute paths and are unaffected.

A note, not a finding: collect-from-origin never fetches in the Artifact-repo:, so its `origin/main` may be stale. A stale ref can only err toward `false` (shown as accepted-unmerged), never toward a false `true`, apart from a force-push on that repo's main. That is the same exposure `--no-fetch` already accepts for `--repo`.

## Refused command
One probe command was denied by the git-identity guard: my manual fixture commit passed `-c user.name/-c user.email`. I stopped that step. All later probe commits used the machine's configured identity with no override, in scratch repos under /var/tmp/delegation-l60brv-5kzF.

## Cause / checks (C4 fields)
Cause: in closeout, the Artifact-repo: branch reuses repoRoot-only worktree discovery for the scratch step (F1). checkAcceptance treats an unreadable `--repo` common dir as "different" and never checks that the named directory is inside a worktree (F2, F3).
Discriminating check: the /var/tmp/delegation-l60brv-5kzF/probe.mjs dry run prints `scratch: would removed` at 08dbe6f and `would refused (contains a path in git worktree list)` with the F1 patch. The bare and non-git `--repo` probes print `OK` at 08dbe6f and refuse with the F2+F3 patch.
Fix location: scripts/work-record.mjs:1314–1315 and :2316–2317. Low severity: scripts/four-read.mjs:837 and scripts/collect-from-origin.mjs's computeMergedInArtifactRepo. Tests go in work-record.test.mjs and work-record-closeout.test.mjs.
Simplification: no new mechanism. F1 reuses the existing worktree-list guard by feeding it both lists. F2 and F3 add one `rev-parse --is-inside-work-tree` call and drop a `!== null` short-circuit.
