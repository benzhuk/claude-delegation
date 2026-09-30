VERDICT: PASS 2ddcbf5c87d871f218eba174e782d065e78bc593

# secret-guard selftest — Windows Git Bash gate, no python3 shim

## Source
- `/var/tmp/lane-60c/dot`, branch `build/selftest-win-60c-1`.
- `git rev-parse HEAD` = `2ddcbf5c87d871f218eba174e782d065e78bc593` (matches target commit).

## Scratch directories
- Netcup side: `/var/tmp/delegation-win60c-ynfF` (mktemp'd, left in place, unused beyond
  being the required scratch anchor — all file staging was done directly from the repo
  path and a session scratchpad, no files were placed here).
- Windows side: `C:\Users\benzh\Code\scratch-l60c-win1` (created fresh this run, left in
  place). Contents copied via scp, same relative layout the selftest expects (sibling
  files in one directory):
  - `executable_secret-guard-selftest.sh`
  - `executable_secret-guard.sh`
  - plus small runner/check scripts I added (`check-python.sh`, `check-usrbin.sh`,
    `list-scratch.sh`, `run-selftest.sh`, `run-selftest-nopython.sh`) used only to work
    around cmd-over-SSH quoting (per brief: "put the chain inside a small .sh file").
- Read the selftest's own header before copying: it sources nothing else — `HOOK_BIN`
  resolution only ever looks for a sibling `secret-guard.sh` or
  `executable_secret-guard.sh` in the same directory as itself, so the two named files
  were sufficient.

## PATH / python3-shim check (before the run)
Ran `command -v python3 python py` in Git Bash (login shell) on the normal PATH:
```
python3:            (empty — does not resolve)
python:  /c/Program Files/Python311/python
py:      /c/Windows/py
```
Full `$PATH` was inspected — no `C:\Temp\sg60-1` (or any other python3-shim directory)
appears anywhere on it. `python3` does not resolve to anything, shim or otherwise.

## Run 1 — normal PATH, Git Bash login shell, no python3
Command: `bash.exe -l C:\Users\benzh\Code\scratch-l60c-win1\run-selftest.sh` (which cd's
into the scratch dir and runs `bash ./executable_secret-guard-selftest.sh`).

Result:
```
SKIP: phase1: dir is 700 and file is 600 (plain umask and under umask 000) -- octal mode bits are not meaningful over NTFS via MSYS/Cygwin (uname=MINGW64_NT-10.0-26100); confirmed instead: log dir/file are written under plain umask and umask 000, and umask 000 does not widen the measured mode (dir=755->755 file=644->644)
----
secret-guard-selftest: 73 passed, 0 failed, 1 skipped (of 74)
skipped: phase1: dir is 700 and file is 600 (plain umask and under umask 000)
exit code: 0
```
- Failing cases: none.
- SKIP lines: exactly one — the octal-mode check (dir 700 / file 600), which is the only
  SKIP the brief allows. The selftest's own MSYS/Cygwin detection (`uname -s` →
  `MINGW64_NT-10.0-26100`) correctly identified this as the NTFS octal-mode-not-meaningful
  case and still verified the non-octal invariants (log gets written, umask 000 doesn't
  widen the measured mode).
- The selftest resolved Python via its `python` fallback (no `python3` on PATH, no shim
  involved) — confirms the lane-60c interpreter-resolution fix works correctly on this
  box with a real, unshimmed PATH.

## Run 2 — PATH=/usr/bin only (no python at all)
Confirmed first that `/usr/bin` has no `python`, `python3`, or `py` (grep for both came
back empty/exit 1).

Command: `bash.exe -l C:\Users\benzh\Code\scratch-l60c-win1\run-selftest-nopython.sh`,
running the selftest with `PATH=/usr/bin` and printing `command -v python3/python/py`
under the same restricted PATH first (all three empty, confirming no interpreter is
reachable).

Result:
```
selftest: FATAL: no Python 3 interpreter found on PATH (tried python3, python, py -3).
selftest: aborting the whole run rather than build empty/malformed JSON payloads that would silently pass every deny case.
exit code: 1
```
Loud abort, nonzero exit (1), no silent pass — matches the expected behavior exactly.

## Summary
- Run 1 (normal PATH, no python3, real `python` present): 73 passed / 0 failed / 1
  skipped (octal-mode check only). PASS.
- Run 2 (PATH=/usr/bin, no python anywhere): loud FATAL abort, exit 1, no pass. Matches
  spec.
- No code was edited. No destructive operations were run. Both scratch directories are
  left in place as required.
