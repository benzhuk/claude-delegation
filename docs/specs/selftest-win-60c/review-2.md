VERDICT: APPROVE bfb5cd4447077b9e4fbc11143f35136674f45aef

# Delta re-review: lane 60c, r2 (dotfiles 2ddcbf5 to bfb5cd4)

The delta is 28 lines in `dot_claude/hooks/executable_secret-guard-selftest.sh`. It applies the r1 patches verbatim and rewrites the comment above `paths_match`.

`git diff --quiet 6f183eb bfb5cd4 -- dot_claude/hooks/executable_secret-guard.sh` is clean, so the hook is still untouched. The worktree is clean at bfb5cd4. I ran every check against scratch copies in `/var/tmp/delegation-rv60c-694V`.

## F1: payload-builder abort. FIXED
- **Cause:** `exit 1` inside `$(...)` ended only the subshell. It now sends `kill -USR1 "$SELFTEST_PID"` to the top-level shell, whose USR1 trap exits 1 (lines 87-91 and 328-332).
- **Discriminating check 1 (every build fails):** I used a `python3` shim that passes the `version_info` probe and fails every build, on a PATH of /usr/bin symlinks with no python. To count passes I used an instrumented scratch copy where `pass_case` prints to stderr.
  - Result: one builder FATAL, then `aborting the whole run.`, exit 1, no summary.
  - **0 passes counted.**
- **Discriminating check 2 (a mid-run failure on an allow case):** the shim fails only the `ls -la` payload, which is the first allow case and is preceded by one deny case.
  - Result: exactly 1 pass counted, which is that preceding deny case. Then the run aborts, exit 1. The failing allow case is never counted.
  - So the trap fires before the assertion evaluates.
- **No-python PATH:** the resolver FATAL, exit 1, no tests run.
- **Fixture cleanup:** no `/var/tmp/secret-guard-selftest-*` is left behind after an abort, so the EXIT teardown still runs.

## F2: `paths_match` basename fallback on Linux. FIXED
- **Change:** `paths_match` now returns 1 after the exact compare unless `IS_WINDOWS_BASH=1` (line 310). The tail fallback runs only when `cygpath` is absent (line 312).
- **Discriminating check:** I ran a scratch hook mutant that logs the Write target as `/wrong/dir/<basename>`.
  - On Linux: `73 passed, 1 failed`, and the FAIL is `phase1: a denied Write logs the file path, never the file content` with `field5=/wrong/dir/selftest-f1-write-target.md`, exit 1.
  - The weakening is gone.
- **Content checks:** the content-never-in-log assertions are unchanged.

## F3: empty stat on the MSYS branch. FIXED
- **Change:** `[ -n "$dmode" ] && [ -n "$fmode" ]` were added to the Windows-branch condition (line 927).
- **Discriminating check:** I simulated MSYS with a `uname` shim that prints `MINGW64_NT-10.0-19045`, plus a `stat` shim that always fails.
  - The mode test reports `FAIL: ... (Windows mode-check SKIP path) -- ... dir=-> file=->`, not a SKIP.
  - The two other failures in that run (symlink and directory at the log path) come from existing tests that read modes with `stat`. They fail the same way with the bad `stat` on the Linux branch, so they are expected and not a regression.
- **The uname shim with real stat:** `73 passed, 0 failed, 1 skipped`. The only SKIP is the mode check, and the printed reason names the uname.

## Regression hunt (the 28 changed lines)
- **Existing signal and trap code:** nothing else in the selftest or the hook uses USR1, `kill` or `trap`. The existing `trap teardown_fixture EXIT` is unaffected, and `exit 1` in the USR1 handler still runs it.
- **The `( umask 000; run_hook ... "$(mk_...)" )` call site:** `$$` in the nested subshell is still the top-level PID. The subshell finishes, then the parent traps and exits. Nothing is counted by `run_hook`.
- **The `[ -z "$out" ]` addition:** `json.dumps` output is never empty, so it cannot cause a false abort. The Linux run confirms this.
- **By design, not a finding:** on a simulated Windows host without `cygpath`, the basename fallback still accepts a same-basename wrong directory. The spec permits this, and Git for Windows ships `cygpath`, so the fallback is not reached there.

## Linux selftest
`secret-guard-selftest: 74 passed, 0 failed, 0 skipped (of 74)`, exit 0.

No open findings.
