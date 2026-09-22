# Backlog notice

`hooks/backlog-notice.js` reads `docs/work/*.record.md` (C1) and, on `UserPromptSubmit`, `PostToolUse` and `Stop`, reports runnable-unowned / delivered-unreviewed / rejected counts, up to 3 ids per bucket:

```
work: 2 runnable and unowned (wr-1, wr-2), 0 delivered and unreviewed (), 1 rejected
awaiting a fix round (wr-3). Pull one or say why not.
```

Silent when all three counts are zero. `UserPromptSubmit`/`PostToolUse` get `additionalContext`; `Stop` gets `systemMessage` only, never `decision`.

At most once per 120s per session (sentinel `<agentsHome>/ws/backlog-notice.<session_id>`). `PostToolUse` also gets a cheaper second gate: past the window it stays silent once the newest record's own mtime and file count both still match what was last scanned — never the directory's own mtime, which an in-place edit never touches.

Kill switches `~/.agents/ws-off` / `ws-off-backlog` silence it completely. Wired as `switch-ws-off-backlog` in `required-wiring.default.json`. Malformed records are skipped, counted on stderr only. Fails open: one stderr line, exit 0, no stdout.
