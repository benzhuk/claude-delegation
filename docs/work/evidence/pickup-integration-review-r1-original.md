The owner-mismatch path reports a false success. I checked the source only and ran no tests.

**VERDICT: NEEDS_FIXES** (candidate `e50ebaf39b7721d2701c652702cb673085496e50`)

## Finding 1: owner mismatch is reported as success (Medium-High, required fix)

The spec says owner mismatch must show up as "visible reconciliation/failure, never success" (spec:19).

- **Evidence:** When a receipt has a saved owner and the registered owner differs, `pickupOnce` writes `handoffStatus: 'PENDING_MANUAL_HANDOFF'` onto the receipt. It then returns `receiptStatus(handoff)` (`decisions-pickup.mjs:1032-1041`). `receiptStatus` sets `status` to `receipt.state` and does not set `manualReconciliationRequired` (`:738-748`). So a `RECORDED` round whose owner changed comes back as `{status:'RECORDED', receipt:{handoffStatus:'PENDING_MANUAL_HANDOFF'}}`. `registeredResultCode` (`:656-670`) then maps that to **`PICKUP_RECORDED`** on every pass while Done stays checked. `flush-last.json` records a fresh "recorded" annotation for a round that is actually waiting for manual handoff.
- **Cause:** The mapping only looks at top-level `status` and `manualReconciliationRequired`. The existing handoff path signals only through `receipt.handoffStatus`.
- **Why the tests pass:** All mapping tests pass made-up `{status}` objects through the `pickupOnce` stub (`decisions-pickup.test.mjs:289-322`, `registered-pickup.contract.test.mjs:483-494`). No test runs the real `pickupOnce` against a saved-owner receipt. The contract case `{status:'UNKNOWN', manualReconciliationRequired:true}` is a shape that real v2 code never returns.
- **Discriminating check:** Create a sealed v2 `RECORDED` receipt with `owner:'a'`, verified capture/pointer evidence and the same checked page digest. Register `owner:'b'` and use the real `pickupOnce` with the injected `readPage`. The result should be `{code:'PICKUP_RECONCILIATION_REQUIRED'}` and there should be zero sends. The current code returns `PICKUP_RECORDED`.
- **Fix location:** `decisions-pickup.mjs:707-708`. The code needs the selected entry, so the check goes in `runRegisteredPickup`:
  ```js
  const entry = entries[ordinal];
  const result = await runOne(entry, { ...deps, agentsHome: base, fsImpl, env, now: pickupNow });
  const handoff = result?.receipt?.handoffStatus === 'PENDING_MANUAL_HANDOFF'
    && result.receipt.owner !== entry.owner;
  return { code: handoff ? 'PICKUP_RECONCILIATION_REQUIRED' : registeredResultCode(result), ordinal };
  ```
  Also add the discriminating check above as a test. This changes no state, adds no reassignment and adds no cleanup. If the registration goes back to the saved owner, the normal code comes back.

## Finding 2: an old recorded round keeps reporting `PICKUP_RECORDED` (Low, doc wording only)

If Done stays checked and the digest is unchanged, a `RECORDED` receipt returns at `:1043-1044` on every pass. Each pass writes a newly timestamped `PICKUP_RECORDED`. `SKILL.md` says it "means the ASK was recorded and queued", which is still true of the receipt, but it reads like new work happened on that pass. Nothing is resent, so this is not an integrity problem. Suggested fix: add "(this round, possibly earlier)" to the SKILL.md line.

## Areas that held up

- **Old top-level-await cycle:** The load chain is `note-flush` → dynamic import of `decisions-pickup` → static import of `note-send` → back to `note-flush`. With `main().then(...)` at `note-flush.mjs:1266-1271`, `note-flush` finishes evaluating before the dynamic import resolves, so the old deadlock (exit 13) is gone. A real subprocess test exists (`contract.test:554-568`). Exit handling matches the old code: `main` returns 0 and the rejection branch sets 1. So the build adds the missing invocation rather than working around it with prompts.
- **Excluded paths:** `--help`, `--status`, `--dry-run`, `--to` and `--home`, including the `=` forms, all return before any registration probe (`:722`). A flush with `ok !== true` returns null. Imports and piggyback callers never reach `main`. Unconfigured means one `lstat` and nothing else (`:735-738`).
- **Switches before reads:** `ws-off` and `ws-off-decisions` are checked before the registration `lstat` (`:732-733`). They are checked again in `runRegisteredPickup:680` and `pickupOnce:848`. When disabled, the registration is only `lstat`ed and never read.
- **Alternate home:** A non-default `AGENTS_HOME`, or a `result.home` that doesn't match, gives `CONFIG_INVALID` with no import (`:745-747`). Comparison is case-insensitive on Windows.
- **All entries validated before selection:** `readRegistration` runs over every entry, including `registeredProject` binding, before `selectIndex` runs. Any throw makes the whole set invalid. Malformed types (arrays, numbers, null bytes) throw and land in the catch-all as `CONFIG_INVALID`. The reader is `lstat`ed, resolved with `realpath` and checked with `detectedGitRoot` on its real directory. Duplicates are caught on normalized page IDs and on case-folded canonical repo paths.
- **Selection:** `crypto.randomInt` with bounds checks; exactly one `pickupOnce` per pass.
- **Receipt states:** Legacy receipts carry `manualReconciliationRequired` → RECONCILIATION. CAPTURE_INTENT/ORPHAN, NEEDS_RECONCILIATION, PREPARED/SENDING and project mismatch → RECONCILIATION. `UNKNOWN` → FAILED, which the spec allows. Anything thrown, including a reader timeout or `INVALID_PAGE`, → FAILED. A held claim → `CLAIM_HELD`, returned before the page is read.
- **UNKNOWN never resent:** `:1043` returns without sending. `recoverSending` needs positive `MATCH` evidence and otherwise goes to `UNKNOWN`.
- **Privacy:** Summaries are rebuilt from allowlists (`safePickupSummary`, `safePickupAnnotation`). The result of `main` is thrown away and nothing goes to stderr. Reader stderr is piped by `spawnSync` (`:544`), not inherited. I found no path where canary text or error messages reach output.
- **Heartbeat race:** The pid/`at`/`timer_at` re-read comes right before `renameSync` (`note-flush.mjs:615-619`). A narrow cross-process check-then-rename race remains. The parent clarification (spec:31) explicitly accepts that, and since the annotation authorizes nothing, it's not material. The same goes for the carry-forward read/write gap at `:666-670`, which can drop or revive one annotation. No fix recommended; adding a lock would be out of scope.
- **Timeouts:** 15 s is the only cancellation, on the reader. 30 s is only an admission cutoff measured around `runNoteFlush`, and the SKILL/spec wording matches that. Normal stdout is written before pickup, and exit is unchanged.

## Summary fields

**Cause:** The status mapping ignores the existing `receipt.handoffStatus` signal.

**Discriminating check:** Real `pickupOnce`, saved owner `a`, registered owner `b`, unchanged checked page → should be `PICKUP_RECONCILIATION_REQUIRED` with zero sends.

**Fix location:** `skills/decisions/scripts/decisions-pickup.mjs:707-708` (patch above), plus one real-`pickupOnce` test in `registered-pickup.contract.test.mjs`.

**Simplification:** `switchActive` in `note-flush.mjs:689-693` duplicates `switchPresent` in decisions-pickup. It's kept local so the importer is never loaded on the disabled path, so leave it. `annotatePickup`'s pre-check at `:707-708` duplicates the check inside `writeHeartbeatFile`, but it harmlessly avoids a temp write. No engine or scheduler was added; reusing `pickupOnce`, the claims and the heartbeat is the minimal design.