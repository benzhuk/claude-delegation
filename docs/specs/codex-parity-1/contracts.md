# Adjudicated interfaces before implementation

Source base remains 8cebeda. The supplied spec controls outcomes; the following resolves concrete scout ambiguities without changing goals.

## P1

Extract the existing internal Claude wrappers into a single P1-owned `hooks/lib/goal-context.mjs`: `cardResult(cwd, agentType) -> Promise<{status,text,reason,path}>`, `rejectionNotice(result) -> Promise<string|null>`, `bearingsNotice(cwd) -> Promise<string|null>`. Preserve existing exact rejection/due/unknown/not-independent strings by moving rather than rewriting. Both host adapters import these wrappers; no duplicated renderers or receipt readers. Additive options for injected environment are acceptable only if both adapters preserve real current switches and tests isolate their state.

Only a positively classified Codex lead gets NEW card/bearings context. Confirmed children continue to receive no peer or goal effects. Unknown metadata keeps its EXISTING peer/continuation behavior but gets no new goal/bearings claim. This narrows only the new advisory, not established delivery. Use classifyCodexRole; no pane-name inference or broader classifier rewrite.

Use actual switch `ws-off-goalcard`, not the supplied prose typo `ws-off-goal-card`. Preserve Claude's current coupling: master suppresses all new context; goalcard-off suppresses card and its bearings advisory; bearings-off suppresses bearings only. Missing/unreadable switch observations retain existing fail-safe behavior.

Codex SessionStart and UserPromptSubmit receive shared card + due/unknown notice only with usable card. SessionStart may add the same rejection message or bearings notice to systemMessage; UserPromptSubmit adds no NEW systemMessage. Preserve pre-existing inbox systemMessage and context on EVERY event, concatenating without replacing. Preserve Claude compact-source suppression where native input actually supplies it; do not invent unsupported native source metadata. No PostToolUse/Stop/Interrupt goal effects. No new hook registration/event/state/timer.

Claude retains its existing cadence, including prompt routing only and bounded PostToolBatch. Shared CONTENT is parity, not identical event schedules. P3 must say this explicitly. Source tests cannot upgrade installed/native-proof claims.

### Spec red-team adjudication (September 25, 2026, America/New_York)

The lead accepts per-prompt delivery explicitly for this bounded source build: up to the renderer's 1200-byte card plus the shared advisory on each eligible prompt. This is a measurable cost, not identical Claude cadence. Do not write Codex goal-card tally/fired state or add a time-floor mechanism. A future cadence change needs evidence from use.

Compute goal work under its own 500 ms asynchronous budget in parallel with existing peer work, and merge only AFTER composeContinuationResult. Timeout/failure drops only goal context. This bounds unresolved asynchronous work; it cannot preempt synchronous filesystem calls, a limitation to state rather than conceal. Preserve ackIds, ack, suppressOutput and continuationAfterFlush. Append context with two newlines and SessionStart human notice with one newline. A confirmed lead with no peer slug/result still receives a standalone goal output with empty ackIds.

Shared helpers take the injected environment explicitly; Claude supplies process.env and Codex supplies deps.env or process.env. Scratch test environments override ambient homes. Move leadIdHint into the helper verbatim and use the native lead session id at SessionStart. Preserve lazy imports on Claude's hot prompt route. Absent cards are silent; rejected cards can show the existing rejection only at eligible SessionStart, and blind failures add nothing. Compact-source suppression remains conditional on real input.

Native startup SessionStart classification is not verified by existing installed-hook evidence. Pin both confirmed-lead and unknown outcomes in tests and document that actual startup delivery depends on metadata being available. Source tests cannot prove app-server/startup timing. Separate top-level builder sessions may classify as leads; per-checkout bearings notices do not authorize an out-of-scope assessment. Builder mandates exclude running bearings for this finite task. Do not change role classifiers or receipt identities to guess organizational roles.

## P2

Inspect current Codex session structure via a local streaming metadata-only probe. Allowed fields: row type, event type, role, timestamps, session id/source/CLI version, usage counters and token-event attribution identifiers. Never print content, instructions, arguments, secrets or raw rows. Do not open/modify/resume the historical original session. Current source may be read but never mutated. Record version/schema observations in synthetic fixtures or non-private prose, not raw private records.

If complete per-build lead usage and conversational run attribution is verified, normalize it to existing shared outputs, with leadHost=codex. If not, emit explicit `leadHost: codex`, `leadTokens: unsupported (<specific reason>)` in flat summary lines copied by work-record. No COUNTED zero or empty numeric table may imply measured Codex usage. Identify unsupported leadTurns separately if event attribution cannot establish them. Preserve Claude behavior and deterministic output. Do not use a .md census output as transcript input.

The census-base review's two defects are owned upstream, not P2 scope. Reconcile fixes if supplied before integration; avoid overwriting them. Use explicit --no-census at acceptance if this build's full attribution is unsupported.

Count only verified, deduplicated per-response usage in the marker window, never cumulative turn/thread snapshots. Unsupported token schemas must not emit a COUNTED prefix or numeric zero tables; invalid counters must fail visibly. Native turn ids are a separate metric, not conversational leadTurns. Model and Codex child discovery/usage remain explicitly unattributed unless verified, including in flat Summary lines. Separate Claude peer review sessions are outside this lead transcript. No cross-home discovery or private transcript export. Lead-only partial evidence may be attached as such; use explicit no-census if the acceptance measurement is unsupported.

## P3 and integration

Docs describe P1's source capability, actual event bounds, positive child exclusion and unknown identity limit. 'Child-work detection unsupported' refers to unverified forms, not falsely denying the existing positive native discriminator. Installed0.20.6 evidence and0.20.7 card compatibility issue remain dated facts, not assertions that the new code is installed. No installation runs in this build.

Runtime territories are independent; P1 owns both consumers of its internal shared helper. There is no unimplemented cross-territory runtime interface needing an artificial stub. The helper signature and this contract are committed before workers branch, so consumers cannot evolve under competing owners.

P3 may build independently against this contract, but integration must check its claims against the final reviewed P1 SHA before acceptance. README body and changelog are both P3 territory. Use the next existing changelog slot 0.20.9 without changing manifests. Document the current Claude plus Codex mirrored route first, native Codex package as an alternative, usable-card/switch semantics and per-prompt cost. Preserve dated installed evidence without turning it into a current live claim.
