# Pane setup — who launches what, and when

The coordinated package's pane model for a build that uses `team-build`'s loop and (if
approved) `delegate`'s ladder. Model tiers referenced here are `docs/model-tiers.md`'s
vocabulary; don't re-derive the tier table here.

## The panes

- **`<project>-fable`** — top tier (Claude Fable / GPT-6-Astra). Writes the spec, reads
  the high-tier red-team's report, renders the merge/ship verdict, and is the only pane
  that writes the decisions page (`delegation:decisions`). Never executes: no builds, no
  file edits outside the spec pack, no direct tool loops over code. Its tokens buy
  judgment, nothing else.
- **`<project>-o`** — an Opus orchestrator pane. Runs `team-build` end to end (Setup
  through Ship, `skills/team-build/SKILL.md`); launches the build-review-fix loop
  (`skills/team-build/references/build-loop-workflow.js`, that file's own new SKILL.md
  section) and, when approved for this build, the ladder
  (`skills/delegate/references/ladder-workflow.js`, `skills/delegate/SKILL.md`'s Ladder
  section). This is the only pane that spawns subagents for execution.
- **Subagents beneath `<project>-o`** — mid tier (Sonnet) writes code and runs tools:
  builders, the scout, the integrator, and any `delegate`-style research/audit fan-out.
  High tier (Opus) reviews: the spec red-team and every territory's independent reviewer.
  Fast tier (Haiku) does mindless bulk sweeps only (`docs/model-tiers.md`'s rule: fast
  tier never touches a number someone will act on) — it does not review, build, or judge.

## Who launches what, and when

1. `<project>-fable` writes the spec and territory map, gets a high-tier red-team read,
   rules on any open questions, and hands the spec pack path to `<project>-o`.
2. `<project>-o` runs `team-build`'s Setup: territory map, contract stubs at t0, the
   Scout step (one Sonnet agent, one file per territory,
   `skills/team-build/references/scout-brief.md`), work records opened, briefs written
   with the scout findings folded in.
3. `<project>-o` launches the build loop (Build → Review → Fix → Integrate, one call per
   territory in parallel, `parallel()` as the barrier) from its own pane — never from
   `<project>-fable`, never from a builder or Sonnet-tier pane.
4. `<project>-o` reads the loop's return (`{ territories, integrator, blockers }`),
   applies Ship (work-record transitions, evidence copies), and reports the merge-ready
   state back to `<project>-fable` for the actual ship decision.
5. If this build also uses the ladder for a bounded research/judge pass, `<project>-o`
   launches it the same way — its own pane, never a subordinate one — and its status
   stays approved-not-live until its own first real run, same as the build loop.

## Notes between panes

`<project>-fable` and `<project>-o` are peers, not owner/subordinate — a note between
them (a question, a handed-off spec path, a blocker escalation) goes through the `multi`
skill, never Orca orchestration dispatch, even when one pane is "above" the other in this
diagram. Orchestration dispatch is for `<project>-o`'s own subordinates (builders,
reviewers, the integrator); `multi` is for talking to the fable pane.

## Measures, and where each is read from

- **Elapsed per work id** (`opened` → `accepted`, or `opened` → last `reviewed` when no
  `accepted` line exists yet, labeled `(to reviewed)`) — `scripts/work-census.mjs`,
  reading `docs/work/*.record.md`'s `Log:` lines.
- **Dispatch latency** (each `delivered` line to the first later `reviewed`/`rejected`
  line, per round, plus the sum) — `scripts/work-census.mjs`, same source.
- **Idle minutes with a runnable unowned record** (time at least one record sat
  `Status: runnable` / `Owner: none`) — `scripts/work-census.mjs`'s footer, computed
  across every record's merged, timestamp-sorted transitions.
- **Recurrence of a failure class** and **workarounds past removal** — read from the
  work records' own `Log:` notes and findings files across builds; no dedicated script
  computes these yet, so read them by grepping `docs/work/` and past reports rather than
  expecting a census tool to surface them automatically.
- **Lead turns (total and windowed), turns/hour in the window, tokens by model for the
  lead and for each subagent, and the combined lead+subagent split** (the speed-census
  numbers) — `scripts/build-census.mjs`, reading the lead's own
  transcript plus each subagent's task-output directory. Its turn/token counts are
  de-duplicated per request id (Claude Code re-emits the same turn as multiple JSONL
  lines while a response streams); the mechanism lives in `scripts/build-census.mjs`'s own
  doc and test fixture, and is deliberately not restated here.

Run both census scripts from `<project>-o`'s pane once a build's Ship step completes
(`skills/team-build/SKILL.md`'s Ship section names the exact moment); the numbers go into
the merge ask `<project>-fable` puts on the decisions page, not into a pane's own
transcript alone.
