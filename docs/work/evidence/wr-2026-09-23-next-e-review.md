VERDICT: APPROVE a409774b360433098d4930c44328fd48891a71f3

Independent final delta integrity review of territory E. Approval covers the source slice and its explicit manual-recovery limits, not installation, live automation or two-host acceptance.

Cause: CAPTURE_INTENT recovery had trusted a parseable capture's claimed digest and proceeded to dispatch before strong byte/round integrity verification. The parent intervention places existing verifyReceiptEvidence at shared dispatchPrepared before SENDING and before invoking the sender. All first-admission, intent-resume, PREPARED-resume and WAITING_OWNER dispatch paths converge there.
Discriminating check: The same independent probe that produced one forbidden send at 99d8beeb now produces zero sends, no dispatch advancement, and persisted NEEDS_RECONCILIATION for a capture whose originalBytes changed without updating its claimed digest. A further pickup also sends zero. No source/test edits were needed for this verification; the external probe's expected result was updated to the required behavior.
Fix location: skills/decisions/scripts/decisions-pickup.mjs:383 shared dispatchPrepared integrity gate; regression test covers first admission and intent recovery with byte and round corruption.
Simplification: Reuses the existing strong integrity helper at the common side-effect boundary; no extra state, validator, transport behavior or recovery exception.

Independent final probe, next-E-final-probe.mjs, passes:
- Recorded cross-project binding refuses before reader/send calls.
- Actual fixture runNoteSend and capture Details agree on durable main-checkout storage.
- Null Done does not reset; explicit valid unchecked observation admits the next round.
- Accounting reconstructs required refs from verified original bytes and rejects empty duplicated metadata bypass.
- CAPTURED interruption preserves global binding; B status/once/account refuse; A resumes original round 1.
- Parseable conflicting capture is rejected before send; receipt persists NEEDS_RECONCILIATION; retry sends zero.

Containment: one lightweight Node process using makeTempHome({gitIdentity:false}); checkSeal returned ok:true/sealed. Actual sender exercised only local disposable fixture storage with --no-type and a git seam. No live sends, network, installs, schedules, identity changes, source/docs/work edits or full-suite runs. Fixtures removed; working tree clean.

Review limits retained: stale claims after actual process death require attended reconciliation; UNKNOWN is not resend authority; absent owner/rebinding remains manual; reader credentials and external CLI deployment are operational prerequisites; no invisible-ABA detection, automatic Done clearing, full unattended recovery or live two-host outcome claim. Parent owns integration/full gate. No remaining blocker found in the reviewed delta and prior independently reproduced findings.
