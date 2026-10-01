VERDICT: NEEDS_FIXES

Candidate: `f52f04799e4f8e1a4d409070fc5e5b6ff3dd6a79`, inspected read-only in `codex-census-1-c3`. Comparison base: `c25cc70cb180f22fc2f5ddb40a47be501cde9245`. Review date: September 27, 2026, America/New_York. Scope: C3 consumer and tests, including the root-pinned `derived_total_tokens` and verified lead response timeline seam. The outstanding C1 repair is not a reason for this verdict.

## C3-F1 — HIGH: mixed-host spec-writing tokens silently become zero

Location: `scripts/four-read.mjs:158` (policy selected at `:148`).

Observed against the exact candidate, with `DELEGATION_TOP_TIER` unset in the isolated Node process:

- Complete Codex build census: Astra `derived_total_tokens:23`. Complete Claude spec census: Opus `input_tokens:100`, `output_tokens:20`, cache fields zero. Valid logical spec identity and spec interval. Actual: `23 tokens: build 23 (gpt-6-astra) + spec slice 0`. Expected: 143 tokens, with spec slice 120.
- Reverse hosts: Claude build 120 and Codex Astra spec 23. Actual: `120 tokens: build 120 (claude-opus-5) + spec slice 0`. Expected: 143 tokens, with spec slice 23.

Cause: `computeTopTierTokens` uses the build census's host-specific default model fragments for both the build and the spec census. Switching hosts changes the meaning of the spec evidence despite its own model attribution being complete.

Discriminating check: test Codex-build/Claude-spec and Claude-build/Codex-spec with no explicit override. Both must total 143 for the above inputs. Keep homogeneous Claude golden bytes unchanged and verify an explicit configured policy remains authoritative for both slices.

Fix location: select the spec policy using `topTierModels(specCensus)` when summing that census at line 158. Continue using each census's own accounting mode (`derived_total_tokens` for Codex, established additive fields for Claude).

Simplification: reuse the existing policy helper per census; no shared default expansion or cross-host transcript parsing is necessary.

## C3-F2 — HIGH: unknown model evidence becomes confident zero

Locations: `scripts/four-read.mjs:68`, `:90`, `:363`, `:368`.

Observed: start with the valid complete native census described below. Change both response timeline model values to literal `unknown`, while retaining `responseTimelineComplete:true`. Actual companion: `0 verified top-tier native API response(s) (lead only); tokens: total 23; breakdown unavailable (...)`. This asserts a verified zero despite unavailable model attribution.

Also replace `combined` with `{unknown:{derived_total_tokens:23}}`. Actual Number 1 begins `0 tokens: build 0 (no top-tier model matched)` and the companion reports `tokens: total 0; cache-read 0, cache-write 0, input 0, output 0`. The unrelated missing-spec warning does not expose that the build's own classification is unknown.

Cause: aggregate validation checks only the numeric derived total; both duplicated timeline validators accept any string, including empty and `unknown`. Model matching then treats unavailable attribution as an ordinary known non-top-tier model. A producer's true completeness flags override contradictory required fields.

Discriminating check: with true completeness flags, test `unknown`, empty, and whitespace-only model names in aggregates and timeline rows; also empty required response/turn ids. Unknown aggregate attribution must make Number 1 unavailable/partial. Unknown timeline model attribution must make the native message companion unavailable, not zero. A known mid-tier model with a complete valid timeline must still legitimately count zero top-tier responses. Missing or invalid timestamp already becomes unavailable and must remain so.

Fix location: strengthen Codex aggregate and timeline semantic validation at lines 68–96 and 357–370 before tier filtering. Require usable nonempty identities/model values and reject explicit unknown model sentinels. Consume one validated timeline result for both native gaps and message counts so the predicates cannot drift. Do not reject a valid derived total merely because cache/raw optional fields are absent.

Simplification: one consumer-side Codex timeline validator, one aggregate validator, and existing model matching. No raw rollout reader or new inference mechanism.

## C3-F3 — HIGH: absent native logical identity bypasses session verification

Locations: `scripts/four-read.mjs:78`, `:399`, `:414`.

Observed: remove only `lead.sessionId` from the valid native census while the record still has `Lead-session: lead-session`. Actual Number 1 still reports build 23; the companion reports two verified top-tier native responses; native gaps remain measured. The arbitrary rollout filename does not establish the requested session.

Cause: identity checking tests a mismatch only when `leadFileId` is truthy. A missing native identity is therefore treated as a successful match. The Number 1 guard also skips a missing record/CLI identity because it requires `leadSessionId` to be truthy.

Discriminating check: absent, empty or invalid native `lead.sessionId` must make identity-dependent Codex metrics unavailable with a named reason. Test absent record/CLI identity too. A nonempty logical id matching the record must work despite an unrelated timestamp-prefixed rollout basename. A mismatched logical id must remain unavailable. Preserve Claude's existing path unchanged.

Fix location: require valid matching nonempty native logical and requested identities in the Codex branch around lines 398–416. Gate Number 1, its native companion and gap evidence consistently; hours derived solely from record timestamps and independently supported rework/ledger evidence need not be discarded.

Simplification: a single Codex identity validation result feeds existing metric guards; never infer identity from a Codex filename.

## Reproduction setup

All observations used imports from the exact candidate and in-memory JSON census inputs. `buildFourRead` received a minimal `fsImpl.readFileSync` returning the committed `scripts/fixtures/four-read/record.md` for the record and serialized candidate-shaped census for the census. Other reads threw, proving the Codex path did not reread raw rollouts. No fixture or candidate file was written.

Baseline native census:

```json
{
  "leadPath": "rollout-arbitrary.jsonl",
  "lead": {
    "host": "codex", "sessionId": "lead-session", "coverageSupported": true,
    "windowStartAt": "2026-09-01T00:05:00Z", "windowEndAt": "2026-09-01T01:05:00Z",
    "codex": {
      "unavailable": [], "responseTimelineComplete": true,
      "responseTimeline": [
        {"responseId":"r1","turnId":"t1","timestamp":"2026-09-01T00:15:00Z","model":"gpt-6-astra"},
        {"responseId":"r2","turnId":"t1","timestamp":"2026-09-01T01:00:00Z","model":"gpt-6-astra"}
      ]
    }
  },
  "subagents": {"incomplete":false},
  "combined": {"gpt-6-astra":{"derived_total_tokens":23,"input_tokens":null,"cache_creation_input_tokens":null,"cache_read_input_tokens":3,"output_tokens":11}}
}
```

For F1, `computeTopTierTokens` was also called directly with the committed record's parsed fields, Opened `2026-09-01T00:00:00Z`, first accepted `2026-09-02T00:00:00Z`, last accepted `2026-09-02T01:00:00Z`. Spec identity is `fixture-spec-session-id`; spec start/end are `2026-08-31T23:00:00Z` / `2026-09-01T00:00:00Z`. Claude spec identity comes from `fixture-spec-session-id.jsonl`; Codex spec identity comes from `lead.sessionId`. Both mixed-host results above are otherwise contract-valid.

## Verified behavior and limits

- Exact HEAD confirmed. Integrator-owned round-two focused log reports 65/65 passing. No gate or full suite rerun by reviewer.
- The baseline census above correctly reports 23 native tokens while its companion says breakdown unavailable. Keep this behavior: known `derived_total_tokens` remains usable despite absent optional cache breakdown.
- `coverageSupported:false` correctly makes Number 1 and its token/message companion unavailable. Native gap observations can remain available independently when the lead-only timeline is complete; discovery incompleteness alone need not erase that independent lead evidence.
- An invalid response timestamp correctly makes native gap and message evidence unavailable. `responseTimelineComplete:false` is covered by the existing focused assertion and must remain unavailable.
- Native responses are explicitly labeled API response units and lead-only in the companion. Gap values are native response gaps, not proof of lost work. No new rework inference was introduced; missing git evidence remains `unavailable (no range)` while existing reaccept logs remain visible.
- Independently compared candidate JSON and Markdown with the base implementation loaded read-only from `git show c25cc70:...`, using the same committed Claude lead, record and ledger fixtures and an in-memory census. Both were byte-identical: JSON 1,535 bytes and Markdown 907 bytes for those exact paths/options. The unchanged golden assertion is `formatJson/formatMarkdown: pin exact golden content for the fixture build, not just self-equality (MINOR 6)` at `scripts/four-read.test.mjs:646`.
- No source edits, fixture writes, cleanup, identity changes, native log reads, full-suite execution, or denied commands occurred. The initial integration-path brief lookup was absent; the existing candidate-path `briefs/C3.md` was then read normally.

These findings concern the C3 consumer itself and do not depend on the pending C1 repair. Scope remains the two owned script files; no work-record or shared architecture changes are needed.
