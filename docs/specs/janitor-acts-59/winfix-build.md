DONE 0cc8d3e0728e1e7175040c5376ab982f170c9914

## Territory

Lane 59 Windows test-portability fix. Test-file-only changes to:
- scripts/reclaim.test.mjs
- scripts/janitor.test.mjs
- scripts/mirror-shared-skills.test.mjs

No product code touched. Two commits on build/janitor-acts-59-1:
- 4935296 test(reclaim,janitor,mirror): run on win32 (lane 59 Windows gate)
- 0cc8d3e test(reclaim,mirror): fix remaining win32 failures found on the Windows gate

## Counts at 0cc8d3e0728e1e7175040c5376ab982f170c9914

Linux (`TMPDIR=/var/tmp node scripts/run-tests.mjs`, this worktree):
tests 3194 / pass 3183 / fail 0 / cancelled 0 / skipped 10 / todo 1

Windows (Ben's desktop, clone `C:\Temp\l59w2-3`, `node scripts/run-tests.mjs`, log
`C:\Temp\l59w2-3.log`, pulled back to `/var/tmp/delegation-l59w2-*/l59w2-3.log`):
tests 3194 / pass 3108 / fail 0 / cancelled 0 / skipped 85 / todo 1, duration_ms 220529.

Only ✖ on Windows is the harness's own expected self-check (`probe`), called out by name in the
brief as the one expected exception. Zero real failures.

Individual territory files also run and pass on both hosts standalone:
- `node --test scripts/reclaim.test.mjs`: 68 tests, 63 pass, 5 skip (Linux)
- `node --test scripts/janitor.test.mjs`: 119 tests, 117 pass, 2 skip (Linux, pre-existing skips)
- `node --test scripts/mirror-shared-skills.test.mjs`: 42 tests, 41 pass, 1 todo (Linux)

## What was fixed

1. **reclaim.test.mjs (was 59 failures, all one root cause)**
   - `baseCtx()`'s `uid: process.getuid()` crashed with `TypeError` on win32 (no such function) -
     guarded to `typeof process.getuid === "function" ? process.getuid() : 0`.
   - Added a `win32Ctx()` helper (home\AppData\Local\Temp, like LOW5's own inline build) and routed
     the kill switch and the four argv-usage-error tests through it - these never reach any path
     resolution (parseArgv/switchedOff both return before `ctx.platform` is consulted), so they run
     unconditionally on both hosts and now build a real win32 ctx rather than baseCtx()'s POSIX one.
   - Added four new win32-real-context twin tests (skipped on non-win32, mirroring LOW5's own
     `skip: process.platform !== "win32"` pattern, since `pImpl()` forces `path.win32` arithmetic
     that only lines up with real on-disk paths on an actual win32 host): T happy-path/dry-run, F3's
     linked-worktree `.git`-FILE refusal, HIGH1's ancestor-`.git` refusal, HIGH2's bare-repo refusal.
     All four ran for real and passed on the Windows gate.
   - Every other test built through `baseCtx()` (which always forces `platform: "linux"` over real,
     host-native absolute paths) was measured, on the Windows gate, to fail identically with
     `"not absolute on this host"` - `isHostAbsolute(raw, "linux")` checks `path.posix.isAbsolute()`
     against a real `C:\...` path, which never matches, before the test's own subject is ever
     reached. These 46 tests (S/T/F3/F7-adjacent/HIGH1/HIGH2/MEDIUM*/LOW*/W and two standalone ones)
     now skip on win32 with a shared, evidence-based reason (`POSIX_FIXTURE_ONLY`) that explicitly
     says this is a fixture limitation, not a claim the subject itself is POSIX-only, and points at
     the win32-context twins that exercise the same reclaim.mjs code for real. Confirmed empirically:
     re-running after adding these skips brought Windows reclaim.test.mjs failures from 45 to 0.
   - Left unskipped (confirmed passing on win32 without changes, since they never reach
     `isHostAbsolute` at all): the three `--branch`/B-only tests, `MEDIUM4`, `MEDIUM5`'s B-line case,
     `MEDIUM7`'s darwin-S test (forces `platform: "darwin"`, different code path), `F7` (its dotdot
     check runs before `isHostAbsolute`), and "one refusal among many arguments removes nothing at
     all" (an early-refusal path). An earlier pass over-skipped these seven by mistake; verified
     against the real Windows run and reverted before the second commit.

2. **janitor.test.mjs (was 1 failure)**
   - The finding-10 ENOBUFS fixture used a 200-char filename x 6500 files; combined with the sealed
     test home's own (already long) path, `git add -A` hit NTFS's legacy ~260-char path limit
     ("Filename too long") before `isTreeClean()` was ever reached. Replaced with 30000 normal-length
     filenames (`normal-length-tracked-file-NNNNNN`, ~30 bytes/line of `git ls-files -v` output),
     reaching the same >1MB target (~1.29MB) the fix needs to trip ENOBUFS, without depending on long
     filenames at all. Runs in ~1s on Linux, ~25s on the Windows gate (raised the test's own timeout
     from 60000 to 120000ms for margin).

3. **mirror-shared-skills.test.mjs (was 7 failures)**
   - POSIX-only 0o600 mode-bit assertions in two tests (F11's settings.json write, F9's codex rules
     write) are now skipped only for the mode assertion itself (`if (process.platform !== "win32")`),
     keeping the rest of each test (the actual write/round-trip/backup behaviour) running on win32.
   - Attempted a win32 `.cmd` stand-in for the fake `chezmoi` binary (three tests). Measured on the
     Windows gate that this does NOT work: `chezmoiManagedStatus()` calls
     `execFileSync('chezmoi', ..., { encoding, timeout })` with no `shell` option, and on current,
     patched Node (post CVE-2024-27980) a resolved `.bat`/`.cmd` is only auto-wrapped through
     `cmd.exe` when the caller passes `shell: true` - which product code does not, and this round
     cannot add without touching product code. These three tests now skip on win32 with that measured
     reason (`CHEZMOI_FIXTURE_UNAVAILABLE`), explicit that it is a fixture limitation, not a claim
     chezmoi detection is unavailable on win32 itself.
   - `isCodexRulesPathCertain`'s test built its "second managed Codex home" fixture at the POSIX-only
     `~/.config/orca/codex-accounts/...` path unconditionally; `codexHomes()` itself looks in a
     platform-specific location (`%APPDATA%\orca\codex-accounts` on win32, `~/Library/Application
     Support/orca/codex-accounts` on darwin). Fixed the test to build its fixture at whichever path
     `codexHomes()` will actually check, keyed off `process.platform` the same way the real function
     is (this is a real fix, not a skip - the subject exists on win32, the fixture was just wrong).
   - Review finding R2-5's failure was NOT a `crossSessionInbound` WARNING issue (the report's own
     guess was wrong) - the action line the test looks for is real and present, but the test compared
     it against a raw, host-native path (`elsewhereDest`, backslash-separated on win32) while the
     product code always prints `old.dest` in the forward-slash form the manifest fixture itself
     stored it in. Fixed by normalizing the expected string the same way
     (`elsewhereDest.split(path.sep).join('/')`). Also gave the test's fixture home a
     `crossSessionInbound: "accept"` settings.json as a hygiene measure (keeps an unrelated WARNING
     action out of its output), though this was not the actual root cause.

## Every skip added, with reason

- `scripts/reclaim.test.mjs`, 46 tests -> `POSIX_FIXTURE_ONLY` (skips on win32 only): S-class (4),
  T-class (4), F3 (2), F8, W-class (4), HIGH1 (4), H1d, HIGH2 (5), H2c, MEDIUM3 (3), MEDIUM5 (1 of
  2 - the W-line case), M5c, MEDIUM6 (2), MEDIUM7 (2 of 3 - the two world-writable cases), LOW10 (2),
  LOW11, L11, LOW13, "a symlink target...", "a target equal to HOME...", "an absent target...", "T
  dir containing a path from the cwd's own git worktree list...", "a path that is neither S, T, nor
  a live worktree...". Reason: `baseCtx()` forces `platform: "linux"` over real, host-native absolute
  paths; `isHostAbsolute` refuses every one of them as "not absolute on this host" before the test's
  own subject is reached (measured on the gate, not assumed).
- `scripts/reclaim.test.mjs`, 4 tests -> `NO_WIN32_HOST` (skip on non-win32 only, i.e. they run ONLY
  on win32): the four new win32-context twins (T happy/dry-run, F3, HIGH1, HIGH2). Reason:
  `pImpl()`'s forced `path.win32` arithmetic only lines up with real on-disk paths on an actual win32
  host. (LOW5, pre-existing, carries the same kind of guard unchanged.)
- `scripts/mirror-shared-skills.test.mjs`, 3 tests -> `CHEZMOI_FIXTURE_UNAVAILABLE` (skips on win32
  only): the two F11 chezmoi tests and the one F9 codex-chezmoi test. Reason: measured ENOENT from
  `execFileSync('chezmoi', ...)` with no `shell: true` against a `.cmd` stand-in, on current patched
  Node.

## win32 tests that now run for real (not skipped)

- `scripts/reclaim.test.mjs`: "no path given", "unknown flag", "--branch without --repo", "--branch
  combined with a path", "F14: kill switch..." (all via the new `win32Ctx()`), plus the four new
  win32-context twins (T happy/dry-run, F3, HIGH1, HIGH2), plus LOW5 (pre-existing, now actually
  exercised on a real win32 host per this gate run), plus everything not built through the POSIX
  `baseCtx()` fixture at all (the three `--branch`/B-only tests, MEDIUM4, MEDIUM5's B-line case,
  MEDIUM7's darwin-S test, F7, and the "one refusal among many" test) - these were already
  platform-agnostic and needed no change.
- `scripts/janitor.test.mjs`: "review finding 10" (the ENOBUFS test) now runs and passes on win32.
- `scripts/mirror-shared-skills.test.mjs`: F11's settings-write test and F9's codex-rules-write test
  now run their full write/round-trip/backup assertions on win32 (only the mode-bit assertion is
  skipped there); `isCodexRulesPathCertain` and review finding R2-5 now run and pass for real on
  win32 (both were real bugs in the test, not legitimate platform gaps).

## Windows verification procedure actually used

- Host `benzh@ben-desktop.tail219acd.ts.net`, `ssh -o BatchMode=yes`, remote shell cmd, chained with
  `&`, per the brief.
- Three iterations, each with a fresh scratch dir/bundle/clone name: `l59w2-1` (confirmed the uid-
  guard + win32-twins commit still left 49 real reclaim/mirror failures - this drove the second
  commit), `l59w2-2` (an ssh backgrounding mistake on my end lost that run partway - abandoned, no
  further action needed, clone/log left in place), `l59w2-3` (0 real failures, the counts reported
  above).
- Each iteration: `git fetch origin main:refs/heads/l59-main-for-bundle`, `git bundle create
  <scratch>/l59.bundle l59-main-for-bundle build/janitor-acts-59-1`, scp to a fresh
  `C:\Temp\l59w2-N.bundle`, `git clone -q -n` into a fresh `C:\Temp\l59w2-N`, `git branch -f main
  refs/remotes/origin/l59-main-for-bundle`, `git update-ref refs/remotes/origin/main
  refs/remotes/origin/l59-main-for-bundle`, checkout the target sha, `node scripts/run-tests.mjs >
  C:\Temp\l59w2-N.log 2>&1`, scp the log back and grep for `✖`/counts.

## Artifacts left in place (nothing deleted, per the hard rule)

Netcup side:
- `/var/tmp/delegation-l59w2-uBIn/l59.bundle`, `.../l59w2-1.log` (first iteration's bundle/log)
- `/var/tmp/delegation-l59w2-<second>/l59.bundle`, `.../l59w2-2-check.log` (second, abandoned
  iteration - the scratch dir path was captured in `/var/tmp/lane-59/.scratch-dir`)
- `/var/tmp/delegation-l59w2-<third>/l59.bundle`, `.../l59w2-3.log` (third, successful iteration -
  path captured in `/var/tmp/lane-59/.scratch-dir2`)
- `/var/tmp/lane-59/linux-full-run.log`, `/var/tmp/lane-59/linux-full-run-2.log` (this worktree's own
  two full-suite runs)
- `/var/tmp/lane-59/.scratch-dir`, `/var/tmp/lane-59/.scratch-dir2` (small text files recording the
  above scratch dir paths)

Windows side (`benzh@ben-desktop`):
- `C:\Temp\l59w2-1.bundle`, `C:\Temp\l59w2-1` (clone), `C:\Temp\l59w2-1.log`
- `C:\Temp\l59w2-2.bundle`, `C:\Temp\l59w2-2` (clone), `C:\Temp\l59w2-2.log` (the abandoned iteration -
  its log shows a partial run, stopped when my local ssh session was dropped by my own mistake, not a
  test failure)
- `C:\Temp\l59w2-3.bundle`, `C:\Temp\l59w2-3` (clone), `C:\Temp\l59w2-3.log` (the successful,
  reported-on run)

The `l59-main-for-bundle` branch ref (both local, in this worktree, and its remote-tracking form in
every Windows clone) is left in place per the brief's one exception.

## Deviations / assumptions

- The brief asked for the kill-switch and argv-usage tests to run "against a real win32 context,
  built the way the LOW5 test builds one" - these do not, in fact, need home\AppData\Local\Temp
  shaping to pass (they never reach path resolution), but they now build through `win32Ctx()` anyway
  for literal compliance and to make that fact visible in the test file itself.
- An early pass over-skipped seven reclaim tests that do not use `isHostAbsolute` at all (the three
  `--branch` tests, MEDIUM4, MEDIUM5's B-line case, MEDIUM7's darwin-S test, and "one refusal among
  many"). Caught and reverted before committing, using the actual Windows gate output as evidence
  rather than guessing.
- No product code changes were needed anywhere - every failure resolved to either a test fixture
  gap (uid guard, win32 path shapes, filename length, mode-bit assertions, chezmoi's `.cmd`
  limitation) or an outright test bug (R2-5's separator mismatch, isCodexRulesPathCertain's wrong
  fixture path). Nothing was BLOCKED.

## GOAL relevance

This territory serves the DONE line (a build goes spec to accepted with nothing lost or stalled):
lane 59's Windows gate was a hard FAIL blocking acceptance; it is now a clean pass with zero real
failures, unblocking the merge. Nearest NOT: "a symptom fix" - avoided by finding the actual
mechanism behind each failure (measured, not guessed) rather than blanket-skipping the whole
territory on win32.
