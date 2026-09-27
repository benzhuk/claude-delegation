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

`coverageSupported` is true only when the selected lead and every included descendant are read from the canonical Codex home, form verified parent edges to that lead, are within the reported two-day UTC horizon, have depth at most 3 relative to the lead, have no unresolved duplicate identity, and have usable per-response `payload.usage` with known model attribution. Any malformed/unreadable candidate, missing or unverifiable ancestry edge, depth greater than 3, unknown required model, or candidate outside the stated horizon remains named in the host-scoped metadata and makes complete coverage unavailable/partial.

Usage is summed only from each record's `payload.usage`, deduplicated by that file's verified `(session_id, response_id)`. Cumulative counters are never summed. A selected child's logical census key is its `session_meta.payload.id`; after its ancestry edge is verified, every child usage record validates against that child's `session_meta.payload.session_id`, never against `meta.id`. The observed direct children have `usage.session_id == meta.session_id == lead session id`, so treating child `meta.id` as a usage session id is forbidden. `turn_context.payload.model` immediately preceding a usage record supplies its model; absent context yields `unknown`. A `task_started.turn_id` counts a lead turn only once per distinct id; raw `turn_context` counts are not turns. Fixtures retain only `session_meta`, `turn_context`, `task_started` timestamp/type/turn_id, `token_usage_record`, and timestamps.

Missing optional raw fields remain `unavailable`, never numeric zero. An independently derived `input + output` total may remain known; cache inputs are not double-counted. `combined` becomes a Codex aggregate only when coverage is supported. Otherwise observed subtotals remain explicitly partial and C3 must produce an unavailable/partial Number 1 rather than a confident zero.

## Discovery and roles

Discovery reads the selected lead's UTC folder and its following UTC folder in the canonical home, records both date labels, accepts direct descendants and recursively verified descendants through relative depth 3, and keeps only logical identities once even if `--tasks` repeats a file or includes the lead. `--tasks` adds candidates; it does not replace default discovery. A session_meta without `source` is an unrelated candidate unless its verified parent edge says otherwise. `agent_path` basename maps `builder`, `reviewer`, `integrator`, or `runner`; another valid nickname is reported as an unmapped role.

## C3 consumer rule, pending scope authorization

If the C3 ruling authorizes `four-read`, it consumes `lead.sessionId`, `lead.coverageSupported`, `lead.codex.unavailable`, and `subagents.incomplete` without changing the Claude path. Astra is classified by the explicit configured top-tier policy; no default may render its spend as zero. Native top-tier message counting is either deduplicated from verified native response records or marked unavailable.
