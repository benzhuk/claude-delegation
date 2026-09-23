# Goals

## Current objective — September 23, 2026 (America/New_York)

Deliver a usable plugin that helps LLM agents manage work on any project: turn authorized user intent into useful, verified outcomes autonomously and in parallel, while learning from evidence and simplifying the systems they work on. Codex and Claude Code are first-class initial hosts; mixed-agent collaboration is part of that baseline. The shared goal, work/evidence identity, skill, memory, and communication contracts stay provider-neutral. Host integrations are thin and verified; an unsupported host capability remains explicit.

This applies to software, research, documents, and other project work. A commit or test suite is one kind of evidence, not the definition of a useful outcome. Each project supplies its outcome, acceptance evidence, constraints, and authorization.

## Operating rules

- Optimize time to useful, verified delivery and outcome quality first. Use the fastest capable work at an appropriate total cost, including research, coordination, review, integration, and rework. Cost measurements guide routing; they neither invent a budget nor stop authorized work. Honor a project-supplied limit.
- Connect each item to the current goal and the evidence that would establish progress. Reassess when evidence, scope, or assumptions change; propose clearer goals, but never silently redefine success.
- Diagnose the first broken contract and address its cause. Repeated failure triggers an architectural reassessment. Prefer the simplest design with fewer independent mechanisms, special cases, duplicate responsibilities, and sources of truth.
- Use a hypothesis and discriminating observation for important uncertainty. Preserve negative results and unknowns; routine work may inherit its parent hypothesis.
- Start independent ready lanes promptly, agree interfaces early, and refill free capacity with finite useful work. A human decision blocks only dependent items; request likely permissions in advance, but an unanswered request is not authorization.
- Completion requires relevant evidence. Code acceptance uses applicable tests, review, and artifact evidence; non-code acceptance uses the project-defined evidence and owner judgment. State what was observed, inferred, and not checked. Stop when the objective is met or all remaining useful work genuinely waits on an external dependency.

## Measures and current evidence

| Measure | Definition | Current evidence / unknown |
| --- | --- | --- |
| Top-tier tokens per accepted deliverable | Whole-task top-tier token cost | Unknown; prior census did not cover the right agents or wakes. |
| Elapsed ask-to-accepted time | Wall time from authorized ask to accepted outcome | Five records show 8.4–18.6 minutes from admission to reviewed, not accepted or comparative performance. |
| Rework after acceptance | Fixes, review rounds, and recurring failure classes in seven days | Unknown; an earlier trailer failure class recurred but was not counted as this measure. |
| Work lost or stalled | Admitted work without result and actionable messages left unread | Earlier observations found delayed results and missing inbox logging; current rate is unknown. |

Whole-task cost, coordination, agent count, and mechanism count explain these outcomes; they do not replace them. No claimed improvement is valid without its comparison evidence.

## Active acceptance boundary

A source candidate, an integrated result, a release, an installation, and a measured useful outcome are separate claims. The next useful proof is real authorized work and shared handoffs on Codex, Claude Code, and a mixed collaboration, with both code and non-code evidence where applicable. Automatic cadence, unattended Done pickup, and durable automatic memory upkeep are not yet demonstrated. Do not represent an instruction, source test, or local checkout as installed or automatic host behavior.

## Active supporting outcomes

The package coordinates its skills and host integrations around the same durable contracts. Actionable communication reaches its intended owner without gratuitous wakes; a human decision or comment is handled in its designated document and does not block independent work. Learning is durable, shared where the host supports it, and superseded lessons cease to govern. Safe cleanup has a named owner and acts only on the provably safe class. These outcomes remain requirements; their implementation, installation, and measurement status are explicit in the relevant work evidence and are not established by this document.

## Dated history and observations

The following records preserve earlier observations; they do not override the current objective or operating rules. The complete original dated quotations and measurements are retained in [the 2026-09-22 historical appendix](goals/history-2026-09-22.md).

- September 20–22, 2026: Ben emphasized token efficiency while maintaining quality, faster deliverables, root-cause work over patch castles, and agents doing valuable work without waiting to be asked.
- September 21, 2026: prior records reported a 152-turn hand-run build and 19/67 orchestrator turns in loop builds; these are observations, not lead-turn targets or provider/model requirements.
- September 22, 2026: the card hook had shipped, five of eleven releases had focused on one surface, and a janitor report listed 48 SAFE and 5 JUDGMENT items. Earlier machine, hook, Notion, and memory status statements remain historical evidence rather than current release requirements.
- September 22, 2026: earlier audits reported 0.13.0 on four machines, a wiring check that could not fail, two hooks without a kill switch, two result notes unread for hours, a direct delivery path without logging, a hand-repaired decisions page, and unsynchronized/untriaged memory. These findings are retained for prioritization; none proves current installed behavior.
- September 22, 2026: an earlier token census omitted wakes and the intended agents; a speed census found 29 percent lead dispatch latency in one build; the recurring trailer failure class was not counted per build. Those baselines are incomplete, so the corresponding measures remain unknown.
- September 23, 2026: the first source/callable candidate was reviewed as 0.14.0 at `9adb6253f83ffecac7cfb8fbe539f8c48caa2cb1`; no main merge, push, installation, or live host validation was thereby proven. The current delivery is recorded in `docs/specs/2026-09-23-harness-next.md`.
