VERDICT: PASS

Artifact: `1332e5d96810e2917e3c78fac132fb9b71105079` on `benzhuk/astra-pickup-integration`, based on `ef7ead8e4b39c1dac601285a909923403e84d3f0`.

Cause: the one-shot pickup already owned page privacy, claims, receipts and exact-send recovery, but no finite host registration or existing unattended CLI called it. The normal note flusher was the existing host cadence; adding a new scheduler or receipt engine would duplicate mechanisms.

Discriminating check: a sealed real `node skills/multi/scripts/note-flush.mjs --json` process with a conventional registration and external reader must exit 0, load the real sibling module without top-level-await deadlock/exit13, create one receipt, and record `PICKUP_RECORDED`. The smoke passed with one receipt and no stderr. With no registration, the post-flush seam performs one `lstat`, imports nothing, writes no pickup timestamp, and leaves normal output/heartbeat unchanged.

Fix location:
- `skills/decisions/scripts/decisions-pickup.mjs`: validates the whole version-1 registration before selection, rejects duplicate pages/repos and unsafe readers, randomly selects one stable canonical entry, calls existing `pickupOnce`, and emits only `{code,ordinal}`.
- `skills/multi/scripts/note-flush.mjs`: admits pickup only from successful standalone normal CLI runs, dynamically imports after peer flushing, preserves safe heartbeat annotations, rejects alternate homes, and invokes `main()` through a promise continuation rather than top-level await.
- `skills/decisions/SKILL.md`: documents opt-in, identity/authority limits, random single-entry cadence, and recorded/delivered/acted-on distinctions.
- Existing focused tests cover registration validation, safe mapping, exclusions, budgets, home/switch boundaries, annotation privacy/preservation/supersession, and unchanged pickup/flush behavior.

Simplification: one conventional private file and two exports reuse `pickupOnce`, `runNoteSend`, page claims, receipts, outbox delivery and the existing timer. There is no sweep CLI, new schedule, cursor, state engine, transport, lock, stale-claim cleanup, owner discovery, or automatic reassignment.

Safe status mapping:
- missing direct registration -> `PICKUP_UNCONFIGURED` (post-flush returns `null` and writes no annotation)
- off switch / pickup `DISABLED` -> `PICKUP_DISABLED`
- malformed/unsafe registration or alternate home -> `PICKUP_CONFIG_INVALID`
- `UNCHANGED`, `NO_ACTION`, `IDLE`, `ACCOUNTED` -> `PICKUP_NO_ACTION`
- `RECORDED` -> `PICKUP_RECORDED`
- `WAITING_OWNER` -> `PICKUP_PENDING_OWNER`
- `INVALID`, `NEEDS_RECONCILIATION`, `PENDING_MANUAL_HANDOFF`, `ORPHAN_CAPTURE`, `CAPTURE_INTENT`, `PREPARED`, `SENDING`, or any result marked `manualReconciliationRequired` (including legacy) -> `PICKUP_RECONCILIATION_REQUIRED`
- exclusive-claim `PickupError` -> `PICKUP_CLAIM_HELD`
- `UNKNOWN`, any unknown future state, reader/send/selection exception, or unknown imported summary -> `PICKUP_FAILED`
- elapsed normal flush >=30,000 ms -> `PICKUP_SKIPPED_BUDGET`

Validation:
- Sealed focused gate: 154/154 passed, 0 failed, 6.21 s. Log: `C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/0924-pickup-targeted-tests-final.log`.
- Real sealed subprocess smoke: exit 0, no signal, empty stderr, `PICKUP_RECORDED`, ordinal 0, one receipt. Fixture/log emitter: `C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/0924-pickup-real-cli-smoke.mjs`; observed fixture was under the system temp directory and used no provider/auth/network.
- `node --check` passed for both changed `.mjs` implementations.
- `git diff --check` passed.
- Working tree clean after commit.
- No full suite run; parent owns the independent contract and integration gates.

Limits and contract qualification:
- The 30-second threshold is admission only. Reader has its existing 15-second bound; Git/filesystem/ledger work is not hard bounded.
- The Windows launcher is asynchronous. No scheduler serialization claim is made; existing page and outbox claims protect their respective records.
- Heartbeat annotation is best-effort diagnostics. It captures pid/at/timer_at, prepares a temporary file, rechecks immediately before atomic rename, and skips after an observed superseding heartbeat. Per clarification `f22296e`, this is not filesystem CAS and retains the narrow cross-process check/rename race. No authority, delivery proof, selection, or acceptance depends on it.
- Registration records the current recipient but does not grant authority. `PICKUP_RECORDED` proves ledger/wake queuing; later normal flush delivery and explicit owner accounting remain separate.
