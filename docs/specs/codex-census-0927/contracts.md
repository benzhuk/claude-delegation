# Codex census pinned contract (t0)

This contract is additive and host-scoped. It preserves the serialized Claude result at the fixture paths and command recorded in `claude-golden-base.md`. It adds no store, hook, event type, or native-side mechanism.

## Existing report shape retained

`runCensus()` continues to return `lead`, `subagents`, `combined`, `marker`, `leadPath`, `tasksPaths`, and `defaultSubagentsDir`. The Claude values and `formatText`/`formatJson` output for `lead.jsonl` plus `tasks/` stay byte-identical to the golden base. `subagents.incomplete`, `unreadable`, `unreadableDirs`, and `perFile` remain the shared incomplete-data vocabulary.

## Codex host-scoped additions

For `lead.host === "codex"`, C1 adds only the metadata required to establish whether a complete census is available:

```text
lead.sessionId: string                    // session_meta.payload.id of the selected lead
lead.coverageSupported: boolean
lead.coverageReason: string | null
lead.codex: {
  discovery: {
    home: "canonical";
    horizonUtcDays: string[];              // lead file UTC day, then next UTC day
    candidates: number;
    malformedFiles: string[];
    unreadableFiles: string[];
    excluded: [{ file, reason }];          // unrelated, duplicate lead/path, depth > 3, or outside horizon
  };
  unavailable: string[];                   // non-empty when coverageSupported is false
}
subagents.perFile[]: { file, role, parentId, agentNickname, depth, turns, byModel, excludedByWindow }
```

`lead.sessionId` is logical identity, never a filename-derived substitute. `leadPath` remains the exact input path. C3 must use `lead.sessionId` for Codex session checks and must not rename a rollout file or require its basename to equal the session id.

## Completeness and accounting

`coverageSupported` is true only when the selected lead and every included descendant form a verified parent edge to that lead, share the lead's root `session_id` namespace, are within the reported two-day UTC horizon when found by default discovery, have depth at most 3 relative to the lead, have no unresolved duplicate identity, and have usable per-response `payload.usage` with known model attribution. Default discovery reads only the canonical Codex home. An explicit `--tasks` directory may add an otherwise eligible rollout file outside that home only after it passes the same ancestry and root-session-namespace checks; no other home is searched implicitly. Any malformed/unreadable candidate, missing or unverifiable ancestry edge, root-session mismatch, depth greater than 3, unknown required model, or candidate outside the stated default horizon remains named in the host-scoped metadata and makes complete coverage unavailable/partial.

Usage is summed only from each record's `payload.usage`, deduplicated by `(logical session_meta.payload.id, response_id)` so equal response ids in distinct children cannot collide. Cumulative counters are never summed. A selected child's logical census key is its `session_meta.payload.id`; after its ancestry edge is verified, every child usage record validates against that child's `session_meta.payload.session_id`, and that value must equal the selected lead's root session id, never `meta.id`. The observed depth-one and depth-two children have `usage.session_id == meta.session_id == lead session id`, so treating child `meta.id` as a usage session id is forbidden. `turn_context.payload.model` immediately preceding a usage record supplies its model; absent context yields `unknown`. A `task_started.turn_id` counts a lead turn only once per distinct id; raw `turn_context` counts are not turns. `--from` and `--to` accept offset-bearing timestamps, retain preceding model context, and apply inclusive endpoints with the existing Claude window semantics; Claude parsing does not change. Fixtures retain only `session_meta`, `turn_context`, `task_started` timestamp/type/turn_id, `token_usage_record`, and timestamps.

Missing optional raw fields remain `unavailable`, never numeric zero. An independently derived `input + output` total may remain known; cache inputs are not double-counted. `combined` becomes a Codex aggregate only when coverage is supported. Otherwise observed subtotals remain explicitly partial and C3 must produce an unavailable/partial Number 1 rather than a confident zero.

## Discovery and roles

Default discovery reads only the selected lead's UTC folder and its following UTC folder in the canonical home, records both date labels, accepts direct descendants and recursively verified descendants through relative depth 3, and keeps only logical identities once even if `--tasks` repeats a file or includes the lead. Each ancestry edge uses the child's `source.subagent.thread_spawn.parent_thread_id` against its immediate parent's logical `meta.id`; a common root session namespace is necessary but never substitutes for that edge. `--tasks` adds candidates and may name a verified rollout outside the canonical home; it does not replace default discovery or authorize a search of other homes. A session_meta without `source` is an unrelated candidate unless its verified parent edge says otherwise. A requested window outside the default horizon is partial/unavailable and visibly reported. `agent_path` basename maps `builder`, `reviewer`, `integrator`, or `runner`; another valid nickname is reported as an unmapped role.

## C3 consumer rule, pending scope authorization

If the C3 ruling authorizes `four-read`, it consumes `lead.sessionId`, `lead.coverageSupported`, `lead.codex.unavailable`, and `subagents.incomplete` without changing the Claude path. Astra is classified by the explicit configured top-tier policy; no default may render its spend as zero. Native top-tier message counting is either deduplicated from verified native response records or marked unavailable.
