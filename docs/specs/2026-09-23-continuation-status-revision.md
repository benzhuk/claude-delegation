# Expose the current evidence revision through the public status command

Actual native Opus useful review of aa42a11 bound successfully, wrote a real report and then could not account: both direct status calls returned active/epoch/attempted/emitted/accountedRevision but no selected revision. Writing the attached report changed the selection revision, making the earlier bind result stale. The model correctly refused guessed/private-state substitution. The public contract in continue/SKILL.md promises status supplies the current selected revision; the core implementation omits it. This is a source defect, not another fixture failure.

## Bounded repair

High-tier integrity builder owns `scripts/continuation.mjs` and `scripts/continuation.test.mjs` only. Reuse the existing bounded selection reader and validation/hashing logic. For a current bound active status, return the actual currently selected revision when that snapshot is valid. Expose unknown selection explicitly when records/evidence cannot be validated or read; never reuse a stale bind/account revision as current. Preserve the existing lifecycle status and native epoch semantics, and retain safe status behavior for unbound, pending, stopped, malformed and unknown state. Choose the smallest clear JSON extension; no new command, cache, ledger or caller-supplied revision lookup.

Status remains read-only: no activation, rearm, attempt reservation, account mutation, cursor movement or authority grant. Snapshot races are resolved by the existing account command's epoch/revision check; the status observation does not authorize an old asynchronous command against a new episode. Do not reveal raw private evidence or exception content in diagnostics.

## Acceptance

The meaningful regression invokes the public command on a valid active binding, changes an attached evidence file, queries status, observes a different current revision, and successfully accounts that exact new revision with the current epoch. The old revision must be rejected. Test unavailable/malformed evidence as explicit unknown/no usable revision, and verify status leaves state/evidence bytes untouched and unbound/stopped/pending behavior safe. Run focused existing continuation tests with actual exit/output, then independent high-tier exact-artifact review. Root runs the final sealed integration gate after all source is stable.

The native review evidence is under the temporary `native-instruction-delta-review-aa42a11` fixture. Its unchanged status JSON is preserved by the native worker. A same-session instruction-fix delta review can continue in parallel; it must not account using a private snapshot helper. Once this core repair is reviewed, qualify the changed public command on useful native work through its real output.

Prediction: changing attached task evidence no longer strands an otherwise valid native reviewer between delivery and exact-revision accounting; malformed evidence still cannot become success. The repair improves one observed lifecycle gap, not general model diligence or macro delivery speed.
