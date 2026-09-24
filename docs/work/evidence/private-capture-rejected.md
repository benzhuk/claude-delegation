VERDICT: NEEDS_FIXES 89870ba1ada12fe206eadc8bdb01fd397e288885

Independent source and adverse-path review — September 23, 2026 (America/New_York).
Integration snapshot 51049f812965cd449222f6c5224354641835ad36 is also blocked: `git diff 89870ba..51049f8 -- skills/decisions` is empty. No source edits, live private state, provider calls, network calls, or full-suite run. All probes used disposable synthetic fixtures, makeTempHome({gitIdentity:false}), and mocked page/send/git dependencies.

## Required fixes

1. Private capture parser errors disclose private bytes in status and recovery diagnostics.

Source: skills/decisions/scripts/decisions-pickup.mjs:153-154, 326-329, 732-739; legacy capture verification at 366-367 has the same unsafe forwarding pattern. JSON.parse errors quote input fragments. writeCaptureExclusive embeds readError.message; verifyOnePrivateCapture returns error.message. CAPTURE_INTENT recovery embeds the former in reconciliationReason, saves it in the receipt, and returns it. runCli serializes these returned objects unchanged.

Independent reproduction:
- Admit a valid synthetic checked page through pickupOnce, with mocked successful send.
- Overwrite its private capture file with `PVT_X9 private capture payload that became malformed`.
- status reports NEEDS_RECONCILIATION but evidenceIntegrity.capture.error equals `Unexpected token 'P', "PVT_X9 pri"... is not valid JSON`; JSON.stringify(statusResult) contains PVT_X9.
- Change only the synthetic receipt state to CAPTURE_INTENT and resume with the unchanged valid page and a send stub that must never run.
- Recovery returns NEEDS_RECONCILIATION; reconciliationReason contains the same snippet, and the saved receipt now contains PVT_X9. No send occurs.

This violates the explicit no-private-content-in-diagnostics boundary despite correctly stopping dispatch. Use fixed safe classifications for private capture JSON/read failures (including exclusive reuse and legacy capture verification); do not forward parser input or arbitrary error messages into status, reconciliationReason, or CLI errors. Retain safe context such as operation, classification, and opaque ref. Add tests that assert raw and base64 canaries absent from serialized status/CLI output and persisted receipt for malformed original, changed, and legacy evidence, plus intent reuse. The explicit successful `open` command remains the intended raw-output boundary.

2. Legacy ACCOUNTED evidence verification silently loses the accounting outcome check.

Source: verifyLegacyEvidence at 371-380 and early v1 return in verifyReceiptEvidence at 383. The old verifier at 3f4d213 checks accountingOutcome.path/digest and returns OUTCOME_MISSING or OUTCOME_TAMPERED. The new v1 verifier checks only capture files.

Independent reproduction:
- Convert a valid synthetic capture/receipt to the original v1 shape in its legacy repository capture path.
- Set receipt.state=ACCOUNTED and accountingOutcome={path:<missing fixture outcome.md>, digest:<64 zeroes>}.
- status returns status=ACCOUNTED, legacyLocation=LEGACY_REPO_CAPTURE, manualReconciliationRequired=true, but evidenceIntegrity.status=OK.

Preserving the saved legacy state and adding the manual flag is correct. Claiming integrity OK while skipping its previously required outcome evidence is a regression. Reuse a small common read-only outcome check for both versions; preserve the v1 receipt bytes and saved state while reporting OUTCOME_MISSING/OUTCOME_TAMPERED. Cover valid, missing, and digest-mismatched outcomes. No migration or resend is needed.

## Other reviewed behavior

The implementation otherwise follows the agreed architecture on source inspection: all three raw capture writers (new admission, intent reconstruction, changed snapshots) resolve into the existing private receipt store; the common resolver canonicalizes existing ancestors, rejects traversal/symlink escape and detected Git roots, and checks both project and transport checkout containment. Pointer serialization is an explicit allowlist and exact-byte verification precedes dispatch. Same-host open verifies capture identity/digest and does not fetch a page when evidence is missing. Changed checked bytes remain reconciliation-only. Fresh NO_ACTION admission occurs after active-round and accounted episode handling, so it cannot erase an admitted round. Comments remain actionable under existing item semantics.

Version separation is justified. The added private path resolver, second explicitly typed artifact, local open entrypoint, and legacy refusal/verifier fit the existing receipt state machine. There is no second work ledger, scheduler, or migration engine. Roughly +300 production lines alone do not justify an architectural rewrite. The duplicated evidence verification did, however, cause finding 2; a shared outcome verifier is a narrow simplification.

Builder's 43 focused passes are reported evidence, not a substitute for the independent failing probes above. Parent owns the full sealed gate. Source remained clean at review. Follow-up review should target the two repairs and exact integrated file identities/metadata; this snapshot is not approved for release.

## Reviewed file SHA-256

- skills/decisions/scripts/decisions-pickup.mjs: 16AE016B275B27B1181ADB3E48E0C88FFB4F95ECC9CA91FDAB5AEA5159B561C3
- skills/decisions/scripts/decisions-pickup.test.mjs: 22AA9CC5F7E5C2D4EAD1773BE42DB1955EDD9BB0B1A5290A77D6F72B92F78A2F
- skills/decisions/SKILL.md: 7C4A06E0B4A14B231C13161B104C905720DF43B6686A24FA211482CDB6B0D3AD
