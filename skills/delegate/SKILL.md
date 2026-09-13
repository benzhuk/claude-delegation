---
name: delegate
description: Use when a prompt decomposes into independent research, review, audit, or analysis lanes that should run as parallel subagents — "investigate these three", "review this from several angles", "audit all X", "sweep the codebase for Y" — or when deciding whether and how to delegate any task to subagents. NOT for multi-file feature builds: that is team-build. NOT for messaging, briefing, or handing off to an EQUAL session you do not own: that is the multi skill.
---

# Delegate — parallel fan-out orchestration

> Substantial multi-file BUILD with specs, territories, and reviewers? Stop — invoke
> the **team-build** skill instead. This skill is for everything else you delegate.

## Route by shape first

- **(a) Multi-file build** → team-build skill. Never hand-orchestrate a build.
- **(b) Independent research / review / audit / analysis lanes** → this skill: fan out
  ALL lanes as parallel subagents in ONE message.
- **(c) Single-file edit, one known lookup, conversation** → do it yourself. No agents.
  Delegation smaller than its overhead is waste, and tightly-coupled design work stays
  in one context — never split it across agents.

## The fan-out

1. **Decompose into independent questions.** One agent per question. Spawn them all in
   a single message so they run truly concurrently; staggering serializes for nothing.
2. **Tier the models** (`../../docs/model-tiers.md`): the mid tier (Claude Sonnet /
   OpenAI GPT-5.6-Terra) executes at full strength, the high tier (Claude Opus /
   OpenAI GPT-6-Astra, Sol if cost forbids) verifies and adjudicates, the fast tier (Claude Haiku / OpenAI
   GPT-5.6-Luna, GPT-5.3-Codex-Spark) is only for mindless bulk sweeps. Verify with a
   stronger tier than the writer.
3. **Check the concurrency budget** (`../../docs/concurrency-budget.md`): read-only
   agents are effectively free — spawn as many as there are questions. Anything that
   runs expensive local verbs (typechecks, builds, browsers, test suites) is capped at
   ONE at a time globally; give such agents the mutex boilerplate. Fan-out grants to
   agents are per-task and budgeted, never standing.
4. **Write full mandates** (`../../docs/mandate-standards.md`): paths not summaries,
   explicit NOT-list, evidence format, negative results authorized, un-agent-able steps
   scoped out, autonomy grants explicit, and the termination formula at the end.
5. **Set ETAs and timers** (`../../docs/agent-pacing.md`) for anything expected past a
   few minutes; when an agent runs slow, use the escalation ladder — don't wait
   passively and don't let sunk cost keep a wrong approach alive.
6. **Consume reports, not replies** (`../../docs/subagent-contract.md`): agents report
   to disk at orchestrator-chosen suffix-style paths, verdict on line 1; a bare "Done."
   reply means read the file. Stop each agent once its report is consumed.
7. **Inline-report agents get the lossy-channel clause** (`../../docs/subagent-contract.md`):
   read-only agents (no Write/Bash) can't land a file, and ONLY their final message text
   reaches you — earlier messages never deliver, and a resumed agent will wrongly say
   "already reported above", destroying the deliverable. Put the contract's verbatim
   clause in their spawn prompt AND every resume; if a completion result references
   prior messages instead of containing the report, resume once with the clause, then
   respawn with report-to-disk.

## Peer sessions

To ask, brief or hand off to an EQUAL session you do not own, use the `multi` skill —
never Orca orchestration dispatch. This skill's fan-out is for subordinate work you
spawn and own; a peer note goes to a session that outlives this one and doesn't answer
to you.

## Orchestrator economy

Your tokens buy judgment: decomposition, adjudication, synthesis. Never pull big files
or broad grep output into the main loop — subagents return ≤10-line conclusions plus a
report path. If you're reading raw file dumps, you've mis-delegated.

## Synthesis

Fan-in is your job: read verdict lines, open only failed/surprising reports, adjudicate
conflicts yourself (or spawn one high-tier adjudicator when two agents disagree on facts),
and state conclusions with each lane's evidence path. A confirmed absence or a proven
limit reported by a lane is a first-class result — surface it, don't re-run the lane
hoping for a positive.
