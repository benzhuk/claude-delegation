# Backlog notice

`hooks/backlog-notice.js` reads `docs/work/*.record.md` (C1) and, on `UserPromptSubmit`,
`PostToolUse` and `Stop`, says how many records are runnable-and-unowned, delivered-and-
unreviewed, or rejected-awaiting-a-fix-round, up to 3 ids per bucket:

```
work: 2 runnable and unowned (wr-1, wr-2), 0 delivered and unreviewed (), 1 rejected
awaiting a fix round (wr-3). Pull one or say why not.
```

Silent when all three counts are zero. `UserPromptSubmit`/`PostToolUse` get it as
`additionalContext`; `Stop` gets `systemMessage` only — never a `decision` (Stop reaches
Ben's pane, not the model, on this CLI build).

At most once per 120s per session (sentinel `<agentsHome>/ws/backlog-notice.<session_id>`,
one file for all three events). `PostToolUse` also gets a cheaper second gate: past the
120s window it stays silent if the newest record's mtime and the record count both still
match what was last printed — never the directory's own mtime, since an in-place Status
edit never touches that.

Kill switches: `~/.agents/ws-off` (master) or `~/.agents/ws-off-backlog` (this feature) —
both silence it completely, nothing read or written. Wired as `switch-ws-off-backlog` in
`scripts/required-wiring.default.json`.

Malformed records (no `Status:`, or an unknown status) are skipped, counted on stderr
only. Fails open on any error: one stderr line, exit 0, nothing on stdout.
