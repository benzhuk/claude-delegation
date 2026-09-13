# Model tiers — the single source of truth (PINNED v2, 2026-09-13)

Skills never name a bare model. They name a TIER and, in parentheses, the concrete model on each
vendor, so any agent reads it once and knows what to call:

> "run this on a high-tier model (Claude Opus / GPT-5.6-Sol)"

| tier | job | Claude | OpenAI (Codex) |
|------|-----|--------|----------------|
| **top**  | orchestrate, judge, decide, synthesize — never bulk execution | Fable  | GPT-6-Astra |
| **high** | verify, adjudicate, spec red-team, the hardest territories (algorithms, concurrency, data integrity) | Opus | GPT-5.6-Sol (see note) |
| **mid**  | default executor — writes code, runs searches, mechanical edits, integration gates | Sonnet | GPT-5.6-Terra |
| **fast** | mindless bulk sweeps only | Haiku | GPT-5.6-Luna, GPT-5.3-Codex-Spark |

Note on the OpenAI high row: OpenAI ships one flagship. A Codex REVIEW or adjudication runs on
GPT-6-Astra unless cost forbids, because "verify with a stronger tier than the writer" needs a
genuinely stronger model; GPT-5.6-Sol is the high-tier choice for hard BUILD territories. Claude has two
distinct models here (Fable above Opus), so its rows need no such caveat.

Rules of thumb (vendor-neutral):
- Top-tier tokens buy judgment only. A top-tier session routes work; it does not grind through it.
- Verify with a stronger tier than the writer: mid writes → high reviews; high writes → top adjudicates.
- Fast tier never touches anything that computes a number someone will act on.
- On Ben's plans the mid tier is effectively free: run executors at full strength, always.

Environment: `DELEGATION_TOP_TIER` — comma-separated model-id fragments that count as top/high for the
routing hook and the delegation gate (default `fable,opus,gpt-6-astra,gpt-5.6-sol`). The old
`CLAUDE_DELEGATION_TOP_TIER` is read as a fallback in 0.2.x and removed in 0.3.0. Only Claude Code has
a programmatic reader (the plugin's reminder hook); on the Codex side the gate is prose-only until Codex
hook events are confirmed. Rollout step for Ben: set the new name in `~/.config/claude/claude.env` on one
machine and `chezmoi add --encrypt` it.

Concrete ids (2026-09-13): Claude `claude-fable-5-1`, `claude-opus-5`, `claude-sonnet-5`,
`claude-haiku-4-5-20251001`; OpenAI `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`,
`gpt-5.3-codex-spark`. When a vendor ships a new model, update this table only; every skill inherits it.

<!-- Builder T2 expands this file with the spawn mechanics per vendor (Claude: `model:` on the Agent call /
agents/*.md frontmatter; Codex: `~/.codex/agents/*.toml` `model =` from the same row) — everything above
this line is frozen. -->
