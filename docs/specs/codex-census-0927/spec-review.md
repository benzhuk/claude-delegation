VERDICT: BLOCKED pending measurement-contract rulings below; implementation may proceed once the lead records them.

Scope: lane seventeen spec judgment only, 2026-09-27 America/New_York. Canonical code inspected at c25cc70cb180f22fc2f5ddb40a47be501cde9245. No native-log survey, code changes, or test gates performed. Paths below are repository-relative; spec.md means this directory's spec.

1. Four-read cannot consume native Codex evidence unchanged (spec.md:15).
   scripts/four-read.mjs:310-312 identifies the session from the entire filename stem, incompatible with a native rollout filename carrying a timestamp prefix. The spec-census check repeats this assumption at :83-84.
   :49 defaults top-tier matching to fable,opus; an attributed GPT model yields a confident zero unless the environment is pinned. :269 ignores all Codex records, producing a false zero companion-message count after Number 1 is enabled.
   RULING NEEDED: authorize narrow Codex consumer adaptation with verified session identity and explicit model-tier policy, plus verified native message counting or unavailable. Preserve Claude behavior. Do not rename evidence/session IDs merely to satisfy basename checks.

2. Observed usage is not proof of complete build coverage (spec.md:6,12,15).
   scripts/build-census.mjs:404-409 deliberately declares coverage unsupported; :791-816 keeps observed sums separate and combined null. Existing token records alone do not establish that every response, child, or model is represented.
   scripts/four-read.mjs:63-89 checks neither coverageSupported nor subagents.incomplete. Simply populating combined can turn a known partial census into an apparently complete measurement.
   RULING NEEDED: define a positive, evidenced completeness condition and propagate failure into Number 1. Parse failures, missing model attribution, unverifiable child ancestry, unsupported depth and unreadable discovery cannot silently disappear into a full-build total. Observed subtotals may remain visible with explicit partial/unavailable status.

3. Discovery horizon and depth need explicit bounds (spec.md:11,23).
   A lead created September 26 with a build September 27 happens to fit two creation-date folders, but that is not a general build-window contract. A persistent lead or descendant created later falls outside it. The spec does not say whether recursion advances the searched day per child, how dates relate to UTC versus local time, or what depth 4 does.
   RULING NEEDED: bind discovery to the same canonical home and an explicit date horizon covering the claimed build; define depth relative to the selected lead, retain excluded depth-4 evidence as incomplete, and report the searched horizon. If retaining the two-day limit, declare unsupported windows unavailable. Pin lead/child file deduplication by logical identity as well as path aliases, including --tasks containing the lead.

4. Descendant identity is underdetermined (spec.md:6,11-12).
   The premise says session_id equals the parent; item 2 says it names the lead. These differ for grandchildren. scripts/build-census.mjs:371,378 currently binds usage session_id directly to the meta session_id, while the spec asks to key children by their own id.
   RULING NEEDED: use the scout's depth-2 evidence to pin meta.id, meta.session_id, parent_thread_id and token record session_id independently; validate the ancestry edge before accepting usage. Do not extrapolate direct-child identity semantics to descendants or merely relax the lead self-check.

5. Unavailable fields must have an aggregation contract (spec.md:12).
   scripts/build-census.mjs:295-303 currently turns missing cache counters into zero; four-read.mjs:48,57-60 adds fields with || 0. Null means zero to that consumer, and a literal unavailable string corrupts arithmetic.
   RULING NEEDED: distinguish unavailable breakdown fields from independently provable totals, preserve field availability through aggregation, and never let a required missing quantity become numeric zero. Pin whether Codex input includes cached input and prove the additive normalization. Missing total_tokens/reasoning fields alone need not invalidate a total derivable from verified input/output.

6. Turn and window definitions need evidence before claiming comparability (spec.md:14,16,23).
   Raw turn_context count may count repeated context snapshots. Existing native turn IDs are usage-bearing turns (build-census.mjs:388), not automatically all user turns. The prescribed trimmed fixtures cannot demonstrate a replacement turn event if its record type was discarded.
   RULING NEEDED: pin a proven turn key/event and deduplication, retain sanitized evidence for repeated contexts and zero-usage turns, or expose leadTurns as unavailable. For local windows require explicit offsets and pin inclusive endpoints, missing/invalid timestamp handling, and response deduplication across the boundary. Preserve the model context preceding --from; filtering it first would misattribute initial in-window usage.

7. Claude preservation is achievable but must constrain the consumer ruling too (spec.md:8,16).
   RULING NEEDED: capture the golden serialized output from the pinned base with identical fixture paths/options, then require byte identity. Keep Codex availability/identity/window changes host-scoped; do not globally change shared arithmetic, timestamp parsing, or default Claude output to solve the Codex case. Include four-read's Claude output if its scope is expanded under ruling 1.

Release decision: do not accept four available-looking lines as four established measurements. The first Codex-led record must either demonstrate complete attribution under these rulings or retain unavailable/partial values; a benchmark victory cannot be an acceptance requirement independent of the measured evidence.
