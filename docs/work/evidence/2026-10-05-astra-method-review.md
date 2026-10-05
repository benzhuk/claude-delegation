VERDICT: REVISE BOTH DESIGNS. Finish the authorized no-code bet with a bounded task trial proposal; neither architecture is ready for implementation.

# Independent method and design review

October 5, 2026, America/New_York. Requested by `skills-f-method-review-1` and its design-review addendum. No code, guards, host configuration, tests or builds were changed or run. Branch: `lane-71/astra-method-review`; nothing merged.

The revised method is a useful correction: start with the problem, give the lead responsibility for technical recommendations, bound the investment, preserve objections and reconsider structure. Keep that direction. The two designs do not yet turn it into a credible next investment. Continue prescribes another large repair program; simplest-core claims to eliminate failures by removing their names, checks and operating contexts, without showing that the necessary work still succeeds. The better next choice is a reversible trial on an ordinary wanted project task, using existing tools, before retiring capabilities.

This is advice within the no-code bet already adopted by Ben, not a request to approve that bet again. The October 5 history records separately authorized guard work; this review neither cancels it nor supplies authority to alter a guard.

## Evidence and independence

The [problem statement](2026-10-02-astra-problem.md) was committed at `080b71aa`; [research](2026-10-02-astra-research.md) at `f27407f7`; the [independent plan](2026-10-02-astra-plan.md) at `68f6c527`, before opening the incumbent method/design files. The detailed raw audit overlapped external research after the problem commit. I then read the method revision, lead view, original ruling, synthesis, all ten incumbent research reports, PROBLEM, both designs and the misfit list. Primary-source reading scopes and retrieval failures are in the three research appendices. This is substantial but purposive research, not an exhaustive or systematic literature review.

The main checkout advanced while this isolated review ran. Critical proposal files matched published main `19f32adab2b3ca79f6ac7e23b55cdc70ba24f499` at review; the [source manifest](2026-10-05-astra-source-manifest.json) hashes all 18 comparison inputs. The original synthesis and ten research reports were local untracked files: their hashes preserve the reading boundary, but I cannot provide published revision links for them. Historical census/inventory reports also have limited provenance, disclosed in the [raw audit](2026-10-05-astra-raw-evidence.md).

I previously led harness work. Permitted histories incidentally disclosed earlier conclusions before this exercise. The research assignments were separate contexts, but used the same model family and related literature. Neither the commit order nor agreement among agents proves independent correctness. Local code claims below were read directly; operating incidents remain attributed to their reports unless explicitly stated otherwise.

## Findings that change the decision

### Blocking: the proposed failure reduction has no valid denominator or causal basis

The simplest-core opening claims four families account for 218 of 282 rows. Its four named families total **197**, from 67 + 69 + 37 + 24. More seriously, these are neither independent incidents nor opportunities for failure. M104 and M132 describe related inode failures; M135 aggregates 59 refusals into one row; several entries restate earlier evidence. The list includes an unrelated restaurant-booking endpoint mistake at M159 and a TDF animation defect at M179, the latter classified under the four-host family. One host cannot remove an animation bug. The header still says 282, while the reviewed file contains 293 rows and duplicate M288 identifiers. These are directly verified text/count findings, not a new census.

The misfit log is a useful inventory of things to investigate. Its six families are hypotheses about related trouble, not demonstrated failure classes eliminated by one design. Some are review findings caught before merge despite the exclusion rule saying those are omitted; M172 explicitly says the lint was correct while classifying it as a false positive. A broad label such as “checks prove less” combines different mechanisms. Do not promise a percentage of failures eliminated from these counts. Use a few dated incidents with explicit cause, retained responsibility and a counterexample that the alternative must survive. Sources: [misfits](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/docs/misfits.md), [simplest-core](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/docs/work/evidence/2026-10-04-design-simplest-core.md).

### Blocking: the retained build loop is not the standalone component described

The design keeps the loop unchanged, deletes census machinery, absorbs the work record, and says the loop creates and removes its worktrees. The current loop's acceptance prompt invokes `accept-prep.mjs`, explicitly requires a plugin root containing `scripts/work-record.mjs` and `scripts/build-census.mjs`, and pins that helper as the only record-edit route. The helper actually spawns both scripts. Omitting the record instead skips acceptance preparation; that is a behavior change, not the same loop. The builder mandate forbids directory deletion and assigns worktree removal to the lead. `maxRounds` already exists as an argument. These are direct source checks, not hypothetical risks.

An extraction may be worthwhile, but it needs a dependency closure and a defined acceptance/cleanup boundary. “No new code except the template” and “the loop is one script” are unsupported as an implementation estimate. Name every retained helper, data contract and check before estimating the shrink. Sources: [loop, acceptance prompt and mandates](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/skills/team-build/references/build-loop-workflow.js#L487), [accept-prep dependencies](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/skills/team-build/references/accept-prep.mjs#L283).

### Blocking: removing credentials from an environment is not a demonstrated replacement for the guards

The design says no agent has secrets, then gives the lead permission to publish with credentials. It does not specify the boundary preventing builders from reaching files, inherited tooling credentials or authenticated external tools. A secret absent from the initial environment is not necessarily inaccessible. Delete, identity and dispatch protections also address losses unrelated to environment disclosure. The plan groups them with noisy checks and removes them without accounting for those responsibilities.

The direction of reducing accessible authority may be sound. First specify what each role can access and do, how the retained publisher gets its authority, and what demonstrates that disallowed access and destructive actions remain blocked. If that requires additional infrastructure, include its cost instead of calling the design four files. Existing owner-directed guard changes remain separate. The October 5 reports of unreviewed automatic deployment and an external tool retrieving production data strengthen the need to reason about authority and effects; I did not independently reproduce those incidents. Sources: [simplest-core risks and removal table](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/docs/work/evidence/2026-10-04-design-simplest-core.md), [October 5 history](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/docs/decisions/history/2026-10-05.md), [misfits M288 and M291](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/docs/misfits.md).

### High: simplicity is purchased by reducing service and transferring work to Ben

One machine reduces rollout combinations. It does not eliminate stale processes, child setup errors, freezes or abandoned work. “No pane waits idle” is contradicted by recovery after a host/process interruption. Reading records only on planning turns does not explain how completed or blocked work gets attention between them. Launching the build pane and reopening the planning pane are recurring owner work; the one-hour migration estimate does not price that burden.

Machine consolidation is also different from support for multiple agent hosts. Running both products on one server can be a trial condition without abandoning desktop workflows or portability. For Cadma, Ben explicitly requires a normal visible signed-in browser for visual QA; availability of Playwright on a server does not satisfy that. Demonstrate the actual task, credentials, interactive tools and recovery path before recommending three machines stop running agents. This is an owner-facing loss/benefit choice, not something a technical recommendation can quietly settle. Source: [simplest-core component, cost and risk tables](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/docs/work/evidence/2026-10-04-design-simplest-core.md); current session's explicit Cadma preference.

### High: a successful build does not replace the tests for retained failure behavior

Deleting tests for deleted code is reasonable. Deleting the entire suite while retaining the loop, publisher and helpers is a different claim. One real build exercises one route; it does not establish correct behavior for a stale reviewed revision, a failed acceptance step, a dead child, concurrent edits or an interrupted cleanup. The current loop has explicit branches for these cases. Preserve the small set of tests tied to retained contracts and representative failures. Remove obsolete tests with their implementation, and name any deliberately relinquished guarantee. Test count itself is not quality. Sources: [loop](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/skills/team-build/references/build-loop-workflow.js), [simplest-core test-removal row](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/docs/work/evidence/2026-10-04-design-simplest-core.md).

### High: the comparison excludes the most informative inexpensive alternative

Continue bundles six expansive lanes: wider unattended cleanup, owner switches, automatic restarts or refusals, stall detection, page changes and more measurement. It calls this “no new mechanism” because each lane names a row. A named failure can justify investigation; it cannot establish the solution or pay for its recurring cost. Applying the two unfavorable M183 examples as the cost of each future lane is not an estimate from comparable work.

Compare both proposals with a third option: freeze optional harness development, run one already wanted project task through the current tools, and change only the boundary that obstructs it. This preserves the option to replace a genuinely wrong structure. The two current documents compare a deliberately expensive repair program with an under-specified removal program; that makes the preferred answer too easy. Source: [continue design](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/docs/work/evidence/2026-10-04-design-continue.md).

### High: acceptance is vulnerable to declaring a failure gone because it was not observed

Ben can identify pain and decide acceptable tradeoffs. He cannot know with certainty that a rare failure has stopped after one quiet bet. Deleting a census ends its error messages, not inaccurate accounting; deleting pickup ends pickup errors, not unread owner decisions. The manual provider-page reading has not shown attribution across a bet's sessions or distinction between raw tokens, cached tokens and cost. A timestamp written in a record is not necessarily the original ask.

For each claimed improvement, state the task, exposure/opportunities, observation window and retained quality. Keep costs, rework, stalls and owner attention as decision evidence even if they cease to be universal admission targets. A four-measure strict-improvement rule also cannot be met below a zero baseline. Resolve that wording explicitly before claiming DONE; do not relabel missing measurements as removed problems. Sources: [method revision, cadence](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/docs/work/evidence/2026-10-02-method-revision.md), [lead view, advice](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/docs/notion/lead-view-architecture-and-plan.md), [raw audit](2026-10-05-astra-raw-evidence.md).

### Medium: the method can reproduce the burden it criticizes

Four artifact types can still generate thousands of files and repeated context. Two full designs at every bet, a new line before every fix, owner acceptance of every misfit and immutable records for routine decisions have costs. A prose-only delegate skill does not “cost nothing.” Use a design pair at a consequential investment or failed architectural assumption; use the existing issue/PR for small changes. Keep the original incident and current rationale without repeated copies.

A fixed appetite prevents silent expansion, but forbidding all mid-bet reframing except a false problem statement can force work after a feasibility or safety assumption fails. Stop and propose a narrower commitment when those facts change; do not extend automatically. A migration should have an owned retirement condition, but forcing complete retirement by every bet close can make safe incremental migration impossible. The scope of the bet must include a useful intermediate state where necessary.

“Codebase stays flat or shrinks” is also an unsafe universal success criterion. A useful feature may require growth; deleting historical evidence can dramatically shrink the repository without simplifying operation. The audited repo is about 90% documentation by path count, and it has actually retired components. Judge dependencies, obligations and user work, with size as context. Sources: [PROBLEM draft](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/PROBLEM.md), [method revision](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/docs/work/evidence/2026-10-02-method-revision.md), [raw audit](2026-10-05-astra-raw-evidence.md).

### Medium: research limits are disclosed, then lost in the recommendation

The original reports often mark secondary material and extractor quotations honestly. The synthesis turns them into stronger claims: that the card caused the accumulation, that a failure class disappears when its mechanism is removed, that outsiders should not author alternatives, or that every owner-facing practice agrees on exactly what Ben should decide. The revised method correctly retracts the blind designer, but absence in a limited search is not evidence that independent authorship never helps. Different-family review is a reasonable experiment, not a validated cure for correlated judgment. Dropping it after three unchanged decisions would measure novelty rather than defect detection or warranted assurance.

Keep the useful practices as explicit bets, with costs and falsifiers. Do not use famous names as proof of the entire package. Our research has the same limitation: much is conceptual or practitioner evidence, and the agent studies do not test this workflow. Sources: local original synthesis/research files, hashes in the manifest; [method revision](https://github.com/benzhuk/claude-delegation/blob/19f32adab2b3ca79f6ac7e23b55cdc70ba24f499/docs/work/evidence/2026-10-02-method-revision.md); [independent research](2026-10-02-astra-research.md).

## What each plan contributes

| Question | Incumbent proposal is better at | Independent plan is better at | Adopt together |
|---|---|---|---|
| Ben's role | Clear pitch, appetite and unedited objections; direct use of his complaints | Distinguishing value authority from technical expertise and uncertain observation | One short recommendation in consequences Ben can judge, with concrete dissent |
| Rethinking | Makes reconsideration a normal planning activity and keeps removal possible | Avoids compulsory redesign for every small change; asks what evidence would justify a structural correction | Reconsider at investment boundaries and invalidated assumptions, proportional to risk |
| Existing protections | Lists individual components and concrete candidate removals | Names retained responsibilities and retirement checks, including recovery and authority | Dependency and behavior accounting before deletion |
| Proof of improvement | Gives failures memorable wording | Requires task success, owner burden, exposure and comparable measurements | A small set of real failures plus a prospective useful-task trial |
| First two weeks | Strong no-code boundary for the first bet | Delivers an external project outcome before further platform investment | Finish this no-code pitch, then seek authority for a bounded external task |

The independent plan is less implementation-specific and needs the dependency audit highlighted above before any deletion. It also risks postponing a necessary redesign and bottlenecking on one lead. Its proposed two-task comparison is a diagnostic case study, not a causal test. These are real weaknesses. Convergence on bounded investment, current problem/rationale, independent review and retirement is useful but weak evidence: shared sources, model family and prior project context could explain it.

## One recommendation and the decisions that remain

**Finish bet 1 by replacing the binary architecture pitch with a reversible trial proposal for one ordinary wanted task.** Use the existing workflow, retain current authority boundaries, and make one suspected structural failure the comparison. Predeclare the outcome, unacceptable losses, owner attention allowance, all-session cost/timing boundary, and stop condition. No broad host shutdown, wholesale test deletion or guard removal follows from this review. After the task, recommend retaining, extracting or removing the specific boundary with evidence. My [two-week plan](2026-10-02-astra-plan.md) supplies the sequence; its dates and thresholds are provisional.

Only owner-level questions belong in the pitch, with recommendations:

- **Which already wanted project task deserves the next trial?** Recommend the highest-priority existing task with a directly observable result; do not invent a harness demonstration as a substitute. The lead should bring one concrete candidate from the authorized project backlog, not ask Ben to design an experiment.
- **Is reducing automatic cross-machine service worth additional manual launches or losing desktop work?** Recommend preserving those capabilities during the trial and measuring their actual use before proposing a loss. One-machine execution for a task need not become a global policy.
- **What appetite and intolerable losses apply?** Recommend one bounded useful slice, no loss of work or unapproved authority changes, and an explicit allowance for Ben's active time. Renew only on new evidence, not to finish a sunk investment.
- **How should the old DONE requirement relate to the newly adopted method?** Recommend useful-task acceptance plus no worsening of required quality/reliability, with claimed improvements measured honestly; any zero-floor or portability change needs an explicit ruling. Until then, do not claim the old DONE bar passed.

No answer is needed to complete this review. These questions belong in the lead's next concrete pitch.

## Objections for the pitch, unedited

1. The two designs do not yet compare credible ways to deliver the same useful task. Continue assumes six more repair lanes; simplest-core omits migration, dependencies and recurring owner work. Include the existing-tools trial before asking for a bet.
2. The claimed removal of 218 of 282 failures is unsupported. The four named families sum to 197, and rows mix repeats, aggregates, caught review findings and unrelated product defects. Use demonstrated failure mechanisms, not that percentage.
3. The retained loop depends on acceptance, work-record and census helpers proposed for removal. It delegates cleanup to the lead. A no-code shrink cannot preserve that behavior as specified.
4. No environment credential is not the same as no access to credentials or dangerous actions. The publishing lead remains privileged. Specify and demonstrate the replacement authority boundary before removing a guard.
5. Preserve tests for retained contracts and failure paths. One successful real build cannot replace checks for stale reviews, interrupted work or concurrent edits.
6. Fewer machines and no wakeups move work to Ben and may remove required desktop capabilities. Price those losses and preserve a recovery path; do not call the failure families ended.
7. Keep the adopted problem-led direction, but measure actual task success and owner effort. A quiet interval, a smaller repository or agreement between models is not evidence that the problem is solved.

## Effort, validation and disposition

Mailbox ACK: October 5, 10:22 AM America/New_York. Main research and plan were committed before comparison. Review text completed approximately 10:47 AM America/New_York, about 25 minutes after ACK; final publication/receipt time is recorded separately. Aggregate tokens and billed cost across parent and children are unavailable through this review's tools and are not estimated from word count. Three research/audit agents and one independent bearings reviewer participated; the lead performed agent-era research and synthesis. That is a one-time review expense, not a proposed per-build process.

Validation was read-only: Git count reproduction and deletion counterexamples, exact proposal revision check, row count/arithmetic, retained-loop dependency inspection, primary-source reading and spot checks, and fresh owner-page reads. No product behavior or proposed replacement has been tested. The review worktree `astra-method-review` is retained for the unmerged report branch. The due bearings assessment is separate: [independent assessment](2026-10-05-astra-bearings-review.md), with lead response and publication recorded beside it.
