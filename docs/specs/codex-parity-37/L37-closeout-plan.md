VERDICT: READY

# Lane 37 merge, close, and publication plan

## Admission before any mutation

Wait for the final test-fix SHA, the final independent Opus APPROVE for that SHA, the accepted `wr-2026-09-28-codex-parity` record, and both retained host gates. The existing Windows gate is `L37-windows-r3.md`; the second-host gate must name the same artifact and be copied into record evidence before acceptance. Do not edit the root-owned record.

Create an ordinary fresh Windows clone only at `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\codex-parity-37\main-merge`; never use a canonical dirty checkout. Fetch `origin`, verify the pushed final branch tip and accepted-record SHA, then merge `origin/build/codex-parity-37` into an up-to-date `origin/main`. Any conflict other than the day-history append stops the merge and becomes a Waiting decision item. For a conflict confined to `docs/decisions/history/2026-09-28.md`, retain both bullets in commit order.

The merge commit itself appends one plain history bullet: `Merged build/codex-parity-37 at <artifact>, <M-D>: <one-line changelog>; suite <pass> of <tests> on Windows.` Do not add it on the lane branch. If `origin/main` was not an ancestor of the branch tip, run one full sealed suite against the exact merge commit in a fresh tree before pushing; record that distinct gate and SHA.

## Close

After the merge is pushed and a fresh fetch proves the merge is an ancestor of `origin/main`, root may use the currently supported default close form:

```text
node scripts/work-record.mjs close --record docs/work/wr-2026-09-28-codex-parity.record.md --repo . --merge <full-merge-sha> --main origin/main --at <current-ISO-with-zone>
```

Current `parseCloseArgs` accepts only `--record`, `--repo`, `--merge`, `--at`, and `--main`; it has no `--closeout`. Do not pass a speculative closeout flag. If a later fetched main adds a closeout command, inspect its current parser and its lane-36 admission rules before selecting it.

## Decisions publication

The configured page id is `3e1da11277a18174bccfea187d5c3972` from `.agents/project.json`; the supported reader is `C:\Users\benzh\.claude\scripts\notion.js`. Read-only origin/main evidence shows lane 34 closed at `cef62ac`, then the pickup was accounted at `df7ba47`, followed by publication commits through `e8a3940`; this is evidence that the bundle-wide lane-34 deferral has cleared, not permission to erase a new owner input.

From the clean main clone only, after the merge bullet is present and pushed, the normal command is:

```text
node skills/decisions/scripts/decisions-render.mjs publish --repo . --page 3e1da11277a18174bccfea187d5c3972 --reader C:\Users\benzh\.claude\scripts\notion.js
```

The renderer fresh-reads the page. If it returns owner-input-pending, defer publication and carry the merge bullet in RESULT; do not use `--clear-done` or clear unrelated input. `--clear-done` is only for a fresh captured pickup round and only from the registered checkout or linked worktree, never this separate clone. On a successful normal publish, retain its generated commit/push receipt and report the exact page publication result.
