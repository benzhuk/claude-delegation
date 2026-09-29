VERDICT: APPROVE 643a8626b7cf3b8d9711e7640ee95a548d9fb69a

# Lane 53 delta review r4: review-run fix round 4 (`git diff 1b62edb 643a862`)

Scope: lead-ruling-r4.md (F1 to F3 from review-r3, verbatim; W1, W2, W3). The worktree's `skills/` and `hooks/` match 643a862 byte for byte (`git diff --quiet 643a862 -- skills hooks`, and the same check against HEAD c4154ee). `git status` in the worktree shows only the pre-existing `?? relscratch/`.

What I ran. Everything ran in `/var/tmp/lane53-r4-pW2h/` (from `mktemp -d`), with TMPDIR set inside that dir.
- `base/` is a `--no-hardlinks` clone checked out at 643a862.
- Each mutant ran in its own fresh clone, `m-<name>/`, using `mutate.mjs`. Logs are in `m-<name>.log`.
- Probes: `syncthrow.mjs` and `w1probe.mjs`.
- Fix simulation: `fixsim.mjs`, with its output in `fixsim.log`.

Not run: no real `claude -p`, no full `run-tests.mjs`, and no edit, stage or commit in the worktree. Nothing was deleted. No process was signalled by hand.
- The only kills came from the F1 kill mutants. They are guarded to fire only when the default `isAliveFn` is in use, so they signal only the sleeper victims that the test file itself spawned, never the fixture pid 555555.
- After the runs, `ps` shows no leftover process that refers to my scratch dir, and no leftover sleeper.

/tmp note: `/tmp` is at 100% inode use (698 free). This report is the only file I wrote there.

## Suite (question 5)

`TMPDIR=/var/tmp/lane53-r4-pW2h/tmp node --test skills/team-build/scripts/review-run.test.mjs` at 643a862 (in `base/`):
**tests 67, pass 67, fail 0, cancelled 0, skipped 0** (13.9 s).

Windows evidence, which I read and did not rerun (`scratchpad/lane-53/review-run-win.log`, `full-suite-win.log`):
- The file gives tests 67, pass 48, fail 0, cancelled 0, skipped 19.
- The full suite gives tests 2998, pass 2965, fail 0, cancelled 0, skipped 33.
- The one `✖ probe` (full-suite-win.log:1356) is run-tests.mjs's own nested fixture, which is meant to fail. It also appears at 1b62edb (win-l53-suite.log:1356), so it is pre-existing.
- These numbers match build-r4.

## Verification table (question 1: F1 to F3, plus W1)

Each row is a fresh clone at 643a862 with one mutation. The counts are for the whole file.

| Item | Applied verbatim? | Mutant | Result |
|---|---|---|---|
| F1 (review-run.test.mjs:530-534, :549-553) | Yes, both sites byte-identical to review-r3's replacement. Only the victim constructor changed to `spawnSleeper` (W3, as the ruling directs). | SIGKILL of `childPid` in the live branch, dir kept (`f1-kill-pid`) | **65 pass / 2 fail**: both victim tests, `actual: 'SIGKILL', expected: null` |
| | | group then pid SIGKILL (`f1-kill-grp`) | **65 / 2 fail**, the same two tests |
| | | the same mutant with the pre-F1 `isProcessAlive` assertions put back (`f1-kill-grp-oldtest`) | **67/67 pass**. So the old test was blind and F1 is the discriminating change. |
| F2 (test :915-917, :944-947) | Yes, verbatim | win32 branch emits `Edit(/C:/…)` (`f2-win-extra-slash`) | **66 / 1 fail**: `actual 'Read,Edit(/C:/Users/me/out dir/report.md)'` |
| | | the regex put back to `/[,)]/` (`f2-regex-old`) | **66 / 1 fail**: `Missing expected exception: r*.md` |
| F3 (review-run.mjs:394-397, and the test at :559) | The code is verbatim. The test is verbatim except `spawn('sleep',…)` became `spawnSleeper(…)`, which W3 directs. | the `lstatSync(wtPath)` guard removed (`f3-no-wt-guard`) | **66 / 1 fail**: the new test captures the "leaving stale run … childPid 2321723" line |
| W1 (review-run.mjs:712-734, the test at :167) | n/a | `git show cc81f22 -- review-run.mjs \| git apply -R` (`w1-revert-code`) | **66 / 1 fail**: the W1 test gives `actual: 7, expected: 4` |

Every item goes red under its named mutant and green at 643a862. **Verified.**

## Question 2: W1

**It fixes the cause, not a compensation.** Before the fix, `spawnImpl(...)` ran bare inside the `new Promise` executor. A synchronous throw rejected the promise and fell into `runReviewRun`'s outer catch, which returns `EXIT.INTERNAL`. The fix is at that call site.
- It resolves the same `spawnError: true` shape as the async `'error'` handler (`:836-847`). So the existing `EXIT.HOST` branch (`:626-630`) serves both paths.
- It writes `stream.jsonl` and `stderr.txt` into runDir.
- Measured on Linux with a real OS-level synchronous spawn failure, `ENAMETOOLONG` (`w1probe.mjs`):
  - 643a862 exits **4** with `review-run: failed to start …: spawn ENAMETOOLONG`.
  - With W1 reverted it exits **7** with `review-run internal error: Error: spawn ENAMETOOLONG`.
  - This is the Linux form of the lead's discriminating check.
- On Windows (review-run-win.log), each EFTYPE run now prints `failed to start …fake-claude.mjs: spawn EFTYPE`, and the W1 test and test :152 pass.

**Can the catch swallow a non-spawn error as HOST? Only one narrow class, measured, and not counted.**
- The `try` wraps only the `spawnImpl(...)` call. No other code of the script is inside it, so an ordinary internal error (git, fs, JSON, and so on) still reaches `EXIT.INTERNAL` (for example, the M11 test at :783 still asserts 7 and passes).
- What the catch *does* take is spawn()'s own argument-validation throw (`TypeError`, `ERR_INVALID_ARG_*`, which carries no `errno` and no `syscall`). That is a bug in this script's argv or env building, not a host failure. Measured (`w1probe.mjs`):
  - An env value carrying a NUL byte gives **4** at 643a862 and **7** with W1 reverted.
  - `--claude-bin ''`, which parseArgs accepts today, gives **4** at 643a862 and **7** with W1 reverted.
- Why this does not count:
  - Today no real input reaches the validation class except `--claude-bin ''`, where 4 is closer to right than 7 (1, usage, would be correct).
  - Otherwise it takes a future bug in the script.
  - The TypeError text is still printed verbatim on stderr.
- A ready patch is in non-blocking item NB1.

## Question 3: W2, the win32 skips

All 19 skipped tests are genuinely fake-dependent **as written**. Each one reaches its assertions only through a spawned fake `claude`: a `run()` with the default or a custom fake, or the review-run CLI launched with `--claude-bin <fake>`. Each one asserts `EXIT.OK`, `BAD_REPORT` or `TIMEOUT`, or asserts the fake's own pid or output.
- The skip is per test, with the ruling's exact reason string.
- No file-level skip exists.
- None of these is a check that passes while not looking.

Skips I disagree with (non-blocking; each could run on win32 with a small rewrite):
- **:266, "the child's environment carries DELEGATION_REVIEW_RUN=1 …"** Every assertion except `exitCode === EXIT.OK` reads `capturedEnv` and `capturedArgv`, which the spy captures *before* spawn. On win32 the spawn then throws EFTYPE and W1 exits 4.
  - With `assert.equal(exitCode, process.platform === 'win32' ? EXIT.HOST : EXIT.OK)` and no skip, the security-relevant env-strip check at the spawn boundary would run on win32.
  - The pure `buildChildEnv` tests (:982, :1004) already run there, and no platform branch sits between `buildChildEnv` and `spawnImpl`. So this is coverage depth, not a hole.
- **:722, "finding 5 (kills M4/M5/M6): the real spawn-boundary argv …"** The same shape applies: argv and cwd are captured before spawn, and `agents.json` is written before spawn. On win32 this is where the `Edit(C:/…)` rule meets the real `--report` path, so it is worth running there with the same exit-code adjustment.
- **:318 and :340 (sidecar identity fields).** The sidecar is written on the spawn-failure path too (`:657`). So `installedRoleSha256`, `roleSource` and `role.sha256` could be asserted on win32, where `installPath` path handling is the platform-sensitive part, if the exit assertion were relaxed. This is lower value.

Checks that **pass on win32 without looking at what they claim** (non-blocking; see NB2):
- **:651 finding 8** and **:709 finding 7** use `if (process.platform === 'win32') return;`. Both report ✔ on Windows in 0.18 ms and 0.04 ms (review-run-win.log:63-64), where they should report a skip.
  - They are pre-existing and not in the diff. Ruling W3's last sentence ("Any test that still cannot run on win32 gets the W2 skip with its own reason") covers them. As a result, build-r4's "48 pass" on Windows includes 2 no-op passes.
- **:257, "the run's clone directory (wt/) is removed on every path — approve, malformed, missing, …"** This one is fake-dependent and unskipped. On win32 all four modes take the EFTYPE spawn-failure path (review-run-win.log shows the four `failed to start …fake-claude.mjs` lines).
  - It is **not vacuous**: it still asserts that the common cleanup at `:653` removes a real `git clone`'s wt/ on Windows, and it is the only win32 check of that line.
  - Its mode loop means nothing there. Keep it running on win32, and add a comment. Do not skip it.
- **:152** On win32, this test (the spawn-failure test) exercises the synchronous W1 path, not the async `'error'` path its comment describes (EACCES). It is still a real check there, because reverting W1 makes it fail on win32. Only its comment is POSIX-specific.

## Question 4: W3, the portable pid helpers

- `spawnSleeper` (`:110-112`) is `spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000)'], opts)`. **Every victim self-exits after 30 s**, so no failure mode can leak a process past 30 s.
- The dead pid (`:577`) is `spawnSync(process.execPath, ['-e','0']).pid`. It is portable, and it passes on Windows (log:57).
- **Is the victim always killed in `finally`?** It is when an *assertion* fails, at all five sites:
  - :521 and :540 assert inside `try` and kill in `finally`. For the detached victim, the kill is `process.kill(-pid)`, falling back to `victim.kill`.
  - :559 and :585 assert only after their `finally` has already killed the victim.
- **It is not killed when *setup* throws.** In :559 (`fs.mkdirSync` and `writeFileSync`) and :585 (`makeRunDirWithOwner`), the sleeper is spawned before the `try`.
  - Measured (`m-w3-setup-throw`): I injected a throw right after the :587 spawn and ran `--test-name-pattern "prints one line"`. The result was 1 fail, and the file process then lingered **30 s** until the victim exited on its own. Nothing was left afterwards.
  - This is bounded, and setup here is only mkdir or write under TMPDIR, but on this host a full `/tmp` inode table (ENOSPC) makes that path plausible. A patch is in NB3.
- On Linux, the helpers change nothing observable: F1's discrimination was measured with them in place. The win32 behaviour comes from the Windows log (the four N1 victim and dead-pid tests pass: log lines 41, 43, 55, 56, 57, 58).

## Question 5: regressions in the delta

None found.
- F3's guard reuses `fsImpl.lstatSync`, which the sweep already calls at `:385`. A failed lstat means "nothing to reclaim", and the sweep only ever removes wt/, so nothing is skipped that could have been reclaimed.
- W1's catch returns before the owner.json rewrite, the listeners and the timer are set up, so nothing is left armed.
- The W2 option objects are `skip: false` off win32. On Linux all 67 tests run (67 run, 0 skipped).
- The 30 s `timeout` options on :808 and :1105 are kept alongside the new `skip`.

## Findings (count toward NEEDS_FIXES)

None.

## Non-blocking (not counted; each has a patch simulated in `fixsim.mjs`)

**Result of applying NB1 to NB3 together:** tests 68, pass 68, fail 0, cancelled 0, skipped 0. The W1 probe then gives: env-NUL exits **7**, ENAMETOOLONG exits **4**, and `--claude-bin ''` exits **1** ("missing value for --claude-bin").

### NB1. W1: keep spawn()'s own argument-validation TypeErrors on EXIT.INTERNAL, and refuse empty flag values

`review-run.mjs:718-719`, current:
```js
    } catch (err) {
      // W1 (lead ruling r4): spawn() throws SYNCHRONOUSLY for some inputs — a shebang script on
```
Replacement:
```js
    } catch (err) {
      // Only an OS-level spawn failure (a libuv errno: EFTYPE, ENAMETOOLONG, ...) is a host problem.
      // spawn()'s own argument validation (ERR_INVALID_ARG_*, no errno) is a bug in this script's
      // argv/env building: rethrow, so it reaches the outer catch as EXIT.INTERNAL.
      if (typeof err?.errno !== 'number') throw err;
      // W1 (lead ruling r4): spawn() throws SYNCHRONOUSLY for some inputs — a shebang script on
```
`review-run.mjs:125`, current:
```js
    if (value === undefined) usageError(`missing value for ${flag}`);
```
Replacement:
```js
    if (value === undefined || value === '') usageError(`missing value for ${flag}`);
```
`review-run.test.mjs:172`, current:
```js
  const spawnSpy = () => { const e = new Error('spawn EFTYPE'); e.code = 'EFTYPE'; throw e; };
```
Replacement (the shape of Node's real `ErrnoException`; UV_EFTYPE is -4028 on win32):
```js
  const spawnSpy = () => { const e = new Error('spawn EFTYPE'); e.code = 'EFTYPE'; e.errno = -4028; e.syscall = 'spawn'; throw e; };
```
Add before `test('a missing report exits 2, and (m8)`:
```js
test('W1: a spawn() argument-validation TypeError (a bug in this script, no errno) stays EXIT.INTERNAL', async () => {
  const spawnSpy = (cmd, argv, opts) => spawn(cmd, argv, { ...opts, env: { ...opts.env, BAD: 'a\0b' } });
  const { exitCode } = await run({ spawnSpy });
  assert.equal(exitCode, EXIT.INTERNAL);
});
```
This test is portable: the validation throw happens before any OS call, on win32 too.

### NB2. Report the win32 no-op tests as skips, not passes

`review-run.test.mjs:651-652`, current:
```js
test('finding 8: a symlinked --repo pointing at the resolved plugin root still trips the inside-repo exit-4 check, before any clone', async () => {
  if (process.platform === 'win32') return; // symlink creation needs elevation on some win32 setups
```
Replacement:
```js
test('finding 8: a symlinked --repo pointing at the resolved plugin root still trips the inside-repo exit-4 check, before any clone', { skip: process.platform === 'win32' && 'symlink creation needs elevation on some win32 setups' }, async () => {
```
`review-run.test.mjs:709`, current:
```js
test('finding 7: isProcessAlive treats EPERM (a process owned by another user) as alive, not dead', () => {
```
Replacement:
```js
test('finding 7: isProcessAlive treats EPERM (a process owned by another user) as alive, not dead', { skip: (process.platform === 'win32' && 'no pid-1-equivalent EPERM case on win32') || (process.getuid?.() === 0 && 'root may signal pid 1, so there is no EPERM to probe') }, () => {
```
`review-run.test.mjs:713-714`, current:
```js
  if (process.platform === 'win32' || process.getuid?.() === 0) return;
  assert.equal(isProcessAlive(1), true, 'EPERM must count as alive, never as dead');
```
Replacement:
```js
  assert.equal(isProcessAlive(1), true, 'EPERM must count as alive, never as dead');
```
Optional: at :257, add a comment that on win32 every mode takes the spawn-failure path and the test then checks only the `:653` cleanup of a real clone. Keep the test running there.

### NB3. W3: spawn-before-try leaves a victim alive (for up to 30 s) when setup throws

`review-run.test.mjs:562-570`, current:
```js
  const runDir = path.join(scratch, 'review-run-abc1234-done0001');
  fs.mkdirSync(runDir);
  fs.writeFileSync(path.join(runDir, 'owner.json'), JSON.stringify({
    pid: 424242, startedAt: new Date(Date.now() - 999_999_999).toISOString(), childPid: victim.pid, timeoutMin: 1,
  }));
  const origWrite = process.stderr.write;
  let captured = '';
  process.stderr.write = (chunk) => { captured += chunk; return true; };
  try { sweepStaleRuns(scratch, 45); } finally { process.stderr.write = origWrite; victim.kill('SIGTERM'); }
```
Replacement:
```js
  const runDir = path.join(scratch, 'review-run-abc1234-done0001');
  const origWrite = process.stderr.write;
  let captured = '';
  try {
    fs.mkdirSync(runDir);
    fs.writeFileSync(path.join(runDir, 'owner.json'), JSON.stringify({
      pid: 424242, startedAt: new Date(Date.now() - 999_999_999).toISOString(), childPid: victim.pid, timeoutMin: 1,
    }));
    process.stderr.write = (chunk) => { captured += chunk; return true; };
    sweepStaleRuns(scratch, 45);
  } finally { process.stderr.write = origWrite; victim.kill('SIGTERM'); }
```
`review-run.test.mjs:588-595`, current:
```js
  const runDir = makeRunDirWithOwner(scratch, {
    pid: 424242, startedAt: new Date(Date.now() - 999_999_999).toISOString(), childPid: victim.pid, timeoutMin: 1,
  });
  const origWrite = process.stderr.write;
  let captured = '';
  process.stderr.write = (chunk, ...rest) => { captured += chunk; return true; };
  try {
    sweepStaleRuns(scratch, 45);
```
Replacement:
```js
  const origWrite = process.stderr.write;
  let captured = '';
  let runDir;
  try {
    runDir = makeRunDirWithOwner(scratch, {
      pid: 424242, startedAt: new Date(Date.now() - 999_999_999).toISOString(), childPid: victim.pid, timeoutMin: 1,
    });
    process.stderr.write = (chunk, ...rest) => { captured += chunk; return true; };
    sweepStaleRuns(scratch, 45);
```

### NB4. Win32 coverage depth (lead's call)

Tests :266, :722, :318 and :340 could run on win32 with the exit-code assertion made platform-aware (details under question 3). More broadly, most in-process fake tests could run on win32 through a spy that launches the fake via node itself:
```js
(c, a, o) => spawn(process.execPath, [c, ...a], o)
```
That leaves the two CLI-subprocess SIGTERM tests (:808, :1105), whose win32 `taskkill /T` path is the live probe's job.

### NB5. build-r4 accuracy

- The W2 section says tests that "exit before spawn … were left unconditional". It does not mention :257, a fake-driven test that is also left unconditional.
- The Windows "48 pass" includes the two `return`-early no-ops (NB2).
- The rest of build-r4 matches what I measured: the F1, F2, F3 and W1 red and green results, the Linux count of 67, and the Windows counts.

## C4 (W1, the bug fixed in this delta)

Cause: `runChild` called `spawnImpl(...)` bare inside the `new Promise` executor. spawn() throws synchronously for non-`EACCES/EAGAIN/EMFILE/ENFILE/ENOENT` libuv errors (win32 `EFTYPE` on a shebang script), so the throw rejected the promise into `runReviewRun`'s outer catch, which returns `EXIT.INTERNAL` (7), bypassing the `'error'` handler's `EXIT.HOST`.
Discriminating check: a spawnImpl that throws synchronously exits 7 with `cc81f22` reverted and 4 at 643a862 (W1 test: `actual: 7, expected: 4` under the revert). A real OS-level synchronous failure (`ENAMETOOLONG`, in `w1probe.mjs`) also gives 7, then 4.
Fix location: `skills/team-build/scripts/review-run.mjs:712-734`, a try/catch around the `spawnImpl` call only, resolving the existing `spawnError` shape. Optional narrowing in NB1.
Simplification: no new branch or field. The synchronous catch resolves the same result shape as the async `'error'` handler, so the one existing `EXIT.HOST` branch serves both.
