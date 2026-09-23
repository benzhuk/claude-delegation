# X — Codex native event and package scout

**VERDICT: PARTIAL — Codex has working native hooks, queue wake-up, subagent events and native plugin discovery; this repo uses only a host-config mirror today.  Do not call that mirror a native package.**

## Verified capability and evidence

- `codex-cli 0.156.1` locally exposes `plugin`, `plugin marketplace`, `queue --thread`, `agents`, and `app-server generate-json-schema`. `codex queue --help` accepts a session UUID/name; the current hook maps `input.session_id` to that thread id at `hooks/multi-codex-hook.mjs:81-90`.
- Hooks are stable locally (`codex features list`) and the generated 0.156.1 protocol schema records `SubagentStart`/`SubagentStop` hook events and `Thread.parentThreadId`. Artifact: `codex-app-schema-x/codex_app_server_protocol.v2.schemas.json` (generated in this temp directory).
- Official hook contract: common fields are `session_id`, `transcript_path`, `cwd`, `hook_event_name`, and `model`; turn hooks also have `turn_id`; `SubagentStart` and `SubagentStop` add `agent_id` and `agent_type`. Critically, subagent hooks use the **parent** `session_id`. [Hooks](https://learn.chatgpt.com/docs/hooks)
- The official contract says transcript layout is not a stable hook interface; do not infer ancestry from JSONL. The sampled local transcripts expose no authentic subagent source shape (only `user`/`chatgpt_handoff`), so they cannot close this gap.
- Current Codex wiring covers only `SessionStart`, `UserPromptSubmit`, `PostToolUse`, and `Stop` (`scripts/codex-hook-trust.mjs:381-389`), and runs delivery/ack with no child discriminator (`hooks/multi-codex-hook.mjs:66-112`). The equivalent Claude adapter has an `agent_id` early return (`hooks/multi-inbox.js:258-264`) plus regression tests (`hooks/multi-inbox.test.mjs:349-387`); that is Claude-only evidence, not Codex parity.
- Codex supports `SubagentStart`/`SubagentStop`, but no documented `agent_id` is supplied for `SessionStart`, `UserPromptSubmit`, `PostToolUse`, or `Stop`. Therefore an `agent_id` guard is valid only on the two native subagent events; adding it to all current events would be an unsupported assumption. Unknown ancestry must not suppress lead delivery.
- Existing support is a mirror: `scripts/mirror-shared-skills.mjs:45-79` writes skills/agents/shims into host locations and points hooks to this checkout; `codex/README.md:27-49` describes the same installation. It is functional host integration, but needs a prior mirror/apply and is not plugin discovery.
- Native plugin packaging is supported now: local installed examples have `.codex-plugin/plugin.json`; marketplaces use `.agents/plugins/marketplace.json`; CLI accepts local/Git marketplace roots. This repo has `.claude-plugin/plugin.json` (0.17.0) but no root `plugin.json`, no `.codex-plugin/plugin.json`, and no `.agents/plugins/marketplace.json`. Official guidance now prefers root portable `plugin.json`, with `extensions.com.openai.hooks`; compatibility `.codex-plugin/plugin.json` remains supported. [Package your plugin](https://developers.openai.com/plugins/build/plugins)
- Native hooks have a trust seam: an enabled plugin does not auto-trust bundled command hooks. The plugin package can provide `hooks/hooks.json`; commands receive `PLUGIN_ROOT`/`PLUGIN_DATA` and compatible `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA`. This is a supported, explicit activation boundary, not a defect.

## Smallest useful session-only trial (after source candidate exists)

Use a scratch `CODEX_HOME`, add the repo-local marketplace with `codex plugin marketplace add <root>`, then `codex plugin add delegation@<marketplace>` and `codex plugin list --json`. Do not run a model or trust a hook. **Prediction:** the list reports enabled `delegation` with source at the checked-out plugin root and its skills become discoverable; failure proves a manifest/catalog shape or path error without modifying Ben's installed configuration.

## Exact smallest source gap worth building

Add a portable root `plugin.json` plus `.agents/plugins/marketplace.json`, and a Codex-specific hook config that calls `hooks/multi-codex-hook.mjs` through `${PLUGIN_ROOT}`. Keep `.claude-plugin/` for Claude compatibility. The new config must not reuse Claude's hook commands wholesale. Add fixture tests that (1) prove marketplace discovery in a scratch home and (2) call Codex `SubagentStart`/`SubagentStop` payloads with `agent_id`, asserting no ledger/cursor/registry mutation. Leave the four lead events enabled unless a live native child event supplies a documented discriminator.

**Falsifiable next action:** package and perform the scratch install/list trial. If `delegation` is absent from `plugin list --json`, native discovery is not delivered. If a later live subagent emits `agent_id` on any delivery event, extend the early no-side-effect guard only for that documented event.
