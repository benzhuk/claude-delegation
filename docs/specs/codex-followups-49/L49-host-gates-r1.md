VERDICT: PASS
SHA: 3def5cf193ae8e175c88153446831a3410c5b47f

Two exact-SHA sealed actual suites passed. No source or work-record file changed.

## Windows

- Native exit: 0. `Global\claude-verify` was acquired within 60 seconds and released in `finally`.
- Node: `C:\nvm4w\nodejs\node.exe`; duration: 169592.6473 ms.
- Counts: 2718 tests, 2704 pass, 0 fail, 14 skipped, 0 cancelled/todo.
- Summary: `windows/3def5cf193ae8e175c88153446831a3410c5b47f/suite.summary`
- Raw: `windows/3def5cf193ae8e175c88153446831a3410c5b47f/suite.raw.log`
- Native receipt: `windows/3def5cf193ae8e175c88153446831a3410c5b47f/suite.exit.txt`
- The runner reported `leak check: 28 new temp entries`; the native suite nevertheless returned 0.

## Netcup

- The first SSH launch was exit 126 because the staged scratch runner was not executable; no runner
  body or suite started. Preserved at `L49-netcup-ssh.exit`.
- After `chmod 700` and `bash -n`, the single actual suite used the retained exact clone, persistent
  regular `/tmp/claude-verify.lock` with `flock -w 60`, short TMPDIR/TMP/TEMP root, and login-shell
  absolute Node `/home/ben/.local/state/fnm_multishells/627792_1790641596664/bin/node`.
- Native exit: 0; SSH exit: 0 (`L49-netcup-ssh-r2.exit`); duration: 20021.616035 ms.
- Counts: 2718 tests, 2713 pass, 0 fail, 5 skipped, 0 cancelled/todo; leak check: 0 new temp entries.
- Local retained copy: `netcup/3def5cf193ae8e175c88153446831a3410c5b47f/{suite.summary,suite.raw.log,suite.exit.txt}`.
- Remote exact clone and raw: `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/49/repo-3def5cf193ae8e175c88153446831a3410c5b47f` and `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/49/3def5cf193ae8e175c88153446831a3410c5b47f/suite.raw.log`.
