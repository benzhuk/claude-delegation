VERDICT: NEEDS_FIXES

Reviewed-at: 2026-09-27T13:09:30Z
Reviewer: GPT-6-Astra
Candidate: f5d2c18626692d148741550499edb7b63e27a63f
Implementation merge: 0fc9405641c6be43762419c5518a504176b03246
Parents reviewed: ac67a1a04cd14f79d0764bc924652738a9fa9d93 and 78bf171d247352fbb43601dc48db5ba2f68df631

## HIGH — token-coverage failure bypasses native companion build-window validation

Location: `scripts/four-read.mjs:706`–707, with the coverage-first token path at `computeTopTierTokens`.

The reconciliation correctly preserves a independently verified lead response count when only whole-build token evidence is partial. However it treats the presence of any token coverage reason as permission to ignore every Number 1 unavailable result, including missing or invalid record/census windows.

Observed against the exact candidate using in-memory record/census inputs and a filesystem canary:

1. Valid two-response Astra timeline and `subagents.incomplete:true`; remove the record's Opened field. Number 1 is `unavailable (no Opened: census window cannot be checked)`, Number 4 is unavailable, but the companion is `2 verified top-tier native API response(s) (lead only); tokens: unavailable (Codex census subagents are incomplete)`.
2. Same census; remove all accepted logs. Number 1 says the census window cannot be checked because there is no accepted Log entry, but the companion still reports two verified responses.
3. Record opens September 1 and accepts September 2; move the native census window and its two response timestamps to September 3, retaining child incompleteness. Number 1 reports the child coverage failure before reaching window checks, and the companion reports two verified responses from outside this build's interval.

Cause: line 707 only propagates `numberOneValue` when `tokenReason` is absent. Identity/window validity and token availability are independent dimensions. A token failure does not establish that the native timeline belongs to a valid build window, and can coexist with missing or contradictory window evidence.

Discriminating check: add a native table crossing valid/invalid window state with child-complete/child-partial coverage. Missing Opened, missing acceptance, record opened at acceptance, and census outside the permitted interval must make the lead-response companion unavailable even when token coverage is partial. Conversely valid matching identity/window plus child-only incompleteness must retain the two-response lead count, with tokens unavailable. A missing/partial spec slice must not erase an independently verified build-lead response count. Keep identity failures and malformed timelines unavailable too.

Fix location: provide one explicit native census/build-window validation result before the companion's token-availability branch, reusing the established build-window rules and tolerance. Require valid record times and a compatible census interval regardless of coverage status. Do not infer window validity from a formatted Number 1 string whose earlier coverage check may have short-circuited. Preserve separate token-availability reporting and do not reinstate a blanket Number 1 completeness requirement.

Simplification: share a small identity/window validity result with the native companion; retain existing C1 timeline validation and no raw transcript parser. No production work-record change is needed.

## Confirmed preserved behavior

- Native filesystem canary recorded zero forbidden reads or directory enumerations. The host guard precedes Claude tool-event scanning and subagent discovery. All native probes read only the supplied record/census.
- Native Number 4 begins `stalled classification unavailable`, including zero-long-gap cases; observed API response gaps are explicitly a heuristic rather than stall attribution. This prevents the new main leading-integer stall consumer from interpreting them as verified stalls.
- Main's exported positional span/agent-result arguments remain intact; native mode is an additional final argument.
- Valid native derived total 23 with unavailable cache/input split remains measured, with explicit unavailable breakdown.
- Valid child-partial coverage retains the independent lead gap and two-response observation while labeling tokens unavailable. Invalid timeline timestamps make timeline-derived evidence unavailable.
- Existing Codex logical lead/spec identity validation, per-host model policy, derived totals and mixed-host spec code remain present. Their approved regression tests were retained.
- Independently compared the candidate to `78bf171` for the default Claude fixture, lane10 and lane16 using the same census/input paths. Both JSON and Markdown were byte-identical in all three cases. Default output retains one stalled gap plus zero waiting. Lane10 retains one 216.8-minute agent stall. Lane16 retains zero stalled and one 41.8-minute waiting interval.
- `git diff ac67a1a HEAD -- scripts/build-census.mjs` was empty. `git diff 78bf171 HEAD -- scripts/work-record.mjs` was empty. The proposal did not alter either previously approved C1 production code or incoming main's acceptance implementation.

The prepared tests meaningfully cover filesystem isolation, valid child-partial preservation, native noninteger/heuristic wording and malformed timelines, but do not cross token failure with invalid build-window evidence. Add that regression rather than weakening the valid child-partial case.

Integrator reports exact candidate focused gate 422/422, exit 0. That green result does not cover the independently reproduced failure above. Reviewer ran no test gate or full suite, made no candidate changes, and requested no gate rerun. An accidentally created empty-purpose placeholder outside the candidate was immediately reverted; the only retained review artifact is this report.
