# Spec: deliver peer notes through each agent's own inbox, never the composer (multi 0.5.0), 2026-09-17

## Why
Ben, today: "orca keeps pasting comms from session to session right into my input box as i am typing then
submits it, conmingling my typing with the comms AND cutting off my prompt mid word. WHY? … this is wrong
architecture." It was. `classifyPane` judges idle from the transcript and says nothing about whether the
input box is EMPTY, so a half-typed human prompt looked exactly like an idle agent; the residue check ran
only on the recovery path; and phase 2 (the Enter) was budgeted up to 20 s after phase 1 (the text), so
even a box that was empty at check time could be his by the time Enter landed. 2026-09-17 stopgap
(f0f27a8, deployed): refuse to type into a non-empty composer, plus a per-machine pause flag
`~/.agents/notes/no-type`, currently set on all four machines.

Then Ben asked the right question: "is there any other way for orca to wake up an idle session other than
typing into input box?" There is, for both agents. That is this build.

## Verified facts (2026-09-17)
**Orca: no.** Every route into a running agent's turn ends in `runtime.sendTerminal` → a PTY write, i.e.
synthesised keystrokes; `orchestration.send` is only a `db.enqueueFederationRelay` row the recipient must
poll with `orchestration.check`; there is no queue the runtime drains on idle; the only non-keystroke
injection is launch-time argv (`--prefill`), which needs a fresh process. Per-pane human-input time
(`lastInputAtByPty`, `src/main/ipc/pty.ts:260`) exists INTERNALLY but is exposed over no RPC. Evidence:
`.claude/agent-reports/74ca276f-70e5-4b77-9678-3d4720d95d0f/lane-orca-wake-report.md` (fork source read on
the Mac checkout).

**Claude Code: a per-session inbox socket.** Docs: https://code.claude.com/docs/en/cross-session-messaging
(section "The session's inbox socket" — "Read this section when … you want a script or hook to post into a
session"). Each session binds a Unix domain socket (macOS/Linux/WSL2) or a named pipe (native Windows) and
exports to its OWN hooks and Bash commands, before any hook runs including SessionStart:
`CLAUDE_CODE_MESSAGING_SOCKET` (path) and `CLAUDE_CODE_MESSAGING_TOKEN` (per-session token). A script posts
by opening the socket and writing `{"type":"auth","token":"<token>"}` as the FIRST line (optional on
macOS/Linux, REQUIRED on native Windows), then the message. "When the receiving session is idle, Claude Code
starts a new turn with the message." Own-child verification is by process evidence OR by that token, and a
message verified neither way is HELD for approval in a session that bypasses permission prompts — so the
token is what makes delivery from the flusher (not a child of the target) land unheld. Connections that
have not sent a complete line in 30 s are closed, so open only when the text is ready. Caps: ~1M chars per
message; rapid bursts to one session are refused at the sender; identical repeats within a short window are
dropped; at most 50 queued for the recipient to read.

**Codex: an on-disk queue.** `codex queue --thread <uuid|name> --message "<text>"` (CLI 0.154.0) issues
`thread/queue/add` to an app-server it spins up in-process and writes a row into `queue_1.sqlite` under
CODEX_HOME; the running TUI watches that store and starts the oldest queued item as a real turn when it next
goes idle. Live-verified on Netcup against a bare `codex` TUI from a separate ssh connection, zero keystrokes
to its pane. Requires: the SAME `CODEX_HOME` as the target, a thread with at least one persisted turn, and
(for immediate pickup) idleness — a busy thread just queues. Evidence:
`.claude/agent-reports/.../lane-codex-wake-report.md`. A busy thread queuing is a FEATURE here: it removes
the race with Ben entirely.

## Design
D1. **Inbox registry** `~/.agents/notes/inboxes.json`, mode 600 (it holds per-session tokens):
    `{ "<slug>": { kind, at, pid?, host?, cwd?, … } }` where kind is either
    `claude-socket` → `{ socket, token }`, or `codex-queue` → `{ codexHome, threadId }`.
    Atomic tmp+rename with mode 600 on create AND rewrite. `transport.mjs` owns
    `inboxesPath/readInboxes/writeInbox/removeInbox/pruneInboxes`.
    **Secret rule (Ben's, hard):** the token is key material. It is never logged, never printed, never put
    in an error message, never included in a `--json` result, and never written anywhere but this file.
    Tests assert that `flush.log`, stdout and every returned object are token-free.
D2. **Registration from the hooks that already run in every session.** Claude adapter
    (`hooks/multi-inbox.js`, via the core): on every event where the slug is known first-hand (`--me`,
    `$NOTE_SLUG`, or a `panes.json` binding — never a title guess, the 0.4.0 rule), record
    `{kind:'claude-socket', socket: $CLAUDE_CODE_MESSAGING_SOCKET, token: $CLAUDE_CODE_MESSAGING_TOKEN,
    pid: process.ppid, cwd}` when both env vars are present. Codex adapter
    (`hooks/multi-codex-hook.mjs`): record `{kind:'codex-queue', codexHome: $CODEX_HOME,
    threadId: <stdin session_id>}`. Registration is best-effort and never fails a hook.
    **Spike first (D8):** confirm the Codex hook's `session_id` is the id `codex queue --thread` accepts.
D3. **Delivery order in `note-flush`**, per outbox entry: (1) a registered inbox for the recipient slug on
    THIS machine → deliver there; (2) nothing registered → leave the entry queued and log
    `no-inbox [<id>] -> <slug>` (the ledger already holds the note, and the recipient's own next turn reads
    it); (3) typing survives ONLY as an explicit last resort: it is attempted only when
    `MULTI_ALLOW_TYPING=1` is set AND no inbox is registered AND the composer pre-check passes. Default: no
    typing, ever. The `no-type` flag file keeps working as a hard off switch.
D4. **Claude socket client** `skills/multi/scripts/inbox-claude.mjs`: connect (`net.connect` to the uds path;
    on Windows the same `net.connect` to the `\\.\pipe\…` name), write the auth line first, then the message
    line, then end; resolve on write completion or a short timeout (default 5 s, never 30). One line of
    message text = the same envelope line the flusher would have typed. Treat ECONNREFUSED/ENOENT as "the
    session is gone" → remove that registry entry and report `inbox-stale`. Never retry a burst: on a
    refusal-shaped error, back off and leave the entry queued.
D5. **Codex queue client** `skills/multi/scripts/inbox-codex.mjs`: run the `codex` binary (resolve like the
    shims do: PATH, then `~/.local/bin/codex`, then fnm/Homebrew paths) with
    `queue --thread <threadId> --message <envelope>` and `CODEX_HOME=<codexHome>` in the child env only.
    Exit 0 → delivered. `no rollation found for thread id` (the zero-turn case) → leave queued, log
    `codex-no-thread`. Any other non-zero → leave queued with the stderr first line, token-free.
D6. **Retire what the composer path needed, but do not delete it yet.** `panes.json`, the binding, the
    classification, `twoPhaseSend` and the composer/history split stay in the tree and stay tested; they are
    now reachable only through the D3(3) last resort. A later version removes them once inbox delivery has
    run for a while. Say that in the spec's own changelog line, so nobody re-derives it.
D7. **Docs**: SKILL.md — delivery is now "your peer's inbox, not your peer's keyboard"; what a session must
    do to be reachable (nothing: its own hook registers it, provided it knows its slug from `--me`/
    `$NOTE_SLUG`); how Ben checks (`note-inbox --status`? no — `ls -l ~/.agents/notes/inboxes.json` and the
    flush log's `delivered … (inbox)` lines); the two failure modes (`no-inbox`, `inbox-stale`) and what they
    mean. Also add the one-paragraph Orca finding so no one proposes `orchestration send` again. Bump to
    0.5.0 in `plugin.json`, `marketplace.json`, README changelog.
D8. **Spikes before D2/D5 (on Netcup over ssh, scratch only, ≤25 min).**
    (a) Claude socket from a NON-child script: start a scratch interactive Claude in tmux
    (`CLAUDE_CONFIG_DIR=~/tmp/claude-inbox-probe`, model haiku, its own dir), read its
    `Peer address` from `/status` or have a SessionStart hook in that scratch config dump its two env vars to
    a file, then from a separate ssh connection post a line with the auth token and confirm the IDLE session
    starts a turn. Record: does it arrive unheld; what the receiving pane shows; timing.
    (b) Codex: scratch `CODEX_HOME` under `~/tmp`, bare `codex` TUI, one baseline turn, then
    `codex queue --thread <session_id from the hook payload> --message …` from another connection — confirm
    the hook's `session_id` is accepted and the idle TUI turns. Kill both scratch sessions afterwards.
    Write both results into this file under "Spike results" before implementing.

## Territories
| T1 `inbox` | claude-delegation, branch `feat/inbox-delivery` from main f0f27a8 | `skills/multi/scripts/{transport,note-flush,inbox-claude,inbox-codex}.mjs` + tests, `hooks/{multi-hook-core,multi-inbox,multi-codex-hook}.mjs|js` + tests, `skills/multi/SKILL.md`, this spec, version files |
| Integrator (me) | — | sealed three-glob suite; the two live spikes re-run against the built code; one real end-to-end note between two scratch sessions |
| Orchestrator (me) | — | `crossSessionInbound: "accept"` in the dotfiles user settings so nothing is held behind an approval dialog; deploy; remove the `no-type` flags only after a clean end-to-end |

Rules: configured git identity only (no `-c user.*`, `--author`, `GIT_AUTHOR_*`, `--no-verify`);
conventional commits; LF; `String.replace` with a function replacement for data-derived text; ESM main
guards via realpath; tests seal HOME/USERPROFILE/APPDATA/LOCALAPPDATA and clear CODEX_HOME; never touch a
live pane, a live session's socket, or a managed Codex home — scratch sessions only; never print a token.
No push.

## Spike results (D8, live on Netcup 2026-09-17, scratch sessions only, killed afterwards)

### (a) Claude Code inbox socket, posted from a NON-child process — WORKS, unheld only with `accept`
Setup: scratch `CLAUDE_CONFIG_DIR=~/tmp/inbox-spike/cfg` (its own `.credentials.json` and `.claude.json`
copies, so nothing of Ben's was read or written), model haiku, `--dangerously-skip-permissions` so the
receiver is in the same permission class as a real Orca pane, own cwd, in tmux. A `SessionStart` hook in
that scratch config wrote `{socket, token, pid}` to a mode-600 file — the two env vars ARE exported to
SessionStart, first-hand, before anything else runs. Token length 32; never printed anywhere.

* **Socket path shape** (Linux, no `XDG_RUNTIME_DIR`): `/tmp/cc-socks/<claude pid>.sock`. Deleted when
  the session exits, so a dead session's socket is an `ENOENT` on connect — that is the `inbox-stale`
  signal (an `ECONNREFUSED` is the same thing with the file left behind).
* **Wire format** (read out of the 2.1.275 bundle's `[uds-messaging]` handler and then confirmed live).
  One JSON object per line:
  `{"type":"auth","token":"<CLAUDE_CODE_MESSAGING_TOKEN>"}` then
  `{"type":"user","from":"<name>","message":{"content":"<text>"}}`.
  The message frame's type is **`user`**, and the text lives at **`message.content`** — a frame with a
  missing or non-string `message.content` is logged as ignored and dropped. Optional fields the handler
  reads: `uuid`, `msg_id`, `priority` (`now`|`next`|`later`, default `next`), `file_attachments`, and
  `session_id` — and `session_id`, if present, must EQUAL the receiving session's id or the frame is
  dropped, so we never send it. Both lines in a single `write()` works. Nothing is written back on the
  socket: the connection is fire-and-forget, and the only completion signal is the write callback.
* **Auth line**: optional on Linux (a post with no auth line delivered identically), required on native
  Windows. We always send it — harmless where it is optional, mandatory where it is not.
* **Held vs delivered.** With NO `crossSessionInbound` set, a bypass-permissions receiver **HELD** the
  message behind an approval dialog: *"The sender did not attest its permission mode and this session
  bypasses prompts. Review it below, or set crossSessionInbound to accept."* The token did NOT make it
  an own-child message: on Linux own-child verification is by process ancestry, and the flusher is not
  an ancestor of the pane (the token only substitutes for ancestry on macOS-after-exit, PID-1
  containers, and native Windows). With `crossSessionInbound: "accept"` in the receiving session's
  settings the same post was **delivered unheld**. So `accept` is a hard prerequisite of this build, not
  a nicety — Netcup's user settings already carry it.
* **Timing**: post at 22:50:19.869 UTC → the receiving pane was already rendering the turn 3 s later,
  and had answered within ~7 s. No keystrokes.
* **The composer is untouched.** With `this is ben typing a half-finished prom` sitting half-typed in the
  receiver's composer, the post arrived as its own turn, the agent answered it, and the half-typed line
  was still sitting there afterwards — unchanged, unsubmitted. That is the 2026-09-17 incident closed at
  the root.
* **Mid-turn**: posted while the session was running a tool; read between tool calls and answered
  without disturbing the in-flight work.

### (b) Codex queue — WORKS, and the hook's `session_id` IS the thread id
Setup: scratch `CODEX_HOME=~/tmp/codex-spike/home` (a copy of the managed account's `auth.json`, mode
600 — the managed home itself was only read), model gpt-5.6-luna, `approval_policy = "never"`, a
`hooks.json` whose handler dumps the payload, pre-trusted with this repo's own
`codexHookHash`/`trustKey`, bare `codex` TUI in tmux, one baseline turn.

* **The hook payload's `session_id` is accepted verbatim by `codex queue --thread`.** `SessionStart`,
  `UserPromptSubmit` and `Stop` all carried the same `session_id`
  (`01a0b193-d533-7360-be08-b82b41f19b3d`), and `codex queue --thread <that id>` printed
  `Queued message <msg id> for thread <session id>.` and exited 0. So D2 needs no new id plumbing.
  Payload keys seen: `session_id, turn_id, transcript_path, cwd, hook_event_name, model,
  permission_mode` (+ `source` on SessionStart, `prompt` on UserPromptSubmit, `stop_hook_active` and
  `last_assistant_message` on Stop). `SessionStart` fired, but its payload only appeared once the first
  turn ran — registration must therefore not depend on SessionStart alone.
* **The idle TUI turned** on the queued item with zero keystrokes to its pane, twice.
* **The composer is untouched here too**: with `ben half-typed this into codex and did not press enter`
  in the composer, the queued note ran as its own turn and the half-typed line survived intact.
* **Unknown / zero-turn thread**: exit 1 with
  `Error: failed to queue session message: thread/queue/add failed: failed to read thread: invalid
  thread-store request: no rollout found for thread id <id> (code -32603)`. Note the spec text above
  said "no rollation found" — the real string is **`no rollout found`**, which is what D5 matches on.

### What the spikes changed in the plan
1. `crossSessionInbound: "accept"` is a prerequisite, and the failure mode without it is a MODAL dialog
   in the recipient's pane — worse than no delivery. The orchestrator's item, restated here.
2. The Claude frame is `{"type":"user","message":{"content":…}}`, not a bare string or a `text` field.
3. Codex's error string is `no rollout found`.
4. `no-inbox` must NOT count as a delivery attempt (added to D3): with typing off by default, counting
   it would burn all 20 attempts in 20 minutes against any unregistered peer and write a BLOCKED line
   into Ben's inbox for a note the ledger had already delivered. Nothing was attempted, so nothing is
   counted; the entry ages out at 48 h as before.
