VERDICT: PASS
SHA: d6e411764846d8a02b82e3c0671f13ccd19a5951

This is final-candidate verification after the Opus-supplied test-parameter/docs delta; it is not a
retry of the prior `3def5cf` suite. Prior green receipts remain retained.

## Windows

- Process-owned `Global\claude-verify` was acquired within 60 seconds and released in `finally`.
- Native exit: 0. Node: `C:\nvm4w\nodejs\node.exe`; duration: 166291.6903 ms.
- Counts: 2718 tests, 2704 pass, 0 fail, 14 skipped, 0 cancelled/todo; leak check: 0 new temp entries.
- Retained receipt: `windows/d6e411764846d8a02b82e3c0671f13ccd19a5951/{suite.summary,suite.raw.log,suite.exit.txt}`.

## Netcup

- A fresh exact detached clone was prepared at `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/49/repo-d6e411764846d8a02b82e3c0671f13ccd19a5951`.
- The scratch runner had `chmod 700` and `bash -n` before its one actual suite. It used login-shell
  absolute Node `/home/ben/.local/state/fnm_multishells/664103_1790642027745/bin/node`, the regular
  `/tmp/claude-verify.lock` with `flock -w 60`, and short TMPDIR/TMP/TEMP under the lane root.
- Native exit: 0; SSH exit: 0 (`L49-netcup-ssh-r3.exit`); duration: 19999.045625 ms.
- Counts: 2718 tests, 2713 pass, 0 fail, 5 skipped, 0 cancelled/todo; leak check: 0 new temp entries.
- Retained local receipt: `netcup/d6e411764846d8a02b82e3c0671f13ccd19a5951/{suite.summary,suite.raw.log,suite.exit.txt}`.
