VERDICT: PASS

# Continuation core independent-review repairs

Artifact: `b46a4ddb8469fd3e61442d8c41f71ffd3923c329`

Exact gate: `node scripts/run-tests.mjs scripts/continuation.test.mjs C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/continuation-independent.test.mjs`

Result at the committed artifact: 27 tests passed, 0 failed. This combines 19 durable source tests/subtests with the eight supplied independent adversarial cases.

Cause: the first implementation exposed a bespoke top-level bind marker, rejected unknown prompt identity before suspending prior authority, let `validateRecord` read evidence before confinement and size checks, ignored unreadable record-index entries, and dropped the normalized injected filesystem during nested selection.

Discriminating check: the supplied independent suite failed five cases at `9a6bec65e117679d7598213c5563acb2736d9422`; all eight independent cases and the expanded durable suite pass at `b46a4ddb8469fd3e61442d8c41f71ffd3923c329`. The durable tests additionally exercise missing event keys, unsupported new prompt profiles, descriptor-level oversized-evidence read counts, injected `openSync` denial through bind/account/Stop, and actual CLI marker output.

Fix location: `scripts/continuation.mjs` now emits `continuationBind:{requestId,epoch}`, invalidates armed state before prompt/start identity rejection, reads confined files through open/fstat/read with per-file and aggregate caps, supplies cached confined evidence to `validateRecord`, returns `INDEX_UNCERTAIN` for unreadable/non-file record candidates, and preserves normalized dependencies recursively. `scripts/continuation.test.mjs` contains the durable regressions.

Simplification: the repair keeps the original one-state-file, one-short-claim design. It adds no scheduler, ledger, provider call, timer, ownership inference, or host enable flag.

Limits: core tests establish source behavior only. Adapter composition, exact native event normalization, and live host qualification remain parent-owned. The core accepts any nonempty profile only when the adapter supplies the verified capability bit; no CLI option can grant that capability.
