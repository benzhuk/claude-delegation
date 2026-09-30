DONE 72f736b62bce9c53ab9cf7aa3a92490bd08472c1

## Territory

Lane 59 seam delta review r2 fix round: janitor acts (scripts/janitor.mjs,
scripts/janitor.test.mjs), reclaim (scripts/reclaim.mjs, scripts/reclaim.test.mjs), path-safety
(scripts/path-safety.mjs, scripts/path-safety.test.mjs). One commit on build/janitor-acts-59-1:
- 72f736b fix(janitor,reclaim): seam review r2 findings

Base: 668d535f06bd4dad1c1769f5f561529351f6ae91 (the docs commit adding ruling-r3.md and
seam-review-r2.md, already in the worktree at start).

## Read before starting

- docs/specs/janitor-acts-59/ruling-r1.md, ruling-r2.md - "doubt resolves to do not remove", "a
  check that cannot complete refuses".
- docs/specs/janitor-acts-59/seam-review-r2.md - NEEDS_FIXES(5) at 483af6e.
- docs/specs/janitor-acts-59/ruling-r3.md - the round's spec, adopting all 5 findings.
- docs/specs/janitor-acts-59/seamfix-build.md - the previous round's report (483af6e).
- docs/specs/janitor-acts-59/winfix-build.md - the Windows gate procedure.

## Deliverables, one row each

### Finding 1 (MEDIUM) - win32 half of MEDIUM 3 untested; corrected claim

- **Change**: `checkOpenProcess` (reclaim.mjs) is now exported (was `function checkOpenProcess`,
  now `export function checkOpenProcess`). Two new tests in reclaim.test.mjs, inserted exactly
  where the finding specified (immediately before the MEDIUM 4 section):
  - `"seam review r2: checkOpenProcess refuses on every platform branch it cannot clear, on any
    host"` - unit-level, drives linux/darwin/win32/other directly through injected
    `openProcessImpl`/`winBusyProbeImpl`, asserting busy, catastrophic, clean, dry-run-skips-probe,
    unknown, and other-platform-fails-closed, all without needing a real win32 host or a spawned
    process.
  - `"seam review r2: a live process whose cwd is a SUBDIRECTORY of the T target refuses the
    target"` - end-to-end, spawns a real child with its cwd inside `<target>/sub/deeper`, asserts
    `reclaimMain` refuses (exit 3, "a process has its cwd here") and the target survives. Kills
    only that spawned child by its own pid in a `finally`.
- **Correction of seamfix-build.md's claim** (per ruling r3, written here, that file untouched):
  seamfix-build.md's Gate 3 section states "the win32 applySafe tests that already cover it were
  unaffected by the extraction" as evidence the win32 busy/catastrophic paths of
  `winRenameBusyProbe`/`checkOpenProcess` were exercised. That claim was **not accurate** - those
  `applySafe` tests exercise the not-busy happy path only; no test anywhere named `janitor-busy`,
  `"in use"`, `"rename it back"`, or `winRenameBusyProbe` drove the busy or catastrophic branches on
  any host, on either janitor.mjs's `winRenameBusyProbe` or reclaim.mjs's `checkOpenProcess`'s win32
  branch. This round's new unit test is the first thing that exercises `checkOpenProcess`'s win32
  busy/catastrophic/dry-run branches at all (on any host, since it takes injected implementations);
  `winRenameBusyProbe` itself (janitor.mjs) still has no direct busy/catastrophic test - out of
  scope for this round (ruling r3 only asked for reclaim's `checkOpenProcess` win32 path).
- Linux: both green (`node --test --test-name-pattern "checkOpenProcess refuses|SUBDIRECTORY"
  scripts/reclaim.test.mjs`: 2 pass).
- Windows: the unit-level `checkOpenProcess` test ran and passed for real (drives the win32 branch
  through injected functions, so it needs no win32-shaped fixture path at all):
  `✔ seam review r2: checkOpenProcess refuses on every platform branch it cannot clear, on any
  host`. The subdirectory test is `POSIX_FIXTURE_ONLY`-skipped there (same reason every other
  `baseCtx()`-built S/T test carries - measured on this exact Windows gate, not assumed).

### Finding 2 (MEDIUM) - reused open-process probe answers "clean" inside a private PID namespace

- **Change**: `worktreeHasOpenProcess` (janitor.mjs, exported under `pathHasOpenProcess`) applies
  the reviewer's exact patch (statSync("/proc/1").uid comparison against the caller's own uid,
  right after the `/proc` readdir try/catch) - but the `statSync` call goes through a new optional
  parameter, `{ statImpl = statSync } = {}` (second argument, defaults preserve every real caller's
  behavior unchanged: `applySafe` and reclaim's default `openProcessImpl` both call it with one
  argument only). Per ruling r3's explicit instruction ("use a stat or getuid injection... rather
  than requiring unshare on the host"), the test forces the condition through `statImpl` instead of
  a real `unshare --pid`. No real-`unshare` test was added in addition - ruling r3 makes that
  optional ("if a real unshare test is added as well..."), and the injectable-seam test alone gives
  full discrimination without depending on `unshare` being installed on every future host.
- **New test** (janitor.test.mjs): `"seam review r2: worktreeHasOpenProcess fails closed inside a
  private PID namespace, discriminated through an injected statImpl (no real unshare needed)"` -
  linux-only (matches the probe's own linux-only mechanism), and skips itself gracefully when run
  as root (root's own uid IS 0, so the discriminator's `uid !== 0` guard can never fire - same
  pattern the file's own pre-existing "review finding 3" root-skip uses). Asserts:
  `pathHasOpenProcess("/", { statImpl: () => ({ uid }) })` (PID 1 "owned" by the caller's own uid,
  the namespace signature) returns `"unknown"`, never a confident answer; the same call with
  `{ uid: uid + 1 }` (PID 1 owned by someone else, i.e. the real host) falls through unaffected.
- **Measured, not assumed, that this repo's own Bash-tool execution environment is NOT itself
  running inside such a namespace** (so the fix does not spuriously flip any pre-existing
  real-process test in this territory): `node -e 'console.log(process.getuid(),
  fs.statSync("/proc/1").uid)'` in this session's own shell gives `1000 0` - PID 1 is root here, not
  the caller. Every pre-existing real-spawned-child test (MEDIUM 1's two `applySafe` tests, MEDIUM
  3's live-process reclaim tests, this round's own new subdirectory test) still exercises the real,
  un-namespaced branch on this host, confirmed by all of them staying green.
- Linux: green (`node --test --test-name-pattern "private PID namespace" scripts/janitor.test.mjs`:
  1 pass).
- Windows: skips there with a stated reason (the discriminator is linux-only, matching the `/proc`
  probe it guards) - `﹣ ... # the PID-1-ownership discriminator is linux-only, matching the /proc
  probe it guards`.

### Finding 3 (LOW) - writeRecord's check-then-write race

- **Change**: `writeRecord` (janitor.mjs) replaces the single `existsSync` check + one fallback
  `-HHMMSS` suffix with the reviewer's exact fix: an exclusive create (`writeFileSync(candidate,
  body, { flag: "wx" })`) tried against `<date>-<host>.json`, then `<date>-<host>-<HHMMSS>.json`,
  then `<date>-<host>-<HHMMSS>-2.json` through `-99.json`, retrying on `EEXIST` and throwing only if
  all 100 names are taken. No window between "does it exist" and "write" exists anywhere in this
  path; a throw still reaches `writeRecordIfRequested`'s catch (`--record failed`), and nothing is
  ever truncated.
- **New test addition**: the existing MEDIUM 2 test in janitor.test.mjs (two same-NY-second
  `writeRecord` calls) gained a third same-second call, asserting it lands at
  `<date>-<host>-<hms>-2.json`, carries its own removal (`feature-c`), and that the second run's own
  file (`feature-b`) is still untouched. The three-file "nothing lost" assertion at the end of the
  test now checks all three refs (`feature-a`, `feature-b`, `feature-c`).
- Linux: green (`node --test --test-name-pattern "MEDIUM 2" scripts/janitor.test.mjs`: 1 pass).
- Windows: ran and passed for real: `✔ seam review MEDIUM 2: a second same-day writeRecord call
  never overwrites the first run's removed list - both removals survive`.

### Finding 4 (LOW) - pathEscapesRoot's absolute-result clause untested; forward-slash win32 bug

- **Change**: `pathEscapesRoot` (path-safety.mjs) gains the reviewer's exact clause -
  `(pathImpl.sep === "\\" && rel.startsWith("../"))` - alongside the existing `".."`/`".."+sep`/
  `isAbsolute` checks, so a forward-slash-separated relative path under `path.win32` (which no
  current caller produces, since every caller passes `pathImpl.relative` output, but which the
  function is now exported as "the one escape predicate" and so must handle correctly regardless)
  is caught too.
- **New test** (path-safety.test.mjs): `"seam review r2: pathEscapesRoot - a '..'-prefixed name
  stays inside; '..', a '..'-prefixed sibling, another drive and a UNC path escape"` - the exact
  table the finding gave: `..live` stays inside on posix and win32, `..` and a `..`-prefixed sibling
  escape on posix, `..\x` and `../x` both escape on win32, another drive and every UNC-vs-UNC/
  UNC-vs-local combination escape.
- Linux: green (`node --test --test-name-pattern "pathEscapesRoot" scripts/path-safety.test.mjs`:
  1 pass).
- Windows: ran and passed for real: `✔ seam review r2: pathEscapesRoot - a '..'-prefixed name stays
  inside; ...`.

### Finding 5 (LOW) - two private loose escape copies survive in reclaim.mjs

- **Change**: `checkS` (reclaim.mjs:398) and `checkT` (reclaim.mjs:467) each replace their private
  `rel === "" || rel.startsWith("..") || p.isAbsolute(rel)` with `rel === "" ||
  pathEscapesRoot(rel, p)`. `pathEscapesRoot` was already imported in this file (used by the
  mount-check and F8's `within()` since the prior round). No private copy of the escape predicate
  survives anywhere in this territory now.
- **No new test**: the finding itself gives none - the only behavior difference is which refusal
  message a `..`-prefixed-sibling path gets (checkT's own "must be named delegation-..." instead of
  falling through to "unrecognized"); the target is refused either way, before and after.
- Confirmed no regression: the full touched-file run (220 tests) stays green with this change in
  place.

## Mutation table (each fix reverted in a separate scratch clone at 72f736b, restored byte-identical
after, confirmed via `git status --short`)

| mutation (reverts) | red test(s) |
|---|---|
| M3b: checkOpenProcess win32 `probe.busy` ignored | 1 (finding 1's unit test) |
| M3c: checkOpenProcess "other platform" returns ok:true | 1 (finding 1's unit test) |
| M3e: checkOpenProcess win32 `probe.catastrophic` ignored | 1 (finding 1's unit test) |
| M3a: finishST's `checkOpenProcess` call removed entirely | 1 (finding 1's subdirectory test) |
| finding 4's forward-slash clause removed | 1 (finding 4's pathEscapesRoot test) |
| finding 3's fix reverted to the old check-then-write | 1 (the extended MEDIUM 2 test - third call lands at the wrong, already-used, name) |
| finding 2's PID-1-ownership check block removed | 1 (finding 2's namespace test) |

Method: a plain `git clone` (not a worktree) of `/var/tmp/lane-59/wt` into
`/var/tmp/delegation-l59sf2-8vZe/mutclone`, checked out at `72f736b`. Each mutation was applied with
a small Python `str.replace` script (asserting the target string was present, so a silent no-op
mutation was never possible), the one relevant test re-run with `--test-name-pattern`, the failure
captured, then the file restored from a saved original copy and `git status --short` confirmed
empty before the next mutation. No mutation was left in place; the clone is byte-identical to
`72f736b` right now.

Finding 5 has no dedicated new test (per the finding's own text) so no mutation row for it; its
regression coverage is the full touched-file suite staying green (220/211/0 fail/9 skip), confirmed
above.

## Gate 1: Linux

Touched test files (`node --test scripts/path-safety.test.mjs scripts/reclaim.test.mjs
scripts/janitor.test.mjs`, `TMPDIR=/var/tmp`):
- 220 tests, 211 pass, 0 fail, 9 skipped (up from the prior round's 216/207/0/9 - the 4 new tests
  above).

Full suite once (`TMPDIR=/var/tmp node scripts/run-tests.mjs`), log at
`/var/tmp/lane-59/linux-full-run-seamfix2.log`:
- 3205 tests, 3192 pass, 0 fail, 0 cancelled, 12 skipped, 1 todo, exit 0.
- leak check: 0 new temp entries.

## Gate 2: commit + push

- Commit 72f736b62bce9c53ab9cf7aa3a92490bd08472c1 on build/janitor-acts-59-1.
- Pushed: `668d535..72f736b build/janitor-acts-59-1 -> build/janitor-acts-59-1`.

## Gate 3: Windows

Followed winfix-build.md's exact procedure (fresh scratch dir/bundle/clone names, a local
main-tracking ref bundled alongside the feature branch, origin/main ref set in the clone from that
same ref):
- `git fetch origin main:refs/heads/l59-main-for-bundle-seamfix2` (this worktree; the two
  pre-existing `l59-main-for-bundle*` refs from prior rounds are untouched, all point at the same
  tip `a57e2ff`).
- `git bundle create /var/tmp/delegation-l59sf2-8vZe/winbundle/l59seamfix2.bundle
  l59-main-for-bundle-seamfix2 build/janitor-acts-59-1`.
- `scp` to `C:\Temp\l59seamfix2-1.bundle`; `git clone -q -n` into `C:\Temp\l59seamfix2-1`;
  `git branch -f main refs/remotes/origin/l59-main-for-bundle-seamfix2`; `git update-ref
  refs/remotes/origin/main refs/remotes/origin/l59-main-for-bundle-seamfix2`; checked out
  72f736b62bce9c53ab9cf7aa3a92490bd08472c1.
- `node scripts/run-tests.mjs > C:\Temp\l59seamfix2-1.log 2>&1`, pulled back to
  `/var/tmp/delegation-l59sf2-8vZe/winbundle/l59seamfix2-1.log`.

Counts:
- 3205 tests, 3114 pass, 0 fail, 0 cancelled, 90 skipped, 1 todo, duration_ms 196188.
- leak check: 0 new temp entries.
- Only `✖` occurrences in the whole log are the harness's own expected self-check, `✖ probe`
  (appearing twice: once in the live run, once again in the "failing tests" detail section for that
  same probe test) - the one expected exception named in the brief. No other failures.
- All 3 new/changed tests that are supposed to run for real on win32 did:
  `✔ seam review r2: checkOpenProcess refuses on every platform branch it cannot clear, on any
  host`, `✔ seam review r2: pathEscapesRoot - a '..'-prefixed name stays inside; ...`, `✔ seam
  review MEDIUM 2: a second same-day writeRecord call never overwrites the first run's removed list
  - both removals survive`.
- The 2 tests that are linux-only/POSIX-fixture-only by design (the private-PID-namespace test, and
  the subdirectory-cwd T test) show as skipped (`﹣`), with stated reasons, not failed.

## Deviations / assumptions

- Finding 2's injectable seam: rather than pass `statImpl` as a third top-level argument or thread
  it through some existing options object, `worktreeHasOpenProcess` gained a second, optional
  parameter (`{ statImpl = statSync } = {}`) - the smallest change that keeps every existing call
  site (`applySafe`, reclaim's default `ctx.openProcessImpl`) byte-identical in behavior, since none
  of them pass a second argument.
- Finding 1's win32 `winRenameBusyProbe` (janitor.mjs) itself still has no direct busy/catastrophic
  unit test (only `checkOpenProcess`'s win32 branch does, via injection) - ruling r3's finding 1
  scope is specifically "reclaim's own checkOpenProcess", not janitor's underlying probe; the
  seamfix-build.md report already flagged a test for `winRenameBusyProbe` itself as "recommended...
  but pre-existing scope", and this round did not expand scope to add it.
- Finding 5 got no new test, matching the finding's own text (it gives none) - the change is
  covered by the full touched-file suite staying green, not a dedicated red/green pair.
- Nothing was BLOCKED. No denied command was hit this round (the secret-guard denial the r2
  reviewer itself hit, from spreading `process.env` into a mutation runner's spawn options, was
  never risked here - no child spawn options anywhere in this round's own edits or scratch scripts
  reference `process.env` at all; every spawned child in the touched test files already used
  `env: {}` or the pre-existing `childEnv` helper).

## Left in place (nothing deleted, per the hard rule)

- `/var/tmp/delegation-l59sf2-8vZe/` - this round's scratch: `mutclone/` (the mutation-testing
  clone, git-status-clean at `72f736b` right now), `touched.log` (the touched-files run), `winbundle/
  l59seamfix2.bundle` and `winbundle/l59seamfix2-1.log` (the bundle sent to Windows and the log
  pulled back).
- `/var/tmp/lane-59/linux-full-run-seamfix2.log` - this round's Linux full-suite log.
- Local git refs `refs/heads/l59-main-for-bundle-seamfix2` (this round), alongside the two
  pre-existing `l59-main-for-bundle`/`l59-main-for-bundle-seamfix` refs from prior rounds in this
  worktree - all point at the same `origin/main` tip and are left per the brief's one exception.
- Windows side (`C:\Temp` on ben-desktop): `l59seamfix2-1.bundle`, `l59seamfix2-1\` (the clone),
  `l59seamfix2-1.log` - this round's bundle/clone/log. No prior round's Windows artifacts were
  touched.
- Prior rounds' scratch (`/var/tmp/lane-59/scratch/`, `/var/tmp/delegation-l59seamfix-scratch/`,
  `/var/tmp/delegation-l59sr2-8s9I/` from the review round) - none of it was touched this round.

## GOAL relevance

Serves the DONE line (a build goes spec to accepted with nothing lost or stalled): the seam review
r2's 5 findings each named a real residual gap in the prior round's fix - two untested behavioral
branches that a future edit could silently break without any test catching it (findings 1 and 2,
the more serious MEDIUM pair), a same-second record-loss race, an untested predicate clause with a
real (if uncalled) bug, and two lingering duplicate copies of the one escape rule the round was
supposed to have unified. Closing all five, each with a red/green (or, where the finding gave none,
full-suite-green) proof, clears the path to acceptance. Nearest NOT: "a symptom fix" - avoided by
exporting and testing the actual shared mechanisms (`checkOpenProcess`, `pathEscapesRoot`,
`worktreeHasOpenProcess`'s own seam) rather than adding a second, parallel check for each finding.
