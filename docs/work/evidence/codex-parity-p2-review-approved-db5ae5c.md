VERDICT: APPROVE db5ae5c714861648f6ce1481eefae230c94e26ff

# P2 narrow delta re-review: 90ee83d..db5ae5c

Final source: db5ae5c714861648f6ce1481eefae230c94e26ff in C:/Users/benzh/orca/workspaces/claude-delegation/astra-codex-parity (HEAD = db5ae5c).
Previous verdict: APPROVE on 90ee83d, with five LOW diagnostics.
Scope: P2 only. This file replaces the 90ee83d version.
Method: the checkout was read-only. I extracted it with `git archive db5ae5c` into scratch and ran all probes from scratch scripts. I read no private transcripts.

## No feature change outside the P2 polish

`git log 90ee83d..db5ae5c` lists four commits: 2a3ed24, f0f32e9, 72bcc3a and the merge db5ae5c. `git diff --stat` shows these source-level changes:

- `scripts/build-census.mjs` (+13/-9) and `scripts/build-census.test.mjs`: the P2 polish, 72bcc3a. Covered below.
- `hooks/multi-codex-hook.mjs` (from f0f32e9): the diff is at lines 139-142 and changes only comment lines. The `withBudget(..., 500)` call and the advisory wiring are byte-identical, so behaviour does not change. The new comment is a more accurate account of the budget: synchronous reads are not preempted.
- `hooks/multi-codex-hook.test.mjs`: test-only.
- `docs/census.md`: +2 lines. They say the marker is a substring match and does not prove a build boundary.
- `docs/work/**`: evidence and record metadata only, which the root owns.

Nothing else changed.

## The polish is correct

Every probe below was run on the db5ae5c copy.

- **Null aggregates in JSON.**
  - For a Codex lead, `lead.totalByModel`, `lead.windowByModel` and top-level `combined` are `null` (`scripts/build-census.mjs:745-746,768`). Observations moved to separately named `observedTotalByModel`/`observedWindowByModel` (`:747-748`).
  - The probes cover a normal session, an empty window, no token records, an identical duplicate, a marker only in metadata, a marker in turn_context, an instruction prelude and a mixed schema. In every one, JSON `totalByModel`, `windowByModel` and `combined` are `null`, and so are `totalTurns`, `windowTurns`, `turnsPerHour` and `nativeTurnCount`.
  - The Claude path keeps its numeric aggregates.
- **Null aggregates in Markdown.**
  - The Codex report returns before any lead, subagent or combined table (`:857-863`), so the `Object.keys(report.combined)`/`lead.*ByModel` loops at `:872,878,913` never see null.
  - The removed branch (old `:876-881`) could not run. With it gone, an unsupported Codex report cannot reach those tables.
  - The flat `by-model` line reads `unsupported (<reason>)`, and all unknown counts render as `unsupported`, `unknown` or `n/a`. The only bold numbers left are the explicitly labelled "Observed native turn ids".
- **Precise empty reason.** `:378-382` now has three cases:
  - no records: `no token_usage_record rows with per-response usage; ...` (probe A, without a marker);
  - empty window: `... inside the marker window; ...` (probes W and H);
  - otherwise: `complete per-build response coverage is not established`.
- **Window label.** The flat line is now `- observedNativeTurnCountWindow:` and prints the window value (`:823`), so it matches the JSON field of the same name (probe H2: window 1, whole-file `observedNativeTurnCount` 2).
- **Never shown as a complete census.**
  - Line 1 is `VERDICT: UNSUPPORTED Codex complete census (...)` for every Codex probe.
  - `leadTokens` is always `unsupported (...)`.
  - The numbers appear only under `observed*` names, with "incomplete coverage" or "not complete lead turns" attached.
  - Earlier fixes still hold. A conflicting duplicate response_id throws (probes F, F3). A turn_context/compacted-only truncation throws (B3). A marker found only in metadata throws `--marker text not found` (NF).
- **Work-record refusal.**
  - `isCensusFile` returns false for every Codex output (`^VERDICT: COUNTED\b`, work-record.mjs:566).
  - `loadCensus` (work-record.mjs:703-710) calls it first and throws `census-missing`, so `accept --census <codex report>` is refused and only `--no-census "<reason>"` can accept the record. The test "acceptRecord: a --census file lacking the recognised header refuses with census-missing" passes.
  - A Claude report is still recognised (`VERDICT: COUNTED 1 lead requests (leadTurns 1), 0 subagent files, leadLastMessageAt: ...`).

## Tests, run by name on the db5ae5c copy

- `node scripts/run-tests.mjs scripts/build-census.test.mjs`: 65/65 pass.
- `node scripts/run-tests.mjs scripts/work-record.test.mjs`: 119/119 pass.

## Status of the earlier LOW items

- Resolved:
  - LOW1: the reason no longer mentions a marker when none was given.
  - LOW2: JSON aggregates are null, with the observations under `observed*`.
  - LOW3: the flat-line label matches the JSON field.
  - LOW5: the dead branch is removed.
- Open by design, LOW4 (a marker inside a `response_item` instruction prelude): probe H3 still opens the window at the prelude. The new docs sentence says the marker does not prove a build boundary. The report is always UNSUPPORTED and refused, so this can only shift the labelled observed diagnostics.
- Non-blocking.

## Findings

None that block acceptance.

## Limits

- The seam review is not covered here.
- I did not run the full sealed suite; it runs separately.
- The Codex schema facts rest on the builder's metadata-only evidence, which I did not re-probe.

Cause: A Codex report exposed unlabelled numeric aggregates and imprecise reasons next to `coverageSupported:false`.
Discriminating check: Scratch probes against the db5ae5c exports. Codex JSON has totalByModel, windowByModel and combined all null, line 1 is UNSUPPORTED, `isCensusFile` returns false, and the named census (65) and work-record (119) suites pass.
Fix location: scripts/build-census.mjs:378-382, 745-748, 768 and 823, with the dead branch removed after 878 (commit 72bcc3a).
Simplification: One `codex ? null : x` rule for aggregates, with observed values under `observed*` names, replaces per-field special cases.
