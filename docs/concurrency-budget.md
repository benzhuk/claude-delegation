# Concurrency budget — budget the verbs, not the agents

Model inference is remote and costs the local machine nothing. Local CPU is spent only
on what an agent *runs*. Twenty agents reading, reasoning, and writing code cost roughly
zero load; three agents running `tsc` on the same monorepo cost more than all of them.
So the rule is not "fewer agents" — it's **parallelize reasoning, serialize local
execution.**

The cautionary number: a real session ran 3 builders that each held a standing
"fan out verification to parallel subagents" grant. Real concurrency was 3 × N children,
each running `tsc --noEmit` over a large monorepo. The machine hit **load average 452**
and became unusable; it fell to 169 within seconds of the agents dying.

## Classify agents by local footprint, not by role

| Footprint | Work | Safe concurrency |
|---|---|---|
| ~Zero | reading files, grep/glob, analysis, research digests, code review, writing prompts and docs | 10–20+ — parallelize freely |
| Low | writing code (no verification), planning, schema inspection | 5–10 |
| **High** | `tsc --noEmit`, production builds, bundlers, browser automation, test suites, dev servers | **1 at a time, globally** |
| Sustained | long-running dev servers, watchers | 1 per port, owned by the orchestrator |

## The rules

- **Fan-out permission composes multiplicatively.** "Each agent may fan out" × N agents
  is how machines catch fire. Grant fan-out **per task, with a stated budget in total
  concurrent children** ("you may fan out ≤3 read-only subagents for the screenshot
  sweep") — never as a standing capability.
- **Typechecks and builds are the expensive verb, not model calls.** Prefer ONE
  typecheck at the gate, run by the integrator, over per-agent typechecks per fix round.
- **Any shared finite resource needs a stated budget, not a stated permission** — CPU,
  a shared database, ports, the user's machine. Parallel dev servers against a shared DB
  are an outage vector.

## Mechanisms — keep the agents, drop the load

1. **A verification mutex.** Every expensive command goes through a lock, so N agents
   queue instead of stampeding. Give agents this boilerplate verbatim:
   ```bash
   until mkdir /tmp/claude-verify.lock 2>/dev/null; do sleep 5; done
   trap 'rmdir /tmp/claude-verify.lock' EXIT
   nice -n 10 npx tsc --noEmit
   ```
   Agents keep working in parallel; only the expensive verb is serial.
2. **Move verification to the integrator.** Builders write code and report; ONE
   integrator runs typecheck/lint/tests once per gate. The failure mode is letting
   builders *also* verify every fix round: N builders × M rounds × one full type-graph
   build each.
3. **Share the incremental cache.** `tsc --incremental` with a shared `tsbuildinfo`
   turns a cold 30–60s build into seconds; N cold runs over an unchanged repo is waste.
4. **`nice` the heavy verbs** (`nice -n 10 …`) — the user's cursor matters more than
   the build; the machine stays responsive even when the queue is deep.
5. **Scope the check to the diff.** A builder that touched three files rarely needs a
   repo-wide typecheck mid-round; run the full check at the gate.
6. **Prefer report-reading over re-derivation.** Point agents at artifacts other agents
   already wrote to disk instead of letting them re-run the analysis.

## The default

> Spawn as many **read-only** agents as the work has independent questions — they are
> effectively free. Cap **writing** agents at the number of disjoint file territories.
> Allow exactly **one** agent to run an expensive verification verb at a time, enforced
> by a lock — and prefer moving verification to a single integrator entirely.

One line: **agent count is not the load-bearing variable; concurrent local processes
are.**
