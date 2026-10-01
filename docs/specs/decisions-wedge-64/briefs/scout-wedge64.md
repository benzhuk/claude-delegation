# Scout: wedge64 (read at base 0d9cdeb5, paths relative to the repo root; line numbers are base)

## 1. Files and symbols
- skills/decisions/scripts/decisions-pickup.mjs (1457 lines) exists. `account` :1307-1378 (needs RECORDED, or the "stuck" path :1333-1342; demands `Owner-attestation: <receipt.owner>` :1354, `Fresh-page-reconciliation:` :1357, one `Accounted-ref:` per captured ref :1360). `pickupOnce` :943-1270. `changedReceipt` :851 writes NEEDS_RECONCILIATION. `ownerInputsChanged` :362, `isSubMultiset` :324.
- Item 3 premise holds: the owner is frozen into the receipt at capture (`owner` :1194, receipt field :1051). A later different `options.owner` only sets `handoffStatus: PENDING_MANUAL_HANDOFF` + `requestedOwner` (:1139-1148); `runRegisteredPickup` maps that to PICKUP_RECONCILIATION_REQUIRED (:802-806). `account` never reads `options.owner`.
- Item 1 premise holds: skills/decisions/scripts/decisions-render-publish.mjs `publish` --clear-done path :456-491 only reads the capture via `defaultReadPickupCapture` :97-148 (accepts PREPARED/RECORDED/WAITING_OWNER/ACCOUNTED, NOT NEEDS_RECONCILIATION :137); it never accounts. SKILL.md :121-131 and :267-278 describe the order "clear Done (publish --clear-done), then account".
- Item 2: `verbatimAnswerPresent` :255-278 and :483 read ONLY today's NY-day history file from `origin/main` (`docs/decisions/history/<today>.md`) plus waiting files. History files exist 2026-09-23..2026-10-01. There is no code that treats an older history file as closing a round; `account` has no history check at all.
- Item 5 (live) is the LEAD's step, not the builder's.
- PICKUP_CONFIG_INVALID CONFIRMED: host file <AGENTS_HOME>/ws/decisions-pickup/registrations.json names repo `C:/Users/benzh/Code/claude-delegation` (pre-move path, now absent). `readRegistration` :677 -> `canonicalProject` :54 throws on realpath -> `runRegisteredPickup` :782-786 returns PICKUP_CONFIG_INVALID; skills/multi/scripts/note-flush.mjs only prints that code (`buildPickupStatus` :317). The real receipt also binds `project` and `transportRepo` to `C:\Users\benzh\Code\claude-delegation` and projectScope fb970de6.. is sha256(project\0page) (`receiptPaths` :114), so a corrected registration yields a different project and `pickupOnce` :953-964 returns PENDING_MANUAL_HANDOFF.
- Real wedge receipt (shape only): version 2, round 3, state NEEDS_RECONCILIATION, previousState NEEDS_RECONCILIATION, owner skills-a, recordedAt set, transportResult.recorded true, handoffStatus PENDING_MANUAL_HANDOFF, requestedOwner ben, reconciliationReason "checked page bytes changed during the active round", reconciliationPrivateCaptureRef set. Do NOT read ~/.agents/ws/decisions-pickup (private captures); synthesise the fixture.

## 2. Helpers to reuse
- skills/decisions/scripts/decisions-pickup.test.mjs top (:1-198): PAGE/CHANGED/SUBSET_CHANGE page constants, NOW, REGISTERED_PAGE, fixture builders; stuck-round tests :521-690 are the template for a wedge fixture.
- scripts/test-home.mjs `makeTempHome`; skills/multi/scripts/test-child-env.mjs `childEnv`.
- decisions-render-publish.test.mjs lane-58 tests (grep "accounted") for the publish stubs (`readPickupCapture`, `execGit`, `readPage` deps).
- `ownerInputs`/`isSubMultiset`/`loadCaptureOwnerInputs` in decisions-pickup.mjs; `ownerInputTriples`, `gitShow`, `gitLsTreeFiles` (:225,:233) in decisions-render-publish.mjs.
- scripts/prefix-test.mjs (prove each regression test fails at the base sha).

## 3. Tests that police this area
- skills/decisions/scripts/registered-pickup.contract.test.mjs:181 "real recorded receipt with a changed registered owner reconciles without resend": asserts a changed owner gives PICKUP_RECONCILIATION_REQUIRED and no resend. Item 3 collides with it; changing it needs an explicit ruling.
- decisions-pickup.test.mjs :431,:446-:690 (changed bytes stay reconciled, C1 sub-multiset, stuck-round provenance), :776 (account needs explicit owner), :814 (ACCOUNTED needs an observed unchecked page), :744, :831.
- decisions-render-publish.test.mjs lane-58/accounted cases: clear-done refuses unless Done still checked and Done label equal.
- skills/decisions/scripts/skill-text.test.mjs pins SKILL.md command strings; note-flush.test.mjs pins PICKUP_CODES.

## 4. Open questions for the spec
- Item 1: today the order is publish --clear-done THEN account, and account needs an outcome file with attestation and Accounted-ref lines. In one step, who writes the outcome (publish synthesises it, account takes the lead's file, or publish calls account with it)?
- Item 2: "admitted as closed" by which command (account, publish, pickupOnce), what receipt state results, and is attestation still required? Any history day, not only today's?
- Item 3: what identifies "the lead that runs the pickup" (registration owner, --owner, session name)? Must the registered-owner-change contract test at registered-pickup.contract.test.mjs:181 be rewritten?
- Config/identity: the receipt's project is the pre-move path. Does the lane rebind receipt.project/transportRepo/projectScope (the pointer files and capture directory are keyed by fb970de6..), or accept a fresh round under the new path? Fixing registrations.json is host state outside the repo and, per the spec, the repo scripts must do the closing, not a hand-edit of the receipt.
