# Lane 42, stale-session guard: lead spec

Source: docs/specs/2026-09-28-parallel-bundle.md at dc16de3, line 27, "Lane 42, stale-session guard" (packet: packet.md beside this file). Base 2cc3c66.

## Defect

Claude Code loads a plugin's hooks once per session, from the version directory that was installed when the session started (`~/.claude/plugins/cache/<marketplace>/<name>/<version>/`). A session started on 0.20.9 on 9/25 kept 0.20.9's hooks after 0.20.13+ was installed, so the delete guard installed 9/27 never loaded for it or its subagents, and a builder sat 16 min at a delete prompt (9/28 03:15Z to 03:31Z). Measure: work lost or stalled.

## Sources verified by the lead (Netcup, 2026-09-28)

- `~/.claude/plugins/installed_plugins.json` is `{"version": 2, "plugins": {"delegation@benzhuk": [{"scope": "user", "version": "0.20.16", "installPath": "/home/ben/.claude/plugins/cache/benzhuk/delegation/0.20.16", ...}]}}`. Each value is an ARRAY of entries (scopes).
- The cache keeps every old version directory (0.3.0 through 0.20.16 on Netcup), so "newest cache dir" is not "installed".
- hooks/hooks.json runs `node "${CLAUDE_PLUGIN_ROOT}/hooks/agent-dispatch-guard.mjs"` (PreToolUse, Agent) and `node "${CLAUDE_PLUGIN_ROOT}/scripts/wiring-check.mjs" --line --hook` (SessionStart).
- agent-dispatch-guard.mjs `decide()` (:479): `~/.agents/no-dispatch-guard` skips everything; every current deny is gated by `~/.agents/dispatch-guard-enforce` (absent on Netcup, so today every deny is observe-only).

## Pinned rulings

P1, where the running version comes from: the running script's own file path. The plugin root is two directories above the hook file (`hooks/x.mjs` or `scripts/x.mjs`). If its realpath matches `<pluginsDir>/cache/<marketplace>/<name>/<version>` exactly, running = `<version>`, key = `<name>@<marketplace>`. Any other shape (a repo checkout, a Codex home, a dev copy) is "not a cache install": pass, no line. Why the path and not plugin.json: the manifest is keyed by the same layout, and the path is what the host actually loaded.

P2, where the installed version comes from: `installed_plugins.json` in `<pluginsDir>`, where `<pluginsDir>` is `$CLAUDE_CONFIG_DIR/plugins` when that env var is set, else `<home>/.claude/plugins` (home from `os.homedir()`, so HOME overrides it in tests and the live proof). Read `plugins[key]`, an array; take every entry whose `version` is plain numeric `x.y.z`; any other version string (a prerelease, a tag, a missing field) makes that entry unreadable and it is skipped. Why not the newest cache dir: old dirs are kept and it would guess.

P3, the comparison: STALE only when the running version is strictly older (numeric x.y.z compare) than EVERY readable entry's version. Equal to or newer than any entry: pass. No readable entry, missing file, bad JSON, missing key, unreadable path, any exception: pass (fail-open). A lookup must stay synchronous and cheap (one stat-free realpath plus one small file read); no network, no child process.

P4, one shared helper: new `scripts/plugin-staleness.mjs` exporting a pure `checkStaleness({ scriptPath, home, env, fsImpl })` returning `{ stale: boolean, running: string|null, installed: string|null, key: string|null, reason: string }` (`installed` = the lowest readable entry version when stale). Both the guard and wiring-check import it. No new hook, no hooks.json change, no matcher change.

P5, the guard: in `decide()`, AFTER the `no-dispatch-guard` skip and BEFORE R1, when `subagent_type` matches `(^|:)(builder|reviewer|runner|integrator)$` (case-insensitive) and the helper says stale, return a deny with rule id `R0-stale`. This deny is NOT gated by `dispatch-guard-enforce`: the spec says refuses, not advises, and without the enforce file every other deny is observe-only. `ws-off` does not disable it either (it is a safety stop, like the delete guard). The only off switch is `~/.agents/no-dispatch-guard`, which already skips everything. Other subagent types (general-purpose, Explore, a fork) are untouched. The existing log line the guard writes records `R0-stale` like any other rule.

P6, deny text, exact, one line (the marker is its first two words):
`stale session: this session loaded delegation hooks <running>, but <installed> is installed, so hooks added since (the delete guard among them) are not running for it or its agents. The one fix: start a fresh session (claude --resume keeps the conversation). Off switch: ~/.agents/no-dispatch-guard`
with `delegation` replaced by the key's name part.

P7, wiring-check: `--line` (and so the SessionStart `--hook` call) prints the same fact as one line when stale, starting with the same marker, `stale session: ...`, and it counts as a non-ok result for the CLI's red exit like any stale finding, while `--hook` still exits 0. It uses wiring-check's own script path. ws-off silences `--line` as it already does.

P8, census: one line in docs/census.md, in the section that lists counted markers (or at its end if none), naming the marker `stale session:` and the rule id `R0-stale` in the guard's log, so lane 38's counter can count it.

## Efficacy

Unit tests (plugin-staleness.test.mjs): older than the only entry (stale), equal (pass), newer (pass), older than one entry but equal to another (pass), manifest missing, bad JSON, key missing, non-array value, non-numeric version (all pass, fail-open), a non-cache script path (pass), CLAUDE_CONFIG_DIR honoured. Guard tests: a stale builder spawn denies with R0-stale and the exact text WITHOUT the enforce file; a stale general-purpose spawn is not denied by R0; no-dispatch-guard skips it; not stale falls through to the existing rules unchanged. wiring-check tests: the stale line appears under `--line`, and `--hook` exits 0.

Live proof (lead, after review): copy the built plugin into a scratch HOME's `.claude/plugins/cache/benzhuk/delegation/0.20.9/`, write that HOME's installed_plugins.json naming 0.20.16, pipe a builder Agent PreToolUse JSON into that copy's guard, show the deny JSON; then the same with the copy at 0.20.16, show pass.
