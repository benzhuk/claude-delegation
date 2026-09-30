VERDICT: NEEDS_FIXES cf8f5fc55a601f25774526a75c473cb6b9fc079e (1)

# Lane 60b delta review r2 (08dbe6f..cf8f5fc)

Inputs: ruling-r1.md (adopts all five findings; F1 and F3 must fail closed) and fix1-build.md.
All work was done in scratch clones under /var/tmp/delegation-l60brv-5kzF (r2, r2m). The worktree was only read. Every mutation run wrote its original bytes back, and `git status` in r2m is clean.

## Gate: full suite at cf8f5fc (`TMPDIR=/var/tmp node scripts/run-tests.mjs`)
tests 3146, pass 3141, fail 0, cancelled 0, skipped 5, todo 0. Leak check: 0 new temp entries.

## Each prior finding: is the fix at the cause?
- **F1: fixed at the cause.** work-record.mjs, in the closeout Artifact-repo branch. The `bothWorktreeLists` union of the repoRoot and mergeProofRoot worktree lists is applied verbatim, and it returns `null` when either list fails. Reverting it turns the F1 test red: 72/73.
- **F2: fixed at the cause.** `rev-parse --is-inside-work-tree` is applied verbatim and runs through `withoutRepoLocatingGitEnv`. Reverting it turns the F2 test red: 255/256.
- **F3: fixed at the cause.** A null `--repo` common dir now throws `artifact-repo-same`. Reverting it turns the F3 test red: 255/256.
- **F4: fixed, all four round-1 survivors now killed.**

  | Mutant | Change | Tests red |
  |---|---|---|
  | M3 | literal-path same check | F4/M3, 255/256 |
  | M4 | branch-named Worktree resolved in repoRoot | F4/M4, 255/256 |
  | M9 | fetch run in repoRoot | 2 red, 71/73 |
  | M10 | fetch result ignored | 1 red, 72/73 |
  | M10b | fetch never runs | 3 red, 70/73 |
- **F5: fixed at the cause.**
  - four-read: reverting the guard turns its test red, 115/116.
  - collect-from-origin: reverting the guard turns its test red, 25/26. The test uses a real repo reachable from a chdir'd cwd, so it can tell the guard is actually in place. The cwd is restored in `finally`.

## Regressions in records without the field: none found
- work-record.mjs: every new line sits inside `if (artifactRepoRaw)` or `else if (artifactRepoRaw)`.
- four-read: when the field is absent, `artifactRepo === undefined` leads to `opts.git`, which is identical to the old `undefined || opts.git`.
- collect-from-origin: an absent or blank field still goes to `computeMerged`.
- The full suite passes.

## Finding

### R2-F1: MINOR. The fail-closed half of F1, which the ruling requires, has no test
Evidence: work-record.mjs, in `bothWorktreeLists` (closeout Artifact-repo branch):
`return own === null || foreign === null ? null : [...own, ...foreign];`

I replaced this with a fail-open version, `return own === null ? null : [...own, ...(foreign ?? [])];`. The whole closeout file still passes, 73/73.

ruling-r1.md says "F1 and F3 fail closed: when the artifact repo's worktrees cannot be listed, the scratch step refuses". Nothing checks that today. F3's fail-closed half does have a test.

Patch for scripts/work-record-closeout.test.mjs. Insert it right after the F1 test's closing lines.

Current:
```js
  assert.equal(fs.existsSync(wtDir), true, "repo B's linked worktree, and its uncommitted work, must survive");
});
```
Replacement:
```js
  assert.equal(fs.existsSync(wtDir), true, "repo B's linked worktree, and its uncommitted work, must survive");
});

// F1, fail-closed half (ruling-r1.md): when Artifact-repo:'s own worktree list cannot be read, the
// scratch step refuses - it never falls back to repoRoot's list alone.
test("closeoutRecord: F1 - an unreadable Artifact-repo: worktree list refuses the scratch step, never removes", () => {
  const env = fixtureEnv();
  const { repo: repoA } = buildRepo(env);
  const { repo: repoB } = buildRepo(env);
  const repoBPosix = repoB.split(path.sep).join("/");
  const bTip = git(["rev-parse", "main"], repoB, env).trim();
  const { scratchPath, by } = mkScratchFixture();
  const recordRel = writeClosedRecord(repoA, {
    work: "wr-2026-09-30-artifact-repo-f1-fail-closed",
    worktree: "main",
    artifact: `territory/a@${bTip}`,
    leadSession: by,
    scratch: scratchPath,
    extra: { "Artifact-repo": repoBPosix },
  });
  const listWorktreesImpl = (root) => (path.resolve(root) === path.resolve(repoB) ? null : []);
  const result = closeoutRecord({ repoRoot: repoA, recordPath: recordRel, closeoutBy: by, listWorktreesImpl });
  const steps = stepsOf(result);
  assert.match(steps.worktree.detail, /artifact-repo: cleanup is manual/); // merge proof passed
  assert.equal(steps.scratch.result, "refused");
  assert.match(steps.scratch.detail, /could not read git worktree list/);
  assert.equal(fs.existsSync(scratchPath), true, "the scratch directory must survive");
});
```
Tried in the scratch clone (/var/tmp/delegation-l60brv-5kzF/addtest-r2.mjs):
- green against cf8f5fc;
- red against the fail-open mutant;
- red when F1 is fully reverted.

No production code change is needed.

## Notes (not findings)
- **Windows symlink.** The F4/M3 test calls `fs.symlinkSync(f.repo, symlinkDir, "dir")` at work-record.test.mjs:1427 without a win32 EPERM guard. Other tests do guard it, for example work-record.test.mjs:1007–1012. The Windows gate passed with the unguarded P6 symlink test at work-record-closeout.test.mjs:1661, so that host allows symlinks. The lead's Windows rerun will confirm this one.
- **Blank four-read field.** A whitespace-only `Artifact-repo:` line now makes four-read show number 3 as `unavailable (no range)`, where work-record treats the blank field as absent. This fails closed: a gap is shown as unknown, never as a confident value.

## C4 fields
Cause: the F1 fail-closed branch (`foreign === null` gives `null`) is correct, but no test pins it, so a later refactor could make it fail open without any test noticing.
Discriminating check: the proposed test passes on cf8f5fc and fails on the mutant `own === null ? null : [...own, ...(foreign ?? [])]`. I ran both.
Fix location: scripts/work-record-closeout.test.mjs, after the "F1 - the scratch step also sees Artifact-repo:'s own worktrees" test.
Simplification: one test that reuses existing fixtures and the existing `listWorktreesImpl` injection seam. No code change.
