VERDICT: PASS 66bd1b428959002ceb5a0ff45cc6357b2d3533e7

# Lane 37 final Windows sealed gate

The candidate was tested from a fresh detached scratch clone at `66bd1b428959002ceb5a0ff45cc6357b2d3533e7`; its tracked tree was clean. The canonical integration worktree had root-owned documentation changes, so it was not used as the test source.

One actual-suite preflight found no active `node ... scripts/run-tests.mjs` process. The process-owned `Global\claude-verify` mutex was acquired within its 60-second bound and released in `finally`. `TEMP`, `TMP`, and `TMPDIR` were set to the lane-owned `integration/windows-r5` directory.

- Command: `node scripts/run-tests.mjs`
- Immediate native exit: `0` (`windows-r5/sealed-suite.exit.txt`)
- Counts: 2,665 tests; 2,653 pass; 0 fail; 12 skipped; 0 cancelled; duration 145628.5181 ms.
- Raw stdout/stderr: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/integration/windows-r5/sealed-suite.raw.log`.

The native Codex proof was not repeated: the production hook source is unchanged from the passing R2 proof, as previously verified. No source, record, commit, or cleanup changed in this gate.
