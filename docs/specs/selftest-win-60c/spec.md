# Lane 60c: secret-guard selftest portability on Windows (lane 60 follow-up)

Source: skills-fable-guard-60-5. The guard went live on the Windows box through an unattributed full chezmoi apply at 11:01 PM NY on Sep 29. The selftest must pass there. This is a test-only change: executable_secret-guard.sh is NOT touched, unless a finding shows the hook itself is wrong on Windows, in which case stop and report.

Evidence, from /var/tmp/lane-60/rollout-report.md:
- The literal run on the desktop's Git Bash gave 27 of 74. The selftest's JSON payload builders call a literal `python3`, and the desktop has only `python`.
- With a python3 shim it gave 72 of 74. The two failures:
  1. `phase1: a denied Write logs the file path, never the file content`: field 5 is a Windows-form path (C:/Users/...), and the test matches the fixture's MSYS path form.
  2. `phase1: dir is 700 and file is 600`: NTFS through MSYS reports 755/644.

## Fix (selftest only)
1. **Interpreter.** Resolve the interpreter once, trying `python3`, then `python` (checking that it is Python 3), then `py -3`. If none is found, FAIL loudly. Never let a missing interpreter make an empty payload that passes "allow" cases, which is exactly what happened: 47 deny cases failed and every allow case passed vacuously. Add a guard that aborts the whole selftest when payload building fails.
2. **Path form.** Normalize both sides of the path comparison, for example through `cygpath -m` when it is available, or compare on the path tail. Keep the assertion that the file CONTENT never appears.
3. **Mode check.** On MSYS or Cygwin, where uname starts with MINGW, MSYS or CYGWIN, skip only the octal mode assertions with a printed SKIP reason. Keep everything else in that case, including that the log is written and umask 000 does not widen access to a world-readable form where it can be measured.

## Proof
- Linux: selftest 74 of 74, or the count plus any new cases, 0 fail.
- The lead runs it on the Windows desktop with NO shim, and it must pass with 0 fail; SKIPs are allowed only for the mode check.
- Show the new interpreter guard aborts when no python is on PATH. Simulate that with a PATH that has none.

## Territory
Dotfiles worktree /var/tmp/lane-60c/dot, branch build/selftest-win-60c-1, base 6f183eb5af09f8222e19d750a564b34c4f529326. File: dot_claude/hooks/executable_secret-guard-selftest.sh only.
