VERDICT: PASS 11a1023e47aeb94d7646d21c1b4c9b4cdc0bc883

# Lane 37 changed-candidate Windows sealed gate R6

The candidate ran from fresh detached clean scratch clone `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/windows-r6-clone` at the stated SHA. The one actual-suite preflight was clear. The process-owned `Global\claude-verify` mutex was acquired within 60 seconds and released in `finally`; `TEMP`, `TMP`, and `TMPDIR` were lane-owned `integration/windows-r6`.

- Command: `node scripts/run-tests.mjs`
- Immediate native exit: `0` (`windows-r6/sealed-suite.exit.txt`)
- Counts: 2,665 tests; 2,653 pass; 0 fail; 12 skipped; 0 cancelled; duration 145625.668 ms.
- Raw stdout/stderr: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/integration/windows-r6/sealed-suite.raw.log`.

No source, record, commit, or cleanup changed in this gate.
