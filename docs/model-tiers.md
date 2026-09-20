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
- Data pulls, censuses, log crunching and mechanical diffs are fast- or mid-tier work (Haiku for
  mindless bulk, Sonnet otherwise), reporting to disk; the orchestrator never runs a comparison in
  its own loop (Ben, 2026-09-18).
- A QUALITY verdict (better or worse against a gold, an advisor note or a baseline) is high tier
  (Opus) at minimum, with the source in hand; a light agent's score is never trusted for that
  (Ben, 2026-09-18).
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

## Spawn mechanics per vendor

How an orchestrator actually pins a tier at spawn time, so "run this on a high-tier
model" becomes a concrete argument instead of a hope.

### Claude Code

- **`model:` on the `Agent` tool call is the override** — pass it at the spawn call site
  (e.g. `model: "opus"`) and it wins over whatever the agent definition's frontmatter
  says. Use this to upgrade one territory (the hardest builder) without touching the
  shared agent file.
- **`agents/*.md` frontmatter `model:` is the default** for every spawn of that agent
  type that doesn't override it — `agents/builder.md` and `agents/integrator.md` ship
  `model: sonnet` (mid tier), `agents/reviewer.md` ships `model: opus` (high tier). This
  is a Claude Code-only mechanism (frontmatter format + the `Agent` tool's `model` param);
  Codex has no equivalent file format, hence the parallel `.toml` files below.
- Concrete ids to pass: `claude-fable-5-1` (top), `claude-opus-5` (high),
  `claude-sonnet-5` (mid), `claude-haiku-4-5-20251001` (fast).

### Codex

- **`~/.codex/agents/*.toml` `model =`** is the equivalent default-pin: each custom role
  file (`name`, `description`, `developer_instructions`, `model`, `sandbox_mode`) names
  its model id directly, no per-call override mechanism confirmed (unlike Claude's
  `Agent` call `model:` param — Codex equivalent: unverified). Pick the id from the same
  tier row as the Claude counterpart, so a `builder.toml` sets `model = "gpt-5.6-terra"`
  (mid) to mirror `agents/builder.md`'s `model: sonnet`, and a `reviewer.toml` sets
  `model = "gpt-6-astra"` to mirror `agents/reviewer.md`'s `model: opus` — per the
  table's note a Codex REVIEW runs on GPT-6-Astra unless cost forbids, in which case
  `gpt-5.6-sol` is the fallback.
- Codex 0.154 ships three built-in roles (`default`, `worker`, `explorer`); custom roles
  in `.codex/agents/*.toml` extend that set. `[agents]` config controls `max_threads`
  (default 6) and `max_depth` (default 1) — the Codex-side equivalent of this plugin's
  concurrency budget, but configured globally rather than per-mandate; treat
  `concurrency-budget.md`'s per-task numbers as the intent and cap them at whatever
  `max_threads` allows.
- Top-tier Codex spawns (adjudication, spec red-team) use `gpt-6-astra` by the same
  reasoning as the table's note: OpenAI's one flagship covers the "judge" row, and the
  "hardest build territory" row stays `gpt-5.6-sol` unless cost allows Astra there too.

### Research lanes

The research ladder (`docs/research-ladder.md`) maps onto the tiers above with no new
tier added: mid tier (Sonnet / GPT-5.6-Terra) runs each source-class lane, fast tier
(Haiku / GPT-5.6-Luna) runs the fetch-and-quote pass over pages a mid-tier lane already
found, high tier (Opus / GPT-6-Astra, Sol if cost forbids — the skeptic is a review, per
the table's note) runs the skeptic pass, which refutes by re-fetching every load-bearing
source itself. The top session adjudicates across lanes; it never runs a lane itself —
that would spend top-tier tokens on execution, which the rules of thumb above already
rule out.
