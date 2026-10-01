DONE 643a8626b7cf3b8d9711e7640ee95a548d9fb69a

# Lane 53 fix round 4 (lead's intervention): F1-F3, W1-W3

Scope: lead-ruling-r4.md, review-r3.md's F1-F3 verbatim, and the Windows-suite ruling (W1-W3).
GOAL served: reliability at equal or better quality on any agent host (Codex and Claude Code
first) — review-run's own test suite was unusable on win32 (23 fail, 1 cancelled, a 40-minute
hang); this round makes it a true signal there. Nearest NOT: no new mechanism — every fix is a
one-line cause, not a redesign.

## Commits (one per concern, in order)

1. `ee7f8cd` test(review-run): F1 — make the N1 no-signal sweep tests discriminating
2. `f96c7ef` test(review-run): F2 — cover the win32 Edit-rule branch and glob-char refusal
3. `d173a82` fix(review-run): F3 — stop probing a completed run's reused childPid
4. `cc81f22` fix(review-run): W1 — catch a synchronous spawn() throw as EXIT.HOST
5. `a10bb65` test(review-run): W2 — skip the fake-claude-dependent tests on win32
6. `643a862` test(review-run): W3 — portable dead-pid and live-victim helpers for win32

No `--no-verify`, no git identity ever set, nothing amended. `docs/specs/review-run-53/` reports
from earlier rounds are untouched; this file is new.

## Deviation, disclosed: TMPDIR=/var/tmp for verification runs

`/tmp` on this host is a `tmpfs` capped at 1,048,576 inodes and was observed at **100% inode
use (712-761 free)** throughout this round (`df -i /tmp`), from concurrent lanes on the shared
box — confirmed independently of my changes: a plain `git clone --no-hardlinks` into `/tmp` and
a minimal reproduction script both failed with `ENOSPC` at that time, then succeeded once
pointed at `/var/tmp` (disk-backed, `/dev/vda4`, 4% inode use). Without this, every fake-claude
test intermittently failed or the whole file hung — not from my code (see the "false start"
below). I ran the two Linux gate commands unmodified, only with `TMPDIR=/var/tmp` prefixed, and
verified with a plain repro script that the same commands behave identically once inode pressure
is removed. Two tiny scratch probes (`/tmp/disktest-poNt4C`, `/tmp/disktest-clone-*`) were made
directly under `/tmp` outside `scratchpad/lane-53/` while diagnosing this — not deleted, per the
hard rule; they are empty/near-empty and harmless. My own mktemp scratch is
`scratchpad/lane-53/r4-LFzpP9/` (a `--no-hardlinks` local clone), left in place.

**False start (not a defect in this work):** an early attempt to red/green-verify W1 with a
NUL-byte `--claude-bin` value caused a cascade of unrelated test failures and a file hang. Root
cause, tracked down: `ENOSPC` inside `git clone`/`checkout` calls made by *later* tests, from the
inode exhaustion above — reproduced identically with the fix's own unmodified spawnSpy test in
isolation (`repro-w1.mjs`), then cleared once `TMPDIR=/var/tmp` was set. The W1 test itself was
rewritten to inject a `spawnSpy` that throws synchronously (no dependency on real OS spawn
quirks), which is also the more portable, more surgical test.

## F1 — red/green

Verified in a mktemp clone (`scratchpad/lane-53/r4-LFzpP9/repo`, `--no-hardlinks` local clone of
this worktree at 38e4418, pristine `review-run.mjs` byte-identical to this worktree's).

- Baseline (no F1 patch): 65/65 pass.
- Mutant (pid-only `process.kill(owner.childPid,'SIGKILL')` reinserted into `sweepStaleRuns`'s
  live branch) + **old** test (pre-F1, `isProcessAlive` assertion): **65/65 pass** — the bug
  review-r3 F1 reports: the old test cannot see the signal.
- Same mutant + **F1's patch**: **63 pass / 2 fail** (red) — both victim tests
  (`review-run.test.mjs:515`/`534` non-detached and detached), `actual: 'SIGKILL' !== expected: null`.
- Mutant reverted (pristine) + F1's patch: **65/65 pass** (green).

## F2 — red/green

Same clone, F1 already applied (65/65 baseline there).

- Pristine + F2's two new assertions (win32 `Edit(C:/...)` argv check; `r*.md`/`r?.md`/`r[1].md`/
  `r{a}.md` glob-char refusal): **65/65** (green).
- Mutant (win32 drive-letter branch removed from `buildArgv`'s `writeRule`): **64 pass / 1 fail**
  (red, the new argv assertion).
- Mutant reverted; second mutant (`validateReportPath`'s regex back to `/[,)]/`, no glob
  chars refused): **64 pass / 1 fail** (red, the new glob-char assertions).
- Both mutants reverted: **65/65** (green).

## F3 — red/green

- New test (`N1: a completed run whose wt/ is already gone is skipped silently...`) against the
  **unpatched** `sweepStaleRuns`: **65 pass / 1 fail** (red) — the false "leaving stale run ...
  in place" line still fires once `wt/` is already gone.
- With the `wtPath` guard added (`lstatSync` before probing `childPid`; `continue` if `wt/` is
  already gone): **66/66** (green), no other test affected.

## W1 — red/green, and the required Cause/Discriminating-check/Fix-location/Simplification

- **Cause:** `runChild`'s `const child = spawnImpl(...)` sat directly inside a `new Promise(...)`
  executor with no `try`/`catch`. `spawn()` throws *synchronously*, before any `ChildProcess` (and
  so before its own `'error'` event) exists, for some inputs — on win32, a shebang script (the
  fixture's fake `claude`) gives a synchronous `EFTYPE` this way. That throw rejected the promise
  and escaped straight past the intended `'error'`-event handling into `runReviewRun`'s outer
  `catch`, which reports `EXIT.INTERNAL` (7) — exactly the failure in every fake-driven test in
  the Windows suite log at 1b62edb (`review-run internal error: Error: spawn EFTYPE`, 21 times).
- **Discriminating check:** inject a `spawnImpl` that throws synchronously (`spawnSpy = () => {
  throw ... }`, no dependency on real win32 spawn behaviour). Unpatched: exit code 7
  (`EXIT.INTERNAL`). Patched: exit code 4 (`EXIT.HOST`), sidecar/cleanup written normally.
- **Fix location:** `skills/team-build/scripts/review-run.mjs`, `runChild`'s `spawnImpl(...)`
  call — wrapped in `try`/`catch`; on catch, write an empty `stream.jsonl`/`stderr.txt` to
  `runDir` and `resolve()` the same `spawnError: true` shape the async `'error'` handler already
  produces (never `throw`/reject).
- **Simplification:** none needed beyond the wrap — the resolve payload reuses the exact shape
  the pre-existing `'error'` handler already builds, so `runReviewRun`'s `EXIT.HOST` branch
  (written once, for the async path) now serves both without any new branch or field.
- Red/green (mktemp clone, `TMPDIR=/var/tmp` for the reasons above):
  unpatched → `{ exitCode: 7, output: null }`; patched → `{ exitCode: 4, output: { cleanup: 'ok',
  ... } }`. Full file: 67/67 (added one test).

## W2

19 tests given a per-test `skip: process.platform === 'win32' && '<reason>'` (never a file-level
skip), reason `'no spawnable fake claude on win32; covered by the live Windows probe'` — every
test that reaches `runChild`'s real `spawnImpl` via the `run()` harness with the fixture fake
`claude` (a shebang script). Tests that exit before spawn (kill switch, recursion marker, M4
existing-report, the symlinked-plugin-root check) and tests needing no fake (argv, env, sweep,
validation, sidecar, W1) were left unconditional, matching the ruling.

## W3

Added `spawnSleeper(opts)` (`spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000)'],
opts)`) and replaced all 5 `spawn('sleep', ['30'], ...)` call sites (the four pre-existing N1
sweep tests plus F3's new test, which also used `sleep`) with it; replaced
`spawnSync('true', [], {}).pid` with `spawnSync(process.execPath, ['-e', '0'], {}).pid`. Both
`sleep` and `true` are POSIX-only; on the Windows run at 1b62edb these gave `kill EINVAL` (an
undefined `.pid` from a failed spawn) and a false "still alive" pid (spawnSync's Windows result
for a missing command) respectively.

## Linux gate

Both run unmodified, `TMPDIR=/var/tmp` prefixed only (see Deviation above); logs in
`scratchpad/lane-53/review-run-gate.log` and `scratchpad/lane-53/full-suite-gate.log`.

- `node --test skills/team-build/scripts/review-run.test.mjs`: **tests 67, pass 67, fail 0,
  cancelled 0, skipped 0.**
- `node scripts/run-tests.mjs`: **tests 2998, pass 2993, fail 0, cancelled 0, skipped 5.** The 5
  skips are pre-existing, platform-conditional, and unrelated to review-run (grep `^﹣`):
  "decide: a Windows path with backslashes..." (Windows path semantics only) · "round-1: run FROM
  a linked worktree reached via a lowercased path..." (linux filesystems are case-sensitive) ·
  "round-2 MINOR: when git deregisters a worktree but an empty directory shell survives
  (Windows)..." (reproduces a Windows-only failure shape) · "timeout terminates the exact owned
  descendant tree" (bare `# SKIP`, an unrelated delete-guard-area test) · "taskkill of only the
  suite child keeps the runner home after its nonzero exit (R1, win32 only)". None touch
  `review-run.mjs`/`review-run.test.mjs`.

## Windows gate (ben-desktop, over ssh, `-o BatchMode=yes`)

Procedure followed exactly: `git bundle create scratchpad/lane-53/l53r4.bundle
refs/remotes/origin/main build/review-run-1` locally; `scp` to a new unique
`C:\Temp\l53r4-20260929024343.bundle`; one ssh line chained with `&` (`git clone -q -n` the
bundle into a new folder of the same name, `git fetch -q origin
refs/remotes/origin/main:refs/remotes/origin/main`, `git checkout -q 643a862...`); ran each gate
command separately (also `>...2>&1` on the remote), then `scp` the logs back. Nothing on Windows
was deleted; the new folder is left in place per the hard rule.

- `node --test skills\team-build\scripts\review-run.test.mjs`
  (`scratchpad/lane-53/review-run-win.log`): **tests 67, pass 48, fail 0, cancelled 0, skipped
  19.** The 19 skips are exactly the W2 list (verbatim reason `no spawnable fake claude on win32;
  covered by the live Windows probe`); no failure anywhere in the file.
- `node scripts\run-tests.mjs` (`scratchpad/lane-53/full-suite-win.log`): **tests 2998, pass
  2965, fail 0, cancelled 0, skipped 33** (19 mine + 14 pre-existing), duration ~170s (was
  2783s/~46min at 1b62edb, entirely from the M13 hang this round removes). The three `✖ probe`
  lines around line 1356 are `scripts/run-tests.mjs`'s own test suite intentionally spawning a
  **failing** inner fixture to verify its sealed-home bookkeeping on a failed run — present
  verbatim in the original 1b62edb Windows log too, not a real failure, and unrelated to
  review-run.
- No failure anywhere outside `review-run.test.mjs` in either Windows run. No test needed to be
  stopped; nothing hung past 15 minutes (the whole full-suite run finished in ~170s).

### Tests skipped on win32 (33 total; reasons verbatim from the log)

**19, this round's W2 (review-run.test.mjs), reason `no spawnable fake claude on win32; covered
by the live Windows probe`:** a malformed first line exits 2 · a missing report exits 2 (m8) ·
a report for a different sha exits 2 · a timeout exits 3 (process-tree kill, M5) · APPROVE passes
through with exit 0 · NEEDS_FIXES (n) also passes through with exit 0 · B1: em dash/CRLF/BOM ·
B1: APPROVE with no sha exits 2 · the child's environment carries DELEGATION_REVIEW_RUN=1 ·
finding 10 (roleBodySha256/claudeBin/resolvedModel/installedRoleSha256) · finding 10
(installedRoleSha256 independent of roleSource) · finding 10 (failed cleanup surfaced) · the role
passed to the child is byte-derived · finding 4 (relative --scratch, git status clean) ·
finding 6 (owner.json rewritten with real childPid) · finding 5 (kills M4/M5/M6, spawn-boundary
argv) · finding 5 (kills M13, SIGTERM kills the fake's real OS process) · finding 5 (cleanup
never follows a symlink) · M5 (SIGTERM while the fake is running).

**14, pre-existing (not review-run, unaffected by this round):** 3 systemd-generator tests
("the systemd generator runs only on linux hosts, and these fixtures are POSIX paths") · 1
sealed-home sweep test ("no POSIX permission bits on win32 - the sweep's own guarantee there is
the 6h age check") · 9 SIGTERM/SIGINT/SIGHUP-propagation tests ("on win32, child.kill(signal)
terminates the child directly without running any Node signal handler - the run-tests.mjs stale
sweep at suite start is the guarantee there, not this handler") · 1 symlinked-temp-dir test
("dir symlinks need privileges on win32"). These are POSIX-only-behaviour tests, each skipping
on win32 by its own platform guard (a different 5 lines skip on the *Linux* gate instead — see
that section above — each host skipping only what doesn't apply to it).

## Open questions

None for this round's scope. Nits 1-11 and the live-probe items in review-r3.md remain
unactioned (out of lead-ruling-r4's scope, which is F1-F3 plus W1-W3 only).
