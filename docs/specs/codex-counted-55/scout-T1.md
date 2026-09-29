VERDICT: NEEDS_SCOPE_RULING

## Files and symbols
- `scripts/build-census.mjs:774-909` exists; `censusCodexLeadFile` verifies `session_meta`, de-dupes `response_id`, reads prior `turn_context.model`, native usage, unique `task_started`, wake and Stop-hook events. The proposed identity/horizon change is confined here plus discovery below.
- `:1138-1281` exists; `codexFirstMeta` reads only line one and `discoverCodexChildren` searches lead UTC day+next day, validates root namespace, `parent_thread_id`, depth<=3, but rejects later children as `outside horizon`.
- `:1294-1380` makes any discovery exclusion or effective window outside that two-day horizon global `coverageSupported:false`; `formatCodexText:1694-1731` then emits `PARTIAL` and hides combined totals. This contradicts the requested known-id bypass.
- `:1903-1932` has no `--lead-session`, `--codex-home`, or explicit discovery-window flag; `--lead` is already the concrete transcript input. Do not invent a record-driven CLI without a caller contract.
- `docs/census.md` Codex section documents two-day default discovery, response-id de-dupe, unique `task_started`, and missing optional usage fields as null/unavailable.

## Helpers to reuse
- Reuse `detectLeadHost` (`:739-758`), `censusCodexLeadFile`, `codexUsage`, `codexFirstMeta`, `codexRole`, and `discoverCodexChildren`; no imported helper territory is presently required.
- Preserve response key `${meta.id}:response:${response_id}` and conflicting-fingerprint rejection (`:867-871`); preserve `rootSessionId` and parent/depth checks (`:825-829`, `:1243-1279`).

## Tests that police this area
- `scripts/build-census.codex.contract.test.mjs` is the direct Codex contract suite; `scripts/build-census.completeness.test.mjs` exercises completeness verdicts.
- `scripts/build-census.test.mjs` protects CLI/output compatibility; `scripts/work-record.test.mjs` accepts only a first-line `VERDICT: COUNTED` census.

## Open questions for the spec
- What is the finite complete child-search boundary for a long-lived root: all canonical session dates intersecting `[windowStart, windowEnd]`, plus a required post-window closure scan, or an explicit supplied directory set?
- A positive root-id match proves the lead file, but what native event proves no later child/resumed child belongs to the historical window? Filename dates do not.
- Minimal additive proposal: retain existing keys; add `lead.codex.identity:{expectedId,verified,path}`, `discovery.scope:{kind,from,to,complete,reason}`, and per-field `lead.codex.fields.{tokens,model,leadTurns,wakes,stopBlocks}.status/reason`. Emit COUNTED only when scope.complete; leave optional usage components null with `unavailable`.
- Keep `windowTurns`/`observedLeadRequests` (deduped API responses) distinct from `leadTurns`/`nativeTurnCountWindow` (unique `task_started`): Lane52 evidence has 99 responses versus 1 lead turn.
