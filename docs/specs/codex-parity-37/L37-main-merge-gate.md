VERDICT: BLOCKED — merge SHA 2bad23a593d3c86bf808e6ee0da6a1dd61c21e09; Windows sealed suite native exit 1.

# Lane 37 exact-merge Windows gate

The isolated ordinary clone fast-forwarded to origin/main `6275fa0dbcfdf34cad39298fd50366e6503ddfb9`, verified the accepted Lane 37 record on `origin/build/codex-parity-37`, and merged that branch with the required history bullet as commit `2bad23a593d3c86bf808e6ee0da6a1dd61c21e09`. Its tracked tree was clean before the gate. The preflight found no active `node scripts/run-tests.mjs` process; the process-owned `Global\\claude-verify` mutex was acquired within 60 seconds and released in `finally`.

- Command: `node scripts/run-tests.mjs`
- Scratch: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/main-merge-windows`
- Native exit: 1, captured immediately in `sealed-suite.exit.txt`
- Counts: 2,688 tests; 2,675 pass; 1 fail; 12 skipped; 0 cancelled; duration 172523.7114 ms.
- Raw log: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/main-merge-windows/sealed-suite.raw.log`
- Time: 2026-09-28T22:43:49.4803145Z through 2026-09-28T22:46:42.6076424Z.

The single failure is `hooks/codex-unsupported.test.mjs:209`, “route child early-close and bounded timeout fail silent without erasing peer or advisory output.” Its slow route preserved peer output but omitted the asserted `ADVISORY-PRESERVED` context. No source change, retry, main push, record closure, or publication followed this failure. The merge commit remains local-only for diagnosis and review.
