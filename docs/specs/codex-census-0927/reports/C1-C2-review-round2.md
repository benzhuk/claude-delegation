VERDICT: NEEDS_FIXES

Exact candidate: `b054493f4c27223baf201bdf2beffe8d84ba80da`; implementation commit `5dc4c36d39c490d4f45accb0a2459657349d85dc`. Reviewed read-only in `codex-census-1-c1` on September 27, 2026, America/New_York. Original review remains preserved at `docs/work/evidence/wr-2026-09-27-codex-census-C1-C2-review-round1.md`. This report does not supersede the historical findings or their original SHA.

All seven original minimal reproductions are repaired. The new response-timeline seam and required-field validation still have the defects below.

## R2-F1 — HIGH: malformed timestamps can disappear from a supposedly complete window

Locations: `scripts/build-census.mjs:494`, `:516`, `:532`.

Observed minimal reproduction: root metadata and Astra context at `2026-09-27T12:00:00Z`, then two distinct responses with the same normal 15-token usage: response `bad` at timestamp `bogus`, followed by response `good` at `2026-09-27T12:00:00Z`. Request `from:2026-09-27T11:00:00Z`, `to:2026-09-27T13:00:00Z`.

Actual: `coverageSupported:true`, `combined.gpt-6-astra.derived_total_tokens:15`, unavailable empty, response timeline contains only `good`, and `responseTimelineComplete:true`. The bad response's membership in the requested window is unknown, not established outside it. Its 15 tokens have been silently omitted from a complete-looking measure.

Run the same transcript without bounds: derived total is correctly 30, but the emitted timeline contains `timestamp:"bogus"` and still has `responseTimelineComplete:true`. A consumer must defensively reject it; the producer is violating the pinned seam itself.

Cause: unknown boundary timestamps are detected only by `!obj.timestamp`, whereas time-window filtering rejects `Date.parse` failures. Timeline completeness checks non-nullness instead of a valid timestamp. Those different predicates let malformed nonempty values escape the unavailable path.

Discriminating check: use missing, empty, malformed nonempty, and non-string timestamps, with and without a window, for both lead and child responses. Invalid timestamps must make timing evidence incomplete. If membership in a requested interval is unknown, coverage must be partial and combined null; independently established unwindowed usage may remain observed.

Fix location: normalize/validate response timestamps once before window membership and reuse the result at lines 494–517. A response with no valid timestamp cannot be silently classified out-of-window. Ensure child timestamp uncertainty reaches `runCodexCensus` through the existing unavailable path.

Simplification: one timestamp-validity predicate shared by membership, unavailable tracking and timeline completeness; no new parser or consumer fallback.

## R2-F2 — HIGH: unusable identities/models still satisfy native completeness

Locations: `scripts/build-census.mjs:475`, `:483`, `:493`, `:517`.

Observed: valid single-response transcript except `response_id:""` yields coverage true and a timeline row with empty responseId, `responseTimelineComplete:true`, and derived total 15. Empty identity cannot establish a verified response key and can collapse distinct unattributable responses.

Observed separately: context `model:"unknown"` with a normal response yields coverage true, `combined.unknown.derived_total_tokens:15`, and an empty coverage-unavailable list. Its timeline flag is false, demonstrating inconsistent notions of model availability inside the same report. A whitespace-only model is also accepted by the same predicate.

Cause: response and turn ids are type-checked without requiring usable values. Any truthy model string becomes a known model for coverage, while only the exact lowercase `unknown` is rejected later by timeline completeness.

Discriminating check: empty/whitespace response ids and turn ids must fail visibly or remain unavailable; session identity validation should apply the same nonempty rule. Literal `unknown`, blank and whitespace-only model values must make coverage partial and timeline incomplete. A valid known mid-tier model remains usable and must not be mislabeled unknown merely because it is not top-tier.

Fix location: validate required identity strings and normalize unknown/empty model values at the existing native-reader boundary, then share those validated values between coverage, deduplication and timeline construction. Do not rely on C3 rejecting contradictory completeness flags.

Simplification: small reusable semantic checks replace permissive truthiness/type predicates. Preserve current response maps and model attribution joins.

## R2-F3 — HIGH: unresolved selected-lead identity still exports a complete timeline

Locations: `scripts/build-census.mjs:847`, `:997`.

Observed: selected root file has response `r` with output 5. A same-id copied root file contains distinct response `other` with output 99. The repair correctly reports `conflicting duplicate logical identity`, coverage false and combined null. However it still exports the first file's response timeline with `responseTimelineComplete:true`.

The timeline is advertised as complete verified evidence for a logical lead whose duplicate identity is unresolved. C3 intentionally permits independently complete lead gap evidence when unrelated child discovery is incomplete, so it can still report a confident gap result from this ambiguous lead. Blanket-gating timelines on all child coverage would erase valid independent evidence and is not the required fix.

Cause: discovery identity conflicts do not reach the lead-only timeline completeness field; `runCodexCensus` copies the reader-local flag unchanged.

Discriminating check: conflicting selected-lead copies must make `responseTimelineComplete:false`; exact identical copies must preserve true and deduplicate. A child-only discovery failure may leave an otherwise verified lead timeline complete. This distinguishes actual lead ambiguity from unrelated aggregate incompleteness.

Fix location: return a specific selected-lead identity verification/conflict result from discovery and combine it with reader-local timeline completeness at lines 997–998. Keep observed rows if useful, with the flag explicitly false.

Simplification: propagate one lead-specific trust fact from the existing identity registry rather than building another transcript-validation path.

## Original findings rechecked

| Original | Exact delta observation |
|---|---|
| F1 cache availability/additivity | One missing cache field now yields derived 15, null exclusive/cache-write values and named unavailable fields; both cache fields missing plus one fully known response aggregate to derived 30 while null availability propagates. JSON preserves nulls; native text renders `unavailable`. Reasoning and raw-total absences are named. |
| F2 conflicting repeated response | Same response after Astra-to-Terra context switch now throws a named conflicting turn/usage/model/timestamp error. |
| F3 marker child exclusion | Marker only in lead now counts the eligible child: child turns 1, combined derived total 30. Lead-only timeline contains the lead response alone. |
| F4 implicit third UTC day | Third-day lead response now gives coverage false, combined null and `effective census window is outside default discovery horizon`. |
| F5 copied identity | Divergent selected-lead copy now makes aggregate coverage partial; identical copy remains complete, is explicitly excluded as exact duplicate, and counts once. Timeline consequence remains R2-F3 above. Source registry also permanently groups all copies before traversal, preventing third-copy resurrection. |
| F6 explicit missing directory | Explicit ENOENT now makes coverage false with named unavailable discovery-directory evidence. Default absent next-day folder remained normal in every minimal fixture. |
| F7 rejected ancestor | Wrong-root parent and its claimed descendant are both excluded; descendant is `unverified ancestry`, no child observed subtotal is counted. |

## Evidence and test coverage

Review probes imported the exact candidate and used only an in-memory filesystem: `Readable.from` streams, first-record/identity reads, and directory enumeration. Common home `C:/review-fixture/canonical`; lead `sessions/2026/09/27/lead.jsonl`; metadata id/session_id `root`; normal timestamp `2026-09-27T12:00:00Z`; context model `gpt-6-astra`; usage `{input_tokens:10,cached_input_tokens:2,cache_write_input_tokens:3,output_tokens:5}` with response id `r` and turn id `turn`. Child ancestry uses the immediate logical parent and common root namespace. No live native logs were read.

Integrator reports the exact candidate's focused gate 77/77, exit 0. No full suite or focused gate was rerun here. Independently rechecked Claude serialized output at the committed relative fixture paths: equal to golden, 1,889 bytes, SHA-256 `d367eb6abcb1b7a469b78a72a5c641d7b93ee65221f796c4459dbb8db0ec54d2`.

Regression coverage remains a separate integration gap: the repair did not add tests beyond the existing 77. The seven old reproductions and these new semantic/timeline cases need durable assertions in the authorized independent-test lane. This is distinct from the three reproduced implementation defects, and the review did not wait for the native fixture lane.

No candidate edits, source/test changes, full-suite execution, recursive deletion, identity changes or denied commands occurred. Only this report was written. C3's own repair and review remain separate.
