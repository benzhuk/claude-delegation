APPROVE 8500d9a

Round 3, delta `6b28563..8500d9a` only.

- **Verbatim**: the delta is one file, one hunk, +5 lines — the test I gave in round 2, character for character (`scripts/work-record.test.mjs:196-199`), placed beside the other A4 test. No other change; `git status` clean.
- **The revert now fails**: on a scratch copy, `work-record.mjs:145` reverted to `let hasInRepoEvidence = false;` gives **32 pass / 1 fail**, failing "validateRecord: accepted with an in-repo evidence path is clean without repoRoot". Baseline 33/33. The MAJOR 1 behaviour is pinned.
- **Gate** `node --test scripts/work-record.test.mjs agents/agents.test.mjs`: **57 pass / 0 fail** (56 + 1).

All round-1 and round-2 findings are closed. Carried forward from round 2, unchanged and not T1's to fix:

- `docs/work/wr-2026-09-21-next-build-t4.record.md:7` and `-t6.record.md:7` separate their two `Evidence:` paths with a **space**; C1 pins `<path>[, <path>]`, so each pair parses as one non-existent path and the validator correctly returns `evidence-missing`. Both files exist under `docs/work/evidence/`. Fix the two records before "the six records read reviewed with in-repo evidence" is claimed.
- For the seam review: `listRecords`' catch yields `{ fields: {}, errors: [] }` for a file that vanished between `readdir` and read, so a caller skipping malformed records by `errors.length > 0` will not skip it (T2's C3 wording, T4's janitor).
