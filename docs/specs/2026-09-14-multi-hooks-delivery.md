# Spec: hook delivery for both agents, typing as last resort (multi 0.4.0), 2026-09-14

## Why
Ben: "could we drop a short for-human summary into the context when the models pass messages, without
typing it into the prompt where I type? my prompts frequently collide with theirs." Ruling (Ben, multiple
choice): **adaptive long-poll, cap 15 min** — an agent waits for a peer note after a turn ONLY while it has an
ASK outstanding; otherwise it goes idle at once.
**[SUPERSEDED 2026-09-16 — see "no parking" at the end of this file]** The waiting was removed two days later, in 0.4.1. Nothing waits for a peer now.

## Verified facts (2026-09-14, all live)
Claude Code v2.1.271 (Netcup):
- Stop hook `decision:"block"` + `reason` continues the turn; `stop_hook_active:true` on the re-fire.
  Command hooks default timeout 10 min, no documented maximum; `timeout` per handler in seconds.
- `systemMessage` in Stop output IS shown to the human: `⎿  Stop says: <text>` under the last reply.
- While a Stop hook runs the UI shows `running Stop hooks…`; text typed then stays in the composer and Enter
  does NOT submit until the hook ends (a second Enter afterwards submits). Esc cancels the hook. Nothing is lost.
- `hookSpecificOutput.additionalContext` reaches the model on UserPromptSubmit and PostToolUse (existing hook).

Codex CLI 0.154.0 (Windows + Netcup):
- `codex features list` → `hooks stable true`. Config: `$CODEX_HOME/hooks.json`
  `{"hooks":{"<Event>":[{"hooks":[{"type":"command","command":"…","timeout":<s>}]}]}}`. Events seen:
  SessionStart, UserPromptSubmit, Stop (stdin: session_id, turn_id, transcript_path, cwd, hook_event_name,
  model, permission_mode, stop_hook_active, last_assistant_message). Default timeout 600 s.
- Stop `{"decision":"block","reason":…}` continues (verified: PING→PONG); `systemMessage` shows in the TUI
  transcript as `Hook  <text>`. UserPromptSubmit `hookSpecificOutput.additionalContext` accepted.
- Typing during a Stop hook: Codex QUEUES it — "Messages to be submitted after next tool call (press esc to
  interrupt and send immediately)" — and runs it after the hook. Better than Claude.
- **Trust gate**: hooks are silently skipped until trusted. `codex exec` skips them unless
  `--dangerously-bypass-hook-trust`. Trust lives in `$CODEX_HOME/config.toml`:
  `[hooks.state."<key>"] trusted_hash = "sha256:<hex>"`, key = `"<abs hooks.json path>:<EventName>:<group
  index>:<handler index>"`, hash = sha256 of the canonical (recursively key-sorted) JSON of
  `{event_name, group:{matcher, hooks:[<that one normalized handler>]}}` (codex-rs hooks/src/engine/discovery.rs
  `hook_hash` → config/src/fingerprint.rs `version_for_toml`; details in the lane report
  `.claude/agent-reports/74ca276f-70e5-4b77-9678-3d4720d95d0f/lane-codex-trust-report.md` under Zhuk Projects).
  `bypass_hook_trust` is CLI-only, never a config key. TUI "Trust all" does not persist on Windows
  (openai/codex#40247). Writing `hooks.state` directly works on macOS per #32491; must be validated here by
  `codex exec` WITHOUT the bypass flag firing the hook.
- Unverified (spike first, D8): whether `ORCA_TERMINAL_HANDLE` / `CODEX_HOME` survive into a Codex hook's env
  (Codex clears env for `notify`; hooks may differ).

Transport (0.3.2): ledger is the channel; `panes.json` binds handle→slug; cursors have `seen` + `cold`;
`note-flush` types wake-ups every minute, per-entry claims, retire-on-read.

## Design
D1. **Shared hook core** `hooks/multi-hook-core.mjs` (ESM, imported by both adapters): given `{event, input,
    slug, home, cwd, now}` returns the hook output object. Reuses the existing handlers' logic (summarise, ack,
    loop guard) — move, don't duplicate. Every output that carries notes also carries
    `systemMessage: "📨 <from> → <to> <KIND>: <body ≤ 80 chars>"` (one line per note, max 3 lines, then
    "+N more in the ledger"). This is Ben's for-human line; it never goes into the composer.
D2. [SUPERSEDED 2026-09-16 — see "no parking" at the end of this file]
    **Long-poll in Stop** (both agents). If `outstandingAsks(slug)` is non-empty and `stop_hook_active` is
    false: write `~/.agents/notes/.listening-<slug>.json` `{pid, handle?, until, asks:[ids]}`; poll every 3 s
    (stat the mirror ledger `~/.agents/notes/<today>.md` + the repo ledger dirs; no orca calls) until a note for
    this slug is unseen or `until` (now + `MULTI_LONGPOLL_MAX_MIN`, default 15, `0` disables) passes; remove
    the marker on every exit path (also SIGTERM/SIGINT). Found → `decision:"block"`, `reason` = the notes +
    the existing "handle these before you stop" text, `systemMessage` per D1. Not found → exit 0 silently.
    `stop_hook_active:true` → never long-poll (loop guard), just surface anything new and exit 0.
    hooks.json / settings timeout for Stop = `(MAX_MIN + 2) * 60` → 1020 s.
    `outstandingAsks(slug)`: my ASK lines from the last 24 h (repo ledgers of the cwd repo + mirror) with
    `Needs:` ≠ none, minus those with a later `re <id>` line from the recipient whose kind is RESULT or
    BLOCKED, or ACK when Needs was `ack`. Export from transport.mjs, unit-tested.
D3. **Codex adapter** `hooks/multi-codex-hook.mjs`: stdin JSON → `hook_event_name` → core. Slug: `$NOTE_SLUG`
    → `panes.json[$ORCA_TERMINAL_HANDLE]` → (spike result) if the handle is absent, a per-home map
    `$CODEX_HOME/.multi-sessions.json` `{session_id → slug}` written by `note-inbox --me <slug>` when it runs
    inside a Codex pane (find what identifies the session in-pane; if nothing does, document the limitation and
    fall back to the pane title via `orca terminal show`). Output mapping: UserPromptSubmit/PostToolUse →
    `hookSpecificOutput.additionalContext` + `systemMessage`; Stop → D2; SessionStart → bind if a handle is
    present, and return the pending notes as additionalContext.
D4. **Installer** in `scripts/mirror-shared-skills.mjs` (runs on every `chezmoi apply` on every machine):
    for `~/.codex` AND every managed Codex home (Linux `~/.config/orca/codex-accounts/*/home`, Windows
    `%APPDATA%/orca/codex-accounts/*/home`, macOS `~/Library/Application Support/orca/codex-accounts/*/home`):
    write `hooks.json` (SessionStart, UserPromptSubmit, PostToolUse, Stop → `node <mirrored path>/hooks/
    multi-codex-hook.mjs`, absolute posix path, Stop timeout 1020, others 30) and upsert `[hooks.state]` trust
    entries in that home's `config.toml` (a TOML edit that preserves everything else; the `notify` line stays).
    Hash recipe per the facts; implement `codexHookHash(handler, eventName, matcher)` in
    `scripts/codex-hook-trust.mjs` with a fixture test whose expected value is taken from a REAL
    `currentHash` (the integrator captures one on Netcup via the app-server `hooks/list`, or from a config.toml
    the TUI trusted on Linux). Idempotent: no rewrite when content is unchanged. Never delete anything.
D5. [SUPERSEDED 2026-09-16 — see "no parking" at the end of this file]
    **Flusher becomes last resort**: `note-flush` skips typing to a slug whose `.listening-<slug>.json` is fresh
    (`until` in the future and pid alive when local) — the hook will deliver; log `listening [<id>] -> <slug>`.
    Everything else unchanged (claims, retire-on-read, bindings).
D6. **Claude adapter** `hooks/multi-inbox.js` → thin wrapper over the core (keep the file name; hooks.json
    unchanged except Stop `timeout: 1020`). Keep the `--no-bind` cached-title rule.
D7. **Docs**: SKILL.md — Codex sessions no longer need `note-inbox --me … --ack` at turn start when hooks are
    installed (say how to check: `$CODEX_HOME/hooks.json` exists and the `codex exec` smoke fires); keep it as
    the fallback. Explain the long-poll to agents in one paragraph (you are waiting because you asked; a queued
    prompt from Ben is normal). Bump plugin 0.4.0 (plugin.json, marketplace.json, README changelog).
D8. **Spike before building D3/D4** (builder, ≤20 min, on Netcup over ssh in a scratch `CODEX_HOME` under
    `~/tmp/`, with `--dangerously-bypass-hook-trust`, model gpt-5.6-luna, `codex exec` prompt "reply hi",
    stdin from /dev/null): a hook that dumps env keys + stdin JSON to a file. Record: does the hook see
    CODEX_HOME and cwd; is `session_id` stable across turns; whether ORCA_TERMINAL_HANDLE survives when the
    parent env has it (export a fake one in the ssh command). Write the result into this spec under
    "Spike results" before implementing D3.

## Spike results (D8, 2026-09-14, Netcup `v2202608391056492408`, codex-cli 0.154.0, gpt-5.6-luna)

Scratch `CODEX_HOME=~/tmp/hookspike/home` (auth.json copied from the managed account, chmod 600); a hook
that dumps `pwd`, `env` and stdin to a file, wired for SessionStart/UserPromptSubmit/PostToolUse/Stop;
`codex exec --dangerously-bypass-hook-trust --skip-git-repo-check "reply hi" < /dev/null`, then
`codex exec resume --last "now reply bye"`. Six dumps. No managed home and no live pane was touched.

1. **The parent environment IS inherited — hooks are NOT `notify`.** All three variables exported in the
   ssh command reached every hook: `CODEX_HOME=/home/ben/tmp/hookspike/home`,
   `ORCA_TERMINAL_HANDLE=term_fake-spike-0001`, `NOTE_SLUG=spikeslug`, plus the usual HOME/PATH. This is
   the finding D3 was blocked on: inside an Orca pane a Codex hook can read `$ORCA_TERMINAL_HANDLE` and
   `$NOTE_SLUG` directly, so the slug chain `$NOTE_SLUG` then `panes.json[$ORCA_TERMINAL_HANDLE]`
   resolves with no new state. **`$CODEX_HOME/.multi-sessions.json` is therefore NOT needed** and is
   dropped from D3; a `session_id` map would only help a `codex exec` run outside a pane, which has no
   peer identity to begin with.
2. **cwd is the session's cwd, twice over.** The hook process starts in it (`pwd` =
   `/home/ben/tmp/hookspike/work`) and the payload repeats it as `cwd`. Either is safe for locating the
   repo ledger.
3. **`session_id` is stable across turns**; `turn_id` changes per turn. Six dumps, one session_id, two
   turn_ids (two per turn: UserPromptSubmit and Stop). `SessionStart` carries no `turn_id`.
4. **`SessionStart` fires again on `exec resume`**, so it is per PROCESS, not per conversation. Anything
   it emits must be idempotent — it will re-announce pending notes on every resume.
5. **Payload shapes, verbatim keys**: SessionStart `{session_id, transcript_path, cwd, hook_event_name,
   model, permission_mode, source:"startup"}`; UserPromptSubmit adds `turn_id` and `prompt`; Stop adds
   `turn_id`, `stop_hook_active:false`, `last_assistant_message`. `transcript_path` is
   `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ts>-<session_id>.jsonl`.
6. **PostToolUse did not fire** — the model called no tools in either turn, so its payload shape stays
   unverified. The adapter treats it defensively: handled like UserPromptSubmit, every field optional.
7. `codex exec` prints `hook: <Event>` and `hook: <Event> Completed` for each, which is how a smoke can
   prove a hook ran without reading any dump file.

## Territories
| T1 `hooks` | claude-delegation, branch `feat/hook-delivery` from main c4c5799 | `hooks/multi-hook-core.mjs` (new), `hooks/multi-codex-hook.mjs` (new), `hooks/multi-inbox.js`, `hooks/hooks.json`, `scripts/mirror-shared-skills.mjs`, `scripts/codex-hook-trust.mjs` (new), `skills/multi/scripts/{transport,note-flush,note-inbox}.mjs` + tests, `skills/multi/SKILL.md`, version files, this spec's "Spike results" |
| Integrator | — | full glob test run; `codex exec` WITHOUT bypass on a Netcup scratch home after the installer wrote hooks.json + trust → hook fires; Claude settings-hook smoke in a scratch project (systemMessage visible) |
| Orchestrator | — | deploy (mirror on 4 machines), seed bindings, watch first live deliveries |

Rules: configured git identity only; conventional commits; LF; `String.replace` with a function replacement
whenever the text comes from data; ESM main guards via realpath; never type into a pane you have not read;
never edit a live managed Codex home by hand (the installer does it, idempotently, and never deletes). No push.

## 2026-09-16 ruling: no parking

**D2 and D5 are reverted. Nothing waits.** Shipped as 0.4.1.

### What happened

The `infra` session sent an ASK. The peer ACKed it, and later sent its RESULT — but under a NEW id
rather than ` re <ask-id>`, so nothing in the ledger ever closed the ask. `outstandingAsks` therefore
kept returning it for the full 24-hour window, and D2's Stop hook did exactly what it was designed to
do: park for 15 minutes at the end of EVERY turn, for a day. Including the turns Ben was driving, where
it reads as the agent hanging on him.

### Why the fix is not a better close rule

Tightening the close detection (accept any later line from the recipient, shorten the window, cap the
parks per hour) would have made this instance rarer without changing the shape of the failure: a Stop
hook that CAN wait minutes will eventually wait minutes for the wrong reason, and the cost lands on the
human watching the pane, who has no way to tell a park from a hang. The waiting also bought very little.
Notes already reach a working session through UserPromptSubmit and PostToolUse, and an idle pane is
nudged by the flusher within a minute — the poll only shortened the gap between "the peer answered" and
"the session noticed" in the one case where the session was about to go idle anyway.

### What changed

- **Stop surfaces what is already in the ledger and exits.** It keeps emit-first-then-ack and the
  `stop_hook_active` guard. Nothing else about hook delivery changes.
- **Removed**: the poll loop and its ledger-mtime pulse, `MULTI_LONGPOLL_MAX_MIN`, the
  `.listening-<slug>.json` marker with everything that wrote or read it, and `outstandingAsks` in
  `transport.mjs`, which had no other caller. Their tests went with them.
- **Stop timeout is 60 s again**, in `hooks/hooks.json` and in the Codex installer's template. The
  timeout is part of the Codex trust hash, so the installer also hands `pruneOurHooksState` the hashes
  earlier versions wrote — otherwise a 0.4.0 entry at an index our handler has since vacated is never
  recognised as ours and stays in `config.toml` for good.
- **note-flush deletes every `.listening-*.json` it finds**, on every run, logging `cleanup <file>`.
  A marker from a 0.4.0 hook that was killed before cleaning up would otherwise silence that slug's
  wake-ups until its `until` passed.

### The rule that replaces D2

Hooks deliver during your turns; when you are idle the flusher nudges you within a minute. No session
ever waits for a peer — not in a hook, not in a turn.
