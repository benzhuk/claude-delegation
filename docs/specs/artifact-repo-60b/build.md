DONE 08dbe6f14b6bd930d9d31712460c365145bfceee

# Lane 60b build report: Artifact-repo:

## Territory and files changed
- `scripts/work-record.mjs` — new `Artifact-repo:` field (OPTIONAL_FIELDS, FIELD_LABELS), `validateRecord`
  finding `artifact-repo-not-absolute`, `gitCommonDirReal` helper (used to detect "same repository" via
  realpath'd `git rev-parse --git-common-dir`, through `withoutRepoLocatingGitEnv`), `checkAcceptance`
  resolving `Artifact:`, `--pinned-artifact`/`--delivery-ref`, `Worktree:`, and the evidence VERDICT sha
  against `Artifact-repo:` (`artifactRoot`) when present, and `closeoutRecord`'s merge-proof fetch/ancestry
  check running against `Artifact-repo:` (`mergeProofRoot`), with a new manual-refusal branch so cleanup
  never deletes a worktree, local branch, or origin branch inside `Artifact-repo:` (only the scratch
  directory step still runs).
- `scripts/work-record.test.mjs` — FINDING_CODES count updated (16 -> 17), a new
  `artifact-repo-not-absolute` validateRecord test, an `makeArtifactRepoFixture` helper, and 6
  `checkAcceptance` tests (spec items 1-6).
- `scripts/work-record-closeout.test.mjs` — 2 tests (spec items 7-8): merge proof against repo B's
  origin/main, and cleanup refusing worktree/branch/origin-branch as manual while repo B's branch and
  origin ref are verified untouched.
- `scripts/four-read.mjs` — `parseRecordText` reads `Artifact-repo:`; `computeReworkAfterAcceptance` is
  called with `fields['artifact-repo'] || opts.git` so rework-after-acceptance resolves against the right
  repo.
- `scripts/four-read.test.mjs` — a `parseRecordText` unit test plus an async `main()` integration test
  proving Artifact-repo redirects the lookup to repo B.
- `scripts/collect-from-origin.mjs` — new `computeMergedInArtifactRepo`; `buildRow` uses it when
  `Artifact-repo:` is present, otherwise falls back to the existing `computeMerged` against `--repo`.
- `scripts/collect-from-origin.test.mjs` — a merged-true/merged-false test using two independent
  `initRepoWithOrigin()` repos, plus a missing-Artifact-repo-directory test asserting `merged` renders as
  `null` (unknown), never a false positive/negative.
- `docs/work-record.md` — one row in the Fields table, one row in the Validator table
  (`artifact-repo-not-absolute`), and a new subsection "Artifacts in another repository" describing field
  semantics, accept/check-acceptance scope, close --closeout's merge-proof scope, cleanup's manual
  refusal, and four-read.mjs/collect-from-origin.mjs's informational-lookup behavior.
- `docs/work/` was not touched.

## How red was proven on a57e2ff411c174ef9b6a40e51820602d5a47e7c7
Diffed the working tree against a57e2ff and confirmed only the 4 source/doc files above (plus their test
files) differ; every other dependency the affected tests touch (`transport.mjs`, `test-child-env.mjs`,
`build-census.mjs`, fixtures) is byte-identical at that commit. Built a scratch tree under
`/var/tmp/delegation-l60b-Sq6m/red-check/` combining the a57e2ff (pre-fix) versions of
`work-record.mjs`, `four-read.mjs`, and `collect-from-origin.mjs` with the current (new) test files and a
full copy of `docs/`. Ran each of the 4 affected test files against that tree with
`TMPDIR=/var/tmp node --test <file>`:
- `work-record.test.mjs`: exactly the 7 new/changed assertions failed (FINDING_CODES count,
  `artifact-repo-not-absolute` validateRecord test, and the 5 new `checkAcceptance` tests for spec items
  1, 3, 4, 5, 6 — item 2, the regression guard, passed unchanged as required, i.e. it was correctly "not
  new red").
- `work-record-closeout.test.mjs`: exactly the 2 new tests (spec items 7, 8) failed.
- `four-read.test.mjs`: exactly the 2 new tests failed.
- `collect-from-origin.test.mjs`: exactly the 2 new tests failed.
All other pre-existing tests in each file still passed against the pre-fix source, isolating the failures
to the new behavior. `node --check` also passed on all three pre-fix and post-fix source files, confirming
no syntax regressions from the scratch-tree splice.

After restoring the current (post-fix) source, all 4 files pass in full: 252/252, 70/70, 115/115, 25/25
(exact counts per file as run individually during development; see gate output below for the current
full-suite roll-up).

## Gate: full suite
`TMPDIR=/var/tmp node scripts/run-tests.mjs`
```
tests 3137
suites 0
pass 3132
fail 0
cancelled 0
skipped 5
todo 0
leak check: 0 new temp entries
```
0 fail, confirmed. (5 skipped are pre-existing, unrelated to this lane.)

## Deviations / assumptions
- The spec's bullet list names `Artifact:`, `--pinned-artifact`/`--delivery-ref`, and `Worktree:` as
  resolving via `Artifact-repo:`, while saying "the record, the evidence, the census and the four-read
  stay confined to `--repo`." I read this as: the evidence *file* stays confined to `--repo` (unchanged —
  still read via `readConfinedRegularFile` against `--repo`), but the commit sha embedded in that
  evidence's `VERDICT` line must resolve via `Artifact-repo:` too. Without this, no evidence in `--repo`
  could ever name an APPROVE verdict for an artifact sha that only exists in repo B, making cross-repo
  accept impossible to pass even in the intended case. Test 1 (accept succeeds end-to-end) only passes
  with this reading, so I treated it as required rather than an extension. Flagging it here in case the
  integrator disagrees with the reading.
- `close --merge`'s own ancestry check (the plugin-repo merge commit) was left entirely unchanged, checked
  against `--repo` — confirmed by spec text and by the closeout test that repo B's branch and origin ref
  are untouched after `closeoutRecord`.
- No git identity was set anywhere; test fixtures reuse whatever `childEnv()`/existing helper functions
  already used in `work-record.test.mjs` and `work-record-closeout.test.mjs` for git commits in fixture
  repos.
- Scratch directories used: `/var/tmp/delegation-l60b-Sq6m/` for the red-check tree (left in place per the
  "delete nothing" rule). A stray `/tmp/old-work-record.mjs` file (an earlier `git show` redirect target,
  before I set up the mandated scratch location) was also left in place rather than removed, after an `rm
  -f` on it was blocked by the temp-script hygiene hook; I did not retry or route around the block. Both
  are harmless leftovers outside the repo.

## Commit and push
Commit `08dbe6f14b6bd930d9d31712460c365145bfceee` on `build/artifact-repo-60b-1`:
`feat(work-record): accept an artifact from another repo via Artifact-repo:`
Pushed to `origin build/artifact-repo-60b-1` (fast-forward from `5e3a941`).

## Cleanup
No dev server or background process was started during this build. Scratch directories under
`/var/tmp/delegation-l60b-Sq6m/` and the stray `/tmp/old-work-record.mjs` were left in place per the
"delete nothing" rule; nothing else needed to be killed or reaped.
