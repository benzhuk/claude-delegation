DONE 3ff71ef1af1c85fef06a1de60a987ce9a0f65b2b

# Lane 46 (test-temp-hygiene): round-1 fix build report

Base for this round: f9cf858 (spec + build.md + review-r1.md + lead-ruling-r1.md, already
on the branch). One commit this round: `3ff71ef`, touching exactly the three files the
ruling authorized: `scripts/run-tests.mjs`, `scripts/run-tests.test.mjs`, `docs/census.md`.
`scripts/test-home.mjs` is untouched (`git diff --stat -- scripts/test-home.mjs` is empty).

Applies `docs/specs/test-temp-hygiene-1/lead-ruling-r1.md` in full: R1, R2, M1, M2, m1, m2,
m3, n2, n3 (n1: no change, as ruled).

Goal-card note: this territory serves "work lost or stalled" (the /tmp-fills-up defect) and
"top-tier tokens per build" is the nearest NOT touched here - this round is a straight review
fix-up, no new mechanism.

## Per-finding: what changed, and the red/green evidence

### R1 - the leak check becomes a reader, not a gate
- Removed the `if (leak.leaked && code === 0) code = 1;` line in `main()` entirely. The
  check still snapshots before/after and prints exactly one `leak check: ...` line (or the
  R2 nested line - see below), but `code` returned from `main()` is now untouched by the
  leak result under every path.
- Flipped the CLI test that pinned the old forced-exit behaviour: "the real CLI's leak
  check line is printed on a planted real leak, but the exit code stays the suite's own
  (R1: the leak check is a reader, not a gate)" now asserts `r.status === 0` (was
  `assert.notEqual(r.status, 0)`) while still asserting the counted line is printed.
  Green: this test passes on the branch after the fix (see the full run below). Since this
  is a flip of an EXISTING assertion rather than a new one, there is no separate "red without
  the fix" demo for R1 itself - the old assertion was inspected directly: it read
  `assert.notEqual(r.status, 0, ...)`, which the new code (code never forced to 1) would now
  fail, so the flip was necessary and is exercised by the same spawn.
- Comment above `LEAK_PREFIX_RE` rewritten to say the check is a reader, name both
  concurrency sources per m4 (a concurrent legacy pre-lane-46 runner, and - the more common
  case - another session running `node --test <file>` directly against a test file that
  mkdtemps without going through the seal, e.g. `four-read.test.mjs`), and say the unit
  tests are the gate for the mechanism, not the printed line on a real run.
- `docs/census.md`'s `leak check:` line rewritten to drop "the run exits 1 even when the
  suite passed" and instead: names the nested-run line, says it never changes the exit
  code, and points at the unit tests as the actual gate.

### R2 - a nested run does not check
- New `nestedRun` computed in `main()`, before the per-run root is even created, as
  `TEST_RUN_ROOT_RE.test(path.basename(os.tmpdir()))` - true exactly when this CLI's own
  `os.tmpdir()` is itself a `delegation-test-run-<pid>-*` directory (i.e. this run's parent
  process is another run's sealed suite that never overrode this inner spawn's TMPDIR).
  When true, both snapshots (`before`/`after`) are skipped (`null`) and the final line is
  the fixed string `leak check: nested run, not checked` instead of `describeLeak(...)`'s
  line.
- New test: "R2: a nested run (this CLI's own os.tmpdir() is itself another run's per-run
  root) prints 'leak check: nested run, not checked' and never snapshots" - spawns the real
  CLI with `TMPDIR`/`TEMP`/`TMP` pointed at a fabricated outer `delegation-test-run-999999-*`
  root (never the real one), asserts the inner suite still passes normally (`status === 0`)
  and that the printed line is exactly the nested line, never the counted form.
- Red without the fix (mktemp copy, see "Revert demonstration" below): with `nestedRun`
  and both `null`-snapshot branches reverted to the always-snapshot original, the same test
  fails - the CLI prints `leak check: 0 new temp entries` instead of the nested line
  (`AssertionError [ERR_ASSERTION]: The input did not match ... /^leak check: nested run, not
  checked$/m`).
- The 2455f1d straggler fix in run-tests.test.mjs (the `--no-sweep` end-to-end test's own
  isolated TMPDIR) is left exactly as it is, per the ruling ("stays, since it is harmless").

### M1 - symlinked temp dir deletes the retained sealed home
- `trimRootExceptHome` now resolves `root` to its realpath once (`fs.realpathSync(root)`,
  falling back to the raw path only if that throws, which the comment notes is
  near-impossible right after a successful `readdirSync`), and compares each entry's full
  path under that realpath, never `path.resolve(path.join(root, name))` against the raw
  `root` spelling. Applied verbatim from review-r1.md's M1 patch.
- New test: "P2: a failing run under a SYMLINKED temp dir still keeps the sealed home
  (POSIX only)" - verbatim from the review's regression test, placed right after the
  existing "P2: a child run killed with SIGTERM leaves no root at all" test.
- Red without the fix (mktemp copy): reverted just the M1 block back to
  `path.resolve(path.join(root, name))` / `path.resolve(keepPath)`; ran
  `node --test --test-name-pattern="SYMLINKED" scripts/run-tests.test.mjs` in the copy - it
  fails: `AssertionError [ERR_ASSERTION]: the printed retained home must exist after a
  failing run \n\n false !== true`. Green on the actual worktree (see full gate output
  below).

### M2 - LEAK_PREFIX_RE extended with the missing families
- Regex literal replaced verbatim with the review's extended version, adding:
  `bearings-state`, `codex-child-hook`, `codex-goal-hook-project`, `other-home`,
  `pconfig-owner-hosts`, `plugin-staleness`, `record-closed`, `wiring-home`, `work-census`,
  `census`, `build-census`, `knowledge-count`, `child-env`, `run-tests`, `cstatus`,
  `janitor`, `collect`, `transport`. No further prefixes beyond the review's list were
  found needed on this pass.
- Doc comment above the constant lists all 18 added families by name, alongside the
  original pinned set.
- The pre-existing "LEAK_PREFIX_RE matches every pinned prefix and rejects an unrelated
  name" test still passes unchanged (the review noted this would stay green, and it does -
  see full test run below).

### m1 - the EPERM branch of the sweep's pid test was untested
- Added the EPERM case (an old root named with pid `1`, POSIX only) directly inside the
  existing "P3: sweepStaleHomes removes a stale test-run root with a dead pid, keeps a
  young one and one with a live pid" test, exactly as the review's patch describes (insert
  before the `sweepStaleHomes(...)` call, assert after).
- Red without the fix (mktemp copy): mutated `isPidAlive`'s catch branch from
  `return Boolean(e) && e.code !== "ESRCH";` to `return false;` (treats EPERM as dead).
  Running the P3 test alone against that mutation: `sweptRoots` reads `2` instead of `1`
  (`AssertionError: Expected values to be strictly equal: 2 !== 1`) - the mutation now sweeps
  the pid-1 root, which the un-mutated code correctly keeps as "alive". Green on the actual
  worktree.

### m2 - a run that never got a home leaves an empty root behind
- `main()`'s post-run branch changed from `else trimRootExceptHome(tmpRoot, home);` to
  `else if (home) trimRootExceptHome(tmpRoot, home); else removeRootBestEffort();` -
  verbatim per the ruling. Comment above it explains the ENOSPC-at-`makeTempHome` case this
  guards.
- No dedicated new unit test was added for this one specific branch (the ruling listed it
  under "apply as patched", not among the three tests the brief asked to be shown red/green);
  it is covered indirectly by every existing P1/P2 test continuing to pass, since `home` is
  always set by the time this branch runs in every test's own probe path.

### m3 - the leak check only snapshotted directories
- `snapshotLeakNames` now matches `entry.name` against `LEAK_PREFIX_RE` unconditionally
  (dropped the `entry.isDirectory() &&` guard), so a straggler that writes a bare file
  under the real temp dir is seen too. Doc comment updated to say "by NAME, not just
  directories".
- The existing "the leak check is silent when clean and goes red on a planted leak" test
  (which only ever plants a directory) still passes unchanged.

### n2 - "directly under" should be pinned exactly
- The P1 test's `assert.ok(root.startsWith(fs.realpathSync(tmp)), ...)` replaced with
  `assert.equal(path.dirname(root), fs.realpathSync(tmp), ...)`, verbatim per the ruling.
  Passes on the branch.

### n3 - the sweep's skipped return had no sweptRoots
- `sweepStaleHomes`'s early return changed from `{ swept: 0, skipped: true }` to
  `{ swept: 0, sweptRoots: 0, skipped: true }`. The two tests that pinned the old shape
  (`ws-off` and `ws-off-sweep` kill-switch tests) were updated to `deepEqual` against the
  new shape - both still pass.

### n1 - no change, per the ruling.

## Revert demonstration (mktemp copies, never the worktree)

All three demonstrations used a copy made with `mktemp -d` under
`.../scratchpad/lane-46/revcopy-V9UXOT` (files copied in: `scripts/run-tests.mjs`,
`scripts/run-tests.test.mjs`, `scripts/test-home.mjs`, `skills/multi/scripts/test-child-env.mjs`,
preserving the relative import paths). Each revert was applied to that copy only, the
targeted test run, and the copy then restored byte-for-byte from the worktree
(`cmp` confirmed identical) before the next revert. The worktree's `git status --short`
was clean of anything but the three intended files throughout - no revert ever touched it.

1. M1 reverted (raw-path comparison restored) -> "SYMLINKED" test: 0 pass / 1 fail
   (`the printed retained home must exist after a failing run`, `false !== true`).
2. m1 mutated (`isPidAlive`'s EPERM branch forced to "dead") -> P3 test: 0 pass / 1 fail
   (`sweptRoots` `2 !== 1`).
3. R2 reverted (nested-run detection and both `null`-snapshot branches removed) -> R2 test:
   0 pass / 1 fail (printed line was the counted `leak check: 0 new temp entries` instead
   of the nested line).

## Gate results

`node --test scripts/run-tests.test.mjs scripts/test-home.test.mjs` with `TMPDIR` pointed
at a scratch dir made via `mktemp -d` under this lane's scratchpad:

```
tests 54
pass 53
fail 0
cancelled 0
skipped 1   (the win32-only taskkill test, skipped on POSIX)
```

Full suite, `node scripts/run-tests.mjs` from the worktree root (no TMPDIR override - the
real machine's own /tmp, as the gate specifies):

```
tests 2670
pass 2665
fail 0
cancelled 0
skipped 5
leak check: 0 new temp entries
```

Exit code 0. The `leak check:` line read `leak check: 0 new temp entries` - clean, and (per
R1) this reader's result never affected the exit code either way. The known
note-flush.test.mjs H4 timing flake did not appear on this run; no rerun was needed.

## Denied commands

None this round.

## Cause / Discriminating check / Fix location / Simplification

**Cause:** unchanged from the round-1 build report - every sealed test child inherited the
real TMPDIR/TEMP/TMP, so each test's own `mkdtempSync(os.tmpdir(), ...)` landed in the real
`/tmp` with no runner-owned cleanup path. This round's fixes are all at the review layer on
top of that: correctness of the retention/removal/sweep/leak-report mechanisms the P1 fix
introduced, not a new cause.

**Discriminating check:** the same before/after `LEAK_PREFIX_RE` snapshot as round 1, now
(a) matching every prefix family the review measured tests actually using (M2), (b)
matching by name rather than by directory-only (m3), and (c) never firing at all when the
CLI's own `os.tmpdir()` is itself a nested run's root (R2), since in that case the snapshot
would be reading a sibling run's own live traffic, not a leak.

**Fix location:** `scripts/run-tests.mjs` - `trimRootExceptHome` (M1), `LEAK_PREFIX_RE` and
its comment (M2), `snapshotLeakNames` (m3), `sweepStaleHomes`'s skipped return (n3), and
`main()`'s post-run branch (m2) and its leak-check tail (R1, R2). `scripts/run-tests.test.mjs`
for the corresponding test changes and the two new regression tests (M1's symlink test,
R2's nested test) plus m1's addition to the existing P3 test. `docs/census.md` for R1's
line.

**Simplification:** none of this round's fixes add a new mechanism - R1 removes a piece of
behaviour (the forced exit) rather than adding one; R2 adds one early-exit branch that reuses
the same `TEST_RUN_ROOT_RE` P3 already has; M1/m2/m3/n3 are each a one-line correction to an
existing function's own contract, not a new path.
