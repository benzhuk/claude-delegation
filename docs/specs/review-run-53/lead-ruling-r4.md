# Lane 53 lead ruling r4: review-r3 F1 to F3, plus the Windows suite at 1b62edb

Fix round 3 was stopped. Its builder issued an `rm -rf` on its scratch dir, which the brief bans. The command sat on a permission prompt the subagent could not show, and the builder went silent for more than 10 minutes. It left one uncommitted edit: F1, applied to review-run.test.mjs and reported green, with its red run not yet recorded. The lead is past the three-round cap, so this round is the lead's intervention. It has a Research line and a single combined scope.

## Windows suite at 1b62edb (ben-desktop, a fresh clone of the bundle, origin/main fetched)

The totals were 2996 tests: 2958 pass, 23 fail, 1 cancelled, 14 skipped. Every failure is in skills/team-build/scripts/review-run.test.mjs. That file hung for about 40 minutes, until the lead stopped that one pid.

In the log (scratchpad/lane-53/win-l53-suite.log), `review-run internal error: Error: spawn EFTYPE` appears 21 times. Research:
1. **Reproduce:** every fake-driven test exits 7 on win32.
2. **Isolate:** the fake claude is a `#!/usr/bin/env node` script (review-run.test.mjs:60, :102). Windows cannot spawn a shebang script, so `spawn()` throws synchronously with EFTYPE.
3. **Hypothesis:** the synchronous throw bypasses runChild's 'error' handler (the lane's 813bcaf fix, EXIT.HOST) and reaches the outer catch, which returns EXIT.INTERNAL (review-run.mjs:666).
4. **Discriminating check:** on Linux, a `--claude-bin` that makes spawn throw synchronously (for example, a path containing a NUL byte, or whatever the builder finds) exits 7 at 1b62edb. After the fix it exits 4.
5. The sweep tests' "dead pid" comes from `spawnSync('true').pid`. On Windows there is no `true`, so the pid is undefined. That explains the N1 "a dead childPid still gets the existing cleanup" failure (review-run.test.mjs:539).

## Scope of this round

- **F1, F2, F3** from review-r3.md, verbatim. F1 is already in the working tree; verify its red run in a mktemp copy, then commit it.
- **W1, code.** A synchronous throw from the child spawn exits EXIT.HOST (4), with the error text in runDir/stderr.txt, exactly like the async 'error' path. The unit test runs on every platform.
- **W2, tests.** On win32, every test that needs the fake claude binary is skipped, with the reason "no spawnable fake claude on win32; covered by the live Windows probe". Use `{ skip: process.platform === 'win32' && '<reason>' }`. The skip is per test, never a file-level skip. Tests that need no fake keep running on win32: the argv, env, sweep, validation, sidecar and W1 tests.
- **W3, tests.** Replace `spawnSync('true').pid` with a portable dead pid: `spawnSync(process.execPath, ['-e', '0']).pid`. Replace any other POSIX-only helper the win32 run shows, such as `sleep`, with a `process.execPath -e setTimeout(...)` child. Any test that still cannot run on win32 gets the W2 skip with its own reason.
- **Gates:**
  1. Linux: `node --test skills/team-build/scripts/review-run.test.mjs`, then `node scripts/run-tests.mjs` once.
  2. Windows: run `node --test skills/team-build/scripts/review-run.test.mjs` on ben-desktop, then the full suite once, using the procedure below. Report the counts and every failure. A failure outside review-run.test.mjs that also fails at origin/main on Windows is pre-existing; say so with the evidence.

Windows procedure:
1. `git bundle create <scratch>/l53.bundle refs/remotes/origin/main build/review-run-1`
2. `scp` the bundle to `C:/Temp/<new name>.bundle`.
3. Over ssh, on one line chained with `&` (cmd runs only the first line):
   1. `git clone -q -n` the bundle;
   2. `git fetch -q origin refs/remotes/origin/main:refs/remotes/origin/main`;
   3. `git checkout -q <sha>`;
   4. `node scripts/run-tests.mjs > C:\Temp\<log> 2>&1`.
4. `scp` the log back and read it locally.

Commit before bundling, because the bundle carries only commits. Do not push; the lead pushes. Wait: the bundle needs the branch ref, and a local branch commit is enough.

## Hard rule, restated because it was broken

No delete in any form: no rm, rm -rf, rmdir, del, git clean, git worktree remove or stash drop. Scratch is left in place, always. A command that needs permission you do not have STOPS the step and is reported.
