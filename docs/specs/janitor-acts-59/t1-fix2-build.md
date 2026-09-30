DONE 3c555f26c55051b9ca29bcffb90a9fea547b13c6

# Lane 59 T1 fix round 2: reclaim and path-safety

Territory: scripts/reclaim.mjs + scripts/reclaim.test.mjs only. path-safety.mjs and
work-record.mjs were not touched this round (t1-review-r2.md's 5 findings are all in
reclaim.mjs/reclaim.test.mjs).

GOAL served: "work lost or stalled" (the re-review found the upward containment walk still let
a plain repo's own checkout, and a bare repo backing live worktrees, fall through to a bare fs
delete). Nearest NOT: "a symptom fix" - HIGH 1 and HIGH 2 are fixed at their root cause (the walk
recognising git repositories only by the `.git` basename, and only refusing when it also found
OTHER linked worktrees), not by patching around the specific probes that found them.

Base: c12e190a9519186f5d5254726138099409b0497c (T1 round 0). Prior fix-round-1 commit:
cb5cda0caa87774186715984fd18e187bf28b198 (NEEDS_FIXES, 5 findings, docs/specs/janitor-acts-59/t1-review-r2.md).
Final commit: 3c555f26c55051b9ca29bcffb90a9fea547b13c6.

## Gate results
- Territory: `TMPDIR=/var/tmp node --test scripts/path-safety.test.mjs scripts/reclaim.test.mjs
  scripts/work-record.test.mjs scripts/work-record-closeout.test.mjs` -> 400 tests, 399 pass,
  0 fail, 1 skipped (the new Windows-only junction test, skipped on this Linux host with a
  stated reason).
- Full suite: `TMPDIR=/var/tmp node scripts/run-tests.mjs` -> 3190 tests, 3183 pass, 0 fail,
  6 skipped, 1 todo, exit 0. Leak check: 0 new temp entries. Log at
  /var/tmp/lane-59/t1-fix2-fullsuite.log.

## Per-finding table

| # | Fix | Test(s) | Red before (cb5cda0) | Green after |
|---|-----|---------|----|----|
| HIGH 1 | `checkAncestorsForGit` no longer distinguishes "a checkout with OTHER linked worktrees" from "is just a checkout" - it refuses on ANY `.git` entry above the target (`lies inside a git checkout at <dir>` for a directory, `lies inside a linked worktree at <dir>` for a file). The dead `listWorktrees`-based "path in git worktree list" branch is deleted (it was unreachable dead weight per the review's own simplification note, and its `null` case failed open). | 3 new tests: a plain repo's checkout inside a T dir (`src`, `src/new.txt`, `.git/objects` all refused), the T top itself being the repo (P2b), and a repo whose `.git/worktrees/` is empty after a worktree was removed (P2c) | yes, all 3 | yes |
| HIGH 2 | New `looksLikeGitDir(dir, fsImpl)` matches git's own directory shape (`HEAD` a file, `objects/` and `refs/` both directories) - applied to the downward walk (a bare repo anywhere below a T/S target is now recognised the same as a `.git` dir) and to the upward ancestor walk (`lies inside a git directory at <dir>` when an ancestor - not named `.git`, since that name already gets its own, more specific message one level up - has this shape). Any lstat error other than ENOENT/ENOTDIR refuses (ruling r1/r2: an incomplete check refuses). | 2 new tests: a bare `b.git` clone inside a T dir, with a linked worktree elsewhere holding an unpushed commit (the T top and `b.git/objects` are both refused); a plain `delegation-*` dir containing a mere file literally named `HEAD` (no `objects`/`refs`) stays removable, proving the shape test doesn't over-fire | yes (bare-repo test); the negative-control test passes on old code too, as expected (old code never removed such a dir either, for an unrelated reason - it isn't S/T-shaped-invalid, this is a regression guard for the new shape check itself) | yes |
| MEDIUM 3 (re-review) | The `..`-prefix twin of LOW 12, in two places: `checkMountsUnderClassRoot`'s `withinOrEqual` (a same-filesystem bind mount at `<top>/..m` was misread as escaping `<top>` and so ignored), and F8's cwd-containment check (`pathWithin(ctx.cwd, resolved)` from janitor.mjs, which has the identical defect - a cwd of `<top>/..work` was misread as escaping `<top>`). A shared `escapesUp(rel)` helper fixes the first; a new local `within(child, parent, ctx)` - reclaim's own copy of `pathWithin`'s realpath + win32-case-fold logic, with the corrected escape test - replaces the F8 call site only. | 2 new tests: an injected-mountinfo bind mount at `<top>/..m` (refused, `crosses a mount point`); a cwd of `<top>/..work` targeting `<top>` (refused, `equals process.cwd() or contains it`) | yes, both | yes |
| MEDIUM 4 | 5 named mutations from the prior round's own proof set, each shown red and reverted (see Mutation proofs below); the underlying HIGH2 st_dev baseline, the "lies under a bind mount" branch, the walk's readdir fail-closed path, and the partial-W print line were all already correct at cb5cda0 - only their mutation-proof was missing. A new `ctx.applySafeImpl` injection point (defaulting to the real `applySafe`) was added so the partial-W print line's own test does not depend on forcing a real git failure. | 5 new/strengthened tests: the HIGH2 class-root-baseline test now fakes `st_dev` for `top` AND every descendant (not just `top`) and forces an empty mount table, so M5b (reverting the baseDev fix) turns red; `H1d` forces an EACCES on an ancestor's `.git` lstat; `H2c` targets a subpath under a mount registered on its ANCESTOR (the existing test only ever hit the equal/contains branches); `L11` forces an EACCES on `readdirSync` (the existing LOW11 test only ever forced `lstatSync` to fail); `M5c` stubs `ctx.applySafeImpl` to return a `partial: true` row directly | all 5 confirmed red under their named mutation (see below); none behaviorally red on cb5cda0 except M5c (which needed the new `applySafeImpl` seam to exist at all) | yes |
| LOW 5 | A Windows-only junction-gate test (`mklink /J` from inside a T dir to a sentinel; asserts either the whole T removal is refused, or only the junction link is removed and the sentinel's own contents survive), skipped everywhere but a real win32 host, with the skip reason stated in the test itself. | 1 new test, `skip: "no win32 host is available..."` on this Linux host | n/a - deferred, not measured here (documented, see Deviations) | n/a |

## Mutation proofs (MEDIUM 4)
Each mutation was applied directly to the committed `scripts/reclaim.mjs` (copy saved first as
`/var/tmp/delegation-l59t1f2-mut/reclaim.good.mjs`), the named test run to confirm red, then the
file restored from that saved copy and `diff` confirmed byte-identical before the next mutation:
- **M5b**: `baseDev = fsImpl.lstatSync(classRoot).dev;` -> `baseDev = fsImpl.lstatSync(target).dev;`
  (reverting HIGH 2's own class-root baseline fix). The strengthened "class-root st_dev baseline"
  test goes from pass to `0 !== 3` (nothing refused).
- **H1d**: the ancestor `.git` lstat's error-refusal condition wrapped in `false &&`. The new H1d
  test goes from pass to `0 !== 3`.
- **H2c**: `if (withinOrEqual(real, resolved))` (the "lies under a bind mount" branch) wrapped in
  `false &&`. The new H2c test goes from pass to `0 !== 3`.
- **L11**: the walk's `readdirSync` failure path's `throw new WalkRefusal(...)` replaced with a
  bare `return;` (fail open). The new L11 test goes from pass to `0 !== 3`.
- **M5c**: the `if (row && row.partial)` print-guard wrapped in `false &&`. The new M5c test goes
  from pass to an assertion error (`c.lines[0]` is `undefined` - nothing was printed).

## Deviations / assumptions
- LOW 5's junction test is written and wired to run for real on a win32 host (`mklink /J`,
  asserting the sentinel's contents survive either way reclaim resolves it), but it is UNMEASURED
  here - no win32 host is available in this environment. It is recorded as a Windows gate item
  both in the test's own skip reason and here, per the re-review's second option.
- `checkAncestorsForGit`'s bare-repo shape check is skipped when `path.basename(dir) === ".git"`:
  an ordinary `.git` metadata directory satisfies the exact same HEAD/objects/refs shape a bare
  repo does (they have identical internal structure), so without this exclusion a target inside a
  checkout's own `.git` (e.g. `.git/objects`) would be reported as "lies inside a git directory"
  at the `.git` dir itself, rather than "lies inside a git checkout" at the checkout root one level
  up - both refuse (exit 3), this only affects which ancestor and which wording is named in the
  refusal reason.
- Added `ctx.applySafeImpl` (defaulting to the real `applySafe` from janitor.mjs) purely for M5c's
  testability, mirroring the existing `idleHoursImpl`/`execFileSyncImpl`/`switchedOffImpl` pattern.
  Both call sites (branch-delete and worktree-remove) now go through it; production behavior is
  unchanged since the default is the real function.
- No new seam note for T2 this round: MEDIUM 3's F8 fix is fully self-contained in reclaim.mjs
  (a local `within()` helper), so janitor.mjs was not touched. Round 1's seam note about
  `pathWithin`'s own `..`-prefix defect (used by `closeoutWorktree` and reclaim's own
  `samePathResolved` for W matching) is unaffected by this round and stays open for a T2-owned
  round.

## Scratch left in place (nothing deleted)
- /var/tmp/delegation-l59t1f2-mut/ - mutation-proof scratch: `reclaim.good.mjs` (pristine, saved
  before every mutation), `reclaim.cb5cda0.mjs` (the pre-fix-round-2 baseline, extracted via
  `git show cb5cda0:scripts/reclaim.mjs`, used to confirm each new test's red-before status),
  `reclaim.current-fixed.mjs` (the final fixed file, saved before swapping in cb5cda0's copy for
  the red-before run), `backup-before-M5b.mjs`, `old-run.log` (the full reclaim.test.mjs run
  against cb5cda0's code, showing exactly which new tests fail and why).
- /var/tmp/lane-59/t1-fix2-fullsuite.log - the full-suite run's output.
- All scratch from fix round 1 (/var/tmp/delegation-l59t1f-*) remains in place, untouched, as
  reported in t1-fix1-report.md.

No file outside scripts/reclaim.mjs and scripts/reclaim.test.mjs was edited. No real host path,
worktree, branch, or settings file was ever a removal target - every test runs against fixtures
under its own mkdtemp (mostly under `TMPDIR=/var/tmp`), and the mutation-proof runs above only
ever mutated scratch/working copies of reclaim.mjs itself, restored and diff-verified after each.
