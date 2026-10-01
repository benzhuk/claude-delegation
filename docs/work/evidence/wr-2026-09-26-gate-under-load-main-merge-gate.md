# Main merge gate receipt — gate under load

- Tested tree: `dad0f7933dad4f6d7b2b55b03cd992bf9566ca06` (clean merge of `build/gate-under-load-1` into fresh `origin/main` `bbd9f5d70608e83ce527ef2eac3d690d66017468`).
- Command: `node scripts/run-tests.mjs` in the isolated Orca merge worktree; the sealed runner spawned the full Node test suite.
- Direct process exit: 0.
- Counts: 1798 pass, 0 fail, 0 skipped.
- Started: 2026-09-26T23:49:12.5444957Z. Ended: 2026-09-26T23:53:47.1000086Z. Elapsed: 273313.449 ms.
- Captures: `wr-2026-09-26-gate-under-load-main-merge-gate.stdout.log`, `.stderr.log`, `.exit`, `.start-utc`, `.end-utc`, and `.sha`.
- Publish: normal non-force push confirmed `origin/main = dad0f7933dad4f6d7b2b55b03cd992bf9566ca06`.

This is evidence-only documentation added after acceptance; it changes no tested runtime or test source.
