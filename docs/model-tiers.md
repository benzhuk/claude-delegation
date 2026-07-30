# Model tiers — who does what

The orchestrator (your main session, on the strongest model you run) buys exactly three
things with its tokens: the spec/contracts, dispute adjudication, and the ship decision.
Everything else is delegated. Tier by cost:

- **Executor — Sonnet by default.** Writing code, mechanical edits, searches,
  reading+summarizing, running commands, drafting docs. Run executors at FULL strength —
  never lower effort to save tokens. A failed cheap agent costs a retry round plus
  orchestrator attention, which is the expensive resource. Reserve low effort for
  latency-gated mechanical steps only.
- **Verifier — Opus, or at minimum a tier above the writer.** Reviews of executor
  output, adjudicating conflicts, and implementation hard enough that executor retries
  would cost more than doing it once (core algorithms, concurrency, data integrity).
- **Bulk — Haiku.** Only genuinely mindless sweeps at volume (hundreds of binary
  per-file checks). When in doubt, it's a Sonnet job.
- **Orchestrator model — main loop only.** Never spawn it as an execution subagent.

## The pattern that works, observed at scale

From a ~40-agent session (two large multi-agent builds, back to back):

- **Sonnet writes, Opus verifies.** ~25 Sonnet invocations across mechanical
  territories, UI, harness plumbing, and research digests — zero quality complaints.
  Reversing the pattern wastes Opus on typing.
- **Every first-pass Opus review returned NEEDS_FIXES, and the findings were not
  nitpicks**: a release metric that was vacuously zero, a cache that froze transient
  errors into permanent wrong answers, a train/holdout split that leaked. Reviews are
  not optional for anything that computes a number someone will act on.
- **The spec red-team is the highest-leverage Opus spend in the pipeline.** One
  adversarial pass over the spec + contracts before any builder spawns; six blockers
  caught there saved a fix round in every territory.

## When NOT to delegate

Do it yourself when the task is smaller than the delegation overhead: single-file quick
edits, one known lookup, conversational answers. Never split tightly-coupled design
across agents — coupled work stays in one context.
