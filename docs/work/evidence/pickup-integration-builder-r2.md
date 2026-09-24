VERDICT: PASS

Artifact: `c6a1dba89037971ad33212766ec7075ca7422e35`, a separate delta on top of delivered candidate `1332e5d96810e2917e3c78fac132fb9b71105079`.

Cause: the registered wrapper mapped only the top-level pickup status. A real saved-owner mismatch preserves the receipt state as `RECORDED` and signals the required manual handoff in `result.receipt.handoffStatus`, so the wrapper falsely emitted `PICKUP_RECORDED`.

Discriminating check: for selected registered owner `decision-owner`, a pickup result shaped like the real state machine — top-level `RECORDED`, saved receipt owner `former-owner`, and `handoffStatus:PENDING_MANUAL_HANDOFF` — now returns `PICKUP_RECONCILIATION_REQUIRED`. The same handoff marker with the selected owner unchanged remains `PICKUP_RECORDED`; the wrapper does not invent a reassignment. Independent Terra owns the sealed real-receipt regression.

Fix location: `runRegisteredPickup` retains the selected canonical entry, then checks the existing receipt handoff signal and compares the saved owner with that entry before applying the ordinary status map. No receipt, owner, claim, or dispatch transition changed. `skills/decisions/SKILL.md` now says a recorded ASK may have been recorded on an earlier pass.

Simplification: the fix reads the existing state-machine signal. It adds no status field, reassignment flow, receipt write, resend, cleanup, scheduler, or recovery mechanism.

Validation:
- Existing focused pickup/flush gate: 154/154 passed, 0 failed. Log: `C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/0924-pickup-targeted-tests-r2.log`.
- `node --check skills/decisions/scripts/decisions-pickup.mjs`: passed.
- `git diff --check`: passed.
- Worktree clean after commit.
- No full suite; parent owns independent contract and integration gates.
