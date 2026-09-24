VERDICT: APPROVE 7f2d984bda74bf474db8eb71904b76edc48835dd

I only read source files. I ran no tests and did not check the manifest file hashes. I couldn't find the builder-r2 and contract-r2 reports: `builder-r2.md`, `contract-r2.md` and their `-report.md` versions don't exist in the packet root. So nothing below relies on their pass claims.

**Changed owner now reports reconciliation.** When the registered owner differs from the saved owner, `pickupOnce` (`decisions-pickup.mjs:1038-1047`) writes `handoffStatus: 'PENDING_MANUAL_HANDOFF'` and returns `receiptStatus(handoff)`. The real v2 result keeps the marker inside the receipt: `{status:'RECORDED', receipt:{owner, handoffStatus, …}}` (`:748-754`). The new check at `:709-712` reads exactly that nested path, so a `RECORDED` round with a changed owner now maps to `PICKUP_RECONCILIATION_REQUIRED`. Nothing is resent, because the handoff branch returns before any dispatch call (`dispatchPrepared` or `recoverSending`).

**A restored owner isn't stuck on the old marker.** The marker stays in the saved receipt. When the saved owner is registered again, the handoff branch is skipped and `:1049-1050` returns the receipt with the old marker still on it. Because the new check also requires `receipt.owner !== entry.owner`, the result goes back to `PICKUP_RECORDED`.

**Negative cases:**
- **Owner format:** `readRegistration` requires `owner` and normalizes it with `validateSlug` (`:612`, `:618`). `pickupOnce` compares the same normalized value, so an entry with no owner, or a spelling mismatch, can't cause a wrong result.
- **Other states:** An `UNKNOWN` receipt with a changed owner now reports reconciliation instead of failed. Both are non-success. A changed digest reaches `changedReceipt` first, and Done unchecked returns `UNCHANGED` before the handoff check. Both behave as before.
- **New rounds:** A new round after accounting takes `options.owner`, so the owners match and the result can't be reconciliation by mistake.

**New test, checked for false passes:** `registered-pickup.contract.test.mjs:138-164` runs the real `pickupOnce`.
- The `registered()` helper passes only `agentsHome`, `env` and `selectIndex`, plus the injected `pickupOnce`. So the test's own `send` counter and `readPage` are the ones used, and the zero-resend check is real.
- The page stays the same across passes, so the handoff branch runs rather than the changed-digest branch.
- Against the old code the changed-owner step would return `PICKUP_RECORDED` and fail the test, so it tells the old and new code apart.
- The unit cases (`decisions-pickup.test.mjs:187-192`) match the fixture owner `decision-owner`.

**Scope:** The code change is limited to reading the result inside `runRegisteredPickup`. It adds no write, no state and no authority. Switches, the unconfigured path, imports and the alternate-home path come earlier in the code and are unchanged.

**Wording:** The SKILL.md text "for this round … possibly on an earlier pass" is accurate for a `RECORDED` receipt that gets reported again.

Cause: Before the fix, `registeredResultCode` only looked at top-level `status`. It never saw the handoff marker inside the receipt.

Discriminating check: Saved owner `owner-a`, registered owner `owner-b`, page unchanged → `PICKUP_RECONCILIATION_REQUIRED` with one send total. Switching back to `owner-a` → `PICKUP_RECORDED`, still one send (`contract.test:156-163`).

Fix location: `decisions-pickup.mjs:707-714`, `SKILL.md:97-99`, plus the tests mentioned above. Nothing more is needed.

Simplification: None needed. You could move the handoff check into `registeredResultCode(result, entry)` so that all code mapping lives in one place. That's optional and doesn't affect correctness.