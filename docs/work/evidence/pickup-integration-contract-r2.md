VERDICT: READY — owner-handoff regression is committed as a real sealed receipt lifecycle test.

Author-corrected formatting: this report replaces an earlier copy whose PowerShell interpolation rendered literal backticks incorrectly. The test, source, probe outcome, and commit are unchanged.

Commit: cbf9db41173d22a35f16b2b910f7f8df2b04c9a4
Owned file: skills/decisions/scripts/registered-pickup.contract.test.mjs

Test expectation:

1. Real `pickupOnce` records a valid checked-page round for owner-a, with capture, pointer, receipt, and exactly one sealed send.
2. Registration changes only to owner-b while bytes remain identical. `runRegisteredPickup` must return `{code:'PICKUP_RECONCILIATION_REQUIRED', ordinal:0}` and send count remains one.
3. Restoring owner-a must return `{code:'PICKUP_RECORDED', ordinal:0}` without a resend; a persisted handoff marker cannot turn a matching saved owner into a permanent false reconciliation.

Actual frozen-candidate discriminator: an archived copy of `e50ebaf39b7721d2701c652702cb673085496e50` executed the same sealed real-receipt sequence with exit 0 and emitted `first=RECORDED`, `selected={code:PICKUP_RECORDED,ordinal:0}`, and `sends=1`. That is the reviewed false green: no duplicate send, but owner mismatch was presented as success.

Probe: `C:\Users\benzh\AppData\Local\Temp\astra-followthrough-0923\0924-pickup-handoff-probe-e50.mjs`

The current integration source separately returned reconciliation in the same probe. Root’s integrated 8/8 run is the acceptance gate.

Checks on the committed delta: `node --check skills/decisions/scripts/registered-pickup.contract.test.mjs` exit 0; `git diff --check` exit 0. No production source, live Notion, transport, registration, credentials, or provider was touched.

Cause: mapping examined top-level receipt state but not nested `receipt.handoffStatus` after the real owner-mismatch path.

Discriminating check: real `RECORDED` receipt owner-a, registered owner-b, unchanged bytes, zero additional sends.

Fix location: builder-owned `skills/decisions/scripts/decisions-pickup.mjs` registered-result mapping.

Simplification: reuse existing receipt, capture, pointer, and `pickupOnce`; no separate handoff state fixture or transport engine.
