VERDICT: BLOCKED

Source SHA: a6feb3a3499c9e451c3c29ef71ff7dc64b42a615 (Round 1 artifact; base was 0c926057a948c4365cf92d82d8fb584cbcc77dcd)
Scope: scripts/work-record.mjs and its test; scripts/continuation.mjs; scripts/collect-from-origin.mjs and its test; scripts/collect-status.mjs and its test; docs/work-record.md; docs/census.md.

Cause: The first scoped gate exposed four compatibility assertions that its implementation changes intentionally affect: three collect-status tests still assume no default prefix/legend/skipped summary, and the repository-wide accepted-check fixture expects five pre-existing hand-closed records to be exempt from the new closed validation.
Discriminating check: one named-mutex gate, `node --test scripts/work-record.test.mjs scripts/continuation.test.mjs scripts/collect-from-origin.test.mjs scripts/collect-status.test.mjs`, exited 1. It ran 292 tests: 288 pass, 4 fail. Raw output: `reports/L23-gate.log`.
Fix location: pending root grant for a changed fix round; likely the affected existing assertions and the intended grandfathering policy for the five pre-existing closed records.
Simplification: no new module or runner was introduced; the filtering stays at collector branch selection and status rendering derives from the existing row data.

Failures (no rerun performed):
- `buildStatusMd: header carries fetch: failed only on failure; attention first, then formatTable's table`
- `status.json shape: generatedAt/host/repo/fetch/main/rows/summary/changeKey/announced`
- `change key different: exactly one call, kind RESULT, --no-type present`
- `accepted-without-check: every record already in this repo's docs/work/ is grandfathered (zero hits)`; it lists five `wr-2026-09-27-*` records.

Unknown: whether pre-existing closed records should be grandfathered despite the pinned requirement that a hand-edited `Status: closed` fail. This requires root ruling before a changed source round.
