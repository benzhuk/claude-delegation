DONE 6ef609a6a45d583356992521deb43b9cdcbc8c4d

# Lane 47 build-r1 report: repo-env-everywhere-1, round 1 fixes

Base for this round: 1b6a5d5 (r0 delivered). Fixes review-r1.md findings F1-F5 per
lead-ruling-r1.md, exactly as ruled — no new behaviour beyond what the ruling specifies.

Commits (1b6a5d5..HEAD):
- 8723c29 docs(F1): correct build.md Part 2 cause and P6->P7 labeling
- c2c4d57 fix(F2): bearingsNotice honours a worktree-keyed receipt too
- 8e89bae test(F3): cover call-site classes (a) and (c) for GIT_DIR isolation
- 6ef609a fix(F4,F5): seal real-git fixtures with childEnv; resolveRealRepo does one git spawn

(a7b4b3a and 8febd55, also on this branch, are the lead/reviewer docs commits already pushed
before this round started; not authored in this round.)

## F1 HIGH: P6's cause was wrong — applied as ruled, no code-behaviour change

The ruling accepted F1 in full: the live miss was skills-fable's stale plugin session
(<=0.20.15, pre-c8c16be) on the PostToolUse `--no-repo` path, not a cwd git could not resolve.
`resolveRealRepo` stays as P7 hardening.

Changes:
- `docs/specs/repo-env-everywhere-1/reports/build.md`: replaced Part 2's Cause/Discriminating
  check/Fix location/Simplification fields verbatim with the reviewer's text (transcript
  9c61c35a evidence, the 0.20.15 vs 0.20.16 `exists:false` vs `exists: checked ? false : null`
  split, c8c16be). Also updated the "Unit test" bullet labels from `L47/P6:` to `L47/P7:` to
  match the renamed tests below (the review's patch instruction named the test file and
  docstring; this label followed for internal consistency, no wording beyond a rename).
- `skills/multi/scripts/note-inbox.mjs`: `resolveRealRepo`'s docstring — old text blamed "the
  hook's cwd for some reason left git unable to answer for it (lane 47, P6 — the false 'not on
  this machine' miss)"; replaced verbatim with the ruling's new text: P7 hardening for "a start
  git cannot place in any repo, e.g. a cwd outside every checkout".
- `skills/multi/scripts/note-inbox.test.mjs`: rewrote the comment above the first P6/P7 test to
  drop the sentence naming the live skills-fable miss (per the patch instruction), and renamed
  both `L47/P6:` test titles to `L47/P7:`.

No production behaviour changed. `note-inbox.test.mjs` still 31/31 pass.

## F2 MEDIUM: applied as patched — worktree-keyed receipt regression fixed, test added

`hooks/lib/goal-context.mjs`'s `bearingsNotice` applied the reviewer's verbatim patch: check
the main checkout first; only if that is not `current` and the resolved repo differs from the
given cwd, fall back to a receipt keyed on the given cwd.

Added `hooks/lib/goal-context.test.mjs`: "bearings receipt completed from a linked worktree
still reads current from that worktree" — `complete({ repo: worktree, ... })`, then
`bearingsNotice(worktree, ...)` must be `null`.

Red/green evidence (mktemp copy, production file reverted, never the worktree):
- Built `git archive 1b6a5d5` into a mktemp dir, copied in the updated
  `goal-context.test.mjs` (goal-context.mjs left at its base/1b6a5d5 state, i.e. NOT yet
  carrying the F2 patch). Ran `node --test hooks/lib/goal-context.test.mjs`:
  ```
  ✖ bearings receipt completed from a linked worktree still reads current from that worktree
    AssertionError: a current worktree-keyed receipt must silence that same worktree's notice
    actual: 'Bearings are due. Run `/delegation:bearings` to assess the current goal and publish the result.'
    expected: null
  ```
  (2 pass, 1 fail — the pre-existing P8 test still passes there.)
- In this worktree (F2 patch applied): `node --test hooks/lib/goal-context.test.mjs` — 3/3
  pass, including both the original P8 test and this new one.

## F3 MEDIUM: both tests added, red on base d6f5c9d, green at the fix

Added exactly the two tests the ruling named, both real two-repo, real-git, lane-44-pattern,
no injected runner:

- **(a)** `scripts/collect-from-origin.test.mjs`: "refExists ignores an inherited GIT_DIR: it
  answers for the repo it was told, never the poisoned one" — repos A and B, `only-in-a`
  branch on A, `GIT_DIR` set on the parent process environment pointed at B (restored in
  `finally`), asserts `refExists(A, 'refs/heads/only-in-a') === true`.
- **(c)** new file `skills/decisions/scripts/decisions-render-core.test.mjs` (did not exist
  before): "defaultExecGit ignores an inherited GIT_DIR: --absolute-git-dir answers for the
  repo it was told, never the poisoned one" — repos A and B, `GIT_DIR` on the parent process
  environment pointed at B, asserts
  `realpath(defaultExecGit(['rev-parse','--absolute-git-dir'], A).trim()) === realpath(A/.git)`.
  Uses `--absolute-git-dir` per the ruling (not `--show-toplevel`, which would not
  discriminate once `GIT_DIR` is set).

Red/green evidence (mktemp copies of base d6f5c9d, production files at base, never the
worktree):
- (a): `git archive d6f5c9d` into a mktemp dir, copied in the updated
  `collect-from-origin.test.mjs`. `node --test scripts/collect-from-origin.test.mjs`:
  ```
  ✖ refExists ignores an inherited GIT_DIR: ...
    AssertionError: Expected values to be strictly equal: false !== true
  ```
  (22 pass, 1 fail.) In this worktree (fix applied): 23/23 pass.
- (c): `git archive d6f5c9d` into a second mktemp dir, copied in the new
  `decisions-render-core.test.mjs`. `node --test skills/decisions/scripts/decisions-render-core.test.mjs`:
  ```
  ✖ defaultExecGit ignores an inherited GIT_DIR: ...
    AssertionError: actual '/tmp/render-core-gitdir-b-.../git' !== expected '/tmp/render-core-gitdir-a-.../.git'
  ```
  (0 pass, 1 fail — answered for repo B, the poisoned GIT_DIR.) In this worktree (fix
  applied): 1/1 pass.

## F4 LOW: applied as patched

`hooks/lib/goal-context.test.mjs`: imported `childEnv` alongside `scratchHome`; added
`const gitEnv = childEnv(os.homedir());` before the first `execFileSync('git', ['init', ...])`
in the P8 test, and appended `{ env: gitEnv }` to each of its five git calls. Applied the same
pattern to the new F2 test above (it copies the identical fixture shape, so it inherited the
same weakness before this patch — not explicitly named in the review's F4 instruction, which
predates the F2 test, but the same class of bug, fixed the same way for consistency).
`skills/multi/scripts/hooks.test.mjs:218`: `execFileSync('git', ['init', '-q', home])` ->
`execFileSync('git', ['init', '-q', home], { env: childEnv(home) })` (`childEnv` already
imported there).

`node --test hooks/lib/goal-context.test.mjs skills/multi/scripts/hooks.test.mjs`: 3 + 30 = 33
tests, all pass.

## F5 LOW: applied as patched

`skills/multi/scripts/note-inbox.mjs`'s `resolveRealRepo` rewritten to the reviewer's verbatim
patch: one `git(['rev-parse', '--git-common-dir'], dir)` spawn, its trimmed result checked for
non-empty, then `mainCheckout(dir, () => common)` reuses that same answer instead of spawning
git a second time. Docstring adjusted to describe the one-spawn behaviour (not verbatim from
the review, which only gave the code patch; wording kept consistent with F1's rewritten
docstring immediately above it).

Ran `node --test skills/multi/scripts/note-inbox.test.mjs` per the ruling's note that "some
fakes count calls": 31/31 pass, no call-count assertion broke.

## Suite totals

Targeted run (all touched/listed test files together, from build.md's own "How to reproduce"
list plus the two new F3 files):
```
ℹ tests 469
ℹ pass 469
ℹ fail 0
```

Full gate — `node scripts/run-tests.mjs > <scratch>/full.txt 2>&1`, exit 0:
```
ℹ tests 2702
ℹ suites 0
ℹ pass 2697
ℹ fail 0
ℹ cancelled 0
ℹ skipped 5
ℹ todo 0
ℹ duration_ms 20578.389882
leak check: 0 new temp entries
```
No H4 note-flush flake observed this run (known flake, not seen this time).

## Denied commands

None. No command was blocked by any guard hook in this round.

## Deviations / assumptions

- Build.md's other P6-labeled prose outside the four named fields (the "Root cause, found by
  reproduction" narrative section and the "Windows repro, before and after" / "P7 outcome"
  sections) was left as-is — the ruling's F1 instruction named specifically the four fields,
  the docstring, and the test file's comment/prefix, not a rewrite of the whole Part 2 section.
  Only the "Unit test" bullet labels were additionally renamed from `L47/P6:` to `L47/P7:`,
  since those are direct references to the renamed tests and would otherwise go stale.
- F4's env-sealing pattern was additionally applied to the new F2 test (not itself named by the
  review, which predates it) for consistency, since it copies the exact same real-git fixture
  shape the review flagged as weakened.
- No dev server or standing process was started or stopped in this round.
- No scratch directories were deleted (per hard rules); left under this lane's scratch dir:
  `f2-red-*`, `f3a-red-*`, `f3c-red-*` (each a `git archive` copy used for one red/green check,
  holding only throwaway fixture repos, no secrets) and `full.txt` (the gate log).

## How to reproduce this report's evidence

```
cd <this worktree>
node --test skills/multi/scripts/transport.test.mjs scripts/test-home.test.mjs \
  skills/multi/scripts/hooks.test.mjs scripts/work-record.test.mjs \
  skills/decisions/scripts/decisions-handback.test.mjs \
  skills/decisions/scripts/decisions-render-core.test.mjs \
  skills/decisions/scripts/goals-mirror.test.mjs \
  skills/multi/scripts/note-inbox.test.mjs hooks/lib/goal-context.test.mjs \
  scripts/collect-from-origin.test.mjs
node scripts/run-tests.mjs
```
