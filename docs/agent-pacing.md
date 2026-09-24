# Agent pacing — ETAs, check-ins, and the slow-agent ladder

Nothing here happens by itself: the orchestrator predicts how long each agent should
take, actually checks at that time, and applies speed levers proactively. The motivating
failure: a fix round ran for hours on a loop whose every iteration paid a full
production build, while two speed levers sat ungranted the whole time — nobody had
predicted the round's cost, so nobody noticed it was being paid.

## ETA at spawn

For any agent expected to run more than a few minutes:

- **Estimate expected duration from the workload shape**: fixed setup (worktree +
  install ≈ minutes; browser install; prod build if needed) + iteration cycle time ×
  expected cycles.
- **Write the estimate into the agent's prompt**: "expected ~N min; if you blow through
  2× this, say so in a status line rather than grinding silently."
- **Set a real timer, orchestrator-side.** Mandate the timer, not the tool: a
  wait/monitor tool with a deadline if the session has one; otherwise a background
  `sleep <ETA-seconds>` job whose completion re-invokes you. A mental note is not a
  timer.
- **If the predicted cycle cost is minutes, grant the levers AT SPAWN, not at
  check-in**: write the parallel-arms budget and the cost-split instruction (below)
  into the initial mandate. An expensive loop discovered at check-in already burned an
  ETA window.

## The check-in

At 1× ETA with no completion: send the agent ONE batched message — (a) status request
(current phase, what's confirmed, estimated remaining cycles, delivered as a paragraph
in its next reply *without stopping work*), and (b) any cheap levers you can grant
immediately. Never poll more than once per ETA window; never interrupt a healthy agent
repeatedly.

## The escalation ladder

Classify from the status reply (or its absence):

- **On track** (progressing; ETA was just tight) → extend the timer once. No changes.
- **Slow but sound** (right approach, expensive loop) → grant speed levers, cheapest
  first:
  1. *Parallel experiment arms* — IF truly independent AND the infra budget allows.
     Re-derive the budget for THIS workload; don't inherit a stale constraint (a
     serial-only default calibrated for shared-DB pressure does not apply to CPU-bound
     local builds — see `concurrency-budget.md`).
  2. *Cost-split iteration* — iterate correctness on the cheapest loop that can falsify
     it (dev-mode, seconds per recompile); reserve the expensive loop (prod build,
     engine-specific browser) for the property that actually needs it (latency,
     engine behavior, prod-only states), as periodic checkpoints.
  3. *Fan out verification* — gates and sweeps go to parallel read-only subagents so
     the main agent's loop is pure experiment.
- **Stuck** (repeating a failed hypothesis ≥2 iterations) → advisor escalation: ONE
  higher-tier advisor with a self-contained question (symptom, evidence, the fork, what
  a verdict unblocks). If the agent didn't self-invoke it, instruct it to.
- **Wrong approach** (status reveals a false premise or scope creep) → stop the agent,
  salvage its report/artifacts, respawn with a narrower corrected mandate. Sunk cost is
  never a reason to continue: tokens already spent don't make a wrong approach right,
  and a respawn with a sharper mandate is usually cheaper than round 3 of drift.
- **Silent past 2× ETA, no reply to the status ping** is a recovery signal, not proof
  the agent is dead. Read its report file and artifacts, and use observed native
  progress when present: record one bounded extension for real work in progress;
  otherwise resume the same agent with the standard recovery prompt (see
  `subagent-contract.md`), respawn from what landed, or narrow / stop a wrong approach.
  A hard user- or project-supplied budget remains binding.

## Record the decision

Every timer extension or lever grant gets one written line in the orchestrator's task
trail ("T2 ETA blown ×1; granted cost-split, staying serial because shared DB"). Hours
of silent grinding are invisible precisely when nothing forces this line to exist.
