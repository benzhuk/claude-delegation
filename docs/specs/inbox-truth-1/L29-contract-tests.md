VERDICT: READY

Independent contract tests added from `spec.md`, without source edits or test execution.

## Cases
- `note-inbox.test.mjs`: a Details note read with `--no-repo` must return `packetExists: null`, `packetChecked: false`, no missing-packet problem, and `not checked here` output.
- Same fixture with repo inspection distinguishes existing packet (`true`, `true`, resolved path) from absent packet (`false`, `true`, one problem and MISSING output).
- A no-Details note remains without a packet suffix and carries `packetExists: null`, `packetChecked: false`.
- `multi-hook-core.test.mjs`: `summarise` has separate assertions for strict true/present, false/MISSING, and null/not-checked rendering.
- `note-inbox.test.mjs`: a small documentation assertion pins the exact Codex queue paragraph immediately after the idle bullet in `skills/multi/SKILL.md`.

## Scope
- Modified only `skills/multi/scripts/note-inbox.test.mjs` and `hooks/multi-hook-core.test.mjs`; changes are unstaged.
- No test was run, as assigned; current base is expected to be red until the L29 source implementation lands.
