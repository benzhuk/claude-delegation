# Switches and exit codes (pinned)
- Master switch: file `~/.agents/ws-off`. Per feature: `~/.agents/ws-off-<name>` with name in: footer, janitor, commit-check.
  A present file means the feature does nothing and exits 0 silently. Files, not env vars: a session started from a GUI
  may never source the env file, and the switch must work exactly when a hook is misbehaving.
- Exit codes: 0 ok · 1 finding · 3 blind (could not read what it needed). NEVER 2 (hook protocol reads 2 as BLOCK).
- Fail open: uncaught error, timeout, unreadable or malformed state file => exit 0, no output.
- State: `~/.agents/decisions/open.json` (array of decision records). Writers use temp-file + rename. Readers tolerate
  a missing file. A record untouched for 30 days with status open is reported by `list --stale`, never auto-closed.
