VERDICT: PASS

Source SHA: 4f4f6e34e17b5d4684decb128f0abd7da464b7b2 (Round 2 artifact; Round 1 was a6feb3a3499c9e451c3c29ef71ff7dc64b42a615; base was 0c926057a948c4365cf92d82d8fb584cbcc77dcd)
Scope: scripts/work-record.mjs and its test; scripts/continuation.mjs; scripts/collect-from-origin.mjs and its test; scripts/collect-status.mjs and its test; docs/work-record.md; docs/census.md.

Cause: The first scoped gate exposed stale compatibility assertions, not a defect in the closed validation or prefix contract.
Discriminating check: Round 2's named-mutex gate, `node --test scripts/work-record.test.mjs scripts/continuation.test.mjs scripts/collect-from-origin.test.mjs scripts/collect-status.test.mjs`, exited 0. It ran 293 tests: 293 pass, 0 fail. Raw output: `reports/L23-round2-gate.log`.
Fix location: `scripts/work-record.mjs` requires a zoned `--at` and defaults `--repo` to cwd; its tests preserve accepted-record grandfathering and independently reject malformed closed fixtures. `scripts/collect-status.mjs` renders the `lane` header, while its fixtures name build branches under the default filter.
Simplification: no new module or runner was introduced; the filtering stays at collector branch selection and status rendering derives from the existing row data.

Round 1 failures (no rerun was performed in that round):
- `buildStatusMd: header carries fetch: failed only on failure; attention first, then formatTable's table`
- `status.json shape: generatedAt/host/repo/fetch/main/rows/summary/changeKey/announced`
- `change key different: exactly one call, kind RESULT, --no-type present`
- `accepted-without-check: every record already in this repo's docs/work/ is grandfathered (zero hits)`; it lists five `wr-2026-09-27-*` records.

Migration debt: five existing records remain invalid under the strict close receipt rule: `wr-2026-09-27-collect-status`, `wr-2026-09-27-delete-deny`, `wr-2026-09-27-knowledge-counted`, `wr-2026-09-27-measure-truth`, and `wr-2026-09-27-pickup-complete`. They are documented in `docs/work-record.md` and were not edited.
