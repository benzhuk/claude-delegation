# P2 scout — Census

## Files and symbols
- `scripts/build-census.mjs` exists and is Claude-JSONL-specific: `--lead` requires a `.jsonl`; readers accept `type: assistant`, `message.usage`, `requestId`/`message.id`, and Claude subagent directory conventions.
- Its public output has no `leadHost`, `leadTokens`, or unsupported state; `formatText` currently emits numeric lead tables, so a Codex branch needs explicit non-numeric attribution instead of zeroes.
- `scripts/build-census.test.mjs` and `scripts/build-census.fixtures/` exist; fixtures encode Claude line shapes, split-request last-line-wins, marker windowing, role journals, and unreadable-file unknowns.
- `docs/census.md` explicitly calls `--lead` “one Claude Code lead session transcript” and documents only Claude paths/turn semantics.
- `hooks/multi-codex-hook.mjs` receives native `session_id`, `cwd`, optional `transcript_path`, and passes a thread id into inbox registration. It neither discovers `$CODEX_HOME/sessions` nor exposes per-turn usage.
- Native evidence names an actual Codex thread and private receipt locations, but offers no published transcript schema, session-file location, or usage-field evidence. No private transcript was opened in this scout.

## Helpers to reuse
- `runCensus`, `formatText`, `formatJson`, `parseArgs`, and bounded streaming readers are reusable once a verified Codex metadata adapter supplies equivalent event/usage data.
- `containsMarkerDeep` is the existing privacy boundary: marker matching returns a boolean and does not print content.
- `docs/work/evidence/windows-installed-codex-hooks.md` supplies only observed hook execution context; use it to distinguish host evidence from a reader contract.

## Tests that police this area
- `scripts/build-census.test.mjs` enforces last-line-wins de-dup, conversational `leadTurns`, marker windows, no confident zero for unreadable input, and deterministic reports.
- `scripts/work-record.test.mjs` / acceptance checks recognize the literal `VERDICT: COUNTED ` prefix; additive host reporting must retain it.
- Existing fixture tests are not evidence that a Codex session has compatible files or token fields.

## Open questions for the spec
- Which supported, non-private Codex metadata/API exposes per-turn model usage and a stable event sequence, and what schema/version proves it?
- May a Codex census inspect a user-supplied session artifact after consent, or must it use only host-provided summaries? Verify metadata access without reading private transcript content first.
- If usage is unavailable, should Codex `leadTurns` also be `unsupported` (no verified assistant/user event stream), while preserving the Claude report API?
