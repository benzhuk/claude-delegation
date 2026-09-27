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

This is stronger evidence than the "Live check when possible" language in `pack/spec.md` Territory D2
describes as the validating step — it is the actual, authoritative implementation and its own test suite,
not an inference from a compiled binary's string table. The spec's primary instruction ("find it in the
Codex hook documentation or Orca's hook") is satisfied: the upstream source IS the documentation here, in
the absence of separately published hook-contract docs.

## What was NOT proven, originally (superseded by the above)

Earlier in this same build, before finding the upstream source checkout, this section said: no
hook-contract documentation ships with the installed `@openai/codex@0.157.0` package, and a scan of the
compiled `codex.exe`'s embedded string table found a distinct approval-outcome vocabulary
(`approved`/`denied`/`rejection`/`timed_out`/`abort`, `HookRunSummary`, `ExecApprovalRequestEvent`) but
neither `permissionDecision` nor `hookSpecificOutput` as literal strings — circumstantial, and explicitly
called "not a disproof" at the time. That scan's inconclusiveness is now explained: a compiled binary's
string table need not contain the literal JSON key names a `serde` deserializer matches structurally, so
the absence proved nothing either way. The upstream source settles it directly.

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

## Follow-ups (not this territory's Owns — flagging, not doing)

1. **The live end-to-end check.** From a Codex session (`skills-a`'s, or a scratch `codex exec` against a
   throwaway `CODEX_HOME`) with `node scripts/mirror-shared-skills.mjs --codex-hooks-only --codex-home
   <scratch>` applied (once `hooks/delete-guard.mjs` exists — D1's build), attempt the same probe D1
   item 8 uses (`mkdir -p SCRATCH/dg && rm -rf SCRATCH/dg`) and record: did the tool call actually not
   run, what did Codex's turn transcript show, and how long it took. Quote the result the way D1 item 8
   asks for its own live check. Valuable confirmation, no longer a blocker for shipping the wiring.
2. **SKILL.md.** The spec's original fallback text said "the SKILL.md sentence says Codex support is
   pending" for the UNVERIFIED case; that case no longer applies. `SKILL.md` is outside D2's `Owns:` list
   (`pack/brief-D2.md` item 5/6), so it is not touched here. Whoever integrates this should add a sentence
   to `skills/multi/SKILL.md` (or wherever the plugin documents Codex parity) saying Codex delete-guard
   support is wired and rides along with `--codex-hooks`, pending only the live end-to-end confirmation
   above.
3. **D1's item 4 (live `agent_id` confirmation).** The upstream source's `command_input_json()` (cited
   above) already shows Codex's PreToolUse payload carries `agent_id`/`agent_type` when the caller is a
   subagent, sourced from `Option<SubagentHookContext>` — this corroborates D1's scoping-by-caller design
   ahead of their own live check, though it does not replace a live confirmation on this host's actual
   Codex build.
