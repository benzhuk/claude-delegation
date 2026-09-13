# Codex counterparts

Codex-side agent roles for the same builder / reviewer / integrator pipeline that
`agents/*.md` gives Claude Code. One pipeline, two vendors, one tier table.

## The three roles

| file | role | tier | model | sandbox |
|---|---|---|---|---|
| `agents/builder.toml` | writes one file territory | mid | `gpt-5.6-terra` | `workspace-write` |
| `agents/reviewer.toml` | adversarial read-only review | high | `gpt-6-astra` | `read-only` |
| `agents/integrator.toml` | full suite + smoke, once per gate | mid | `gpt-5.6-terra` | `workspace-write` |

Models come from `docs/model-tiers.md` and nowhere else. The reviewer is Astra rather than
Sol on purpose: OpenAI ships one flagship, and "verify with a stronger tier than the writer"
needs a genuinely stronger model. `gpt-5.6-sol` stays the high-tier choice for hard BUILD
territories. When a vendor ships a new model, edit the tier table; these files follow it.

The `developer_instructions` in each file mirror the intent of the matching `agents/*.md`
in vendor-neutral words — no Agent tool, no `subagent_type`, no Claude-specific hook names.
Where Claude's file says "you have no Bash tool", the Codex file says "your sandbox is
read-only", which is the same guarantee by a different mechanism.

## Installation

`scripts/mirror-shared-skills.mjs` copies every `codex/agents/*.toml` to
`~/.codex/agents/` and publishes `skills/{multi,delegate,team-build}` (plus the
chezmoi-managed `~/.claude/skills/{knowledge,triage,dev-server,learn}` when present) to
`~/.agents/skills/<name>`, which Codex scans natively.

```
node scripts/mirror-shared-skills.mjs --dry-run    # see every action first
node scripts/mirror-shared-skills.mjs              # symlink on macOS/Linux, copy on Windows
node scripts/mirror-shared-skills.mjs --uninstall  # remove exactly what the manifest lists
```

The mirror deliberately never writes `~/.claude/skills`: Claude Code already receives these
skills through the plugin cache, and a second copy would mean two skills with one name.

Codex reads `SKILL.md` frontmatter for `name` and `description` only, which is exactly what
these skills carry — no per-vendor skill format work is needed.

## Spawning a role

Codex subagents need `[features] multi_agent = true` in `~/.codex/config.toml`
(**verified** present on Ben's Windows box). The `[agents]` block controls `max_threads`
(default 6), `max_depth` (default 1) and `job_max_runtime_seconds`. Three roles ship
built in: `default`, `worker`, `explorer`; the files here add three more.

**Unverified:** the exact invocation that spawns a named custom role, and whether a global
`~/.codex/agents/*.toml` is discovered the same way a repo-local `.codex/agents/*.toml` is.
The audit confirmed the file format and location convention but not the call site, and no
live spawn was attempted. Confirm during the pilot before relying on it; if only the
repo-local path is discovered, copy these files into the target repo's `.codex/agents/`
and add that path to the mirror.

**Unverified:** `sandbox_mode` accepts `read-only` / `workspace-write` /
`danger-full-access` in Codex's own config vocabulary; the values here follow that
convention but were not exercised on a live spawn.

## Peer messages

Any of these roles talking to a session it does not own uses the `multi` skill, never an
orchestration dispatch, worker or mailbox command. That line is in all three
`developer_instructions` and in the global `AGENTS.md` line the dotfiles territory adds.
