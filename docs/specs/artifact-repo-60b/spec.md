# Lane 60b: a work record whose artifact lives in another git repository

## Why
Lane 60's reviewed artifact is a dotfiles commit (ba98516), while its record, specs and evidence sit in the plugin repo. `work-record.mjs accept` resolves `Artifact:` only in `--repo`, so it refuses with `sha-not-in-git`. Pinned mode's ancestry check deliberately refuses an artifact from "a wholly unrelated repository" when nothing names that repository. Today, then, no honest path exists to accept cross-repo work.

Measure moved: work lost or stalled. Any lane whose code lives outside the plugin repo, which today means dotfiles, sits at reviewed with no route to accepted.

## Design: one explicit field
- **New optional header field `Artifact-repo:`**, placed before `Worktree:`. It is an absolute path to a directory inside a git worktree of the repository that holds `Artifact:`.
  - When it is absent, behavior is byte-for-byte unchanged, and every existing test stays green.
  - When it is present, it must be absolute. It must not resolve to the same repository as `--repo`: compare `git rev-parse --git-common-dir` realpaths, and refuse `artifact-repo-same` when they match. The field is for cross-repo work only.
  - It is named explicitly, so the "unrelated repository" guard still holds for every record that does not name one.
- **accept and check-acceptance.** When `Artifact-repo:` is present, the following resolve with `git -C <Artifact-repo>` instead of `repoRoot`:
  - `Artifact:`;
  - `--pinned-artifact` or `--delivery-ref`;
  - the `Worktree:` field. `Worktree:` must then be an absolute directory, or a branch name, in that repo.
  The record, the evidence, the census and the four-read stay confined to `--repo`, as today. A missing or unreadable `Artifact-repo:` directory fails closed with `sha-not-in-git`. Reuse `withoutRepoLocatingGitEnv`.
- **close --merge and the cleanup merge proof.** The artifact's ancestry is checked against `origin/main` of the `Artifact-repo:` repository, after a `git fetch origin` there. A fetch failure is `UNVERIFIABLE`, as today.
  - The record's own `--merge <sha>` is the plugin-repo merge commit. It stays checked in `--repo`, unchanged.
  - Cleanup steps must never delete branches or worktrees in the `Artifact-repo:` repository. Refuse those steps with a stated reason, `artifact-repo: cleanup is manual`.
- **four-read.mjs and collect-from-origin.mjs.** Wherever they turn `Artifact:` into a sha that they then look up in git, they use `Artifact-repo:` when it is present. Where a lookup is only informational, a missing object must render as unknown, never as a confident value.
- **validateRecord.** Parse the field. Add a finding `artifact-repo-not-absolute` when it is present and not absolute.
- **Docs.** In docs/work-record.md, add one row to the field table and one short subsection, "Artifacts in another repository", describing only the behavior above.

## Territory (one builder)
- scripts/work-record.mjs and its tests
- scripts/four-read.mjs and its tests
- scripts/collect-from-origin.mjs and its tests
- docs/work-record.md

## Tests (each must be red on a57e2ff and green after)
1. Accept succeeds for a record in repo A whose Artifact, Worktree and `Artifact-repo:` name a commit in repo B. Use temporary repos made with `mktemp -d` under /var/tmp.
2. The same record without `Artifact-repo:` still refuses with `sha-not-in-git`. This test is not new red; it guards against regression.
3. An `Artifact-repo:` that points at repo A itself refuses with `artifact-repo-same`.
4. A relative `Artifact-repo:` refuses.
5. A missing `Artifact-repo:` directory refuses with `sha-not-in-git`.
6. Pinned mode refuses an artifact that is not an ancestor of the named Worktree in repo B.
7. close with `Artifact-repo:` checks ancestry against repo B's origin/main, and refuses when the artifact is not merged there.
8. Cleanup never touches repo B.
9. The full suite passes: `TMPDIR=/var/tmp node scripts/run-tests.mjs`, 0 fail.
