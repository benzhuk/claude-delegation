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
2. **Scout** — one cheap (mid-tier) agent, per BUILD, not per territory: after the
   territory map exists and before any territory's worktree is created, it surveys every
   territory in one pass and writes one output file per territory
   (`<spec-pack>/scout-<territory-id>.md`, at most 40 lines each — files/symbols the
   territory will touch and whether the spec's premise about them still holds, existing
   helpers to reuse, tests
   that police the area, open questions for the spec). Full instructions, copyable
   verbatim into the scout's prompt: `references/scout-brief.md`. Fold each territory's
   scout file into that territory's brief (by path, as an addendum — never restate it)
   before spawning that territory's builder; a scout finding that contradicts the spec
   loses to the spec once you've ruled on the discrepancy.
3. **Decompose by territory, not layer-step**: one builder per disjoint file territory
   (e.g. DB+API+shared-lib = one; UI = one; pipeline = one). Pinned contracts let
   territories build in parallel even when they call each other. A serial layer chain
   (schema → api → client → ui, each awaiting review) is the #1 wall-clock waste; one
   agent per micro-task multiplies briefing overhead past the work. File-level disjoint
   territories stated in every prompt is what produces zero edit collisions at 15+
   concurrent agents.
4. **Commit contract stubs at t0 — mandatory, not optional.** Turn the pinned contracts
   into actual committed type/interface files before spawning, so repo-wide typecheck
   is green from the start and builders physically can't drift. Cost ~15 minutes; saves
   a contract-mismatch round in every territory (proven: 4 builders compiled against a
   frozen `contracts.ts` simultaneously with zero mismatch rounds — one built its eval
   harness against an engine signature before that engine existed).
5. **High-tier spec red-team** (skip only for
   small/low-risk builds): one high-tier agent adversarially reviews spec + contracts —
   missing cases, ambiguities, wrong decomposition. The highest-leverage high-tier spend
   in the pipeline.
6. **Estimate ETAs and plan the timers** (`docs/agent-pacing.md`, shipped next to this
   skill as `../_docs/agent-pacing.md` when mirrored, and in the plugin repo's `docs/`
   otherwise). Anchor
   estimates: pure-code territory ≈ 30–60 min; build + measurement harness ≈
   60–90 min; anything paying a prod build per iteration ≈ 2–3 h unless parallelized —
   that last shape gets its levers (parallel arms budget, cost-split iteration) granted
   AT SPAWN, in the mandate, not discovered at check-in.
7. **Open one work record per territory before spawning it** — `docs/work/<work-id>.record.md`
   (`docs/work-record.md`, shipped next to this skill as `../_docs/work-record.md` when
   mirrored, and in the plugin repo's `docs/` otherwise, has the full field list): `Status:
   runnable`, `Owner: none`, `Scope:` the spec or brief path and the commit it was read at,
   `Authority:` what may happen without Ben and what may not. **You are this record's ONLY
   writer, for its whole life** — builders and reviewers keep their own state file and
   report to the path in their mandate; neither one ever touches `docs/work/`. Ownership
   returns to you, recorded as a `Log:` line, the moment an agent reports, is stopped, or
   dies.

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
  the risk center: a wrong test is a false-green gate, worse than none. **Default, not
  optional, whenever a territory's own tests are also what gates its own builder** — a
  builder writing and grading its own contract test is a conflict of interest; someone
  else writes that test.
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
  computes a number someone will act on. **For a bug-fix territory**, the attack brief
  also asks: is this fix the CAUSE, or a COMPENSATION for it (a guard that hides the
  symptom without removing the defect) — and does the fix's landing let any existing
  `WORKAROUND:` on the work record come out. The brief also asks the builder for the
  four fields the integrator's `bugfix-fields` gate and the reviewer mandate both
  require: `Cause:`, `Discriminating check:`, `Fix location:`, `Simplification:` — name
  them explicitly, since a builder who is never asked for them has no reason to supply
  them and the gate then fails on fields nobody requested. Verdict still comes first.
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
- **Pipeline reviews, no barrier**: spawn each territory's reviewer in the SAME turn its
  builder's report lands — check every territory for a pending reviewer spawn before
  that turn ends. Never hold reviews for the slowest builder.
- **Parallel reviewer lenses** when wall-clock beats tokens: two reviewers per
  territory with distinct priorities (correctness vs. security/edge-cases), merge,
  dedupe, relay once. Fix rounds continue with a single reviewer.
- More agents ≠ faster: parallelism is capped by genuinely disjoint territories.
  Splitting a territory that shares files trades token cost for serial merge-conflict
  resolution on your critical path — strictly worse. And mind the machine: agent count
  is free, concurrent local processes are not (`../_docs/concurrency-budget.md`).
- **No new wave while any of this orchestrator's records show `delivered`, `rejected`, or
  `reviewed` (approved but not yet integrated)** — except a workstream whose prerequisite
  is met and whose own record says so. Starting a new wave before its predecessor's
  records catch up builds the next wave on unintegrated, or already-rejected, work.

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
  otherwise), not blind trust in its memory. **A reviewer with no report file at its ETA
  is stopped and respawned fresh — never waited on past ETA**, the same ladder as a
  builder's.
- **Round-3 Research line** (`docs/mandate-template.md`'s `Research:` field, required
  from the third fix round on): its content is five diagnosis steps, in order — (1)
  reproduce the failure reliably and record the exact repro; (2) isolate it to the
  smallest failing input, or the specific commit that introduced or exhibits it; (3)
  form one falsifiable hypothesis for the cause; (4) name a discriminating check whose
  result would come out differently under that hypothesis than under any other
  plausible cause; (5) run that check and record what it showed BEFORE writing the fix.
  `not needed, <reason of 10+ chars>` is a good answer only after a genuine attempt at
  these five turned up nothing to isolate.
- **Best-of-two fix attempts**: a mandate-granted option, not a default. Grant it only
  for a third-round-or-later territory, or one on the critical path, where two
  independent fresh-builder attempts against the same findings path, reviewed and the
  cleaner APPROVE kept, are cheaper than another serial round.
- Report protocol, termination formula, notification idempotence, and TaskStop hygiene:
  `../_docs/subagent-contract.md`. Applies verbatim to every role here.

## Ship

One builder commits at the end: conventional commits split by territory (respect the
user's attribution config). If a local production build is unsafe (dev server running),
use the CI/preview build as the gate. The integrator runs deployment smoke checks; you
read its verdict and own the ship decision.

Move every territory's work record as it moves, in the same turn the event happens:
`owned` when you spawn its builder, `delivered` when the builder reports, `rejected` on a
`NEEDS_FIXES` verdict (`Next:` names the fix round), `reviewed` on `APPROVE`, `accepted`
only once integrated within `Authority:` or by Ben's own quoted word — copy the deciding
report to `docs/work/evidence/<work-id>-<lane>.md` at that moment, since `accepted`
requires at least one evidence path inside the repo. Every report copied into
`docs/work/evidence/` starts with a `VERDICT:` line (`VERDICT: APPROVE <sha>`,
`VERDICT: PASS`, …) — the reviewer's and builder's own bare-word verdict is not enough,
since `validateRecord`'s `evidence-no-verdict` check reads only the copy in the repo; add
the prefix at copy time if the original report didn't carry it. You remain the only
writer to `docs/work/` through to the end; a fresh orchestrator, or one that is woken, is
shown its next runnable record by reading that directory, never by asking you to recall
it.

Once every territory is `reviewed` and the integrator's gates are green — before the merge
ask, so its numbers go into it, not after `accepted`, which is downstream of that decision
— run `node <plugin>/scripts/work-census.mjs docs/work` (and, if this build launched the
loop from an Opus pane, `node <plugin>/scripts/build-census.mjs --lead <lead-session.jsonl>
--tasks <subagent-tasks-dir>`) to get the measures — elapsed per work id, dispatch latency,
idle minutes with a runnable unowned record — that make the build's speed a number instead
of an impression. The plugin repo's `docs/pane-setup.md` names what each measure means and
which script reads it; don't restate that here.

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

## Running the loop from an Opus pane

This section is the file's last section — it follows Common mistakes above, not the Ship
section earlier in this file, even though Ship is where a reader might expect a "how the
build actually runs" note to live.

**When**: two or more territories, from an Opus orchestrator pane only — never Fable,
never a builder or lead pane running at a lower tier. Below two territories, run the
pipeline by hand as described in Setup through Ship above; the loop earns its keep on
genuine fan-out, not a single-file fix.

**What it is**: `skills/team-build/references/build-loop-workflow.js`, a Workflow script
that runs the whole build → review → fix loop, for every territory, as one call. Inside
it, one `runTerritory(t)` per territory drives that territory's own build/review/fix-round
loop; every territory runs concurrently under `parallel()`, a barrier, so the script only
moves on to the integrator once all of them have either reached `APPROVE`, exhausted
`maxRounds`, or died twice. Static contract, tests, and the pinned agent-type/model pairs:
`skills/team-build/references/build-loop-workflow.test.mjs`.

**Pre-launch steps, in order** — the script does none of these itself:
1. Spec pack on disk (spec, contracts, territory map) per Setup step 1 above.
2. One scout agent per build — not per territory — writing one file per territory to
   `<spec-pack>/scout-<territory>.md` (`skills/team-build/references/scout-brief.md` has
   the brief). Fold each territory's scout findings into its brief before any builder
   spawns; where a scout report and the spec disagree, the spec wins.
3. Worktrees and branches, one per territory, ALL cut from the SAME shared `baseSha`:
   `git worktree add <worktree> -b <branch> <baseSha>`. The script never creates a
   worktree of its own — that concept doesn't exist inside it, by design; every worktree
   decision happens here, before launch.
4. Briefs written, one per territory, plus the reviewer brief and the integrator brief.
5. Open one work record per territory, as in Setup step 7 above, before spawning.

**The launch call**: invoke the Workflow tool with
`{scriptPath: "skills/team-build/references/build-loop-workflow.js"}` and an `args`
object shaped `{ specPath, baseSha, startedAt, maxRounds?, territories: [{ id, briefPath,
worktree, branch, gate }], reviewerBriefPath, integratorBriefPath }` — see
`skills/team-build/references/build-loop-args.example.json` for a worked example.
`startedAt` is required: the script has no clock of its own (`Date.now()`/`new Date()`
are unavailable inside a Workflow script), so stamp it yourself before calling. `maxRounds`
defaults to 3.

**Reading the return**: one object, `{ territories, integrator, blockers }`.
`territories` is one row per territory — `{ id, sha, verdict, rounds, reportPath,
findingsPath, blocker }` — read `verdict` for the outcome and `blocker` for why a
territory never reached one (`'agent-died'`, `'builder-blocked'`, `'build-failed'`, or
`'rounds-exhausted'`; `null` means it reached the loop's normal end). `blockers` is the
same information again as a flat `[{ id, reason }]` list, for a quick scan without
walking every territory row. `integrator` is that stage's own verdict object — read it
last, since it only ran over the territories that weren't excluded for a blocker.

**What breaks honestly**:
- No warm-delta re-review across rounds — every fix round gets a full review, not a diff
  against the prior one's findings.
- No per-agent timeout. A hung agent is killed externally (outside the script) and the
  run resumed with `resumeFromRunId`; the longest unchanged prefix of `agent()` calls
  replays from cache, and only the stuck call and everything after it runs live.
- Results return once, at the end — there is no partial/streaming read of a
  still-running loop; `journal.jsonl` in the run's transcript directory is the durable,
  inspectable record of every agent's actual return, read that before assuming a result
  was empty.

**Making this a measured change, not just a launched one**: record `startedAt` and the
full return value in the work record's `Log:` line for this run, then run the plugin
repo's `scripts/build-census.mjs` (its `docs/census.md` has the CLI) against this run's
own lead transcript. Those two steps are what let a future build compare its own
turns-and-tokens cost against this one, honestly, instead of by memory.
