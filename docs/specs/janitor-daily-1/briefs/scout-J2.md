# Scout — J2 (wiring-check.mjs, required-wiring.default.json)

## Files and symbols
- `scripts/wiring-check.mjs` main() currently always `return 0` except an unknown-flag
  usage error (file header comment lines 35-37 states the contract explicitly: "Exit 0
  always... a wiring check never fails its caller"). `checkWiring().ok` already exists
  and is pure (`results.every(state ok|info)` per research.md) — the CLI just never
  reads it into an exit code today. This matches the spec's premise exactly, no drift.
- `required-wiring.default.json` (9 checks, confirmed by reading the file): 6 `switch`,
  1 `env_presence` (`pane-note-slug`), 2 `file_fresh` (`flusher-heartbeat`,
  `lean-rules-file`). Zero `hook_present`, `hook_absent`, `json_value` or `file_exists`
  checks exist today, and the spec's premise ("Keep the two existing `file_fresh`
  checks") holds — those are exactly `flusher-heartbeat` and `lean-rules-file`.
- `hook_present`/`hook_absent` types already have full switch-case support in
  `wiring-check.mjs` (case blocks at lines 130-131 validate shape, 260-263 evaluate),
  and are already unit-tested (`wiring-check.test.mjs:125-152`) against an arbitrary
  settings-shaped JSON file with `hooks.<Event>[].hooks[].command` substring matching —
  but **no check of this type is wired into `required-wiring.default.json` today**, so
  J2 is the first real user of a type the evaluator already fully supports.
- The plugin's own hook registration lives in `hooks/hooks.json` (part of the plugin
  bundle, loaded by Claude Code directly from the installed plugin, not copied into
  `~/.claude/settings.json`). Exact commands found there: PreToolUse delete-guard —
  matcher `Bash|PowerShell`, `node "${CLAUDE_PLUGIN_ROOT}/hooks/delete-guard.mjs"`; the
  PostToolUse hook that touches notes is `hooks/multi-inbox.js PostToolUse` (matcher
  `*`) — there is no separate file literally named "note-inbox" hook script; that's the
  multi-inbox script's PostToolUse invocation.
- `crossSessionInbound: "accept"` is read via `JSON.parse(...).crossSessionInbound` in
  `scripts/mirror-shared-skills.mjs:183` and `skills/multi/scripts/inbox-claude.mjs:32`
  from a Claude settings file (README.md:26 names it `~/.claude/settings.json`) — this
  is a real, already-checked-elsewhere prerequisite, good precedent for J2's
  `json_value` check.
- Shim path convention: `~/.local/bin/note-send` per the spec; `mirror-shared-skills.mjs`
  generates PATH shims (`SHIM_COMMANDS` at line 102: `note-send`, `note-inbox`,
  `note-flush`, `note-notify`, plus `.cmd` variants on Windows) but the scout did not
  find the exact install directory constant in this pass — grep
  `mirror-shared-skills.mjs` for where shims are actually written (near line 517,
  "PATH shim is generated, not copied") to confirm the real path before hard-coding it
  in the new checks.

## Helpers to reuse
- `expandHome(p, home)` (wiring-check.mjs, top of file) already expands `~/...` in any
  check's `file` field — new checks can use `~/...` paths directly, same as existing
  ones.
- `evalHookPresence`, `evalFileExistence` already exist and are what the new
  `hook_present`/`file_exists` checks will call through unmodified — no new evaluator
  code needed, only new JSON entries plus (per J2 rulings) tightening
  `hook_present`'s match to a real parsed hook-command match rather than a raw
  text/substring search, if the current substring-only match is judged too loose for a
  commented-out or wrong-command false positive (see Tests below).

## Tests that police this area
- `scripts/wiring-check.test.mjs` is large (400+ lines) and already parametrizes every
  check type incl. `hook_present`/`hook_absent` against synthetic settings files
  (lines 125-152, 258-260 for unreadable/corrupt file handling, 403-405 for malformed
  check shape, 429 for empty-substring "any command" semantics) — any change to
  `hook_present`'s matching strictness must keep these green or update them
  deliberately, and the report should say which.
- `scripts/janitor.test.mjs` embeds a WIRING section reading the same
  `checkWiring()` — confirm (per contracts J2 ruling 1) that this embedded caller does
  NOT depend on the CLI's exit code, only on the library return value, before changing
  `main()`'s exit behavior.

## Open questions for the spec
- The spec names "the PostToolUse note-inbox hook" but the actual registered hook at
  that event is `hooks/multi-inbox.js` (not a file named note-inbox) — confirm this is
  the intended hook to check, and confirm the exact `substring` the new `hook_present`
  check should match (e.g. `multi-inbox.js` vs a longer unambiguous string) since a
  too-short substring risks a false match against an unrelated future hook.
- Since `hooks/hooks.json` ships inside the plugin and Claude Code loads it directly
  (never written into a per-user `~/.claude/settings.json`), what FILE does a
  `hook_present` check actually read on a real host to see these two hooks wired? If
  Claude Code never materializes plugin hooks into a user-editable settings file, this
  check may need a different target file (or a different check type) than
  `hook_present` as currently shaped — flagging for the lead's ruling, not guessing.
