# A plan for useful work with less machinery

Independent plan, October 5, 2026, America/New_York. Written before opening the existing method and design proposals. Proposed practice only: no source change, removal or new goal is authorized by this document. The time limits below are reversible starting bets, not research-derived optima.

## Choose one investment that can pay for itself

Ben chooses a real project outcome worth having within two weeks, the loss he will not tolerate, and how much attention and money it deserves. My recommendation is an already wanted user task in a project such as Cadma or BTO, not another demonstration whose only customer is this harness. First inspect the existing request and observe the present task. If neither establishes demand, spend at most half a working day clarifying the problem before proposing implementation.

The lead writes the shortest usable account of the outcome, present failure, main uncertainty, observable acceptance and appetite in the existing issue or work brief. Consider doing nothing, using an existing tool and one simpler implementation before selecting a design. Do not make three speculative designs compulsory for a small fix. A substantial architecture choice warrants two plausible alternatives and a short failure analysis, judged by behavior and dependencies rather than impressive prose.

Ben decides purposes, tolerable losses, spending limits and irreversible tradeoffs. The lead owns technical recommendations and explains the consequence Ben can observe. “Approve this architecture” is not a useful owner question. “This shortcut saves a day but cannot recover yesterday's edits; is that loss acceptable?” is. If a consequential technical claim cannot be tested or supported by comparable experience, buy a bounded expert review or narrow the commitment. Owner approval and model consensus cannot manufacture expertise.

## Keep the work coherent

Use one responsible lead, a mid-tier builder for substantial implementation and a high-tier reviewer when the change warrants independent verification, consistent with current authority. The lead can delegate genuinely independent investigation; it should not split one tightly coupled state machine merely to fill slots. Reviewers first see the behavioral contract and evidence, then the proposed answer. They must identify concrete failure cases or acknowledge uncertainty. The lead resolves disagreements by evidence and consequences, not votes.

Use only three existing surfaces: the current issue/brief for intent and decisions; the branch or PR with checks for implementation and review; the existing work record for actual state and measurements. Link them instead of copying their contents. The record names one writer, the exact revision, unresolved acceptance, next action and location of unmerged work. A session ending or changing hands must leave that information current. No new registry, scheduler, driver or approval engine is part of this plan.

Inspect the useful increment at its first integrated demonstration and at acceptance. Reconsider architecture when a recurring failure crosses the same boundary, when a key assumption fails, or when a change needs coordination across several state owners. Do not reinterpret every defect as grounds for a rewrite. Trace the failure, name the responsibility that is misplaced, and compare a bounded replacement against keeping the existing route. A simplification is complete only when the unnecessary path and its operating obligation are retired.

Research ends when the next inexpensive observation is unlikely to change the investment. Implementation stops for an unmet safety boundary, exhausted appetite, invalidated value claim or the existing goal's stop condition. Preserve evidence and choose another independently authorized task. A stop is not permission to redefine the goal. Any revised release condition requires Ben's decision.

## What stays, and what must earn its place

This is a functional disposition, not permission to delete files. A concrete removal needs dependency inspection and a check of the named failure below. Freeze optional harness development while these choices are tested through real work.

| Existing part | Proposed disposition and reason | Required check before removal or replacement |
|---|---|---|
| Git, isolated work and installed version identity | Keep. Protect recoverability and identify what actually ran. | Uncommitted or unmerged work remains discoverable; installed code matches the evidence. |
| Tests, review and secret/authority guards | Keep proportionate behavior checks and boundaries. Simplify duplicated checks only with equivalent coverage. | Known failure remains caught; no alternate-tool retry after refusal. A guard's inconvenience is not removal evidence. |
| Delegate/team-build and host adapters | Keep existing execution/review capability; freeze new drivers. | A real mixed handoff preserves intent, result and failure without a new shared host primitive. |
| Peer messaging | Use when ownership crosses sessions; otherwise native child results suffice. Keep durable delivery evidence. | A sent ask is received, handled or explicitly blocked once; duplicate nudges do not create a second assignment. |
| Work record and status collection | Keep one current owner and evidence chain; remove duplicate state descriptions only after reconciliation. | A fresh session can locate active and unmerged work without reconstructing chat. |
| Census and attribution | Use existing raw measures plus a short manual accounting where necessary. Defer richer dashboards and claims of complete attribution. | All participating sessions and waits are included; unknown cost is unknown, not zero. No accepted gate uses unsupported totals. |
| Goal card, bearings and decisions page | Keep purpose, stop authority and visible decisions. Use existing publication, not another state model. | Owner sees the actual blocked choice; repository and page disagreement is exposed and reconciled. |
| Publication/history helpers | Freeze expansion; collapse duplicated prose at the next needed edit. | Required decisions and evidence remain reachable, with one current statement distinguished from history. |
| Janitor and resource claims | Keep bounded reports and explicit ownership; no speculative cleanup. | No work disappears because its record exists only on a branch. Independent owner confirms disposal where required. |
| Knowledge capture/retrieval | Retrieve relevant lessons and curate demonstrated ones; defer bulk capture throughput work. | A prior actionable lesson changes a later decision; unused accumulation is not success. |
| Install/hooks and test-home tooling | Keep reproducible installation and isolation; reduce overlapping routes only at a measured boundary. | Tests cannot modify the real home; supported hosts run the reviewed revision with explicit failures. |
| Dev-server support | Keep where actual project use needs it; leave out of the harness trial otherwise. | Owner can locate and stop the server and recover the intended workspace. |
| Retired continue runtime/artifact machinery | Leave retired; do not replace under a new name without a fresh observed need. | Existing retained behavior covers the original loss; any future addition names the uncovered failure. |

The initial deletion is from the work plan: no further general mechanism until the useful slice exposes a need. Physical deletions come from that evidence, not a target line count. The audit already records real deletions; this plan does not pretend none occurred.

## Two weeks, with a decision at each useful result

**Days 1–2:** confirm the real task and an existing comparable baseline. Reconstruct one prior delivery's clock, participating sessions, escaped defects and stalls. Record missing evidence. Inspect the riskiest technical or value assumption using an existing artifact or small probe. Commit to the slice only if it can still return value within the appetite. Do not spend these days building measurement infrastructure.

**Days 3–5:** build and demonstrate the smallest complete useful path. Preserve necessary behavior. Record all participation and waits as they happen, and review the actual revision once it meets the contract. If a harness defect blocks it, isolate the boundary and propose the smallest justified correction; do not silently expand the project.

**Days 6–7:** let the user exercise the delivered task and record failures and workarounds. Compare total effort and quality with the stated baseline. If the first slice fails its purpose, stop the method expansion and explain the failure before selecting more work.

**Days 8–10:** if the first slice is useful, run a second comparable task led from the other host, including a genuine mixed handoff if still required by the approved goal. Remove at most one demonstrated redundant route when its retirement check can be satisfied within the appetite. Finish with one recommendation: continue, change the boundary, or abandon this method experiment. The calendar is an appetite, not a guarantee of ten uninterrupted days or permission to start unspecified work.

## Judge the result without fooling ourselves

Keep the goal's four raw measures: top-tier tokens across all involved sessions, elapsed ask-to-accepted including waits, rework after acceptance, and work lost or stalled. Predeclare the observation window for rework, the start/finish events and how ambiguous work is counted. Add actual task completion and Ben's active minutes/interruptions as quality and burden checks, using a simple log. Report total model cost where available so moving work to lower tiers cannot conceal greater overall expense.

A baseline at zero rework cannot be beaten strictly; do not alter the current DONE wording by interpretation. Ask Ben to distinguish no worsening from strict improvement before a release claim. Two tasks are diagnostic case studies, not a causal trial or proof of universal host portability. Difficulty, familiarity and model changes remain confounders. If comparable evidence is missing, say “not established” and collect it prospectively instead of inventing a favorable baseline.

The prediction: two useful tasks can be delivered and recovered from existing records without adding a harness mechanism, with required quality preserved and less owner coordination than the reconstructed baseline. Any added mechanism, missing participating session, lost work, unapproved tradeoff or failed user task falsifies the relevant part. A failure calls for diagnosis; it does not automatically license another patch. Risks include a lead bottleneck, noisy comparisons, hidden manual effort and postponing a genuinely necessary architectural repair. The bounded demonstrations and explicit stop protect against those risks imperfectly; no method removes judgment.
