# claude-delegation

Multi-agent orchestration for [Claude Code](https://code.claude.com), distilled from
real large-scale sessions (up to ~40 subagents per session) — including the incidents:
the load-average-452 fan-out stampede, the hours-long fix round nobody had put a timer
on, the agents whose final reply was `Done.` while their report said `NEEDS_FIXES`.

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

**Two skills** (auto-suggested by task shape, or invoke directly):

- **`/delegation:delegate`** — parallel fan-out orchestration for independent
  research / review / audit lanes: decompose, tier the models, budget the concurrency,
  write full mandates, set timers, consume reports.
- **`/delegation:team-build`** — spec-driven builder/reviewer pipeline for substantial
  multi-file features: pinned contracts committed at t0, disjoint file territories,
  adversarial Opus reviews with attack briefs, one integrator owning the expensive
  verification verbs, ship gate with the orchestrator.

**Shared mechanics** (`docs/`, referenced by both skills):

- [`model-tiers.md`](docs/model-tiers.md) — Sonnet writes, Opus verifies, Haiku sweeps;
  orchestrator tokens buy judgment only.
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

**One hook** (UserPromptSubmit, requires `node` on PATH): injects a one-line routing
reminder — build → team-build, fan-out → delegate, small task → no agents — so the
policy survives long sessions and context compaction.

## The philosophy, in four lines

1. Orchestrator tokens buy judgment (spec, adjudication, ship); executors run at full
   strength; verifiers are a tier above the writer.
2. Agent count is not the load-bearing variable; concurrent local processes are.
3. The reply is not the result — the report file is.
4. Nothing paces itself: every agent gets an ETA, every ETA gets a timer, every timer
   gets a decision.

## License

MIT
