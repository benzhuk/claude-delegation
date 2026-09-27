# delete-deny Territory D2 — the Codex PreToolUse deny shape: established

Written for work `wr-2026-09-27-delete-deny`, Territory D2. Supersedes nothing; extends the scoping in
`pack/codex-guards.md` and `docs/notes/skills-o-codex-guards-1.md` (same text, the predecessor's note in
the main checkout, `C:/Users/benzh/Code/claude-delegation/docs/notes/skills-o-codex-guards-1.md`).

This note originally shipped mid-investigation, with the deny shape marked UNVERIFIED and the wiring
gated behind an extra opt-in flag (`--codex-hooks-delete-guard`). Later in the same build, a stronger
evidence source resolved the open question. This is the updated version: **the deny shape is now
established**, and the wiring rides along with the existing `--codex-hooks`/`--codex-hooks-only` opt-in —
no separate flag.

## What is wired now

- `scripts/codex-hook-trust.mjs:CODEX_DELETE_GUARD_EVENTS` — a `PreToolUse` entry, 10 s timeout, for the
  SAME script D1 wires for Claude (`hooks/delete-guard.mjs`).
- `scripts/codex-hook-trust.mjs:DELETE_GUARD_HOOK_MARKER` — `'delete-guard.mjs'`, so this file's own
  `mergeHooksJson` (parameterized with a `marker` argument) never confuses the delete-guard's group with
  the note-delivery script's group (`HOOK_MARKER`, `'multi-codex-hook.mjs'`) in the same `hooks.json`.
- `scripts/mirror-shared-skills.mjs:installDeleteGuardHooks` — the same merge/trust/atomic-write
  machinery `installCodexHooks` already used for note delivery, extracted into a shared
  `installCodexHookScript` so the two installers cannot drift into two different regex-shaped bugs (the
  single-source-of-truth constraint in `docs/notes/skills-o-codex-guards-1.md` #4, applied to the
  installer code around the patterns, not only the patterns themselves).
- No separate flag: `installDeleteGuardHooks()` is called wherever `installCodexHooks()` is — both in
  `--codex-hooks-only` and in a normal run under `--codex-hooks`. Tested in
  `scripts/mirror-shared-skills.test.mjs` (the `D2:` cases): the guard installs alongside note delivery
  without colliding, is a clean refusal (never a crash or a silent no-op) while `hooks/delete-guard.mjs`
  is absent, and the now-removed `--codex-hooks-delete-guard` flag is refused as unknown rather than
  silently accepted (a stale doc or muscle memory typing the old flag gets told, not ignored).

## What is proven

**1. Codex executes a `PreToolUse` hook at all.** Evidence:
- `scripts/codex-hook-trust.test.mjs:134-141` (`ORCA_HOOKS` fixture) reproduces a real Orca-managed
  `hooks.json` that carries a `PreToolUse` group pointed at `.orca/agent-hooks/codex-hook.cmd` —
  i.e. Orca itself runs a command hook on `PreToolUse` in production Codex homes.
- `scripts/codex-hook-trust.mjs` (comment above `HOOK_MARKER`) documents that Orca writes this same
  command into `SessionStart`, `UserPromptSubmit`, `PreToolUse` and `PermissionRequest` in every managed
  home it controls.
- On this host, `codex-cli 0.157.0` is installed (`codex --version`), and the plain `~/.codex/hooks.json`
  already carries `SessionStart`/`UserPromptSubmit`/`PostToolUse`/`Stop`/`Interrupt` entries for
  `multi-codex-hook.mjs` (this plugin's own note-delivery installer, already applied) — a live, non-Orca
  home with no `PreToolUse` entry in it today, since nothing before this build ever wired one there.

**2. Codex's `PreToolUse` contract honors a deny in the exact shape Claude's hooks use.** This was
originally left unresolved (see "What was NOT proven, originally" below) after a static string scan of the
installed `codex.exe` came back inconclusive. It is now resolved by reading Codex's own upstream Rust
source directly:

- Repository: `https://github.com/openai/codex.git`, commit `7dae8c53d97e61cd774e4d6bcca5243c29ca615c`
  (dated 2026-09-24), a local checkout available on this build's host at the time of investigation.
- File `codex-rs/hooks/src/events/pre_tool_use.rs` implements `PreToolUseRequest` and its response
  parsing (`parse_completed`). Its own unit tests fix the exact contract:
  - `permission_decision_deny_blocks_processing` — feeds the hook a response
    `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
    "permissionDecisionReason":"<text>"}}` and asserts `should_block: true` with the reason surfaced as
    the block reason. This is BYTE-FOR-BYTE the shape `hooks/agent-dispatch-guard.mjs` already emits for
    Claude, and the one D1's `hooks/delete-guard.mjs` is expected to reuse.
  - `permission_decision_allow_can_update_input`, `deprecated_block_decision_blocks_processing`,
    `unsupported_permission_decision_fails_open`, `exit_code_two_blocks_processing` round out the
    contract (an `"allow"` decision can rewrite the tool call via `updatedInput`; the older
    `{"decision":"block","reason":...}` shape still works; an unrecognized decision fails OPEN, matching
    this plugin's own fail-open convention; a bare exit code 2 with stderr is an alternate deny path).
  - The same file's `command_input_json()` confirms the hook payload carries `agent_id`/`agent_type`
    fields sourced from an optional `subagent: Option<SubagentHookContext>` — relevant to D1's
    scoping-by-caller design (not this territory's job, flagged for D1's own live check, item 4).
- The integration suite `codex-rs/core/tests/suite/hooks.rs` exercises this at the level of an actual
  simulated turn: a `PreToolUse` hook returning the deny shape above is asserted to genuinely prevent the
  guarded command from running (the test's own marker-file/`.git`-directory checks never appear), not
  merely that the hook process is invoked.

**3. On Codex, the guard only denies calls that carry `agent_id` — top-level Codex sessions are not
guarded** (review round 1, MAJOR 3). D1's `decide()` passes the call through (logs `passed-lead`, does not
deny) when `agent_id === undefined` (wt-d1 `hooks/delete-guard.mjs:396-398`) — by design, so a human's own
watched pane keeps today's permission prompt instead of being silently refused. On Claude that field is
present exactly on a dispatched subagent's tool call. On Codex it is narrower: Codex fills `agent_id` only
from `thread_spawn_subagent_hook_context` (`codex-rs/core/src/hook_runtime.rs:199`), and the field is
dropped entirely (not sent as `null`) when there is no subagent context
(`codex-rs/hooks/src/schema.rs:282-285`, `skip_serializing_if = "Option::is_none"`). So the guard denies a
**Codex subagent's** (`spawn_agent`) recursive delete, but a **top-level Codex session** — a `codex exec`
run, or a lane lead's own Codex pane — gets no `agent_id`, logs `passed-lead`, and the command runs. That
top-level case is exactly the "unwatched permission prompt" this whole effort exists to close for a
`codex exec` builder or a skills-a pane running unattended: the wiring here does not yet close it. Probe,
run against a scratch `CODEX_HOME` with D1's script present: a top-level payload
`{"tool_name":"Bash","tool_input":{"command":"mkdir -p x && rm -rf x"}}` (no `agent_id`) printed nothing,
exited 0, and logged `passed-lead`; the same payload with `agent_id` set was denied.

This is stronger evidence than the "Live check when possible" language in `pack/spec.md` Territory D2
describes as the validating step — it is the actual, authoritative implementation and its own test suite,
not an inference from a compiled binary's string table. The spec's primary instruction ("find it in the
Codex hook documentation or Orca's hook") is satisfied: the upstream source IS the documentation here, in
the absence of separately published hook-contract docs.

## What was NOT proven, originally (superseded by the above)

Earlier in this same build, before finding the upstream source checkout, this section reported a string
scan of the installed `codex.exe` and said it found neither `permissionDecision` nor `hookSpecificOutput`
as literal strings, and explained that as a compiled binary "need not contain the literal JSON key names a
`serde` deserializer matches structurally." **Both parts of that were wrong** (review round 1, MINOR 1):
serde's derive macros do embed field names as literals, and a corrected scan of the same binary finds them.
Measured directly against the installed `@openai/codex@0.157.0` binary (path:
`…/@openai/codex/…/bin/codex.exe`, found via `codex --version` → `0.157.0`), `grep -c -a -F` gives
`permissionDecision` 5 hits, `hookSpecificOutput` 8 hits, and the literal string `"Command blocked by
PreToolUse hook"` 1 hit. That ties the upstream source reading to the exact installed version: the source
workspace itself is checked out at `version = "0.0.0"` in `codex-rs/Cargo.toml:159`, so it cannot be
matched to `0.157.0` by version number alone, and the binary scan is what closes that gap. The upstream
checkout used for this note lives at `%TEMP%/codex-hook-source` (commit
`7dae8c53d97e61cd774e4d6bcca5243c29ca615c`) — a temporary research artifact on this build's host, not part
of this repository and not guaranteed to persist; the durable citations in the owned files and this note
are to the commit hash and the specific test/function names, not to that path.

## What is still outstanding

A LIVE end-to-end check — a real Codex turn, with the guard installed, attempting the same probe delete
D1 item 8 uses and actually observing the refusal in a live transcript — has not been run in this
territory. The static/source-level evidence above is strong enough that this build no longer gates
wiring the guard behind an extra flag or an UNVERIFIED marking, but the live check remains valuable
confirmation that nothing about a specific host's Codex build, config, or hook-loading order changes the
picture. See "Follow-ups" below for who should run it and how.

## Decision

Ship the wiring ON whenever `--codex-hooks` (or `--codex-hooks-only`) is used — the spec's own primary
path ("through the existing `--codex-hooks` opt-in path... with its own trust entry") — with no separate
flag and no UNVERIFIED marking in the code comments. The doc comments in both owned files
(`scripts/codex-hook-trust.mjs`, `scripts/mirror-shared-skills.mjs`) cite this note and the specific
upstream test/function names as the durable evidence, rather than depending on the local checkout path
(a temporary research artifact, not part of this repository) remaining available.

This decision is about the deny **shape**, not the guard's **reach**: per item 3 above, the wiring as
delivered only denies a Codex subagent's recursive delete, not a top-level Codex session's. That
narrower-than-Claude reach is shipped as-is in this territory (D2's Owns is the wiring, not D1's `decide()`
scoping rule), and is named as an open decision for the lead below rather than silently shipped as if it
matched Claude's coverage.

**Open decision for the lead:** should a top-level Codex lane (a `codex exec` builder, a skills-a pane) be
denied too, not just a Codex subagent? On the spec's own rule for ambiguity ("the reading that refuses
more"), probably yes — but that is a change to D1's `decide()` contract (for example, a CLI argument that
treats every Codex caller as if it had an `agent_id`, which D2 would then need to append to the Codex
command), and must not be made inside D2 alone.

## Follow-ups (not this territory's Owns — flagging, not doing)

1. **The live end-to-end check — must be run BY a Codex subagent, not a top-level session** (revised,
   review round 1 MAJOR 3). Per item 3 above, `agent_id` is only present on a Codex `spawn_agent`
   subagent's tool call, so a top-level `codex exec` probe is **expected to pass, not be refused** — that
   result would not mean the deny shape is broken, and running the probe's actual delete at the top level
   is not safe until a refusal has first been demonstrated from a subagent. Correct procedure: from a lead
   Codex session, use `spawn_agent` to dispatch a child, and have that child (not the lead) run
   `mkdir -p SCRATCH/dg && rm -rf SCRATCH/dg` against a scratch `CODEX_HOME` that has
   `node scripts/mirror-shared-skills.mjs --codex-hooks-only --codex-home <scratch>` applied (once
   `hooks/delete-guard.mjs` exists — D1's build). Record whether the child's tool call was refused, what
   the transcript showed, and how long it took. Separately, and only as a documented negative control, a
   top-level `codex exec` attempt against the SAME scratch home may run the probe (in a directory that is
   safe to actually delete) and is expected to succeed — i.e. NOT be refused — which is itself the
   confirmation of item 3's scope finding, not a failure.
2. **SKILL.md.** The spec's original fallback text said "the SKILL.md sentence says Codex support is
   pending" for the UNVERIFIED case; that case no longer applies, but "Codex delete-guard support is
   wired" (this build's earlier draft of this follow-up) overstates it too — it reads as full parity with
   Claude's coverage, which item 3 shows is not the case. `SKILL.md` is outside D2's `Owns:` list
   (`pack/brief-D2.md` item 5/6), so it is not touched here. Whoever integrates this should add a sentence
   to `skills/multi/SKILL.md` (or wherever the plugin documents Codex parity) saying: "Codex: wired for
   Codex subagents; top-level Codex lanes are not guarded" — and resolve the open decision above (this
   note's "Decision" section) before deciding whether that sentence needs revisiting.
3. **D1's item 4 (live `agent_id` confirmation).** The upstream source's `command_input_json()` (cited
   above) already shows Codex's PreToolUse payload carries `agent_id`/`agent_type` when the caller is a
   subagent, sourced from `Option<SubagentHookContext>` — this corroborates D1's scoping-by-caller design
   ahead of their own live check, though it does not replace a live confirmation on this host's actual
   Codex build.
