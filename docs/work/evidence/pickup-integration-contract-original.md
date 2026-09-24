VERDICT: READY — revised independent registered-pickup contract test is committed; the current targeted red is expected because both pinned public exports remain committed stubs.

Worktree: C:\Users\benzh\orca\workspaces\claude-delegation\astra-pickup-contract
Base inspected: ef7ead8e4b39c1dac601285a909923403e84d3f0
Test commit: 0c73a92892f7957ceb61b0c01fa9e8f765f6adc7
Owned file: skills/decisions/scripts/registered-pickup.contract.test.mjs

Behavioral discriminators covered:
- no registration and switches are inert before selection;
- malformed later entries prevent earlier entry work; duplicate normalized pages and project/page binding mismatch reject before pickup;
- one injected selection invokes exactly one entry; UNKNOWN is reconciliation-required; owner waiting/handoff, reconciliation, claim-held, no-action and recorded map to fixed summaries without canary detail;
- help/status/dry-run/targeted and --home split/equal forms are excluded; normal failure is inert; absent registration remains inert at the budget cutoff; registered elapsed >=30s returns PICKUP_SKIPPED_BUDGET; a bare eligible pass rejects a nondefault AGENTS_HOME rather than mixing homes;
- a pickup annotation preserves observed normal-flush accounting and declines an observed replacement heartbeat (a best-effort diagnostic check, not a cross-syscall CAS guarantee);
- a real sealed CLI subprocess uses its actual relative import graph, requires reader execution and exit 0, and rejects exit 13.

Checks: node --check exit 0; git diff --check exit 0. Targeted sealed contract run under C:\Users\benzh\AppData\Local\Temp\claude-verify.lock: 0 pass / 7 fail / exit 1. Six direct cases fail at REGISTERED_PICKUP_NOT_IMPLEMENTED from the two public stubs. The actual CLI exits 0 but sealed reader marker is absent: standalone post-flush invocation is not connected. Expected-red evidence only; source integration must rerun this exact test for a meaningful pass.

Coverage boundary: representative malformed/path cases are independent contract tests; detailed exhaustive oversize, symlink, reader-type and unreadable-filesystem permutations remain builder-owned regression coverage. No live Notion, send, registration, config, credential, or provider action occurred.

## Correction — 2026-09-24 America/New_York

Follow-up independent-test commit: 8f0f50dc75b38dbddf0fdba015a7f6509469f480. This does not amend delivered history. It derives ordinal 1 from canonical repo/page sorting rather than fixture creation paths; treats PENDING_MANUAL_HANDOFF as reconciliation; tests UNKNOWN only with its real manualReconciliationRequired shape; verifies an unrecognized return as FAILED; and supplies CLAIM_HELD as the existing thrown PickupError shape. 
ode --check and git diff --check both exited 0. No source edit or suite run occurred.

## Held-claim fixture correction — 2026-09-24 America/New_York

Follow-up commit: 7af55d6f8c7bd09c72a34d366374c0e23f00ca3a. The integrated 6/7 result isolated a test-fixture error: a generic injected PickupError maps to PICKUP_FAILED, unlike production's held-claim path. The contract test now creates the real sealed eceiptPaths(...).claim directory and invokes registered pickup without a pickupOnce override. It asserts PICKUP_CLAIM_HELD and that the sealed reader marker remains absent. 
ode --check and git diff --check exited 0; no source change or suite rerun was made.
