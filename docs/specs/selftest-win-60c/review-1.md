VERDICT: NEEDS_FIXES 2ddcbf5c87d871f218eba174e782d065e78bc593

# Review: lane 60c, secret-guard selftest portability (dotfiles 2ddcbf5 against base 6f183eb)

File reviewed: `dot_claude/hooks/executable_secret-guard-selftest.sh` (the only changed file). Scratch work was done only in `/var/tmp/delegation-rv60c-fVJP`. The worktree is clean and HEAD is still 2ddcbf5.

## Findings

### F1 (HIGH): the payload-builder abort guard does not abort. The past bug class is reproduced exactly (27 of 74)
- Where: `executable_secret-guard-selftest.sh:314-324` (`_py_json`), used at every call site as `"$(mk_*_payload ...)"`.
- Cause: `_py_json` runs `exit 1` inside the command substitution the caller wraps it in. That `exit` ends only the `$(...)` subshell. The script uses `set -u` without `set -e`, and even with `set -e` a substitution used as a function argument would not propagate. So after a failure the parent calls `run_hook` with an EMPTY payload, the hook allows, and every `assert_allow` passes vacuously.
- Discriminating check: I made a `python3` shim that passes the version probe (`version_info`) but exits 1 for every payload build, and put it first on a PATH that has no other python. Result: 79 `FATAL: JSON payload builder failed` lines, then `secret-guard-selftest: 27 passed, 47 failed, 0 skipped (of 74)`, exit 1. That matches the Windows incident exactly: 47 deny cases failed and 27 allow cases passed vacuously. The overall exit is nonzero only because deny cases happen to exist. A builder failure limited to some payloads (one builder, or one argument shape) would let its allow cases pass silently with no FAIL line.
- Fix location: `_py_json` plus a top-level trap placed just after the interpreter-resolution block (after line 86).
- Simplification: the `$$`-signal approach needs no changes at the 87 call sites.
- Patch, part 1. After line 86:
  - Old:
    ```
      exit 1
    fi

    # --- platform detection (lane 60c)
    ```
  - New:
    ```
      exit 1
    fi
    # A payload builder runs inside "$(...)" at every call site, so its own
    # `exit` only ends that subshell. It signals the top-level shell instead,
    # which aborts the whole run here ($$ is the top-level PID in subshells too).
    SELFTEST_PID=$$
    trap 'echo "selftest: FATAL: a JSON payload builder failed -- aborting the whole run." >&2; exit 1' USR1

    # --- platform detection (lane 60c)
    ```
- Patch, part 2. Lines 319-321:
  - Old:
    ```
      if [ "$status" -ne 0 ]; then
        echo "selftest: FATAL: JSON payload builder failed (interpreter=${PYTHON_CMD[*]}, exit=$status) -- aborting rather than continue with an empty/malformed payload." >&2
        exit 1
    ```
  - New:
    ```
      if [ "$status" -ne 0 ] || [ -z "$out" ]; then
        echo "selftest: FATAL: JSON payload builder failed (interpreter=${PYTHON_CMD[*]}, exit=$status) -- aborting rather than continue with an empty/malformed payload." >&2
        kill -USR1 "$SELFTEST_PID" 2>/dev/null
        exit 1
    ```
- Verified on a scratch copy:
  - With the same failing shim: one builder FATAL line, then `a JSON payload builder failed -- aborting the whole run.`, no summary, exit 1.
  - The EXIT trap still tears down the fixture: no `/var/tmp/secret-guard-selftest-*` directory is left behind.
  - On normal Linux the patched copy still gives 74 passed, 0 failed, 0 skipped, exit 0.

### F2 (MEDIUM): `paths_match` falls back to the basename on every platform, which weakens the Linux assertion
- Where: `executable_secret-guard-selftest.sh:300-306` (`paths_match`, the unconditional `path_tail` line 304). It is used at line 573.
- Cause: the tail comparison runs on Linux too. Now any logged field 5 with the same final component passes, even one in the wrong directory, and even when field 5 is only the basename.
- Discriminating check (mutation on a scratch copy of the hook, passed in via HOOK_BIN): I rewrote the logged Write target to `/wrong/dir/<basename>`.
  - The 2ddcbf5 selftest gives 74 of 74 passed, exit 0. The mutant is not caught.
  - The base 6f183eb selftest FAILS `phase1: a denied Write logs the file path, never the file content`.
  - So this is a real loss of assertion strength on Linux.
  - The content assertions (the key and `here is a stash` never in the log) are intact and strict.
- Fix location: `paths_match`. Normalize only on MSYS or Cygwin. Git for Windows ships `cygpath`, and `cygpath -m` on both sides already matches the MSYS argument-converted `C:/...` form, so the tail fallback is needed only when `cygpath` is absent.
- Simplification: exact match everywhere, plus a Windows-only normalization.
- Patch. Lines 302-305:
  - Old:
    ```
      [ "$(normalize_path_form "$a")" = "$(normalize_path_form "$b")" ] && return 0
      [ "$(path_tail "$a")" = "$(path_tail "$b")" ] && return 0
      return 1
    ```
  - New:
    ```
      [ "$IS_WINDOWS_BASH" -eq 1 ] || return 1
      [ "$(normalize_path_form "$a")" = "$(normalize_path_form "$b")" ] && return 0
      command -v cygpath >/dev/null 2>&1 && return 1
      [ "$(path_tail "$a")" = "$(path_tail "$b")" ] && return 0
      return 1
    ```
- Verified on a scratch copy:
  - Normal Linux run: 74 of 74, 0 failed.
  - Against the mutated hook: that one test FAILs (`field5=/wrong/dir/...`), exit 1.
  - Predicted on Windows: `cygpath -m /tmp/selftest-f1-write-target.md` equals the `C:/Users/.../Temp/...` form that MSYS gave python, so the test passes.
- The comment block at lines 274-284 should be updated to match: the tail fallback applies only on MSYS or Cygwin without cygpath.

### F3 (LOW): the Windows mode branch can pass on empty stat output
- Where: `executable_secret-guard-selftest.sh:916-917`.
- If `stat` fails on both runs, `dmode`, `dmode2`, `fmode` and `fmode2` are all empty. The equality then holds and the result is a SKIP rather than a FAIL. The existence checks keep this mostly honest.
- Patch:
  - Old: `&& [ "$dmode2" = "$dmode" ] && [ "$fmode2" = "$fmode" ]; then`
  - New: `&& [ -n "$dmode" ] && [ -n "$fmode" ] && [ "$dmode2" = "$dmode" ] && [ "$fmode2" = "$fmode" ]; then`
- Predicted: no change on Linux, where this branch is never taken. On Git Bash `stat -c %a` works, so the result is still a SKIP.

## Answers to the attack brief
1. **Interpreter resolution.**
   - The order is python3, then python, then `py -3`. Each one is checked with `sys.version_info[0] == 3` (lines 69-80), so python and py are verified as Python 3.
   - With no interpreter at all, the run aborts loudly with a nonzero exit. Proof: a PATH made of symlinks to all of /usr/bin minus python*/py*/pydoc* gave `FATAL: no Python 3 interpreter found on PATH (tried python3, python, py -3).` and exit 1, with no tests run.
   - A builder that fails mid-run does NOT abort (F1).
2. **Path-form normalization.** Both sides are normalized, and the content-never-in-log assertion is present and strict (line 573, unchanged `grep -qF` checks). The tail fallback weakens the path check on Linux (F2).
3. **Mode check.**
   - It is skipped only when `uname -s` matches MINGW*/MSYS*/CYGWIN*, and it prints a SKIP. Otherwise the branch becomes a FAIL.
   - On Linux the 700/600 assertion is unchanged and runs.
   - Assertion counts, base against new:
     - `assert_*` calls: 57 and 57
     - `pass_case`: 19 and 19
     - `fail_case`: 22 and 23 (one new FAIL path in the Windows branch)
     - test functions: 69 and 69
   - The only removed assertion line is the field 5 `=` compare, which `paths_match` replaced.
4. **Hook untouched.** `git diff --quiet 6f183eb 2ddcbf5 -- dot_claude/hooks/executable_secret-guard.sh` is clean.
5. **Linux run.** `secret-guard-selftest: 74 passed, 0 failed, 0 skipped (of 74)`, exit 0.

## Verified clean
- The hook is untouched.
- The interpreter resolution order and version check are correct, and a missing interpreter aborts the run.
- The skip is gated to Windows-family uname only.
- The summary line and exit code handle SKIP without making a failure look like a pass.
- No other assertion was removed or weakened.
