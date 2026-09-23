# S recovery scout — verdict: full unattended owner recovery is a real external design boundary

0.17 provides conservative one-shot pickup and recovery; no safe independent source extension
is supported without defining owner liveness/rebinding authority. It intentionally avoids resend
after uncertain delivery and never clears owner Done.

- `skills/decisions/scripts/decisions-pickup.mjs:102-116`: per-page exclusive claim; failed
  cleanup stays visible and is never stale-broken.
- `:178-218,383-417`: capture/outcome integrity gates every dispatch; send crash or failed
  persistence goes through positive exact transport evidence.
- `:360-380,566-605`: SENDING MATCH records; absent/unreadable transport is UNKNOWN with no
  resend; conflict/corruption needs reconciliation; absent owner waits for explicit binding.
- `:431-447,555-564`: page/project collision and owner replacement are explicit manual handoff.
- `:713-755`: only RECORDED may be accounted; outcome needs owner attestation, fresh-page
  reconciliation, and every captured reference.
- `skills/multi/scripts/transport.mjs` supplies durable main-checkout routing used by pickup;
  it cannot prove that an owner session is live or authorize replacement.

Prospective disjoint ownership, if owner supplies a binding/recovery contract:
`skills/decisions/scripts/decisions-pickup.mjs`, its focused test, and `skills/decisions/SKILL.md`.
Do not alter transport/note-send: exact envelope evidence is the established side-effect seam.

Adversarial tests already cover crashes at capture/SENDING/RECORDED, unknown/conflicting
transport, altered capture bytes/round, concurrent claim, owner absence/rebind, page collision,
changed checked page, account prerequisite, and unchecked reset.

Fundamental blocker: an orphaned owner is not observable authority. Automatically selecting a
replacement or resending UNKNOWN would create a consequential duplicate/unauthorized action.

Next action: keep UNKNOWN/PENDING_MANUAL_HANDOFF visible and obtain an explicit owner-rebind
contract plus a falsifiable recovery test. Prediction: absent that contract, any "automatic"
recovery either blocks safely as today or violates the no-duplicate/no-new-authority rule.
