# claude-delegation

Multi-agent orchestration for [Claude Code](https://code.claude.com) and Codex,
distilled from real large-scale sessions (up to ~40 subagents per session) — including
the incidents: the load-average-452 fan-out stampede, the hours-long fix round nobody
had put a timer on, the agents whose final reply was `Done.` while their report said
`NEEDS_FIXES`. Tiers are vendor-neutral (Claude and OpenAI/Codex both mapped, see
below); the subordinate-fan-out skills below are for work you spawn and own — talking to
an equal peer session is the separate `multi` skill.

## Install

```
/plugin marketplace add benzhuk/claude-delegation
/plugin install delegation@benzhuk
```

Or non-interactively:

```bash
claude plugin marketplace add benzhuk/claude-delegation
claude plugin install delegation@benzhuk
```

## What you get

**Three skills** (auto-suggested by task shape, or invoke directly):

- **`/delegation:delegate`** — parallel fan-out orchestration for independent
  research / review / audit lanes: decompose, tier the models, budget the concurrency,
  write full mandates, set timers, consume reports.
- **`/delegation:team-build`** — spec-driven builder/reviewer pipeline for substantial
  multi-file features: pinned contracts committed at t0, disjoint file territories,
  adversarial high-tier reviews with attack briefs, one integrator owning the expensive
  verification verbs, ship gate with the orchestrator.
- **`/delegation:multi`** — peer-session notes: one-line envelopes to an EQUAL session
  you don't own (see below).

Neither `delegate` nor `team-build` is for talking to a session you don't own — see
[`multi`](#multi--peer-sessions) below for that.

**Shared mechanics** (`docs/`, referenced by both skills — these links are repo-relative;
if you're reading a mirrored skill copy without `docs/` next to it, e.g. Codex's
`~/.agents/skills/{delegate,team-build}/SKILL.md`, find the same files at
`~/.claude/plugins/cache/benzhuk/delegation/<version>/docs/<name>.md` or
`github.com/benzhuk/claude-delegation/blob/main/docs/<name>.md`):

- [`model-tiers.md`](docs/model-tiers.md) — the tier table (below): mid tier writes,
  high tier verifies, fast tier sweeps, top tier orchestrates and judges; orchestrator
  tokens buy judgment only.
- [`subagent-contract.md`](docs/subagent-contract.md) — reports to disk with the
  verdict on line 1, the termination formula, notification idempotence, mid-edit death
  recovery.
- [`concurrency-budget.md`](docs/concurrency-budget.md) — budget the verbs, not the
  agents: read-only agents are free, expensive local verbs are a global mutex.
- [`agent-pacing.md`](docs/agent-pacing.md) — ETA at spawn, check-in at 1× ETA, and the
  slow-agent escalation ladder (levers, advisors, respawn, sunk-cost rule).
- [`mandate-standards.md`](docs/mandate-standards.md) — what every agent prompt
  carries: paths not summaries, the NOT-list, evidence formats, authorized negative
  results, budgeted autonomy grants.

**Three agents** for the team-build pipeline: `builder`, `reviewer`, `integrator`.

**Two hooks** (all require `node` on PATH):

- **Routing reminder** (UserPromptSubmit): injects a one-line routing reminder — build →
  team-build, fan-out → delegate, small task → no agents — so the policy survives long
  sessions and context compaction. It reads `DELEGATION_TOP_TIER` (falling back to the
  legacy `CLAUDE_DELEGATION_TOP_TIER`; default `fable,opus,gpt-6-astra,gpt-5.6-sol`) to
  decide whether the current session is top/high-tier and add the orchestrator-economy
  sentence.
- **Peer-note inbox** (UserPromptSubmit, Stop, PostToolUse — new in 0.3.0): reads the
  peer-note ledger for this pane and injects anything new, so a `multi` note reaches the
  session without anyone typing into its pane. `Stop` blocks the stop while something is
  waiting (honouring `stop_hook_active`). Silent when there are no notes, when the
  session is not in an Orca pane, and on any error — a hook must never break a session.

## Model tiers

Every skill and doc here names a tier, never a bare model — see
[`model-tiers.md`](docs/model-tiers.md) for the full rationale and spawn mechanics per
vendor. The table (copied verbatim, single source of truth in that file):

| tier | job | Claude | OpenAI (Codex) |
|------|-----|--------|----------------|
| **top**  | orchestrate, judge, decide, synthesize — never bulk execution | Fable  | GPT-6-Astra |
| **high** | verify, adjudicate, spec red-team, the hardest territories (algorithms, concurrency, data integrity) | Opus | GPT-5.6-Sol (see note) |
| **mid**  | default executor — writes code, runs searches, mechanical edits, integration gates | Sonnet | GPT-5.6-Terra |
| **fast** | mindless bulk sweeps only | Haiku | GPT-5.6-Luna, GPT-5.3-Codex-Spark |

Note on the OpenAI high row: OpenAI ships one flagship, so a Codex REVIEW or
adjudication runs on GPT-6-Astra unless cost forbids (a genuinely stronger model than
the writer); GPT-5.6-Sol is the high-tier choice for hard BUILD territories instead.
Claude has two distinct models here (Fable above Opus), so its rows need no such
caveat. Full rationale: `model-tiers.md`.

Sentence pattern in every skill: "run this on a high-tier model (Claude Opus /
GPT-5.6-Sol)" on first mention in a file, "the high-tier reviewer" afterward.

## `multi` — peer sessions

`delegate` and `team-build` are for subordinate work you spawn and own. `multi` is the
separate skill for talking to an EQUAL session you do not own — asking, briefing, or
handing off to a peer pane, another territory's owner, or a session on another machine.
Both Claude and Codex load it. Never use Orca orchestration dispatch for this.

**The ledger is the channel; typing into a pane is a wake-up.** Every note is appended to
`docs/ledger/<today>.md` (and mirrored to `~/.agents/notes/`) before anyone tries to type
it anywhere, and the recipient discovers it by reading. A wake-up that cannot be typed —
the pane is mid-turn, at a permission prompt, unreadable — costs latency, never the note.
This is the 0.3.0 correction after a day-long two-session pilot in which no typed note
reached the Codex pane for five hours while senders sat blocked for up to an hour each.

Notes are one physical line, ≤700 characters, following a pinned envelope grammar (full
contract in `skills/multi/references/envelope.md`):

```
taxonomy → nucleus, 9.13.26 10:05 NYC [taxonomy-pr132-review-1] ASK: Please review my PR #132. Goal: faster wall clock, better batch orchestration. Details: docs/notes/taxonomy-pr132-review-1.md Needs: review by 15:00
```

Four commands, all on PATH after the mirror runs:

```bash
# send: ledger first, then a best-effort wake-up. Exit 3 means queued, not failed.
note-send --from taxonomy --to nucleus --kind ASK --topic pr132-review --text "Please review my PR #132." --goal "faster wall clock, better batch orchestration" --needs review --by "15:00"

# read: the ledger as this pane's inbox. Exit 0 always.
note-inbox --me taxonomy --ack

# retry the wake-ups that could not be typed. Runs itself; this is for looking.
note-flush --dry-run
```

`note-notify` is the fourth: Codex runs it from `~/.codex/config.toml` at every turn end —
the one moment a Codex pane is provably idle — and it drains that pane's queued wake-ups.

Receiving is automatic on both vendors:

| | how a note reaches the session |
|---|---|
| **Claude Code** | the plugin's `UserPromptSubmit`, `Stop` and `PostToolUse` hooks run `note-inbox`, inject the new notes, and ack. `Stop` blocks the stop when something is waiting. |
| **Codex** | `note-inbox --me <slug>` at the start of every turn (AGENTS.md), plus the `notify` drain above. Codex does not queue typed input mid-turn, so it is never typed at while working. |

## Install (mirror for Codex)

Codex reads shared skills and agent roles from its own paths, not the Claude Code plugin cache. Publish once after installing the plugin (idempotent; also supports `--dry-run`, `--force`, `--uninstall`):

```bash
node scripts/mirror-shared-skills.mjs
```

Publishes: skills to `~/.agents/skills/<name>`; the five shared docs to `~/.agents/skills/_docs/` (so `../_docs/<name>.md` links resolve); Codex roles to `~/.codex/agents/*.toml` with models from the tier table above; and the four PATH shims `note-{send,inbox,flush,notify}` (plus a `.cmd` for each on Windows) — all recorded in `~/.agents/skills/.mirror-manifest.json`, so `--uninstall` removes exactly what it created.

## The philosophy, in four lines

1. Orchestrator tokens buy judgment (spec, adjudication, ship); executors run at full
   strength; verifiers are a tier above the writer.
2. Agent count is not the load-bearing variable; concurrent local processes are.
3. The reply is not the result — the report file is.
4. Nothing paces itself: every agent gets an ETA, every ETA gets a timer, every timer
   gets a decision.

## License

MIT
