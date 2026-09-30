VERDICT: PASS bfb5cd4447077b9e4fbc11143f35136674f45aef

# secret-guard selftest — Windows Git Bash gate, no python3 shim (round 2)

## Source
- `/var/tmp/lane-60c/dot`, HEAD `bfb5cd4447077b9e4fbc11143f35136674f45aef` (confirmed via
  `git rev-parse HEAD`).
- Diffed the selftest against the round-1 commit (`2ddcbf5c...`): the new revision adds a
  subshell-abort trap (`SELFTEST_PID` / `USR1`) so a payload-builder failure aborts the
  whole run instead of silently continuing, and tightens the Windows path-normalization
  helper to only apply off Linux. It still sources nothing outside itself — `HOOK_BIN`
  resolution only looks for a sibling `secret-guard.sh` / `executable_secret-guard.sh` in
  its own directory, so the same two files were sufficient again.

## Scratch directories
- Windows side: new directory `C:\Users\benzh\Code\scratch-l60c-win2` (did not exist
  before this run — confirmed with a `dir` probe first — created fresh, left in place).
  Contents (same relative layout as round 1, siblings in one directory):
  - `executable_secret-guard-selftest.sh`
  - `executable_secret-guard.sh`
  - `run-selftest-win2.sh`, `run-selftest-nopython-win2.sh` (small runner scripts, needed
    to work around cmd-over-SSH quoting per the brief)
- `C:\Users\benzh\Code\scratch-l60c-win1` was left untouched — verified its file listing
  and mtimes are unchanged from round 1 (same 7 files, same timestamps).
- No netcup-side scratch directory was needed this round (files were scp'd straight from
  `/var/tmp/lane-60c/dot` and the session scratchpad).

## Run 1 — normal PATH, Git Bash login shell, no python3
Command: `bash.exe -l C:\Users\benzh\Code\scratch-l60c-win2\run-selftest-win2.sh` (cd's
into the win2 scratch dir, prints `command -v python3/python/py`, then runs
`bash ./executable_secret-guard-selftest.sh`).

```
=== command -v check ===
/c/Program Files/Python311/python
/c/Windows/py
=== running selftest ===
SKIP: phase1: dir is 700 and file is 600 (plain umask and under umask 000) -- octal mode bits are not meaningful over NTFS via MSYS/Cygwin (uname=MINGW64_NT-10.0-26100); confirmed instead: log dir/file are written under plain umask and umask 000, and umask 000 does not widen the measured mode (dir=755->755 file=644->644)
----
secret-guard-selftest: 73 passed, 0 failed, 1 skipped (of 74)
skipped: phase1: dir is 700 and file is 600 (plain umask and under umask 000)
=== exit code: 0 ===
```
- `python3` did not resolve (no line printed for it — same as round 1; no shim present).
- Failing cases: none.
- SKIP lines: exactly one — the octal-mode check (dir 700 / file 600), the only SKIP the
  brief allows.

## Run 2 — PATH=/usr/bin only (no python at all)
Command: `bash.exe -l C:\Users\benzh\Code\scratch-l60c-win2\run-selftest-nopython-win2.sh`,
running the selftest with `PATH=/usr/bin`.

```
=== command -v check under restricted PATH ===
=== running selftest under PATH=/usr/bin ===
selftest: FATAL: no Python 3 interpreter found on PATH (tried python3, python, py -3).
selftest: aborting the whole run rather than build empty/malformed JSON payloads that would silently pass every deny case.
=== exit code: 1 ===
```
- `command -v python3/python/py` under `PATH=/usr/bin` all resolved to nothing.
- Loud abort, nonzero exit (1), no silent pass — matches the expected behavior exactly.

## Summary
- Run 1 (normal PATH, no python3, real `python` present): 73 passed / 0 failed / 1
  skipped (octal-mode check only). PASS.
- Run 2 (PATH=/usr/bin, no python anywhere): loud FATAL abort, exit 1, no pass. Matches
  spec.
- No code was edited. No destructive operations were run. win1 was left untouched; win2
  and both round-1 scratch dirs remain in place.
