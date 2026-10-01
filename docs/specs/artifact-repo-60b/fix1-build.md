DONE cf8f5fc55a601f25774526a75c473cb6b9fc079e

# Lane 60b fix round 1: review findings F1-F5

Serves GOAL's "work lost or stalled" measure (the same territory as the original build); nearest
NOT avoided: no new mechanism added, every patch reuses an existing guard (F1 feeds the existing
worktree-list guard two lists instead of one; F2/F3 add one `rev-parse --is-inside-work-tree` call
and drop a `!== null` short-circuit; F5 mirrors validateRecord's own absolute-path rule).

## What was applied
All five findings from `docs/specs/artifact-repo-60b/review.md`, adopted in full per
`ruling-r1.md`. Every patch the review gave was applied verbatim.

- **F1 (MAJOR)** — `scripts/work-record.mjs`, the `closeoutRecord` Artifact-repo cleanup branch:
  the scratch step's `removeScratchDirectory` call now receives `listWorktreesImpl: bothWorktreeLists`,
  a wrapper that unions `listWorktreesImpl(repoRoot)` with `listWorktreesImpl(mergeProofRoot)` (or
  `null` if either fails) — so a scratch directory that contains or lies inside one of
  Artifact-repo:'s own worktrees is refused, not silently removed alongside them.
- **F2 (MEDIUM) + F3 (MINOR)**, combined patch — `scripts/work-record.mjs`, `checkAcceptance`'s
  Artifact-repo block: a new `git -C <Artifact-repo> rev-parse --is-inside-work-tree` check refuses
  a bare repository or a `.git` directory with `sha-not-in-git` (F2); and an unreadable `--repo`
  common dir now throws `artifact-repo-same` outright instead of the old `!== null &&` short-circuit
  that let it silently pass as "assume different" (F3, fails closed).
- **F4 (MEDIUM)** — no code patch (the finding was a test-coverage gap in already-correct code);
  added the four tests the review itself specified (mutants M9, M10, M3, M4).
- **F5 (LOW)** — `scripts/four-read.mjs` (`main`'s `numberThree` call site) and
  `scripts/collect-from-origin.mjs` (`computeMergedInArtifactRepo`): a relative `Artifact-repo:`
  now renders as `unavailable (no range)` / `merged: null` instead of ever running git against
  `process.cwd()`.

## Files changed
- `scripts/work-record.mjs` — F1, F2+F3 patches.
- `scripts/four-read.mjs`, `scripts/collect-from-origin.mjs` — F5 patch.
- `scripts/work-record.test.mjs` — F2 test (bare Artifact-repo: refuses sha-not-in-git), F3 test
  (non-git --repo refuses artifact-repo-same), and F4's two work-record-side tests (M3: symlink and
  linked-worktree spellings of --repo both refuse artifact-repo-same; M4: a branch-named Worktree:
  resolves inside Artifact-repo:, proven by moving repo A's own HEAD past the artifact sha).
- `scripts/work-record-closeout.test.mjs` — F1 test (a repo-B linked worktree registered inside the
  Scratch: directory is refused, not removed; the worktree and its uncommitted file survive) and
  F4's two closeout-side tests (a stale local `origin/main` in Artifact-repo: is seen past by a real
  fetch there; a fetch failure inside Artifact-repo: refuses every step UNVERIFIABLE).
- `scripts/four-read.test.mjs` — F5 test (a relative Artifact-repo: renders "unavailable (no
  range)", using a real but unrelated `--git` repo to rule out an accidental fallback match).
- `scripts/collect-from-origin.test.mjs` — F5 test (a relative Artifact-repo: renders `merged:
  null` even when, via a controlled `process.chdir()`, that relative path happens to resolve to a
  real, matching repo that would otherwise answer `merged: true` — a nonexistent relative path
  would have failed closed anyway and proven nothing about the guard itself).
- `docs/work/` was not touched.

## How red was proven on 08dbe6f14b6bd930d9d31712460c365145bfceee (the pre-review commit)
Built a scratch tree under `/var/tmp/delegation-l60b-fix1-qFyF/red-check/tree` as a full copy of
the worktree (its own `.git` included), then `git checkout 08dbe6f -- scripts/work-record.mjs
scripts/four-read.mjs scripts/collect-from-origin.mjs` to put back the pre-review source, while
copying the four NEW test files (`work-record.test.mjs`, `work-record-closeout.test.mjs`,
`four-read.test.mjs`, `collect-from-origin.test.mjs`) from this round's fixed tree on top. `diff`
against the fixed source confirmed exactly the intended patches were reverted (F1's
`bothWorktreeLists`, F2/F3's `is-inside-work-tree` check and the `repoCommonDir === null` throw,
F5's absolute-path guards in both files) and nothing else. `node --check` passed on all three
reverted files. Ran each affected file with `TMPDIR=/var/tmp node --test <file>` against that tree:

- `work-record.test.mjs`: 254/256 pass, 2 fail — exactly the F2 and F3 tests (`checkAcceptance: F2
  - a bare Artifact-repo: ... refuses sha-not-in-git`, `checkAcceptance: F3 - a --repo that is not
  itself a git repository refuses artifact-repo-same, never accepts`). The F4/M3 and F4/M4 tests
  passed unchanged, as expected — they cover pre-existing (already-correct, not patched this round)
  behavior, so they pass on both sides.
- `work-record-closeout.test.mjs`: 72/73 pass, 1 fail — exactly the F1 test (`closeoutRecord: F1 -
  the scratch step also sees Artifact-repo:'s own worktrees...`). Both F4 tests (stale-ref,
  fetch-failure) passed unchanged, same reasoning as above.
- `four-read.test.mjs`: 115/116 pass, 1 fail — exactly the F5 test (`main: a relative
  Artifact-repo: never resolves against process.cwd()...`).
- `collect-from-origin.test.mjs`: 25/26 pass, 1 fail — exactly the F5 test (`Artifact-repo: a
  relative value renders merged as unknown (null)...`). The first version of this test (a bare
  nonexistent relative path) passed even on 08dbe6f, since a nonexistent target fails closed
  regardless of the missing absolute-path guard; it was rewritten to build a REAL repo at a path
  the relative value resolves to (via `process.chdir()`), which only then genuinely distinguished
  the guard's presence from its absence.

After restoring the fixed source, all 4 files pass in full (256/256, 73/73, 116/116, 26/26 —
matching the counts in the full-suite roll-up below).

## F1 and F3 fail closed, as the ruling requires
- F1: when either the repo's own or Artifact-repo:'s `git worktree list` cannot be read,
  `bothWorktreeLists` returns `null` (not a partial list), and `removeScratchDirectory` already
  treats a `null` worktree list as "could not read git worktree list" — refused, never removed.
- F3: when `--repo`'s own common dir cannot be resolved (`gitCommonDirReal` returns `null`),
  `checkAcceptance` now throws `artifact-repo-same` outright rather than falling through to
  "assume different and accept" — confirmed by the new F3 test.

## Gate: full suite
`TMPDIR=/var/tmp node scripts/run-tests.mjs`
```
tests 3146
suites 0
pass 3141
fail 0
cancelled 0
skipped 5
todo 0
leak check: 0 new temp entries
```
0 fail (3132 -> 3141 pass; 9 new tests added across the four files, all green).

## Deviations / assumptions
- F4 and F5's test-writing followed the review's own recipes as closely as possible; the
  collect-from-origin F5 test needed a `process.chdir()` around the call (not in the review's own
  text) because a naive nonexistent-relative-path probe passes on both sides of the patch and
  proves nothing — flagging this in case the lead wants a different proof shape.
- No git identity was set anywhere; all fixture commits reuse the existing `childEnv()`/`fixtureEnv()`
  helpers each test file already had.
- Scratch used: `/var/tmp/delegation-l60b-fix1-qFyF/` (mktemp'd under `/var/tmp`), left in place per
  "delete nothing" — it is a harmless full-tree copy outside the repo. Test fixtures inside it (and
  inside the real test runs) use `fs.rmSync` on their own throwaway fixture directories in the same
  way the pre-existing test files in this project already do (e.g. removing a `.git` directory to
  simulate a non-git repo, or a linked worktree's directory as part of exercising the removal
  guard) — this is Node's `fs` API acting on disposable git/scratch fixtures the test itself just
  created, not a shell `rm`/`git clean` on real work.
- One command was refused during this round, from the previous build session and reported already
  (an `rm -f` on a stray `/tmp` file); nothing new was denied this round.

## Commit and push
Commit `cf8f5fc55a601f25774526a75c473cb6b9fc079e` on `build/artifact-repo-60b-1`:
`fix(work-record): lane 60b review findings`
Pushed to `origin build/artifact-repo-60b-1` (fast-forward from `3f2f427`).

## Cleanup
No dev server or background process was started. No PID needed to be killed. Scratch directories
(`/var/tmp/delegation-l60b-fix1-qFyF/`, `/var/tmp/delegation-l60b-Sq6m/` from the prior round, and
the stray `/tmp/old-work-record.mjs`) were left in place per "delete nothing."
