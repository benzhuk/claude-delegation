VERDICT: FAIL 14dc252e0e5932e6d7a410fc8e14bd2ff4167c16

# Lane 23 independent contract gate

- Integration merge head: `14dc252e0e5932e6d7a410fc8e14bd2ff4167c16`.
- Builder source SHA: `4f4f6e34e17b5d4684decb128f0abd7da464b7b2`; builder evidence head: `6b7a0c265c037dc0cc8b12b148aee66831699cef`.
- Command: `node --test scripts/record-closed-and-skip.contract.test.mjs` under the non-deleting `Global\claude-verify` mutex.
- Native exit: 1. Result: 3 pass, 3 fail, 0 skipped.

Failures retained in `L23-contract-gate.log` with immediate native exit in `L23-contract-gate.exit`:

1. Two close-CLI contract cases throw `TypeError: Cannot read properties of undefined (reading 'write')` in `acceptanceMain` at `scripts/work-record.mjs:1703` when the independent test supplies its IO shape.
2. The continuation all-status contract receives `INVALID_RECORD` for the generated snapshot where `OK` is expected.

No builder focused gate, full suite, source edit, independent-test edit, rerun, or acceptance measurement followed this failure.
