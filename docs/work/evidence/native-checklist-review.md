VERDICT: REJECT BEA33A3A841A60258ABC618A078790ADF042F544F71432F9840AB87F7BBDAEF3

Independent content review of checklist-state/checklist-draft.md against current source 92703038af4414b58c92f1d7a5c5aa09c6af917c, the supplied packet, accepted work records, and native-write-contract-verified.md. Hash computed from actual draft bytes. Read-only inspection only apart from this requested review report; no source edits, provider calls, installation, configuration, peer communication, or retry.

Decision

Reject this checklist as a replacement for the current ready queue. It is an attributable Claude-authored artifact, but successful transport does not make its content accurate. It introduces false acceptance semantics, reopens completed work, and invents serialization/authority constraints. Parent should retain it as a rejected non-code outcome and make narrow evidence-driven corrections to the existing queue rather than invest in another authoring round.

Material findings

1. False idempotency premise (draft line7).
The proposed Done acceptance observation requires "idempotent --id". The supplied packet and current ready queue explicitly say repeated --id is NOT idempotent. Existing note-send appends ledger entries (skills/multi/scripts/note-send.mjs:539); caller-side capture/binding/recovery is the relevant protection, not an idempotent transport flag. This wording could encourage unsafe retries and duplicates. Acceptance must preserve the real one-shot, recorded-result, conservative recovery contract; automatic unattended activation is a separate claim.

2. Conflates callable bearings with implemented automatic release/KILL completion (line6).
The checklist describes the acceptance observation as an installed host emitting daily/release/KILL notices and recording completion without prompting, with installation authority as the next blocking step. skills/bearings/SKILL.md:52 explicitly requires an explicit new invocation for changed Release/KILL conditions and says no hook watches HEAD or automatically detects release state. Current source provides advisories and explicit completion receipts, not that automatic behavior. Installation alone cannot turn an unimplemented automatic path into a supported live trial. Keep installed advisory/explicit assessment verification separate from still-undemonstrated automatic cadence.

3. Reopens already accepted and published non-code work, with wrong artifact attribution (lines12,16).
The operator guide is docs/native-use.md, published at 9270303, not the docs/work-record.md correction at 17759c3. docs/work/wr-2026-09-23-native-use-guide.record.md is accepted, identifies the exact guide digest, includes independent review, and grants useful documentation/source publication authority. The non-code-record correction also has its own accepted record. "Publish the reviewed guide" and treating publication as waiting on Ben are stale and would duplicate completed work. The useful reviewed guide is already a concrete non-code outcome; no new research/document ask is needed merely to manufacture the first example. Its acceptance still does not prove live installation.

4. Invents global dependency and prohibition (line14, also line5).
The source says neither provider MUST spawn the other; the draft changes that to neither provider MAY spawn the other. This reverses an architecture-independence rule into a blanket prohibition and conflicts with the actual bounded cross-provider reviews already performed. Equal peers still use multi; owned provider calls and peer transport are different mechanisms.
The native Codex package trial's attended temporary-home authentication boundary is real for that particular inspected route. It does not prove every possible useful host pilot or mixed handoff is globally blocked on that route. The draft makes that trial a prerequisite for mixed delivery without reachability evidence and broadly says a useful pilot needs new Ben authorization despite existing authorized work. Keep authority and dependency item-specific rather than inventing a global blocker.

5. Incorrect or contradictory current-evidence accounting (lines5,9,13).
"No host pilot run yet" conflicts with the same checklist's actual native Opus review and Sonnet one-file Write evidence. These do not complete the whole two-host/mixed baseline, but they are real bounded host observations and must be credited at their actual scope.
Line9 says no plugin registration executed immediately after citing disposable installed package discovery. Marketplace/plugin registration DID execute in disposable CODEX_HOME; no persistent installation is the correct boundary. The runtime plan itself prepared no new model call/registration, but that does not erase earlier discovery installations.
Line13 calls Claude-authored/Codex-reviewed work "not attempted; no record found". This very attributable Claude checklist has now received an independent Codex content review. Its rejection means no accepted useful artifact was achieved in that direction, not that the review event was never attempted.

6. Collapses distinct argv evidence stages (line10).
The original launcher splitting was reproduced with an outer argv fixture. The actual-inner-spawn fixture subsequently demonstrated the repaired vector, after identifying the duplicated preflight and Read-only runner. Saying the defect was reproduced "via the same spawn call" merges those stages. The accepted native-write-contract evidence carefully distinguishes original inferred causation, actual Read-only fixed-1 vector, corrected transport proof, and the successful one-file Write. Preserve that attribution rather than simplify it into a stronger historical causal claim.

Sound content retained

The draft correctly credits the narrowly successful native Write, accurately identifies the native Opus review as continuation-patch rather than packaging review, preserves non-code evidence without fake Git commits, keeps comparative performance unknown, and does not claim persistent native installation. Those useful fragments do not compensate for the material queue/acceptance errors above.

Suggested parent disposition, no new author round

Use the accepted native Write evidence to close the old transport/permission uncertainty at its narrow scope; mark the reviewed operator guide as already accepted/published; retain the specific native Codex temporary-home auth boundary without extending it to all independent work; and record this actual Claude-authored/Codex-reviewed checklist as REJECTED. Keep the existing queue's correct --id warning and provider-neutral must-not-require-cross-spawn language. No model retry or additional transport work is warranted by this content failure.
