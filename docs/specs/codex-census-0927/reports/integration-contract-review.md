VERDICT: FIXTURE_CONTRADICTION

Exact integrated artifact: `bc309e4a834eb0ad00d8a094c9593ca149ece72e`. Read-only adjudication, September 27, 2026, America/New_York. The producer correctly rejects the fixture's unverifiable parent edge; no producer change is justified.

Cause: `scripts/build-census.codex.contract.test.mjs:273` calls `meta('marker-child', ROOT, 1, 1)`. The helper at line 31 takes `(id, sessionId, parentId, depth, agentPath)`, so this writes numeric `parent_thread_id:1`. The selected lead's logical id is `root-session`, not 1. Root-session namespace alone is insufficient to establish parenthood under the pinned contract.

Discriminating check: small in-memory calls against the exact integrated module reproduced the two cases without running a test gate. Original parent `1` yields `coverageSupported:false`, reason `unverified or out-of-contract discovery candidate`, child exclusion `unverified ancestry`, no included children and combined null. Changing only parent to `root-session` yields coverage true, child turns 2, excludedByWindow 1, and combined Terra output 14 (derived total 44). This matches all existing marker assertions.

Fix location: change line 273 to `meta('marker-child', ROOT, ROOT, 1)`. Keep the expected complete coverage and marker-boundary assertions unchanged. The separate selected-root/unverifiable-parent test already covers the negative ancestry case.

Simplification: one fixture argument correction; no implementation workaround, relaxed ancestry rule or altered expected result.

Reviewed the preserved raw integration gate: 17/18 passing, sole failure at the marker test's coverage assertion line 279, exit 1. No gate rerun, source edit, fixture write, cleanup or denied command occurred. Only this report was written.
