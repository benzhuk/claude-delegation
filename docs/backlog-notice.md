# Backlog notice

`hooks/backlog-notice.js` reads `docs/work/*.record.md` (C1) and, on `UserPromptSubmit`, `PostToolUse` and `Stop`, reports runnable-unowned / delivered-unreviewed / rejected counts, up to 3 ids per bucket:

```
work: 2 runnable and unowned (wr-1, wr-2), 0 delivered and unreviewed (), 1 rejected
awaiting a fix round (wr-3). Pull one or say why not.
```

Silent when all three counts are zero. `UserPromptSubmit`/`PostToolUse` get `additionalContext`; `Stop` gets `systemMessage` only, never `decision`.

At most once per 120s per session (sentinel `<agentsHome>/ws/backlog-notice.<session_id>`). `PostToolUse` also gets a cheaper second gate: past the window it stays silent once the newest record's own mtime and file count both still match what was last scanned — never the directory's own mtime, which an in-place edit never touches.

Kill switches `~/.agents/ws-off` / `ws-off-backlog` silence it completely. Wired as `switch-ws-off-backlog` in `required-wiring.default.json`. Malformed records are skipped, counted on stderr only — a `runnable`-status record with a non-`none` `Owner:` counts as malformed too (it is not what its `Status:` claims). Fails open: one stderr line, exit 0, no stdout.

A `Work:` id held by more than one record (`checkRecordSet`, `scripts/work-record.mjs`) is a separate problem: each record still lands in its normal bucket per its own `Status:` — a duplicated id is not itself malformed — but a second, independent stderr line prints when any are found: `backlog-notice: duplicate work id(s): <comma-separated ids>`. Both stderr lines can fire together, either alone, or neither; the printed `additionalContext`/`systemMessage` line never changes.
