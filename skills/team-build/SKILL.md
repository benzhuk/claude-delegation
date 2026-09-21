---
name: team-build
description: Use when building a substantial multi-file feature with an agent team — builder/reviewer pipeline, tiered execution (mid tier writes, high tier verifies), spec-driven parallel implementation. This is the DEFAULT build method for any substantial multi-file feature unless the user instructs otherwise. NOT for research/review/audit fan-out without a build: that is delegate. NOT for messaging, briefing, or handing off to an EQUAL session you do not own: that is the multi skill.
---

# Team build — builder/reviewer orchestration

> Independent research/review/audit lanes with nothing to build? Stop — invoke the
> **delegate** skill instead.

You are the orchestrator. Builders (mid tier: Claude Sonnet / OpenAI GPT-5.6-Terra)
write; independent reviewers (high tier: Claude Opus / OpenAI GPT-6-Astra) verify
adversarially; an integrator runs the mechanical gates; you own the spec, adjudication,
and the ship decision. Token efficiency comes from paying for context
once (specs on disk, reports by path, agents resumed while they are small and
restarted from their state file once they are not); speed comes from ownership
boundaries, not luck.

Shared mechanics — model-tiers, subagent-contract (reports, termination, recovery),
concurrency-budget, agent-pacing, mandate-standards — are referenced by path in the
sections below; this file is the build pipeline that uses them. Each doc's first
mention says where to find it once mirrored.

## Setup — before spawning anything

1. **Write the spec to disk**: design decisions, **pinned contracts** (exact API
   response shapes, type signatures, module interfaces), and a **territory map** —
   every file path owned by exactly one builder. Agent prompts reference the doc by
   path; never restate its content in prompts. Start each builder's prompt, the
   mandate, from `docs/mandate-template.md`, shipped next to this skill as
   `../_docs/mandate-template.md` when mirrored, and in the plugin repo's `docs/`
   otherwise.
2. **Decompose by territory, not layer-step**: one builder per disjoint file territory
   (e.g. DB+API+shared-lib = one; UI = one; pipeline = one). Pinned contracts let
   territories build in parallel even when they call each other. A serial layer chain
   (schema → api → client → ui, each awaiting review) is the #1 wall-clock waste; one
   agent per micro-task multiplies briefing overhead past the work. File-level disjoint
   territories stated in every prompt is what produces zero edit collisions at 15+
   concurrent agents.
3. **Commit contract stubs at t0 — mandatory, not optional.** Turn the pinned contracts
   into actual committed type/interface files before spawning, so repo-wide typecheck
   is green from the start and builders physically can't drift. Cost ~15 minutes; saves
   a contract-mismatch round in every territory (proven: 4 builders compiled against a
   frozen `contracts.ts` simultaneously with zero mismatch rounds — one built its eval
   harness against an engine signature before that engine existed).
4. **High-tier spec red-team** (skip only for
   small/low-risk builds): one high-tier agent adversarially reviews spec + contracts —
   missing cases, ambiguities, wrong decomposition. The highest-leverage high-tier spend
   in the pipeline.
5. **Estimate ETAs and plan the timers** (`docs/agent-pacing.md`, shipped next to this
   skill as `../_docs/agent-pacing.md` when mirrored, and in the plugin repo's `docs/`
   otherwise). Anchor
   estimates: pure-code territory ≈ 30–60 min; build + measurement harness ≈
   60–90 min; anything paying a prod build per iteration ≈ 2–3 h unless parallelized —
   that last shape gets its levers (parallel arms budget, cost-split iteration) granted
   AT SPAWN, in the mandate, not discovered at check-in.

## Roles

- **Builder** (mid tier: Claude Sonnet / OpenAI GPT-5.6-Terra; **high tier for the
  hardest territory** — core algorithms, concurrency/state machines, data integrity,
  subtle migrations; high-tier builders already cost about 17 percent of all measured
  spend and over a quarter of the top tier, so reserve this for one territory, don't
  default to it — on Claude Code, set
  `model: opus` on the `Agent` call, which
  overrides the agent file's frontmatter; on Codex, no pre-built high-tier builder role
  ships — copy `~/.codex/agents/builder.toml` to `builder-high.toml` and set
  `model = "gpt-5.6-sol"` for that one territory — see the spawn-mechanics section of
  `docs/model-tiers.md` (shipped next to this skill as `../_docs/model-tiers.md` when
  mirrored, and in the plugin repo's `docs/` otherwise)): implements only its
  territory. On Claude Code, an explicit `model: opus` here needs a `JUDGMENT:` line
  in the prompt, or the dispatch guard denies the spawn once enforcement is on (off
  switch `~/.agents/no-dispatch-guard`).
  Gate before reporting: territory-scoped tests + typecheck via the shared
  verification mutex (`docs/concurrency-budget.md`, shipped next to this skill as
  `../_docs/concurrency-budget.md` when mirrored, and in the plugin repo's `docs/`
  otherwise) — builders do NOT run
  repo-wide checks every fix round; the full graph belongs to the integrator's gate.
  Commits its territory early and often. If a cross-territory import doesn't exist yet,
  code against the contract and note it.
- **Contract-test writer** (mid tier, optional but cheap): writes integration/contract
  tests from the spec while builders build — converts contract compliance from a
  judgment call into a mechanical gate. Upgrade to the high tier when the contracts ARE
  the risk center: a wrong test is a false-green gate, worse than none.
- **Reviewer** (high tier, fresh per phase, never the
  planner): read-only; spawns only after
  that builder's own gate is green. Its prompt is a **specific attack brief**, not
  "review this" — name the priorities, the explicit questions, and the attack surface
  ("try to defeat the traceability gate: numbers as words, reformatted numbers, empty
  arrays"), and tell it what previously went wrong in this codebase — naming a past bug
  class catches its twin immediately. Findings require severity, file:line or
  measured-count evidence, and a concrete fix; mechanical findings carry a
  ready-to-apply patch (exact old → exact new) the builder applies verbatim. Verdict
  `APPROVE`/`NEEDS_FIXES` first. The bundled `reviewer` agent has a shell (Bash,
  PowerShell), so a mechanical check (running the gate, a revert-and-diff) needs no
  extra tool grant. Mid-tier reviewers
  only for genuinely low-risk territories; reviews are not optional for anything that
  computes a number someone will act on.
- **Seam reviewer** (high tier, after all territories land; worth it at ≥3 territories or
  any cross-territory data handoff): one pass scoped to the contract boundaries — call
  sites across territories, shared types in use, data handoffs. Per-territory reviewers
  never see the joints; the integrator's gate is mechanical; without this, seams are
  reviewed by no one.
- **Integrator** (mid tier): runs the full suite ONCE per gate, triages failures to
  territories, drives live smoke verification (routes load, console clean, loading/error
  states, visual placement). This is where the expensive verification verbs live —
  once per gate, not per agent per round. Reports pass/fail + failure file; never
  decides.
- **Orchestrator** (you): everything env-touching (migrations, seeds, deploys),
  cross-territory adjudication, ship decision. If you're reading full test logs on
  green runs, you're spending the expensive model on integrator work.

## Scheduling — maximize overlap

- **Spawn all builders in one message**; never stagger territory launches.
- **Pipeline reviews, no barrier**: spawn each territory's reviewer the moment that
  builder reports — never hold reviews for the slowest builder.
- **Parallel reviewer lenses** when wall-clock beats tokens: two reviewers per
  territory with distinct priorities (correctness vs. security/edge-cases), merge,
  dedupe, relay once. Fix rounds continue with a single reviewer.
- More agents ≠ faster: parallelism is capped by genuinely disjoint territories.
  Splitting a territory that shares files trades token cost for serial merge-conflict
  resolution on your critical path — strictly worse. And mind the machine: agent count
  is free, concurrent local processes are not (`../_docs/concurrency-budget.md`).

## Iteration mechanics

- Fix rounds continue the **same agents by name** only while they stay small: the
  builder gets the **findings file path** (never a paraphrase, never inlined content);
  the same reviewer runs a delta re-review (verify each fix, hunt regressions — not a
  fresh full review). Once the dispatch guard's resume notice has fired for an agent
  (its context passed `DELEGATION_RESUME_NOTICE_TOKENS`, default 150k), the next round
  spawns a FRESH builder instead: brief it with the spec path, the findings path, and
  its state file path (`<report-dir>/<territory>-state.md`), never its stale memory.
  Cap ~3 rounds, then intervene yourself.
- **Batch scope changes** — never inject instructions into an agent mid-round; queue
  them for its next round. Mid-round addendums get missed and cost two round-trips.
- Check in at ETA and use the slow-agent ladder (`../_docs/agent-pacing.md`); an
  agent killed mid-edit gets the standard recovery prompt
  (`docs/subagent-contract.md`, shipped next to this skill as
  `../_docs/subagent-contract.md` when mirrored, and in the plugin repo's `docs/`
  otherwise), not blind trust in its memory.
- Report protocol, termination formula, notification idempotence, and TaskStop hygiene:
  `../_docs/subagent-contract.md`. Applies verbatim to every role here.

## Ship

One builder commits at the end: conventional commits split by territory (respect the
user's attribution config). If a local production build is unsafe (dev server running),
use the CI/preview build as the gate. The integrator runs deployment smoke checks; you
read its verdict and own the ship decision.

## Peer sessions

To ask, brief or hand off to an EQUAL session you do not own — another territory's
owner on a different pane, a peer machine's session — use the `multi` skill, never Orca
orchestration dispatch. Builders, reviewers, and the integrator here are subordinates
you spawned and own; a peer note goes to a session you don't.

## Common mistakes

- Planner doubling as reviewer → reviews its own plan; keep reviewers independent.
- Holding all reviews until every builder finishes → slowest builder delays everyone.
- Builders running expensive repo-wide checks every round → the full graph is the
  integrator's, once per gate; per-round checks go through the mutex, scoped to the
  diff.
- Skipping live verification because reviews were thorough → runtime-only bugs ship.
- Spawning a reviewer on code that fails the builder's own gate → burns the expensive
  pass and guarantees an extra round.
- Paraphrasing findings when relaying → drops file:line specifics; send the path.
- Acting on a bare "Done." reply → read the report file; the reply is only a
  notification that it exists.
