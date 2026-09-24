## Everyday work on a project

Start with a concrete request that names the desired outcome and boundaries:

> “In this project, implement the requested change, use the project’s applicable skills and existing conventions, run the relevant checks, record the evidence in the work record, and continue with finite ready work until the goal is met. Ask me only when an external choice or new authority is genuinely required.”

The agent first reads the project goals, current work record, and the instructions relevant to the task. It identifies:

- the project goal this work advances;
- the authorized outcome, including files and systems in scope;
- applicable skills and their required workflow;
- what counts as sufficient evidence for completion.

It then performs independent, in-scope work: inspect the relevant code and documentation, make the authorized changes, and run proportionate tests, builds, linting, or review checks. It should not turn ordinary implementation details into questions. Questions are reserved for choices only a human can make—for example, a product tradeoff, an external action, missing credentials, or authority to change something outside the agreed scope.

As work progresses, capture durable evidence: changed areas, commands or checks run, results, review findings, and any remaining risks. Record this in the project’s work record using its established format. A failed check is evidence too: diagnose it, fix it when authorized, or record the blocker precisely.

Before declaring the task complete, review the result against the original authorized outcome and project goal. Continue with finite, ready follow-up work when it is clearly in scope and materially improves completion; otherwise close the work with a concise handoff stating what changed, what was verified, and any explicit next decision.

### Limitations

This workflow does not create an ongoing binding commitment, grant new authorization, guarantee automatic project completion, or replace human decisions. It cannot act where access, credentials, trust, external coordination, or product direction is required. Native agent behavior may also differ between Codex and Claude Code; the shared request establishes intent, while each environment’s installed instructions govern execution.

### Observed / Not checked

I could not read the requested sources because every shell read command was blocked by the invocation’s filesystem policy, including the requested skill files:

- `C:\Users\benzh\.agents\skills\continue\SKILL.md`
- `C:\Users\benzh\.agents\skills\team-build\SKILL.md`

I therefore did not read `docs\GOALS.md`, `docs\native-use.md`, or `docs\work-record.md`, and did not validate terminology, work-record format, or source-specific limitations. The proposed text is a conservative draft derived from the task brief and needs source-grounding corrections after those files can be read.