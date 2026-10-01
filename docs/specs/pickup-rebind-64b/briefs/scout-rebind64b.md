# Scout: rebind64b (read at base b52e3fae, paths relative to the repo root; line numbers are base)

## 1. Files and symbols
- skills/decisions/scripts/decisions-pickup.mjs (1580 lines) exists. Spec's investigation cited the lane-64 worktree; lines have drifted by 2-50 at base: parseArgs 1527 (not 1536), runCli 1550 (not 1557), settleRound 1406-1501 (not 1394-1498), verifyOnePrivateCapture 427 (not 425), atomicJson 147 (not 151), handoff-marker write 1148-1158 (not 1100-1108), marker cleared in settleRound 1491-1494 (not 1480-1484), receipt.project refusals 966/997 (pickupOnce), 1288 (status), 1416 (settleRound), 1511 (openPrivateCapture). durableTransportRepo 827 and registeredProject 647 match. Premise holds: no `rebind` exists; verbs are only once/status/account/open (parseArgs 1528).
- The "different authorization project" binding is exactly `receipt.project` (+ `receipt.transportRepo`); five refusals compare it (above) and a sixth compares transportRepo (975, 1006, 1299, 1418). Receipt and claim files are keyed by page only (receiptPaths 114-126), so the receipt file does not move; only its contents do.
- Binding NOT named by the investigation: `receipt.exactSendInputs.argv` carries the OLD transportRepo twice (`--recipient-repo`, `--sender-repo`, built in sendInputs 545-554) and `dispatchPrepared` sends that saved argv verbatim (930). A PREPARED receipt left with the old path would send to a dead repo. lineMatchesSend (557) compares id/from/to/kind/body/details/needs only, never argv.
- Also path-bearing: every saved capture carries `project`, `transportRepo` (verified 435-437); captures for EARLIER rounds stay under `captures/<projectScope>/` (the receipt tracks only the current round, so they are unreferenced but carry the old project); `accountingOutcome.path` is under AGENTS_HOME and keyed by projectScope, unaffected.
- Pointers carry no path (pointerPacket 280-292) and resolve under `receipt.transportRepo` (resolveDetails 270-277, verifyPointer 451-463); they stay valid only if the same-named file exists under the NEW main checkout's docs/notes.
- New rounds after rebind use `receiptPaths(newProject).projectScope` (1206-1207), the old round keeps its saved scope; status uses the saved scope (1305). `note-send` topic and noteId embed the saved scope (545-547), unchanged.
- skills/decisions/SKILL.md (472 lines) exists; the pickup section is 181-285; wrapped at about 92 columns. skills/decisions/scripts/decisions-pickup.test.mjs (1889 lines) exists.

## 2. Helpers to reuse
- decisions-pickup.mjs: `canonicalProject` 54, `canonicalThroughExistingAncestor` 201 (resolves a path that no longer exists), `canonicalPathKey` 671 (win32 case fold), `registeredProject` 647, `durableTransportRepo` 827, `acquireClaim`/`releaseClaim` 156-171, `atomicJson` 147, `readJson` 128, `verifyOnePrivateCapture` 427, `verifyReceiptEvidence` 516, `receiptStatus` 833, `settleRound` 1406 (claim + project + transport checks template), `PickupError` 30.
- decisions-pickup.test.mjs: `fixture()` 63 (non-git repo, project = realpath), `deps()` 100, `buildWedge` 1526 (a 9/30-shaped stuck receipt in a sealed home), `privateFile` 127, `wedgeBlock`/`W_ROUND`/`W_CHANGED` 1481-1514, `status`/`pickupOnce` imports; `makeTempHome` from scripts/test-home.mjs; `childEnv` from skills/multi/scripts/test-child-env.mjs for any child process.

## 3. Tests that police this area
- decisions-pickup.test.mjs 833-896: a second project gets PENDING_MANUAL_HANDOFF, status and `account` refuse "bound to another authorization project"; rebind must leave these refusals intact (the refusal for a LIVE second project must still fire).
- decisions-pickup.test.mjs 1358-1480: worktree, main-checkout and bare-backed project identity and projectScope formula; rebind must not change `receiptPaths`.
- registered-pickup.contract.test.mjs (273 lines): the registration and owner-handoff contract (181: changed registered owner reconciles, no resend).
- skill-text.test.mjs: pins SKILL.md literal strings; no SKILL.md line may start with `**`; the added line must not break the existing multi-line `\n` patterns near 244-285 (insert, do not re-wrap).
- scripts/build-census.mjs 160: parses the note id `<from>-decisions-<64 hex>-<round>`; rebind must keep noteId and projectScope byte for byte.
- decisions-render-publish.test.mjs: uses exported `status`/`openPrivateCapture`/`closeRound`; their behavior must not change.

## 4. Open questions for the spec
- Which receipt states may be rebound: any, or not CAPTURE_INTENT/PREPARED/SENDING (a send in flight)? The live receipt is NEEDS_RECONCILIATION round 3. Spec silent.
- Must rebind rewrite `exactSendInputs.argv` (the two repo flags)? Spec says "project and transportRepo ... keeps noteId, detailsPath" only.
- Must rebind also rewrite captures of earlier rounds r1..rN-1 and an orphan rN+1 under the saved scope, or only the two the receipt names (privateCaptureRef, reconciliationPrivateCaptureRef)? Spec: "each saved private capture".
- Atomicity across files is not possible; the order and re-run behavior after a crash midway are unspecified (captures first then receipt last is the safe order, but a capture already at the new identity then fails the OLD-identity check on re-run).
- If the pointer file is absent under the new transportRepo, refuse before any write, or write after the fact and let status report POINTER_INVALID? Spec: verifyReceiptEvidence must be OK afterwards.
- Output shape and exit code on success and on the idempotent second run are unspecified.
