VERDICT: APPROVE 90ee83d04405c3e97d7de1b52f86acc04716ed8a

# P2 delta re-review: Codex census reader, final source

Final source: 90ee83d04405c3e97d7de1b52f86acc04716ed8a in C:/Users/benzh/orca/workspaces/claude-delegation/astra-codex-parity. The P2 fix commit is c136c5ca9e4658d756e4871b5ccf510f5afc0caa.
Scope: P2 only. This is a delta re-review of my findings on 97541f0 (M1-M4, LOW5-7) plus the P2 adjudication in docs/specs/codex-parity-1/contracts.md. The seam review is not in this file; I did not do it.
Method: the checkout was read-only (HEAD = 90ee83d; its uncommitted changes are only the root's docs/work records and untracked evidence). I extracted it with `git archive` into a scratch copy and ran every probe from scratch scripts against the exported functions. I read no private transcripts. I read `docs/work/evidence/codex-parity-usage-schema.md`, which contains metadata only.

## Gate (rerun on the scratch copy of 90ee83d)

- `node scripts/run-tests.mjs scripts/build-census.test.mjs`: 65/65 pass.
- `node scripts/run-tests.mjs scripts/work-record.test.mjs`: 119/119 pass.
- That is 184/184, which matches the builder's claim.

## Prior findings: all resolved

- **M1 (HIGH, window with no records became COUNTED 0): RESOLVED.**
  - Change: `windowTokenRecordCount` at `scripts/build-census.mjs:321,362`, and `coverageSupported:false` with a reason at 377-380.
  - Probe W (marker after the last record) gives `VERDICT: UNSUPPORTED Codex complete census (no token_usage_record rows ... inside the marker window ...)`.
  - `observedLeadTokens`, `observedLeadRequests` and `observedNativeTurnCount` all read `unknown`, and the rate is `n/a`.
  - JSON: `windowTurns`, `turnsPerHour`, `observedLead*` and `observedNativeTurnCountWindow` are all `null`.
  - `isCensusFile` returns false, so no COUNTED zero exists anywhere.
- **M2 (MEDIUM, conflicting duplicate response_id): RESOLVED.**
  - Change: a fingerprint map at `:355-360`.
  - Probe F (same id, different turn) throws `repeats a response_id with conflicting turn or usage`.
  - Probe F3 (same id, different usage, on either side of the marker) also throws.
  - Probe F2 (identical repeat) de-duplicates to 1, which the adjudication allows.
- **M3 (MEDIUM, unsupported path printed zeros): RESOLVED.**
  - For Codex, `totalTurns`, `windowTurns`, `nativeTurnCount*` and `turnsPerHour` are `null` in JSON (`:727-749`). The body renders them as `unsupported`, `unknown` or `n/a` (`:845-854`).
  - Probe A (no token records) prints no bold numeric value and no `: 0 (` line.
- **M4 (MEDIUM, partial coverage presented as complete): RESOLVED by adjudication.**
  - The contracts.md adjudication says per-response records establish observed usage but not completeness, forbids invented correlation rules, and says ordinary coexisting `token_count` events must not be rejected. That is a legitimate answer to the judgment question I raised.
  - The code follows it. Every Codex report has `coverageSupported:false`. Line 1 is always `VERDICT: UNSUPPORTED Codex complete census`. `leadTokens` says unsupported. The measured number appears only as `observedLeadTokens ... (verified deduplicated per-response usage; incomplete coverage)`.
  - Probe M (a token_count followed by one token record) is now diagnostic-only and refused by work-record.
  - The schema evidence supports this. It shows 2,463 `token_count` events against 2,146 `token_usage_record` rows, so complete coverage really is unproven.
- **LOW5 (marker in session_meta): RESOLVED.**
  - `:335` excludes `session_meta` and `turn_context` from the marker search.
  - Probe H (marker only in session_meta): `main` throws `--marker text not found`.
  - Probe H2 (marker in turn_context, then again in a real user message): the window starts at the real message.
- **LOW6 (turn_context/compacted-only truncation): RESOLVED.** `:306` routes these to Codex. Probe B3 throws `Codex session_meta was not found`.
- **LOW7 (docs): RESOLVED.**
  - `docs/census.md` now says every Codex report is `VERDICT: UNSUPPORTED`, that `accept --census` refuses it, and that `--no-census` must carry the limits.
  - The `codexSubagents` line now says Codex `--tasks` is rejected.

## Adjudication and contract check

- The adjudication resolves a contradiction inside the P2 contract. "Flat summary lines copied by work-record" cannot hold alongside "work-record must refuse this report as a complete census". It resolves it in the fail-closed direction: refuse the report and accept with `--no-census`, attaching the observations separately.
- That matches the spec's own acceptance line (`--no-census "<reason>"` when P2 cannot make a Codex census possible) and the goal that unknown is never shown as a number. I agree with it.
- Header recognition: a Codex report is refused (`CENSUS_HEADER_RE = /^VERDICT: COUNTED\b/`, work-record.mjs:566, probe result false). A Claude report is still recognised: probe line 1 is `VERDICT: COUNTED 1 lead requests (leadTurns 1), 0 subagent files, leadLastMessageAt: ...`.

## Upstream repairs preserved

- The dedicated `leadLastMessageAt` stays on line 1 for both hosts: build-census.test.mjs:140 for Codex, :355 and :470 for Claude, and work-record.mjs:630 reads only that field.
- Unreadable-directory handling and INCOMPLETE are intact: `buildDirSpecs`/`collectTaskFiles` return `unreadableDirs` (`:458-511,617-620,755`), and tests :948-981 pass.
- A Codex lead skips the default subagents glob and rejects `--tasks` before any directory stat, so it never hits the upstream directory-error path and never masks it.

## Remaining observations (LOW, non-blocking)

The report is always UNSUPPORTED and refused, so these can only affect diagnostics. None blocks acceptance.

1. **LOW: the reason text wrongly mentions a marker when no marker was given.**
   - Where: `scripts/build-census.mjs:378-380`. With no `--marker` and zero token records (probe A), the reason reads "... inside the marker window ...".
   - Fix: replace
     ```js
         coverageReason: windowTokenRecordCount === 0
           ? 'no token_usage_record rows with per-response usage inside the marker window; complete coverage is not established'
           : 'complete per-build response coverage is not established',
     ```
     with
     ```js
         coverageReason: tokenRecordCount === 0
           ? 'no token_usage_record rows with per-response usage; complete coverage is not established'
           : windowTokenRecordCount === 0
             ? 'no token_usage_record rows with per-response usage inside the marker window; complete coverage is not established'
             : 'complete per-build response coverage is not established',
     ```
   - Test :140 asserts only the `^VERDICT: UNSUPPORTED .*leadLastMessageAt` shape, so it keeps passing.
2. **LOW: Codex JSON still carries unlabelled numeric aggregates.**
   - Where: `:743-744,764`. `lead.totalByModel`, `lead.windowByModel` and top-level `combined` are numeric (probes SUP-normal and M), and `{}` in the window-empty case. Yet the text says by-model is unsupported and that no combined-spend table is emitted.
   - `coverageSupported:false` sits next to them and nothing in the repo consumes this JSON, but the adjudication asks for "nulls for unsupported JSON values".
   - Fix: for `leadHost === 'codex'`, emit `combined: null`, and either set `totalByModel`/`windowByModel` to null or rename them `observedTotalByModel`/`observedWindowByModel`.
3. **LOW: the flat-line name does not match the JSON field.**
   - Where: `:819`. `- observedNativeTurnCount:` prints the window value (`observedNativeTurnCountWindow`), while the JSON field `observedNativeTurnCount` is the whole-file value (probe H2: flat line 1, JSON 2).
   - Fix: change the label to `- observedNativeTurnCountWindow:`, or print `report.lead.observedNativeTurnCount`.
4. **LOW: a marker in a `response_item` instruction prelude can still open the window.**
   - Where: `:335`. Probe H3 used a synthetic user message wrapping instructions. It opens the window at the prelude, so earlier responses count as observed build usage.
   - The adjudication says "Metadata preludes do not establish build-marker boundaries". `session_meta`/`turn_context` are covered, but I did not verify whether Codex 0.155.1 writes instruction preludes as `response_item`. The evidence doc doesn't say.
   - Fix, only if a metadata-only probe shows such rows: exclude them from `containsMarkerDeep`.
5. **LOW (nit): dead code.** `:876-881` (the Codex branch after the lead tables) can no longer run, because `coverageSupported` is always false and the function returns at :856-862. Delete it, or keep it on purpose for a future supported-coverage path.
6. **Process note (not a code defect):** `docs/work/evidence/codex-parity-usage-schema.md` is untracked in the checkout. The root owns attaching or committing it with the `--no-census` acceptance.

## Limits

- I did not do the seam review (P1/P3 joins, docs vs P1, package inclusion). The packet asks for that in a separate, fresh file.
- Codex schema facts (for example, whether `output_tokens` includes `reasoning_output_tokens`) rest on the builder's metadata evidence file, which I did not independently re-probe (no private reads). Since every Codex figure is now labelled observed and incomplete, this cannot inflate a claimed census.
- I did not run the full sealed suite; the packet says it runs separately.

Cause: The Codex reader treated coverage as file-level or implied by any record's presence, so window-, response- and segment-level gaps came out as counted numbers.
Discriminating check: Scratch probes W, F, F2, F3, A, H, H2, H3, B3 and M against the 90ee83d exports. Every one now shows UNSUPPORTED, unknown or null, or throws. Only the LOW diagnostics above remain.
Fix location: scripts/build-census.mjs `censusCodexLeadFile` (:311-382), the `runCensus` return (:724-749) and `formatText` (:785-862), at c136c5c.
Simplification: A single `coverageSupported:false` for Codex, plus separately named `observed*` fields, replaces the per-case support heuristics I proposed. No correlation rules were invented.
