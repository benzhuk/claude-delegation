DONE 483af6eeecdfcc92457dd975b239a7d3621d5605

## Territory

Lane 59 seam review fix round: janitor acts (scripts/janitor.mjs, scripts/janitor.test.mjs) plus
reclaim (scripts/reclaim.mjs, scripts/reclaim.test.mjs), and path-safety.mjs (the shared escape
predicate MEDIUM 1 needed). One commit on build/janitor-acts-59-1:
- 483af6e fix(janitor,reclaim): close lane 59 seam review's 3 MEDIUM findings

Base: 0cc8d3e0728e1e7175040c5376ab982f170c9914 (winfix-build round), plus the docs commit
8510350 already in the worktree at start.

## Read before starting

- docs/specs/janitor-acts-59/seam-review.md (NEEDS_FIXES(3) at 4a11867) - the 3 MEDIUM findings.
- docs/specs/janitor-acts-59/ruling-r1.md, ruling-r2.md - "doubt resolves to do not remove", "a
  check that cannot complete refuses".
- docs/specs/janitor-acts-59/winfix-build.md - the win32 test-portability round this one builds on.

## Deliverables, one row each

### MEDIUM 1 - one escape predicate

- **Change**: `pathEscapesRoot(rel, pathImpl = path)` is now the single exported implementation in
  scripts/path-safety.mjs (`rel === ".." || rel.startsWith(".." + pathImpl.sep) || pathImpl.isAbsolute(rel)`).
  path-safety.mjs's own private `escapes()` now calls it. reclaim.mjs's private `escapesUp()` is
  removed; its two call sites (`checkMountsUnderClassRoot`'s `withinOrEqual`, and `within()` for
  the F8 cwd check) now import and call `pathEscapesRoot` directly. janitor.mjs's `pathWithin`
  (the exact line the seam review named, janitor.mjs:1695 at 4a11867) now imports and calls the
  same function instead of its own looser `!rel.startsWith("..")` test.
- **Red on 0cc8d3e** (measured against `git archive 0cc8d3e`, via `node -e` calling the archived
  `pathWithin` directly):
  - `pathWithin("/a/b/..live", "/a/b")` → `false`
  - `pathWithin("C:\\a\\..x", "C:\\a", { platform: "win32", pathImpl: path.win32 })` → `false`
- **Green on 483af6e** (same calls against the patched file):
  - `pathWithin("/a/b/..live", "/a/b")` → `true`
  - `pathWithin("C:\\a\\..x", "C:\\a", { platform: "win32", pathImpl: path.win32 })` → `true`
- **New tests** (scripts/janitor.test.mjs):
  - `"pathWithin: MEDIUM 1 - a real child dir named '..live' is inside; an actual '..' escape is
    not, on posix and win32"` - unit-level, matches the seam review's own predicted table exactly
    (`..live` true, `..` false, the win32 form true).
  - `"seam review MEDIUM 1: a SAFE worktree with a live process sitting in a real '..live' child
    dir is still refused, not misread as outside"` - end to end: spawns a real child process with
    its cwd inside `<worktree>/..live`, runs `applySafe` with `state.act = true`, asserts the
    worktree is skipped with `"a process has its cwd here"` and survives on disk. Kills only that
    spawned child by its own `child.kill()`/pid at the end (`finally`), matching the file's
    existing "review finding 2" pattern one test above it.
- Linux: both green (`node --test --test-name-pattern "MEDIUM 1" scripts/janitor.test.mjs`:
  2 pass, 0 fail).
- Windows: the unit-level `pathWithin` test ran and passed for real on the Windows gate
  (`✔ pathWithin: MEDIUM 1 ... on posix and win32`). The open-shell end-to-end test is `linux`-only
  by its own `skip` guard (the `/proc/[pid]/cwd` probe it exercises is linux-only, same guard the
  pre-existing "review finding 2" test next to it already carries) - it showed as skipped (`﹣`),
  not failed, on the Windows run.

### MEDIUM 2 - a second same-day act run never overwrites the first run's `removed` list

- **Change**: scripts/janitor.mjs's `writeRecord` applies the seam review's exact patch: on a
  same-day/same-host collision (`existsSync(jsonPath)`), the new record is written to
  `<date>-<host>-HHMMSS.json` (NY wall-clock time) instead of overwriting the earlier file.
- **Red on 0cc8d3e**: reproduced with a standalone script (`/var/tmp/lane-59/scratch/repro-medium2.mjs`)
  against `git archive 0cc8d3e`'s `writeRecord`: two calls, same `now`/`dir`/`hostName`, different
  `applyLog` (one removal each) both wrote `2026-09-29-h.json`; the second call's content
  (`removed: [feature-b]`) is the only thing left on disk - `feature-a`'s removal is gone.
- **Green on 483af6e**: same script against the patched file: first call writes
  `2026-09-29-h.json` (`removed: [feature-a]`, untouched by the second call); second call writes
  `2026-09-29-h-160000.json` (`removed: [feature-b]`) - both survive.
- **New test** (scripts/janitor.test.mjs): `"seam review MEDIUM 2: a second same-day writeRecord
  call never overwrites the first run's removed list - both removals survive"` - two `writeRecord`
  calls into one dir, same NY date/host, asserts the first file's path/content is untouched, the
  second lands at the predicted `-HHMMSS` suffix, and (read together) both refs survive.
- Linux: green (`node --test --test-name-pattern "MEDIUM 2" scripts/janitor.test.mjs`: 1 pass).
- Windows: `✔ seam review MEDIUM 2: a second same-day writeRecord call ...` ran and passed for real.

### MEDIUM 3 - reclaim's S/T refuses a target a live process has as its cwd

- **Change**:
  - scripts/janitor.mjs exports the existing linux/darwin probe under a neutral name:
    `export { worktreeHasOpenProcess as pathHasOpenProcess };`.
  - scripts/janitor.mjs's win32 rename-away-and-back probe (previously inline in `applySafe`) is
    pulled out, unchanged in behavior, into its own exported function `winRenameBusyProbe(target)`
    returning `{ busy }` / `{ busy: true, catastrophic, detail }`; `applySafe`'s win32 branch now
    calls it (same log messages/shapes as before - confirmed by the untouched win32 `applySafe`
    tests still passing, see below).
  - scripts/reclaim.mjs's `finishST` now calls a new `checkOpenProcess(resolved, ctx)` after the
    mount check (so both the initial validation and the LOW 13 pre-rm re-check run it): on
    linux/darwin it calls `ctx.openProcessImpl` (defaults to `pathHasOpenProcess`), refusing with
    `"a process has its cwd here"` or (for `"unknown"`) `"in-use check failed"`; on win32 it calls
    `ctx.winBusyProbeImpl` (defaults to `winRenameBusyProbe`) on the resolved target, **skipped
    only on `--dry-run`** (a dry run never removes anything, so it never needs the mutating
    rename-and-back probe; both the real, non-dry-run validation and the LOW 13 re-check
    immediately before the actual `rmSync` always go through it); any other platform fails closed
    with `"in-use check failed"`. No second open-process mechanism was written - both mechanisms
    are the exact ones janitor.mjs already had, exported and reused.
- **Red on 0cc8d3e**: reproduced with a standalone script
  (`/var/tmp/lane-59/scratch/repro-medium3.mjs`) against `git archive 0cc8d3e`'s `reclaim.mjs`:
  spawned a real child process with its cwd set to a T fixture directory, then called
  `reclaimMain([target], ctx)` (no dry-run) - it printed `removed T ...`, exit 0, and the target
  directory was gone from disk while the child (still alive) had it as its cwd.
- **Green on 483af6e**: identical repro against the patched files: `refused .../data: a process has
  its cwd here`, exit 3, target still exists.
- **New tests** (scripts/reclaim.test.mjs):
  - `"seam review MEDIUM 3: a live process with its cwd inside a T target is refused, not silently
    removed"` - spawns a real child with `cwd: target`, asserts refusal and survival, kills only
    that spawned child (`child.kill()`, its own pid) in a `finally` at the end.
  - `"seam review MEDIUM 3: an in-use check that cannot answer ('unknown') refuses with 'in-use
    check failed', never a confident match"` - injects `openProcessImpl: () => "unknown"`.
- Linux: green (`node --test --test-name-pattern "MEDIUM 3" scripts/reclaim.test.mjs`: 2 pass).
- Windows: both MEDIUM 3 tests skip there (they build through `baseCtx()`, which forces
  `platform: "linux"` over real win32-shaped absolute paths - the exact same
  `POSIX_FIXTURE_ONLY` skip reason the winfix-build round already gave every other `baseCtx()`-built
  S/T test; not a claim the subject is POSIX-only). The win32-real mechanism (`winRenameBusyProbe`)
  is exercised indirectly: the win32 `applySafe` tests that already cover it were unaffected by the
  extraction (still pass), and the win32 T happy-path/dry-run twin (real `rmSync` removal, no live
  process) still passes on the Windows gate with the new `checkOpenProcess` call in the path,
  confirming the dry-run skip and the "not busy" case both work for real on win32.

### Two more win32 twins in reclaim.test.mjs

- Added, both skip-gated `{ skip: process.platform !== "win32" ? NO_WIN32_HOST : false }`, matching
  the existing twin pattern (T happy/dry-run, F3, HIGH1, HIGH2):
  - `"F14: kill switch refuses every argument, exit 3, nothing removed (win32 host)"` - two
    win32-shaped targets, asserts every argument gets its own refusal line.
  - `"argv usage errors: no path, unknown flag, --branch without --repo - all exit 2 (win32 host)"`.
- These are twins of the already-present, host-agnostic versions of the same cases (built through
  `win32Ctx()` unconditionally since the winfix-build round, per that round's own report) - added so
  a Windows gate run shows, by name, that this exact behavior was exercised for real on that host,
  not only on a ctx labelled "win32" while running on Linux.
- Windows: both ran (not skipped) and passed:
  `✔ F14: kill switch refuses every argument, exit 3, nothing removed (win32 host)`
  `✔ argv usage errors: no path, unknown flag, --branch without --repo - all exit 2 (win32 host)`

## Gate 1: Linux

Touched test files (`node --test scripts/path-safety.test.mjs scripts/reclaim.test.mjs
scripts/janitor.test.mjs`, `TMPDIR=/var/tmp`):
- 216 tests, 207 pass, 0 fail, 9 skipped.

Full suite once (`TMPDIR=/var/tmp node scripts/run-tests.mjs`), log at
`/var/tmp/lane-59/linux-full-run-seamfix.log`:
- 3201 tests, 3188 pass, 0 fail, 0 cancelled, 12 skipped, 1 todo, exit 0.
- leak check: 0 new temp entries.

## Gate 2: commit + push

- Commit 483af6eeecdfcc92457dd975b239a7d3621d5605 on build/janitor-acts-59-1.
- Pushed: `8510350..483af6e build/janitor-acts-59-1 -> build/janitor-acts-59-1`.

## Gate 3: Windows

Followed winfix-build.md's exact procedure (fresh scratch dir/bundle/clone names, a local
main-tracking branch bundled alongside the feature branch, origin/main ref set in the clone from
that same ref):
- `git fetch origin main:refs/heads/l59-main-for-bundle-seamfix` (local worktree; the prior round's
  `l59-main-for-bundle` ref is untouched and left in place, both point at the same tip `a57e2ff`).
- `git bundle create /var/tmp/delegation-l59seamfix-scratch/l59seamfix.bundle
  l59-main-for-bundle-seamfix build/janitor-acts-59-1`.
- `scp` to `C:\Temp\l59seamfix-1.bundle`; `git clone -q -n` into `C:\Temp\l59seamfix-1`;
  `git branch -f main refs/remotes/origin/l59-main-for-bundle-seamfix`;
  `git update-ref refs/remotes/origin/main refs/remotes/origin/l59-main-for-bundle-seamfix`;
  checked out 483af6eeecdfcc92457dd975b239a7d3621d5605.
- `node scripts/run-tests.mjs > C:\Temp\l59seamfix-1.log 2>&1` (node v24.18.0 on the box), pulled
  back to `/var/tmp/delegation-l59seamfix-scratch/l59seamfix-1.log`.

Counts:
- 3201 tests, 3112 pass, 0 fail, 0 cancelled, 88 skipped, 1 todo, duration_ms 197281.
- leak check: 0 new temp entries.
- Only `✖` in the whole log is the harness's own expected self-check, `✖ probe` - the one expected
  exception named in the brief. No other failures.
- All 4 new/changed tests that are supposed to run for real on win32 did:
  `✔ seam review MEDIUM 2: a second same-day writeRecord call ...`,
  `✔ pathWithin: MEDIUM 1 - a real child dir named '..live' is inside ... on posix and win32`,
  `✔ F14: kill switch refuses every argument, exit 3, nothing removed (win32 host)`,
  `✔ argv usage errors: no path, unknown flag, --branch without --repo - all exit 2 (win32 host)`.
- The 3 tests that are linux-only by design (the MEDIUM 1 open-shell end-to-end test, and both
  MEDIUM 3 tests) show as skipped (`﹣`), with reasons, not failed.

## Deviations / assumptions

- MEDIUM 3's design point ("On win32, ... either reuse applySafe's rename-away-and-back probe on
  the top target, or refuse on win32 until the Windows gate measures it") was resolved as: reuse
  the probe, extracted into its own exported function (`winRenameBusyProbe`) rather than kept
  inline in `applySafe`, so reclaim.mjs's S/T classes call the identical mechanism instead of a
  second implementation. Refusing outright on win32 was rejected: it would have broken the
  already-green, real-removal win32 T happy-path test from the winfix-build round (a regression),
  and the brief asks to keep win32 green, not merely not-worse.
- The win32 busy probe is skipped specifically on `--dry-run` (judgment, not in the seam review's
  own text): a dry run never removes anything, so there is no safety reason to perform a real,
  if self-reverting, filesystem rename during a read-only prediction. The real, destructive paths
  (a live non-dry-run validation, and the LOW 13 pre-rm re-check right before the actual `rmSync`)
  always go through it.
- MEDIUM 1's deliverable literally asks to "export it once, from path-safety.mjs" and "use it in
  janitor's pathWithin" and "replace the private copies in reclaim.mjs and path-safety.mjs" - done
  exactly as three call sites sharing one function, not a larger refactor of `pathWithin` or
  reclaim's own `within()` (which still does its own realpath/win32-fold work; only its escape test
  is now shared).
- Nothing was BLOCKED. No denied command was hit this round.

## Left in place (nothing deleted, per the hard rule)

- `/var/tmp/lane-59/scratch/pre-fix-0cc8d3e/` - a `git archive 0cc8d3e` extraction of the whole
  tree, used for the red-side repros.
- `/var/tmp/lane-59/scratch/repro-medium2.mjs`, `/var/tmp/lane-59/scratch/repro-medium3.mjs` - the
  two standalone repro scripts, plus their fixture repos under
  `/var/tmp/lane-59/scratch/medium2-repo-pre/`, `/var/tmp/lane-59/scratch/medium2-repo-post/`.
- `/var/tmp/lane-59/linux-full-run-seamfix.log` - this round's Linux full-suite log.
- `/var/tmp/delegation-l59seamfix-scratch/l59seamfix.bundle`,
  `/var/tmp/delegation-l59seamfix-scratch/l59seamfix-1.log` - the bundle sent to Windows and the
  log pulled back.
- Local git refs `refs/heads/l59-main-for-bundle-seamfix` (this round) and the pre-existing
  `refs/heads/l59-main-for-bundle` (prior round) in this worktree - both point at the same
  `origin/main` tip and are left per the brief's one exception.
- Windows side (`C:\Temp` on ben-desktop): `l59seamfix-1.bundle`, `l59seamfix-1\` (the clone),
  `l59seamfix-1.log` - this round's bundle/clone/log. The prior round's `l59w2-1`/`l59w2-2`/`l59w2-3`
  artifacts (bundle/clone/log for each) were not touched.

## GOAL relevance

Serves the DONE line (a build goes spec to accepted with nothing lost or stalled): the seam
review's 3 MEDIUM findings each named a real "work lost or stalled" path - a live shell's worktree
removed out from under it (MEDIUM 1), a day's removal record silently overwritten (MEDIUM 2), and
another agent's live scratch dir removed while a process still has it as its cwd (MEDIUM 3). Fixing
them, with red/green evidence and a clean win32 gate, unblocks the round's acceptance. Nearest NOT:
"a symptom fix" - avoided by fixing the shared root cause once (one escape predicate) instead of
patching each of the three copies' symptoms separately, and by reusing janitor's existing
open-process/win32-probe mechanisms instead of writing new ones for reclaim.
