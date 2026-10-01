VERDICT: PASS

Source SHA: 44b6c7359c42d95a406c46e451bfba68b4ec3090 (Round 4 artifact; Round 3 was 0830d78dfe13571a80ef125a841689120e5fbefa; Round 2 was 4f4f6e34e17b5d4684decb128f0abd7da464b7b2; Round 1 was a6feb3a3499c9e451c3c29ef71ff7dc64b42a615; base was 0c926057a948c4365cf92d82d8fb584cbcc77dcd)
Scope: scripts/work-record.mjs and its test; scripts/continuation.mjs; scripts/collect-from-origin.mjs and its test; scripts/collect-status.mjs and its test; docs/work-record.md; docs/census.md.

Cause: `Date.parse` accepts the Log token shape but returns NaN for `not-a-date`; `Math.max(NaN, now - 600000)` is NaN, making the stale lower-bound comparison false.
Discriminating check: R3's named-mutex gate, `node --test scripts/work-record.test.mjs scripts/continuation.test.mjs scripts/collect-from-origin.test.mjs scripts/collect-status.test.mjs`, exited 0. It ran 294 tests: 294 pass, 0 fail. Raw output: `reports/L23-round3-gate.log`.
Fix location: `closeRecord` rejects a non-finite final Log timestamp before separate monotonic and wall-clock comparisons; its regression proves byte preservation for both a stale and a current `--at`.
Simplification: no new module or runner was introduced; the filtering stays at collector branch selection and status rendering derives from the existing row data.

Round 1 failures (no rerun was performed in that round):
- `buildStatusMd: header carries fetch: failed only on failure; attention first, then formatTable's table`
- `status.json shape: generatedAt/host/repo/fetch/main/rows/summary/changeKey/announced`
- `change key different: exactly one call, kind RESULT, --no-type present`
- `accepted-without-check: every record already in this repo's docs/work/ is grandfathered (zero hits)`; it lists five `wr-2026-09-27-*` records.

Migration debt: five existing records remain invalid under the strict close receipt rule: `wr-2026-09-27-collect-status`, `wr-2026-09-27-delete-deny`, `wr-2026-09-27-knowledge-counted`, `wr-2026-09-27-measure-truth`, and `wr-2026-09-27-pickup-complete`. They are documented in `docs/work-record.md` and were not edited.

Research (R3): added and ran exactly one narrow regression named `R3 repro: malformed final Log timestamp lets a stale close write` before the fix. It passed (one test, 328 ms), proving that the stale close wrote. The raw receipt is `reports/L23-r3-repro.log`. The separate comparisons in the fix are the discriminating result: malformed final logs now refuse before `writeFileSync`, and the focused gate verifies both stale and current byte-preserving refusals.

Round 4: the deterministic saved smoke identified the legend placement only; no research was needed. `buildStatusMd` now writes the legend immediately after the `branch ... lane` table header while keeping attention before the table. The named-mutex `node --test scripts/collect-status.test.mjs` gate exited 0: 25 pass, 0 fail. Raw output: `reports/L23-round4-gate.log`.
