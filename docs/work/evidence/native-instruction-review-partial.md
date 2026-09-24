VERDICT: PARTIAL

# Native Claude shipped-instruction review proof

## Disposition

The one authorized Claude Sonnet provider task did not produce a review artifact. It reached the 180-second hard cap and the runner terminated the native CLI with `SIGTERM`. The selected evidence file remains exactly `VERDICT: PENDING — native Claude instruction review has not run.` No source verdict, bind, account, acceptance, or completion is claimed.

The reviewed snapshot was immutable shipped plugin 0.20.0 commit `8b4ea6f1d376ab90271bc6f80a3a523a7aa746cf`. Before launch, all five copied blobs were independently verified against Git:

- `skills/continue/SKILL.md`: `47e96ea66f5379e85abae4c55dba65f05d3ba986`
- `skills/team-build/SKILL.md`: `503c2a4f0a670b76a37b7979591195a37401a28e`
- `skills/delegate/SKILL.md`: `44cdb29b869665427257d952295b7dab9ec3ee24`
- `docs/subagent-contract.md`: `ea14550e521eb576b6457d41b3f164d15d8bd5ab`
- `docs/model-tiers.md`: `a50bfd131c6098b7d94af6398f3e84e9acfdc589`

The model read the brief, authority, manifest, work record, all five target files, and the bounded postrelease contract delta. It had started a long reasoning pass but emitted no review text and made no Write call before termination. Its last stream event was an estimated 10,000 thinking tokens for the unfinished request, so no partial chain-of-thought or verdict is recoverable or represented here.

## Continuation observation and root cause

Persistent session storage fixed native episode discovery. The three UserPromptSubmit hooks all succeeded but returned only routing/empty output. On the first `PostToolUse:Read`, the continuation hook emitted native session `75397551-6a78-46fb-866e-1f7eaeee740c` and an opaque epoch (value omitted from this published copy); the rendered hook context is present in the persistent transcript.

The disposable task prompt incorrectly said to bind **if and only if UserPromptSubmit** supplied the values. Because the real bootstrap supplied them on PostToolUse, the model obeyed the narrower condition and never invoked bind. The continuation state proves the episode was discovered but remained `phase:"unbound"`, with `binding:null`, `attempted:false`, and `accountedRevision:null`. This is a fixture-prompt contradiction, not evidence that native continuation discovery failed.

No Stop hook ran because the process was terminated at the hard cap, so the completion hook had no opportunity to issue its one correction.

## Permissions and tool observations

The Edit repair was correct: effective rules allowed `Edit(native-claude-instruction-review.md)` and did not deny Edit. There was no Write attempt, so report-write success was not tested in this run.

The model made three out-of-scope Bash attempts while exploring:

1. A read-only `find`/`ls` under `repo/docs` succeeded.
2. A read-only `find` under `repo/snapshot` succeeded.
3. A `git hash-object` loop was denied under `dontAsk` because only the continuation Bash command family was allowlisted.

`run-summary.json` has `permission_denials:[]` because no native result event existed at forced termination. That field is not authoritative for an interrupted run. `stdout.jsonl` contains one explicit `system.permission_denied` event for the hash command. The host-side preflight blob verification remained valid, but the model did not independently recompute it.

## Runtime accounting

- Started: `2026-09-24T03:18:26.688Z`
- Terminated: `2026-09-24T03:21:26.734Z`
- Elapsed: 180,046 ms
- Native exit: no exit code; signal `SIGTERM`; `timed_out:true`
- Model: `claude-sonnet-5`, high effort
- Completed provider blocks recorded in the transcript: 4
- Completed-block usage: 8 input tokens, 20,263 cache-creation input tokens, 46,595 cache-read input tokens, 6,288 output tokens, including 4,446 thinking tokens
- Unfinished request: stream estimate reached 10,000 thinking tokens; it has no completed usage/result row
- Total cost: unavailable because the CLI produced no result event
- Web: zero searches and zero fetches in every completed provider block
- Hooks: 68 lifecycle events, comprising matched start/response pairs. Successful responses were SessionStart 3, UserPromptSubmit 3, PostToolUse:Read 20, PostToolUse:Bash 4, and PostToolBatch 4.
- `AGENTS_HOME` was fresh and had no `ws-off`.

## Static leads for parent adjudication

These are Codex spot-check leads from the same immutable files, not native Claude findings and not a substitute verdict:

1. `continue/SKILL.md:13,21,45` requires starting unrelated independent ready work, while `team-build/SKILL.md:158-161` forbids any new wave whenever any record is delivered, rejected, or reviewed except a stated-prerequisite case. The latter is broader than dependency safety and can serialize unrelated work. A narrow repair would apply the barrier only to dependent workstreams and defer unrelated work to `continue`.
2. `subagent-contract.md:16,28-40` requires the report's own verdict and says never trust the reply. `team-build/SKILL.md:211-216` says to add a `VERDICT:` prefix at copy time when the original report lacks it. That permits an orchestrator to manufacture load-bearing verdict evidence. A narrow repair would reject or reissue a verdict-less report and preserve evidence bytes when copied.
3. `model-tiers.md:28` requires high-tier work to receive top-tier adjudication. `team-build/SKILL.md:80-93` permits a high-tier builder for the hardest territory, while `team-build/SKILL.md:108-120` still prescribes only a high-tier reviewer. That leaves the highest-risk high-tier build without the stronger-tier check. The reviewer rule should explicitly escalate high-tier-authored territory work to top-tier adjudication.
4. `model-tiers.md:10,21-24` reserves top-tier orchestrators for judgment and routes mechanical execution to mid/fast tiers. `team-build/SKILL.md:141-143` assigns the orchestrator “everything env-touching,” including migrations, seeds, and deploys. Ownership and approval are judgment; executing those commands can be bulk work. The wording should say the orchestrator authorizes and adjudicates environment changes while a scoped mid-tier executor performs mechanical steps, except for irreducible privileged actions.

The already-repaired missing-process-receipt rule in `postrelease-c50-subagent-contract.patch` is intentionally excluded from these leads.

## Evidence paths

- `native-instruction-review-8b4ea6f/run/run-summary.json`
- `native-instruction-review-8b4ea6f/run/stdout.jsonl`
- `native-instruction-review-8b4ea6f/run/claude-debug.log`
- `native-instruction-review-8b4ea6f/run/launch.json`
- `native-instruction-review-8b4ea6f/run/agents-home/ws/continuation/41afec2b95f60359b4981256b96b273c3e9a0427b5f613153d35b6b14be8a965.json`
- `native-instruction-review-8b4ea6f/repo/snapshot-manifest.json`
- `C:/Users/benzh/.claude/projects/C--Users-benzh-AppData-Local-Temp-astra-followthrough-0923-native-instruction-review-8b4ea6f-repo/75397551-6a78-46fb-866e-1f7eaeee740c.jsonl`

No source repository file, production installation, personal configuration, auth material, private Notion content, or external destination was changed. No paid retry was made.

## Lead disposition after hand-back

The overnight bearings prediction failed: no useful artifact or bind/account completed in this attempt. The effective prompt imposed the wrong event-only gate even though the shipped skill permits current native hook context. The 180-second containment timer then terminated ongoing work before a verdict. Neither failure is reported as a plugin discovery defect, successful cancellation test or evidence that model judgment failed.

The separately labeled Codex static leads were inspected by the lead. They identify real instruction conflicts and are admitted in `2026-09-23-instruction-consistency.md`: scope the dependency barrier, align reviewer tiers, separate environment ownership from execution, reconcile evidence reading/formatting and use the shared progress-based ETA ladder. No runtime workaround is selected for the disposable brief's error. The mid-tier source builder owns that finite correction. Its resulting changed instructions require an independent review, which is a new useful deliverable; the failed native run is not rerun solely to obtain green lifecycle evidence.
