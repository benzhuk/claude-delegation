VERDICT: NEEDS_FIXES

Reviewed candidate: `1be32d8aa9f90181024d9fa158793ea1daa549fd` in `codex-census-1-c1`, against source base `c25cc70cb180f22fc2f5ddb40a47be501cde9245` and the pinned C1+C2 contract. Review date: September 27, 2026, America/New_York. Candidate remained read-only. No source, tests, work records, or other documentation changed. No command was denied in this review. No full suite ran.

## Findings

### F1 — HIGH: missing cache fields inflate totals and become confident zero

Locations: `scripts/build-census.mjs:298`, `:312`, `:76`, `:820`, `:842`, `:1051`.

Observed: one response with native `input_tokens:10`, `cached_input_tokens:2`, absent `cache_write_input_tokens`, and `output_tokens:5` produces `coverageSupported:true`, `observedLeadTokens:17`, `combined.gpt-6-astra={input_tokens:10,cache_creation_input_tokens:0,cache_read_input_tokens:2,output_tokens:5}`, and `VERDICT: COUNTED`. The independently known total is 15. With both cache fields absent, both render as numeric zero, coverage remains true, and unavailable is empty. `reasoning_output_tokens` and raw `total_tokens` availability are discarded entirely.

Cause: `codexUsage` falls back to inclusive native input when either cache component is absent, then generic Claude aggregation converts null to zero and adds the remaining known cache component again. It has no channel for preserving raw optional-field availability.

Discriminating check: test each missing cache component separately and both together, including two responses of the same model where only one is missing a component. Native input plus output must stay 15 per response; absent breakdowns must remain unavailable through per-file/model/role/combined serialization. Also assert missing reasoning/raw-total fields are named unavailable even when the derived total is known.

Fix location: use the existing Codex reader and a small Codex-specific aggregate path at `runCodexCensus` (lines 820–846); leave Claude helpers and formatting unchanged. Preserve raw inclusive input and independently derived input-plus-output total. Produce the additive four-column split only when both cache components are known; otherwise represent the unsplittable input and missing components as unavailable. Do not feed inclusive input plus any cache component into the shared additive sum. Carry optional-field availability explicitly; its absence alone need not invalidate an independently established total.

Simplification: one normalization at the native-reader boundary and one availability-aware Codex accumulator, with existing response maps retained. No alternate transcript parser, discovery mechanism, or consumer redesign is needed.

### F2 — HIGH: response-id conflict detection allows spend to move between models

Location: `scripts/build-census.mjs:421`.

Observed: metadata, Astra context, response `r`, Terra context, identical response `r` produces `coverageSupported:true` and a combined aggregate containing only `gpt-5.6-terra`. All 15 native tokens move from Astra to Terra. The duplicate fingerprint contains turn id and normalized usage, but omits model, timestamp/window identity and discarded native usage fields.

Cause: last-line replacement is allowed after comparing an incomplete response identity fingerprint.

Discriminating check: repeat one logical response under a different known model with the same turn and usage; this must fail visibly or make coverage partial, never erase Astra attribution. Keep exact repeat dedup and same response id in different child identities working. Also exercise conflicting timestamp across a window and conflicting raw optional fields.

Fix location: include the attributed model and relevant native evidence in conflict validation at lines 418–425; define a deterministic policy for repeat timestamps across boundaries rather than silently moving a logical response.

Simplification: retain the existing per-logical-session response map, strengthening its conflict predicate instead of adding another dedup pass.

### F3 — HIGH: a lead marker silently removes eligible child usage

Location: `scripts/build-census.mjs:817`.

Observed: lead contains `event_msg` with `marker:"start-build"`, then a 15-token response. Verified child has its own 15-token response at the same timestamp, with no marker text. `runCensus({marker:"start-build"})` returns `coverageSupported:true`, one child with `turns:0`, and combined total 15 rather than 30. The child is reported window-excluded even though its timestamp is in the lead's build window.

Cause: the lead's literal marker is searched independently in each child. The round-three child-usability rule then correctly accepts usable whole-file child evidence, inadvertently allowing this incorrect empty window to look complete.

Discriminating check: put marker only in the lead; include child responses before, at and after its timestamp. Count at/after inclusively without requiring children to repeat lead prompt text. Preserve the legitimate complete case where a verified usable child has only responses outside the actual window.

Fix location: derive the shared build boundary once from `lead.windowStartAt` and apply timestamp bounds to child usage at lines 816–819, matching existing Claude marker semantics. Unknown child timestamps at a required boundary must remain explicit.

Simplification: resolve the marker once, then use the existing Codex time-window reader for all children.

### F4 — HIGH: an implicit window extending beyond discovery is falsely complete

Location: `scripts/build-census.mjs:839`.

Observed: lead metadata on September 27, native lead response on September 29, and an eligible child in `sessions/2026/09/29` yield `coverageSupported:true`, no children, and `VERDICT: COUNTED`. Discovery reports only September 27 and 28. The child's spend is silently absent.

Cause: horizon validation considers only explicit `opts.from` and `opts.to`, ignoring the effective interval when either boundary is implicit, including unwindowed and marker-only runs.

Discriminating check: unwindowed, marker-only and from-only runs whose effective end is on the third UTC day must be partial under the pinned two-day discovery limit. A bounded in-horizon slice of a longer lead must remain eligible when its actual requested coverage fits the horizon.

Fix location: compare the effective claimed census interval with the reported horizon at lines 839–847, not just option strings. Do not silently extend discovery beyond the contract.

Simplification: one effective-window calculation shared with child filtering and horizon validation.

### F5 — HIGH: conflicting copies of the selected lead identity are invisible

Locations: `scripts/build-census.mjs:747`, `:761`, `:787`.

Observed: selected lead has response `r` with output 5; another candidate file has the same logical root id but a different response with output 99. Coverage remains true. The copy is absent from exclusions, unavailable and child accounting. Only the selected lead's path is listed as `duplicate lead/path`.

Cause: the selected lead is removed before candidate identity checks; candidates sharing its id are skipped by `known.has(id)` both during selection and final exclusion reporting. Their consistency is never established. Separately, a third copy of any child id can re-enter `byId` after the first pair deletes that id.

Discriminating check: identical copied lead should be explicitly deduplicated; divergent content or metadata under the same lead id must remain an unresolved identity conflict and make coverage partial. Test two and three copies of a child identity, too; ordering must not resurrect conflicted evidence.

Fix location: register the selected lead in identity resolution before candidate processing and retain a set of permanently conflicted ids. Resolve verified exact copies or mark ambiguity visibly before ancestry traversal.

Simplification: one logical identity registry, including the lead, instead of separate identity bypasses in traversal.

### F6 — MEDIUM: missing explicit tasks directory becomes confident zero

Locations: `scripts/build-census.mjs:708`, `:729`.

Observed: pass `tasksDirs:["C:/review-fixture/missing"]`; injected filesystem returns `ENOENT`. Census reports complete coverage with zero children and no unavailable reason. A misspelled requested evidence directory is indistinguishable from no children.

Cause: default discovery's legitimate missing-directory tolerance is also applied to explicitly requested directories.

Discriminating check: missing default next-day folder may be normal; missing explicit tasks directory must fail visibly or mark partial and name the directory. Check ENOTDIR and EACCES as well.

Fix location: distinguish explicit directory reads at lines 708–729 and populate shared `unreadableDirs` or equivalent named host-scoped discovery evidence; do not suppress explicit ENOENT.

Simplification: a required/optional argument to the existing directory-list helper suffices.

### F7 — MEDIUM: rejected root-namespace parent can authenticate its descendants

Locations: `scripts/build-census.mjs:773`, `:763`.

Observed: child `bad-parent` points to root but declares `session_id:"foreign"`; grandchild points to `bad-parent` and declares root namespace. Parent is excluded for root mismatch, yet grandchild is counted in `perFile` with one observed response. Overall coverage is partial, so this does not create a complete combined total, but the observed subtotal includes evidence whose ancestry chain failed verification.

Cause: rejected candidates are inserted into the same `known` map used to authenticate eligible parents.

Discriminating check: a rejected parent must not make a descendant eligible. Descendants of that parent remain named unverified evidence. Valid depth-two root-namespace records must continue to count.

Fix location: separate visited/excluded identities from verified eligible ancestry at lines 756–789; only verified parent nodes may authenticate included children.

Simplification: a verified-parent map plus a visited/excluded set makes the trust distinction explicit.

## Validation and boundaries

- Exact candidate HEAD confirmed. Its only pre-existing untracked paths were builder gate/report artifacts.
- Read the integrator-owned round-three log and exit file: 77 tests passed, zero failed, exit 0. I did not rerun that gate or the full suite.
- Independently generated Claude output using the exact committed relative fixture paths and compared bytes to `claude-golden-base.md`: equal, 1,889 bytes, SHA-256 `d367eb6abcb1b7a469b78a72a5c641d7b93ee65221f796c4459dbb8db0ec54d2`.
- All observed findings above were reproduced by importing the exact candidate module and supplying an in-memory filesystem (`Readable.from` streams, synchronous metadata reads and directory enumeration). No live rollout or private transcript content was accessed.
- Common minimal fixture: `session_meta` root id/session_id `root`; timestamp `2026-09-27T12:00:00Z`; `turn_context.model="gpt-6-astra"`; `token_usage_record` root session, response `r`, turn `turn`, usage `{input_tokens:10,cached_input_tokens:2,cache_write_input_tokens:3,output_tokens:5}`. Canonical injected home is `C:/review-fixture/canonical`, lead path `sessions/2026/09/27/lead.jsonl`. Children have unique logical ids, root session namespace, and `source.subagent.thread_spawn.parent_thread_id` identifying the immediate parent. Apply each finding's specified mutation to reproduce its result.
- C2's paragraph is conditional about measured coverage and lane-fourteen enforcement; no C2-only defect found. C3/four-read is explicitly out of scope and is not a reason for this verdict.
- In-window coverage and whole-file child usability are distinct. Do not revert the valid round-three correction merely to hide F3: a usable verified child with zero responses inside a correctly calculated window can contribute zero without making coverage incomplete.

## Independent test defects, separate from implementation findings

The integration-only `scripts/build-census.codex.contract.test.mjs` does not pass its temporary `home` as `codexHome`. The candidate intentionally uses canonical-home discovery, so these tests otherwise enumerate the configured real canonical directory, not their own default-discovery fixtures. Correct the injection rather than change production discovery to follow arbitrary selected-lead homes.

Its first test expects coverage true while a foreign-parent candidate is present; the pinned contracts currently say an unverifiable ancestry edge makes coverage partial. Resolve this assertion against the contract explicitly. Foreign usage must never be counted regardless of that ruling.

Its fourth test expects `leadTurns:1`, but the only `task_started` is at 12:00:00.500Z and the requested window starts 12:05Z. The pinned windowed task-started definition yields zero. The pre-window context should still supply the response model, which is a separate assertion.

Its missing-optional-fields test combines unknown-model and over-depth failures and only checks that some unavailable reason exists; it does not detect absent-field serialization or the F1 arithmetic defect. Add isolated assertions.

Requested integrator execution of the unchanged independent contracts against a disposable exact-candidate setup; raw outcome belongs with integrator evidence. None of these test defects weakens the independently reproduced implementation findings.
