# delete-deny Territory D2 — the Codex PreToolUse deny shape, still unverified

Written for work `wr-2026-09-27-delete-deny`, Territory D2. Supersedes nothing; extends the scoping in
`pack/codex-guards.md` and `docs/notes/skills-o-codex-guards-1.md` (same text, the predecessor's note in
the main checkout, `C:/Users/benzh/Code/claude-delegation/docs/notes/skills-o-codex-guards-1.md`).

## What is wired now

- `scripts/codex-hook-trust.mjs:CODEX_DELETE_GUARD_EVENTS` — a `PreToolUse` entry, 10 s timeout, for the
  SAME script D1 wires for Claude (`hooks/delete-guard.mjs`).
- `scripts/codex-hook-trust.mjs:DELETE_GUARD_HOOK_MARKER` — `'delete-guard.mjs'`, so this file's own
  `mergeHooksJson` (now parameterized with a `marker` argument, `scripts/codex-hook-trust.mjs` near
  `export function mergeHooksJson`) never confuses the delete-guard's group with the note-delivery
  script's group (`HOOK_MARKER`, `'multi-codex-hook.mjs'`) in the same `hooks.json`.
- `scripts/mirror-shared-skills.mjs:installDeleteGuardHooks` — the same merge/trust/atomic-write
  machinery `installCodexHooks` already used for note delivery, extracted into a shared
  `installCodexHookScript` so the two installers cannot drift into two different regex-shaped bugs (the
  single-source-of-truth constraint in `docs/notes/skills-o-codex-guards-1.md` #4, applied to the
  installer code around the patterns, not only the patterns themselves).
- `--codex-hooks-delete-guard` — its own CLI flag, independent of `--codex-hooks`. Tested in
  `scripts/mirror-shared-skills.test.mjs` (the two `D2:` cases): the flag alone wires the guard, is a
  clean refusal (never a crash or a silent no-op) while `hooks/delete-guard.mjs` is absent, and never
  collides with the note-delivery hooks in the same file.

## What is proven

Codex **executes** a `PreToolUse` hook. Evidence:
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

## What is NOT proven

Whether Codex's `PreToolUse` hook contract **honors a deny** in the shape Claude's hooks use —
`{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason:
'<text>' } }` (the shape `hooks/agent-dispatch-guard.mjs` already emits for Claude, and the one D1's
`hooks/delete-guard.mjs` is expected to reuse) — or whether Codex silently accepts the tool call anyway,
which would be a false green: a guard that looks installed and trusted but never actually refuses
anything.

Checked, on this host, before concluding this is unresolved:
- No hook-contract documentation ships with the installed package (`@openai/codex@0.157.0` under
  `node_modules/@openai/codex`; its `README.md` and the vendored binary's own `--help` text describe CLI
  flags and subcommands, nothing about a hook's JSON return value).
- The compiled `codex.exe` (`@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe`) was
  scanned for its embedded string table (ASCII runs ≥ 6 chars). Neither `permissionDecision` nor
  `hookSpecificOutput` appears anywhere in it — the exact tokens Claude's contract uses are simply absent
  from this binary's vocabulary. What IS present is a family of approval-outcome strings —
  `HookRunSummary … event_name handler_type execution_mode scope source_path display_order
  status_message … approved approved_exec policy_amendment proposed_exec … approved_for_session
  approved_mcp_policy_amendment denied rejection timed_out abort` — which reads as Codex's own
  **approval-request** decision vocabulary (the "ask the user" flow: `ExecApprovalRequestEvent`,
  `RequestPermissionsEvent`), not necessarily a hook's own returned-JSON contract. This is circumstantial,
  not a disproof: a hook's decision could be read through a different path (exit code, a distinct
  wire-protocol message, or the same "approval decision" vocabulary reused for a hook's answer) that a
  static string scan of one binary cannot rule out either way.
- No live check was run: confirming the deny shape needs a real `codex exec` turn — a live model call —
  attempting an actual probe command against a Codex home with the guard installed and watching whether
  the tool call is refused. This build did not spend that turn, on the same reasoning the spec itself
  gives room for (`pack/spec.md` Territory D2: "if the deny shape cannot be established on this host by a
  live check, D2 ships the wiring behind an extra opt-in flag, marks it UNVERIFIED... "). Spending a real,
  metered turn to settle a binary-strings question felt like the wrong tradeoff against this territory's
  ETA, given the fallback the spec already names.

## Decision

Ship the wiring, OFF by default, gated by its own flag (`--codex-hooks-delete-guard`), never turned on by
`--codex-hooks` alone. Every doc comment touching it (`scripts/codex-hook-trust.mjs`,
`scripts/mirror-shared-skills.mjs`) says UNVERIFIED and points back at this file.

## Follow-ups (not this territory's Owns — flagging, not doing)

1. **The live check itself.** From a Codex session (`skills-a`'s, or a scratch `codex exec` against a
   throwaway `CODEX_HOME`) with `node scripts/mirror-shared-skills.mjs --codex-hooks-only --codex-home
   <scratch> --codex-hooks-delete-guard` applied (once `hooks/delete-guard.mjs` exists — D1's build),
   attempt the same probe D1 item 8 uses (`mkdir -p SCRATCH/dg && rm -rf SCRATCH/dg`) and record: did the
   tool call actually not run, what did Codex's turn transcript show, and how long it took. Quote the
   result the way D1 item 8 asks for its own live check.
2. **SKILL.md.** The spec's own fallback text says "the SKILL.md sentence says Codex support is
   pending." `SKILL.md` is outside D2's `Owns:` list (`pack/brief-D2.md` item 5/6), so it is not touched
   here. Whoever integrates this should add one sentence to `skills/multi/SKILL.md` (or wherever the
   plugin documents Codex parity) saying Codex delete-guard support is wired but unverified, behind
   `--codex-hooks-delete-guard`.
3. **If proven live:** flip this doc's verdict, update the UNVERIFIED comments in
   `scripts/codex-hook-trust.mjs` and `scripts/mirror-shared-skills.mjs`, and decide whether the guard
   should ride along with `--codex-hooks` instead of needing its own flag.
