VERDICT: NEEDS_FIXES b426e8a7dbe4a5aeee4033da613083f161670122 (1)

# Lane 60b final confirm, review r3 (artifact b426e8a)

All execution happened in a scratch clone at /var/tmp/l60b-r3-W7UO/c, checked out at b426e8a. Probe repos are under /var/tmp/l60b-r3-W7UO/probe. I did not write to the worktree /var/tmp/lane-60b/wt, and `git status --short` there is empty. For the mutant run I edited the scratch clone's work-record.mjs, then restored it with `git checkout` in the scratch clone. `git status --short` there is also empty.

## 1. Is b426e8a exactly review-r2's patch, and does it touch only the test file? Yes.
- `git show --stat b426e8a` shows one file, scripts/work-record-closeout.test.mjs, +26/-0.
- I extracted review-r2.md's "Replacement:" block (28 lines) and diffed it against lines 402-429 of the file at b426e8a. The result is FILE-MATCH, byte-identical.
- `git diff cf8f5fc b426e8a` also lists fix1-build.md and the work record. Both come from the intermediate commit 687084a ("docs(work): lane 60b fix r1 delivered"), not from b426e8a. Neither is code.

## 2. Does the new test go red against the fail-open mutant? Yes.
Only the closeout file was run:
- b426e8a as committed: 74 tests, 74 pass, 0 fail.
- Mutant at work-record.mjs:2341, `return own === null ? null : [...own, ...(foreign ?? [])];`: 74 tests, 73 pass, 1 fail. The failing test is `not ok 10 - closeoutRecord: F1 - an unreadable Artifact-repo: worktree list refuses the scratch step, never removes`.
- After I restored the file, the scratch clone was clean again.

## 3. Full suite at b426e8a (`TMPDIR=/var/tmp node scripts/run-tests.mjs`)
tests 3147, pass 3142, fail 0, cancelled 0, skipped 5, todo 0. Leak check: 0 new temp entries. That is r2's 3146 plus the one new test.

## 4. Spot check of the accept path
Question: with the field present, can acceptance pass for an artifact that is not reachable from the named Worktree in the artifact repo? Yes, it can. That is the one finding below.

## Finding

### R3-F1: MEDIUM. A `Worktree:` directory is never checked to belong to `Artifact-repo:`, so an artifact that nothing in the artifact repo reaches is accepted in both modes
Spec (spec.md, "accept and check-acceptance"): "`Worktree:` must then be an absolute directory, or a branch name, **in that repo**."

Code: in scripts/work-record.mjs at b426e8a, lines 1377-1385:
- `worktreeTarget` is any absolute path, or a relative path resolved against `artifactRoot`. `../x` escapes.
- When that path is a directory, it becomes `worktreeGitDir`.
- Both the live freshness check (`worktreeHead !== artifact`) and the pinned ancestry check (`merge-base --is-ancestor` at 1407) then run inside that directory's own repository.
- Nothing compares the directory's git-common-dir with `Artifact-repo:`'s common dir. `artifactCommonDir` is computed at 1304 and used only for the artifact-repo-same test.

I probed this with real temporary repos: /var/tmp/l60b-r3-W7UO/probe/probe.mjs and probe2.mjs. Neither sets a git identity.

**probe.mjs.** Repo A holds the record. Repo B is `Artifact-repo:`: commit F sits on branch `feat`, and `main` has moved on. Repo C is `git clone B` with `feat` checked out, so its common dir is separate.

| Probe | Mode | Worktree: | Result |
|---|---|---|---|
| P1 | pinned F | B | REFUSED sha-not-in-git (control, spec test 6) |
| P2 | pinned F | C, a clone outside B | **ACCEPTED** |
| P3 | live F | B | REFUSED sha-not-in-git (control) |
| P4 | live F | C | **ACCEPTED** |
| P5 | pinned F | `../C`, relative, escapes B | **ACCEPTED** |
| P6 | pinned F | `feat`, a branch in B | ACCEPTED (legitimate) |

**probe2.mjs** is the decisive case. Commit X was made in clone C. Only its objects were copied into B, with `pack-objects --revs | unpack-objects`, so `git -C B for-each-ref --contains X` is empty. No ref or worktree in B reaches X.

| Probe | Mode | Worktree: | Result |
|---|---|---|---|
| Q1 | pinned X | B | REFUSED |
| Q2 | pinned X | `main` (branch in B) | REFUSED |
| Q3 | pinned X | C | **ACCEPTED** |
| Q4 | live X | C | **ACCEPTED** |

So spec test 6's guarantee is bypassed by naming any other clone that holds the commit. The test passes only because its own fixture happens to name B.

Scope: the no-field path has the same shape, because an absolute `Worktree:` directory is not tied to `--repo` either. That behavior predates this lane, and the spec requires it to stay byte-for-byte unchanged. The fix below is therefore gated on `artifactRepoRaw` and changes nothing for records without the field.

#### Patch 1: scripts/work-record.mjs (three exact replacements)

(a) Current (line 1296-1297):
```js
  let artifactRoot = repoRoot;
  if (artifactRepoRaw) {
```
Replacement:
```js
  let artifactRoot = repoRoot;
  let artifactCommonDir = null;
  if (artifactRepoRaw) {
```

(b) Current (line 1304):
```js
    const artifactCommonDir = gitCommonDirReal(artifactRepoRaw, spawnImpl, fsImpl);
```
Replacement:
```js
    artifactCommonDir = gitCommonDirReal(artifactRepoRaw, spawnImpl, fsImpl);
```

(c) Current (line 1385):
```js
  const worktreeGitDir = worktreeIsDir ? worktreeTarget : artifactRoot;
```
Replacement:
```js
  // Lane 60b (spec.md item 3: "Worktree: must then be an absolute directory, or a branch name, in
  // that repo"): a Worktree: directory must belong to the Artifact-repo: repository itself. A linked
  // worktree shares its git-common-dir; a separate clone holding the same commit does not, and would
  // otherwise let an artifact that no ref in Artifact-repo: reaches pass both modes (review r3).
  if (artifactRepoRaw && worktreeIsDir && gitCommonDirReal(worktreeTarget, spawnImpl, fsImpl) !== artifactCommonDir) {
    throw acceptanceError(`sha-not-in-git: Worktree: ${worktreeField} is not a worktree of Artifact-repo: ${artifactRepoRaw}`, "sha-not-in-git");
  }
  const worktreeGitDir = worktreeIsDir ? worktreeTarget : artifactRoot;
```

#### Patch 2: scripts/work-record.test.mjs (insert a test)
Current (line 1373):
```js
// ── Lane 60b review round 1 (ruling-r1.md): F1-F5, all adopted ─────────────────────────────
```
Replacement:
```js
// Review r3 (spec.md item 3, "Worktree: must then be an absolute directory ... in that repo"): a
// Worktree: directory in a separate clone of Artifact-repo: refuses in both modes; a linked
// worktree of Artifact-repo: itself (same git-common-dir) is still accepted.
test("checkAcceptance: r3 - a Worktree: directory outside the Artifact-repo: repository refuses; its linked worktree passes", () => {
  const f = makeAcceptanceFixture();
  const b = makeArtifactRepoFixture(f.env);
  const cDir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-artifact-repo-clone-"));
  execFileSync("git", ["clone", "-q", b.dir, cDir], { env: f.env });
  const linked = path.join(fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), "work-record-artifact-repo-linked-")), "wt");
  execFileSync("git", ["-C", b.dir, "worktree", "add", "-q", "--detach", linked, b.sha], { env: f.env });
  const toPosix = (p) => p.split(path.sep).join("/");
  const recordPath = path.join(f.repo, f.record);
  const base = fs.readFileSync(recordPath, "utf8").replace(/^Artifact: .*$/m, `Artifact: territory/a@${b.sha}`);
  fs.writeFileSync(path.join(f.repo, f.evidence), `VERDICT: APPROVE — ${b.sha}\nIndependent review of a cross-repo artifact.\n`);
  const withWorktree = (dir) => fs.writeFileSync(recordPath, base.replace(/^Worktree: \.$/m, `Artifact-repo: ${toPosix(b.dir)}\nWorktree: ${toPosix(dir)}`));
  withWorktree(cDir);
  for (const opts of [{ pinnedArtifact: b.sha }, { deliveryRef: b.sha }]) {
    assert.throws(
      () => checkAcceptance({ repoRoot: f.repo, recordPath: f.record, ...opts }),
      (error) => error.code === "sha-not-in-git" && /is not a worktree of Artifact-repo:/.test(error.message),
    );
  }
  withWorktree(linked);
  assert.equal(checkAcceptance({ repoRoot: f.repo, recordPath: f.record, deliveryRef: b.sha }).ok, true);
});

// ── Lane 60b review round 1 (ruling-r1.md): F1-F5, all adopted ─────────────────────────────
```

#### Verification status
I did not execute these patches. When I tried to apply them to the scratch clone, a PreToolUse hook (secret-guard) denied the command. Under the brief's rule that a denied command stops the step, I did not retry or work around it, and nothing was written. The predicted outcome below comes from mental simulation. The builder should confirm it on the fix round.

- **Predicted, new test.** It is red at b426e8a: the clone passes in both modes, which is P2/P4. It is green with Patch 1.
  - The clone's `--git-common-dir` realpath is `<cDir>/.git`, which differs from `<b>/.git`, so it throws.
  - The linked worktree's `--git-common-dir` is `<b>/.git`, which is equal, so it proceeds. Its HEAD is b.sha, so live mode passes.
  - `git clone` into an empty mkdtemp directory is allowed, and `worktree add` targets a subdirectory that does not exist yet.
- **Predicted, probes.** P2, P4, P5, Q3 and Q4 flip to REFUSED sha-not-in-git. P1 and P3 are unchanged: B's own common dir is equal, so the existing checks still decide. P6 and Q2 are unaffected: a branch name is not a directory, so `worktreeIsDir` is false.
- **Predicted, existing tests.**
  - Test 1, test 6, F3 (1407) and the branch-named cases (1387, 1463) all name B or a branch, so they are equal or skipped.
  - F4/M3 (1435) and test 3 (1301) throw artifact-repo-same before this point.
  - Records without the field never enter the new `if`.
  - closeout, four-read and collect-from-origin do not call checkAcceptance. Its only callers are acceptRecord at 1536 and the CLI at 2662.
  - Expected full suite: 3148 tests, 0 fail.
- `gitCommonDirReal` returns null for a directory that is not in git. `artifactCommonDir` is non-null at this point, because line 1305 refuses otherwise. So a non-git `Worktree:` directory fails closed through the same new check.

## Verified absences (first-class)
- b426e8a contains no production code change. The r2 fixes F1-F5 at cf8f5fc are carried unchanged, and the full suite is green.
- Records without the field: the new patch is gated on `artifactRepoRaw`, so there is no behavior change there.
- Inside the artifact repo, both reachability checks hold. Branch names resolve in `Artifact-repo:` (P6 accepts, Q2 refuses). A `Worktree:` of B itself is held to freshness (P3) and to ancestry (P1, Q1).

## Note (not a finding)
Records without the field have the same unconstrained absolute `Worktree:` directory relative to `--repo`. This predates lane 60b, and the spec requires the no-field path to stay unchanged, so I leave it out of scope. If the lead wants it closed, that would be a separate lane.

## C4 fields
Cause: checkAcceptance resolves a directory `Worktree:` in whatever repository that directory belongs to, and never ties it to `Artifact-repo:`'s git-common-dir. The freshness and ancestry checks therefore run against an arbitrary clone rather than "that repo".
Discriminating check: probe2.mjs. With an artifact X that no ref in B reaches, `Worktree: <B>` and `Worktree: main` refuse, but `Worktree: <clone C>` is ACCEPTED in both pinned and live mode at b426e8a. With Patch 1 it is predicted to refuse sha-not-in-git.
Fix location: scripts/work-record.mjs, checkAcceptance: hoist `artifactCommonDir` (lines 1296/1304), and add the common-dir guard before `const worktreeGitDir` (line 1385). Test in scripts/work-record.test.mjs, before the "Lane 60b review round 1" banner (line 1373).
Simplification: one equality check that reuses the existing `gitCommonDirReal` and the `artifactCommonDir` already computed. It is gated on the field, adds no new helper, and leaves the no-field path unchanged.
