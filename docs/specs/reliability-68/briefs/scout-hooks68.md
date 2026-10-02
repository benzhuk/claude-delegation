# Scout: hooks68 (items 1 and 2, and the brief-template sentence of item 3). Read at base 0f910a7a.

## 1. Files and symbols
- Item 1 is largely BUILT already (stale-session-guard-1, aeb7f762 and a960c366, 9/28, before 0.20.18). `scripts/plugin-staleness.mjs` `checkStaleness()` reads the running version from the script's own cache path and `installed_plugins.json`; `staleSessionText()` builds the line. `scripts/wiring-check.mjs` (main(), lines ~474-535) prints it on `--line`, and `hooks/hooks.json` runs `wiring-check.mjs --line --hook` on SessionStart. Printed text today: "stale session: this session loaded delegation hooks 0.20.18, but 0.20.19 is installed, ... start a fresh session". The spec's one-liner ("plugin 0.20.18 running, 0.20.19 installed: restart this pane") does not exist anywhere. Staleness is "running strictly older than EVERY readable installed entry", not "differs".
- Item 2, Claude side: `hooks/multi-inbox.js` already returns early on `input.agent_id` (main(), ~line 253) and on `DELEGATION_REVIEW_RUN=1`, before any registration (commits 94666538, f95958ff). So the spec's premise (subagent events register the lead's inbox) is already guarded for hook events that carry `agent_id`. `registerMyInbox()` (~line 168) passes `cwd` from `input.cwd` straight into `transport.claudeInboxRecord()` (transport.mjs:1538); `registerInbox()` (transport.mjs:1596) never checks the cwd.
- Item 2, Codex side: `hooks/multi-codex-hook.mjs:239` calls `registerInbox(... codexInboxRecord(env, {cwd}))` with `input.cwd`; role `child` returns earlier (line ~205).
- Item 2, "recipient repo": `skills/multi/scripts/note-send.mjs` lines 639-690 choose `targetRepo`; the inbox branch (lines 654-675) uses `inboxRecord.cwd` and `mainCheckout()` (transport.mjs:~450-482), which RETURNS `start` for a non-git directory ("write where we were told"). That is how a ledger line lands in a probe folder. Only a non-existent cwd falls back with a warning today.
- Item 3 sentence: absent from every shipped template. Candidate places: `agents/{builder,reviewer,runner,integrator}.md`, `codex/agents/*.toml`, `skills/team-build/SKILL.md`, `skills/delegate/SKILL.md`, `docs/mandate-template.md` (mirrored to `_docs` by `scripts/mirror-shared-skills.mjs`). The mandate constants in `skills/team-build/references/build-loop-workflow.js` (lines 193-215) are census68's file.

## 2. Helpers to reuse
- `transport.mjs`: `mainCheckout`, `gitRunner`, `toPosix`, `readInboxes`. For a cheap git-checkout test inside a hook (700 ms PostToolUse budget) walk up for a `.git` entry with `fs.existsSync`; do not spawn git.
- Pattern to copy for the sentence: `agents/agents.test.mjs` lines 158-190 (pinned scratch sentence in eight role files; worktree rule once per place, outside the safety block).
- `scripts/plugin-staleness.mjs` `checkStaleness` (reuse, do not fork).

## 3. Tests that police this area
- `agents/agents.test.mjs`: safety blocks byte-identical across the four agents, 11 bullets, under 2100 chars. New sentence goes OUTSIDE the safety block.
- `scripts/wiring-check.test.mjs` lines ~1281-1437: pins the literal "stale session: ..." text for CLI, `--json` and `--hook`; line 1444 pins the hooks.json SessionStart wiring.
- `hooks/agent-dispatch-guard.test.mjs` and `scripts/plugin-staleness.test.mjs`: pin `staleSessionText`.
- `hooks/multi-inbox.test.mjs` tests (l), (l2), (m): child and review-run sessions leave populated lead state untouched. `hooks/multi-codex-hook.test.mjs`, `skills/multi/scripts/note-send.test.mjs`, `transport.test.mjs`: registration and recipient-repo behaviour.

## 4. Open questions for the spec
- Item 1: is the existing stale-session line the item, with only the wording changed? A SessionStart hook cannot warn a pane that never restarts; it fires only on a start, resume, clear or compact event. Default used in the brief: keep `staleSessionText` untouched for the guard, CLI and `--json`; in `--hook` mode print the spec's one-liner instead.
- Item 2: no event in this tree is known to reach `registerMyInbox` without `agent_id` except an unmarked `claude -p` child that inherits `NOTE_SLUG`. Which event produced the 20-hour "gudgeon" registration is not on disk. Default: add the non-checkout refusal (registration side AND note-send side) and a test for a child-shaped event; report if no unguarded path is found.
- Does item 2's "refuse a recipient repo that is not a git checkout" mean at registration, at send, or both? Default: both.
