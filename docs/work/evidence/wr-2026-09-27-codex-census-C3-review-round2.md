VERDICT: NEEDS_FIXES

Exact candidate: `2f8e8ac5625740d89ae41fd9307c713bb9d2ab2b`, inspected read-only in `codex-census-1-c3`. Date: September 27, 2026, America/New_York. Original report `C3-review.md` remains intact. All original minimal C3 reproductions are fixed; the required spec-identity predicate still needs the same validation now correctly applied to the build identity.

## R2-F1 — HIGH: matching unknown spec identities authenticate a spec slice

Location: `scripts/four-read.mjs:172` (the spec identity comparison; validated build identity helper at `:84`).

Observed: a valid 23-token Astra build census plus a 23-token Codex spec census with `lead.sessionId:"unknown"`, paired with record `Spec-session: unknown`, yields:

```text
46 tokens: build 23 (gpt-6-astra) + spec slice 23
```

There is no partial/unavailable qualification despite the spec's logical identity being unavailable. This is the same class of bypass repaired for the build census, but the spec path still uses equality alone.

Exact reproduction: import `computeTopTierTokens` from the candidate. Build census has `lead.host:"codex"`, `lead.sessionId:"lead-session"`, `coverageSupported:true`, `subagents.incomplete:false`, empty `lead.codex.unavailable`, `combined:{"gpt-6-astra":{derived_total_tokens:23}}`, and window `2026-09-01T00:05:00Z` to `2026-09-01T01:05:00Z`. Spec census has the same valid coverage/model total fields, but `lead.sessionId:"unknown"` and window `2026-08-31T23:00:00Z` to `2026-09-01T00:00:00Z`. Fields are `spec-session:"unknown"`, `spec-from:"2026-08-31T23:00:00Z"`. Pass opened `2026-09-01T00:00:00Z`, accepted `2026-09-02T00:00:00Z`, last accepted `2026-09-02T01:00:00Z`, as parsed milliseconds. No model-policy environment override. Actual result is the line above.

Cause: `computeTopTierTokens` validates Codex build identity through its caller, but the spec branch compares `censusLeadSessionId(specCensus)` with the raw record field without applying `isUsableCodexValue`/`codexIdentityReason`. Two identical unavailable placeholders therefore pass.

Discriminating check: matching valid spec identity must include the spec total; matching `unknown`, `unavailable`, blank or whitespace-only spec identities must retain the measured build subtotal and label the spec slice unavailable/partial. Missing or mismatched spec identity must also remain partial. Exercise both Codex and Claude build hosts consuming the invalid Codex spec, plus the existing valid mixed-host pairs. These are durable positive/negative regression pairs, not only checks that the new branch executes.

Fix location: reuse the current Codex identity helper for a Codex `specCensus` against `fields['spec-session']` before accepting the spec slice around lines 166–172. Return the existing partial-spec form with a spec-specific reason; do not discard independently known build tokens. Keep Claude-only behavior unchanged.

Simplification: apply the same already-tested semantic identity predicate to both Codex census roles. No new parsing, report field or discovery mechanism.

## Verified original repairs and positive/negative pairs

| Check | Exact candidate observation |
|---|---|
| Codex build 23 + Claude spec 120 | 143 tokens, spec slice 120. |
| Claude build 120 + Codex spec 23 | 143 tokens, spec slice 23. |
| Derived total 23 with null input/cache-write split | Number 1 retains 23; companion reports total 23 and breakdown unavailable. |
| Valid logical lead identity, arbitrary rollout basename | Two verified native API responses counted, lead-only label retained. |
| Missing or mismatched logical lead identity | Number 1 and companion unavailable; native gap evidence unavailable with the identity reason. |
| Missing requested record identity | Number 1 and companion unavailable (`no valid Lead-session:`). |
| Unknown, empty, whitespace-only timeline model | Native gaps and response companion unavailable, never verified zero. Independently valid model token total remains usable. |
| Empty response id / empty turn id / malformed timestamp | Timeline-derived metrics unavailable. |
| Unknown aggregate model | Number 1 and companion unavailable, rather than numeric zero. |
| Known Terra aggregate and timeline | Legitimate zero top-tier tokens/responses remains allowed. |

These were in-memory probes against the exact candidate, with file access limited to the committed record fixture and supplied census JSON. No raw native transcript was reread. The new source shares one validated timeline result for native message/gap consumers, removing the earlier duplicate predicate.

## Claude preservation and gate evidence

Integrator reported focused gate 68/68, exit 0. Reviewer did not rerun a test gate or full suite.

Independently compared candidate JSON and Markdown with source base `c25cc70cb180f22fc2f5ddb40a47be501cde9245`, using the same committed Claude lead/record/ledger fixtures and in-memory census. JSON and Markdown were byte-identical: 1,535 and 907 bytes respectively for those exact absolute fixture paths/options. The existing golden assertion and fixture inputs remain unchanged.

## Separate integration test/fixture sanity check

These observations concern integration files, not the C3 candidate or the verdict above. They require test correction, not weaker implementation behavior.

1. `scripts/build-census.codex.contract.test.mjs:159`, `:175`, `:184`, `:185` assert optional missing fields appear in `lead.codex.unavailable`. The repaired producer correctly preserves optional-field availability in each aggregate's `unavailable` array while a derived total remains fully usable. Global coverage reasons may therefore remain empty. Assert `combined[MODEL].unavailable` and field nullness instead, including serialized text/JSON, while retaining `coverageSupported:true` and the known derived total.
2. `scripts/build-census.codex.contract.test.mjs:206` combines model, timestamp and raw-field duplicate conflicts into one transcript, and line 218 expects a partial returned report. The reader currently fails visibly by throwing on the first lead conflict, which satisfies the pinned visible-failure contract and prevents subsequent cases from running. Split these into independent cases and assert the named rejection; separately test child conflict propagation to partial discovery if needed. Add the positive identical-repeat dedup pair.
3. The temporary-home injection, foreign-root exclusion fixture and pre-window `task_started` expectation are corrected in the inspected integration test. The native fixture test derives expected model totals, but its final integrated gate is still pending.
4. Inspected all three `scripts/build-census.fixtures/codex-native-sanitized/*.jsonl` files structurally, printing field paths/types and record counts only. Each has five rows: one `session_meta`, one `event_msg`, one `turn_context`, two `token_usage_record`. Leaf fields are timestamps, record/event types, logical/root/turn/response ids, model, thread source, spawn parent/depth/agent path/nickname, and numeric `usage`/turn/thread token counters. No prompt, content, tool argument/output, instruction, environment, or message-body fields were present. No private text was exposed by the inspection.

The separate C1 producer defects remain under repair and are not additional grounds for this C3 verdict. No source edits, candidate writes, cleanup/deletion, identity changes, denied commands or full gates occurred. Only this report was written.
