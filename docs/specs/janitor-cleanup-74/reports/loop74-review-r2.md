VERDICT: APPROVE 59301137a47486909693197e6ace2e11284a4530

# loop74 review, round 2 (delta re-review)

Worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-janitor-cleanup-74-loop74. Branch: build/janitor-cleanup-74-loop74. HEAD is 59301137a47486909693197e6ace2e11284a4530; I ran `git rev-parse HEAD` myself. I reviewed the range 64227d75..HEAD: 4 commits, 10 files, +257/-33. I read the diff itself, not the builder's report.

Result: all five prior findings that were the builder's to fix are fixed: F1 (BLOCKER), F2 (MAJOR), F3, F5 and F6. I found no regressions and no new findings. F4 is still open, as expected, because it is the lead's ruling (details below). I do not count it.

## Gate re-run (mine)
I ran the brief's 15 gate files, plus phase-commit.test.mjs, closeout-territories.test.mjs, collect-status, four-read and build-census. Log: scratchpad/gate-r2.log.
- Result: 1402 tests, 1395 pass, 2 fail, 5 skipped.
- Both failures are in `scripts/work-record-closeout.test.mjs` (l.373 and l.922). That file has not changed since base 6b302f93. Both are the same fixed-name temp-dir collisions round 1 reported: `closeout-test-by-9/.../repoB-linked-wt already exists` and `EEXIST closeout-test-by-reporoot-33\repo`. They come from a concurrent run of the same file, not from this territory.
- I re-ran `work-record-closeout.test.mjs` and `closeout-territories.test.mjs` on their own: 84/84 pass.

## Prior findings: verification

### F1 (BLOCKER): FIXED, and the tests catch a regression
- `build-loop-workflow.js:464-466` adds `adoptCommit`. All six call sites now assign its result back:
  - territory, Build and its respawn: l.916 and l.920
  - territory, Fix and its respawn: l.965 and l.969
  - seam-fix and its respawn: l.1133 and l.1137
- `adoptCommit` takes the runner's sha only when `committed === true` and the sha is 7 to 40 hex characters. A null build (dead builder) stays null, so the respawn logic is unchanged. A runner that is refused, dead or reports a clean tree leaves the builder's own sha in place.
- If a runner claims a commit with a false sha, the reviewer's real HEAD will not match it, so the territory ends BLOCKED `review-sha-mismatch`. That is the safe outcome.
- New tests (l.2699-2741) cover the territory APPROVE at the commit sha, a refused or clean commit keeping the builder's sha, and the seam re-review APPROVE at the seam-fix commit sha. The stale `aaaaaaa1` reviewer sha in the item-1 test is now the 40-character commit sha.
- Mutation check: on a scratch copy I replaced `adoptCommit`'s body with `return b`. Three tests failed: the item-1 commit-runner test and both F1 "moves HEAD" tests. I discarded the copy; the reviewed tree was not touched.

### F2 (MAJOR): FIXED
- `phase-commit.mjs:65-75` now checks two things:
  - `--show-toplevel` must equal the given path after `normPath` (resolve, then `realpathSync.native`, then lowercase on win32). Otherwise it returns `not-worktree-root`.
  - If `--git-dir` equals `--git-common-dir`, it returns `main-checkout`.
- `phaseCommitPrompt` (l.457) lists both reasons as answers.
- The test fixtures are now linked worktrees. A new test (phase-commit.test.mjs:205-237) covers four cases:
  - a subdirectory of a main checkout returns `not-worktree-root`
  - a main checkout on `build/x-t1` returns `main-checkout`
  - in both cases HEAD does not move and the two untracked files stay untracked
  - a subdirectory of a linked worktree is refused, and the linked worktree's root commits
- My live check used a scratch orphan linked worktree, with no commit needed:
  - The path was given uppercased, with a trailing `\` and a space (`TERR ONE\`). The root check passed and returned `clean`, exit 0. So the root check does not wrongly refuse a valid territory on Windows.
  - The base repo returned `main-checkout`, exit 3.
- The no-identity test now points `GIT_CONFIG_GLOBAL` at an empty file on the same linked fixture, and still asserts `no-identity` with the files left in place.

### F3: FIXED
- `work-record.mjs:2381-2391`: `loopStateTerritoryBranches` reads `setup.territories[].branch`. The real file `docs/work/wr-2026-10-02-janitor-cleanup.loop-state.json` has exactly that shape and names `build/janitor-cleanup-74-janitor74` and `-loop74`.
- When the list exists, it is used as an exact allow-list on top of the existing prefix and id filter (l.2404-2407).
- When it is missing, a branch's tip must be an ancestor of the lane's Artifact sha, or the branch is refused with `not part of this lane` (l.2426-2434). No Artifact sha also means a refusal, which is the safe direction.
- `laneArtifactSha` is set only after `resolveCommit` succeeds (l.2555). Step 4b runs only in the branch with no blockedReason and no artifact-repo, so `laneArtifactSha` is always set when 4b runs.
- Two new tests:
  - a `build/lane-a-v2` cut and merged to main but not into the lane is refused, and its worktree and branch are kept
  - a loop-state that lists only t1 and t4 means t2 is never considered
- The fixtures now merge territories into the lane branch. A squash-merged lane would fail the ancestry fallback and leave its territories in place. That loses no work.

### F5: FIXED
- `transport.mjs:867-870` adds `agentsHomeOf`, which uses `path.resolve(AGENTS_HOME)` and otherwise `<home>/.agents`. That matches `decisions-pickup.mjs` `agentsHome()`, which also uses `path.resolve`.
- `resolveDetailsPath` and `packetPathFor` both use it. `note-inbox` (l.258 and l.354) and `note-send` (l.733 and l.756-757) pass `env`.
- Test: note-send.test.mjs "lane 74 F5".
- `rg` finds no other reader of `.agents/notes/packets`. The decisions-pickup verification already resolved against AGENTS_HOME.

### F6: FIXED
- `transport.mjs:888` returns null for any Details with a `..` segment. Backslash is outside the Details charset (`envelope.mjs` DETAILS_RE and ENVELOPE_RE), so no `..\` variant exists.
- note-inbox then reports `exists: null` and the raw Details, with no HOME path.
- Test: note-send.test.mjs "lane 74 F6".
- Residual risk, not a finding: the legacy repo-relative loop in `note-inbox.mjs:358-362` still joins `docs/notes/..` without checking for `..`. That was already true at base and is anchored at the repo, not at HOME. Round 1 called it out of scope.

### F4: OPEN, the lead's ruling (not counted)
The ledger still uses `.git/info/exclude`. That is a third option, beside the two spec item 5 names (tracked, or moved out). Round 2 did not change it, as the builder's report says. The lead must accept that option or require one of the spec's two.

## Regression hunt (all clear)
- Round 2 touched no janitor file, hooks.json, codex-hooks.json, agent safety block or `decisions/*` (the diff stat for those paths is empty).
- No existing return field or blocker name changed meaning. `build.sha` still means the HEAD the reviewer must match.
- The 129 base build-loop assertions are unchanged and green.
- `closeoutTerritories`' new parameters default to `null`, so existing callers and tests behave as before. `--by` gating comes before every step and is unchanged.
- Still true from round 1, now that F1 makes seam-fix commits real: the seam-fix phase commit runs `git add -A` on the integration worktree. It therefore sweeps the lead's untracked briefs, reports, loop-state.json and any uncommitted record edit into a `chore(seam)` commit. For the lead, not counted.

## Denied command (reported verbatim, not retried another way)
My first attempt at a live phase-commit fixture set commit-identity env vars, and the PreToolUse hook blocked it: "PreToolUse:Bash hook error: [C:/Users/benzh/.claude/hooks/git-identity-guard.sh]: GIT-IDENTITY-GUARD: blocked — command assigns GIT_AUTHOR_* / GIT_COMMITTER_*". I dropped that step. The orphan-worktree check under F2 needed no commit and no identity, and it covers the path-normalisation question the blocked step was meant to answer.
