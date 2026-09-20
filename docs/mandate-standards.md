# Mandate standards — what every agent prompt carries

Agents inherit nothing. Every capability, boundary, and acceptable outcome must be in
the prompt, every time. The checklist:

## Paths, not summaries

Prompts carry **file paths to specs, contracts, and findings — never paraphrases**.
Relaying a findings file by path costs nothing and never loses a file:line; a paraphrase
drops specifics and burns orchestrator tokens. Same for prior work: point agents at
artifacts already on disk instead of letting them re-derive them.

## Territory and the NOT-list

- State the territory file-level and disjoint: "YOUR TERRITORY: only these files."
  Across ~15 concurrent builders in one real session this produced zero edit
  collisions — that's the boundary working, not luck.
- Tell agents what NOT to touch, explicitly, every time: other checkouts, running dev
  servers, production builds, other agents' territories, ports. Agents respect stated
  boundaries consistently and have no way to infer unstated ones.

## Evidence format

Ask for the evidence shape you need to act without re-verifying: "cite file:line for
every field you claim exists", "measured numbers, not adjectives", "verdict word first."

**State over intent** (`docs/subagent-contract.md`, full rule): every claim names the
command that observed it and its output, never a description of what should be true.
"Pushed" means `git rev-parse origin/<branch>` was read; "deployed" means the running
version was read; "green" names the command, the exit code and what it ran against (tree
sha, and the versions read back after any rebuild). A reviewer verifies against origin
and the running bytes, never against the report — write this expectation into the
mandate, don't assume it's known.

## Authorize negative results — or get fabricated positives

An agent optimizes the metric you gave it. If the prompt doesn't say a negative result
is acceptable, you get overfitting dressed as progress. Standard language:

> "If the values genuinely aren't derivable / the bug isn't in this territory / the
> concept doesn't exist in this codebase, say so plainly with evidence and stop.
> A proven limit or a confirmed absence is a BETTER outcome than a hack that games
> one case."

The most valuable agent outputs in a large real session were exactly these: a
ground-truth-limit proof that honestly ended a workstream, and a scope finding that a
gap was architectural. Both happened only because the prompt authorized them.

## Name un-agent-able verification up front

Before spawning, identify verification steps the agent cannot do — typing credentials,
solving captchas, anything behind human-only auth — and either get them done first or
scope them out of the agent's definition of done. Otherwise the agent correctly parks
with a BLOCKED verdict and the round is wasted. And when a visual channel silently
fails (black screenshot, locked display), the right behavior is to assert on the app's
own state (DOM/text/API) and say that's what happened — teach it in the prompt.

## Autonomy grants (explicit, budgeted)

- **Advisor escalation**: stuck after 2 failed iterations on one hypothesis, or at a
  genuine design fork → spawn ONE higher-tier advisor with a self-contained question.
  The advisor answers; it never takes over. One advisor per stuck-point. Product
  rulings come from the spec, never an advisor.
- **Verification fan-out**: read-only checks (screenshot sweeps, per-route parity,
  coverage audits) go to parallel subagents — but granted per task WITH a concurrency
  budget, never as a standing capability (see `concurrency-budget.md`).
- **Experiment fan-out**: only when arms are truly independent AND the mandate grants
  an explicit resource budget (ports, worktrees, shared-infra pressure). No budget →
  serial.

## Timing and termination

- ETA in the prompt + orchestrator timer: `agent-pacing.md`.
- Report path (orchestrator-chosen, suffix-style), verdict-first report, and the
  termination formula: `subagent-contract.md`.
