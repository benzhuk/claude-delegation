# C3 main reconciliation proposal

## Pinned inputs

- C3/C1 integration base: `ac67a1a04cd14f79d0764bc924652738a9fa9d93`
- Main source: `78bf171d247352fbb43601dc48db5ba2f68df631`
- Reconciliation merge: `0fc9405641c6be43762419c5518a504176b03246`
- Proposal branch: `build/codex-census-1-c3`

## Resolution

The merge preserves main's Claude R6/R7 `Agent`/`Task`/`Workflow` span and subagent-stall
implementation. Native Codex uses only C1's verified response timeline for its lead gap
measure; it never reads the rollout or derives a Claude `subagents/` path.

Native response silence is labeled as a heuristic. Number 4 begins with `stalled
classification unavailable` so the measured native response-gap count cannot be parsed as
a verified stall count. A zero native gap count therefore remains a measured response-gap
result without claiming zero lead or child stalls. An unavailable or malformed timeline
keeps both native gaps and the native lead-response companion unavailable.

Whole-build token coverage still obeys `coverageSupported` and `subagents.incomplete`.
When child discovery alone is incomplete, the independently complete lead response
timeline continues to support lead gaps and the lead-only response count; that companion's
token suffix carries the coverage failure instead of presenting a whole-build total.

## Regression coverage prepared

`scripts/four-read.test.mjs` now pins:

- a filesystem canary that fails if native Codex reads anything beyond the record, census,
  and ledger inputs, including any rollout or derived subagent directory;
- positive and zero native response-gap cases that lead with unavailable stall
  classification;
- preservation of a valid lead timeline and lead-only response count when child coverage
  is incomplete; and
- unavailable native gap/count behavior for incomplete or malformed timelines.

Main's existing Claude fixture goldens remain unchanged: lane 10 retains one 216.8-minute
agent stall, and lane 16 retains zero stalled gaps plus one 41.8-minute
waiting-on-agents interval.

Per the integration assignment, no test command or gate was run in this lane. The
integrator owns all execution gates. No broader code seam is required; the native output
shape avoids the existing leading-integer acceptance policy without changing
`work-record.mjs`.
