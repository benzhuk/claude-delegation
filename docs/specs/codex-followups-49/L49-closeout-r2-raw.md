# Lane 49 closeout r2

**VERDICT: SHIPPED**

## Correct merge and preservation

- Pushed merge: `ddbc93ef8ac435584e39e924aa7c08ff4ff2182b`.
- Parents: verified current main `687905cce37a697eb2df85c487f8e4ed1a9804ac`; accepted Lane 49 tip `a27b7b4369dab32825885f63d9e527f869a0939f`.
- The first parent assertion passed before the suite. The merge contains one plain Lane 49 history bullet in `docs/decisions/history/2026-09-28.md` naming final artifact `d7625e0`, restored timing/derived parity/per-session cadence, and the final host count.
- Diagnostic only, no suite: stale-base local merge `aa6bef4bb50cbe8f437872f7270e411e1e3123da` was preserved as branch `lane49-stale-base-r2`; it was never pushed. Its stale base was `f7df941`, so it was replaced locally without reset, force, or deletion by recreating `main` from fetched `687905c`.

## Exact merge gate

- Windows sealed runner exit: `0`; candidate exactly `ddbc93ef8ac435584e39e924aa7c08ff4ff2182b`.
- Start `2026-09-29T01:26:15.1868272Z`; end `2026-09-29T01:30:16.6294095Z`.
- 2912 total; 2898 pass; 0 fail; 0 cancelled; 14 skipped; 0 todo; duration 236180.4343 ms.
- Temp-entry check: 0 new entries. Prepared Windows runner used `Global\claude-verify` and releases it in `finally`.
- Raw: `windows/ddbc93ef8ac435584e39e924aa7c08ff4ff2182b/suite.raw.log`; native receipt: `windows/ddbc93ef8ac435584e39e924aa7c08ff4ff2182b/suite.exit.txt`.

## Push and guarded renderer publish

- Main push after the green merge gate: exit `0`; remote main advanced `687905c..ddbc93e`.
- One normal renderer publish ran with no recovery flags or manual page edit: exit `0`; raw `L49-publish-r2.raw.log`; receipt `L49-publish-r2.exit`.
- Page: `3e1da11277a18174bccfea187d5c3972`; reader: `C:\Users\benzh\.claude\scripts\notion.js`.
- Renderer retained backup `C:\Users\benzh\.local\state\notion-backups\3e1da11277a18174bccfea187d5c3972\2026-09-29T01-31-20-407Z.md`, read back successfully, and set title `Skills: 9/28 9:31PM Decisions`.
- Bookkeeping commit `5cbd6ba561b50bda871906474523fade19c51900` (`chore: decisions page published 2026-09-29T01:31:18.905Z`) updated `docs/decisions/last-render.md`, pushed successfully. Final `origin/main` is `5cbd6ba561b50bda871906474523fade19c51900`.
