---
name: bearings
description: Assess actual progress toward an agent-work goal from bounded evidence, choose CONTINUE, RE-PLAN, or CUT, and publish a dated, evidence-linked result. Use for standing project bearings and architecture-drift checks; do not use for ordinary implementation review.
---

# Bearings

Use this skill to obtain an independent, evidence-based answer about whether a project is moving toward its actual goal. It is a callable assessment, not a scheduler, work tracker, or replacement for the project's goal documents.

## Prepare the assessment

1. Gather a bounded packet: the current goal/card revision, completed and in-flight work with their results, relevant commit or artifact links, earlier predictions, and available measures. State the date, assessment window, and what evidence was unavailable. If current sources or owner direction conflict, surface the conflict and authority rather than silently choosing a definition of success. Do not make the reviewer rediscover the whole project.
2. Give the packet to a fresh **high-tier** reviewer through the host's native delegation mechanism. Both Codex and Claude Code use the same request and output requirements below; host-specific discovery, execution, or wake-up behavior is not assumed.
3. Have the reviewer answer all four questions:

   - Have we made significant progress towards the goal?
   - Have we gotten sidelined on some too-specific sub-project?
   - Have we spent time on a castle of patches instead of going back to the architecture and simplifying?
   - Are we still building towards the simplest possible solution that solves our actual core problem?

   Require cited observations, explicit unknowns, one next action, one falsifiable prediction, and exactly one decision: `CONTINUE`, `RE-PLAN`, or `CUT`. Require a short list of material failures or gaps in priority order, each with its impact, confidence or unknowns, and why the first item selects the next action. Keep independently authorized work distinct from that single selected next build so the ranking does not serialize it; that work may continue in parallel. A reviewer may report that the evidence cannot support a confident decision; that is an unknown, never a reason to invent progress or regression.

   Spot-check accessible source evidence behind material claims. Label each observation as directly verified, attributed to a report, or an inference; a citation alone does not establish that its claim is true.

Read [references/evidence-template.md](references/evidence-template.md) before preparing or publishing an assessment.

## Respond and act

The lead writes the response in its own words. It must distinguish reviewer observations from its own decision and name the next action or owner decision.

- `CONTINUE`: carry out the named next action within existing authority.
- `RE-PLAN`: simplify or redirect the currently authorized work, recording what changed and the prediction that will show whether it helped. If two RE-PLAN responses fail to improve the named concern, reassess the architecture and evidence before choosing further patches. Do not automatically change the user's objective or authority.
- `CUT`: stop the identified line of work and preserve agreed outcomes, evidence, and reversible artifacts. Escalate any goal, authority, or irreversible disposition decision to the owner.

Routine replanning inside existing authority may proceed. A pending owner choice does not erase independent authorized work.

## Publish the result

Publish a dated assessment to the project's configured Notion decisions or goals page using the `notion-writing` skill. Include repository evidence as links to the reviewed revision or artifacts, rather than unsupported prose references. Re-read the target page immediately before the write and follow that skill's concurrency rules.

If the page, credentials, or publication route is unavailable, keep the complete assessment in the project evidence/report location and mark publication `PENDING` with the attempted route and reason. Do not represent the human-visible check as complete, and do not block unrelated work. A repository-path invocation can be useful before installed host discovery is verified; record that distinction. Installed host discovery and automatic cadence require their own host-specific verification.
