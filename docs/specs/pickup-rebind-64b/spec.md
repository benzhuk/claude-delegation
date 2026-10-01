# Lane 64b: pickup rebind after a repo move (follow-up of lane 64, scope item 5)

Lead ruling, 10/1, skills-o. Lane 64 (merged 34a8c290) fixed the wedge, but its live proof cannot run: the pickup receipt for page 3e1da11277a18174bccfea187d5c3972 is bound to the pre-move repo path C:/Users/benzh/Code/claude-delegation, and `decisions-pickup.mjs status --repo <new root>` refuses "this page is bound to a different authorization project". No script moves that binding, and the receipt must not be hand-edited. Measure: work lost or stalled (a repo move must not strand a page).

## Scope, pinned
Implement the `rebind` verb exactly as the investigation below designs it (section 3, steps a to e), smallest form. Hard requirements:
1. Refuses unless the receipt's project equals the canonical `--from-project` AND that old path does not exist (a live project can never be taken over).
2. Verifies saved evidence against the OLD identity before rewriting; rewrites project and transportRepo atomically in the receipt and each saved private capture; keeps projectScope, privateCaptureRef, detailsPath, noteId; verifyReceiptEvidence returns OK afterwards.
3. Wherever else the page-to-project authorization binding lives (the "different authorization project" refusal), rebind moves it under the same two refusals. Find it; the investigation may have missed it.
4. Owner per item 3 of lane 64: never rewrite receipt.owner; a different --owner goes through the existing handoff marker.
5. Tests from a fixture of the 9/30 moved-repo state: rebind then status OK; existing old path refused; tampered capture refused; second rebind is a no-op or a clean refusal.
6. SKILL.md (decisions) gains one line naming the verb for a repo move.
Not in scope: registrations.json (host config, the lead repointed it by hand on 10/1), any waiver flag, publish changes.
Live run after merge is the lead's.

## Investigation (runner, read-only, 10/1)

Read-only. All refs are in the lane-64 worktree, skills/decisions/scripts/decisions-pickup.mjs (P) unless noted. Nothing run that writes; no command denied.

(1) Register / re-register command: none exists.
- CLI verbs are only `--once`, `status`, `account`, `open` (P:1536 parseArgs). Nothing writes registrations.json; the only touches are reads (P:683 path, P:686 readRegistration, decisions-title.mjs:98 "never written", note-flush.mjs:331/1212 lstat).
- SKILL.md:187-197 documents it as a private hand-written file `{version:1, entries:[{repo,page,from,owner,reader}]}`; repo must exist and its .agents/project.json decisions_url must bind the page (P:701-732). The stale repo throws in canonicalProject (P:54, realpathSync) -> runRegisteredPickup returns PICKUP_CONFIG_INVALID (P:786-792).
- Secondary cause of the same code: note-flush.mjs:1226-1229 prints it when AGENTS_HOME differs from ~/.agents. Check env too.
- So registration is hand-edited private host config by design (not receipt/pointer); that part is a lead decision, no command.

(2) Receipt repo-path binding: not movable by any script path.
- The path is an identity string, not a resolved link. project = realpath(--repo) (P:54, 647-656 registeredProject/projectIdentity). Every entry point compares `receipt.project !== project` and refuses: status P:1291, pickupOnce P:968/999, settleRound P:1401, openPrivateCapture P:1508. Nothing maps old path -> new; the old path is never resolved.
- It is also load-bearing, not just a label: `receipt.transportRepo` is where the pointer is read (resolveDetails P:271-277, verifyPointer P:458) -> the POINTER_INVALID/MISSING ENOENT you saw; `receipt.project`+`transportRepo` are compared to every private capture file (verifyOnePrivateCapture P:432-437), and rejected if the receipt's transportRepo differs from the live main checkout (P:975, 1006, 1299, 1418).
- projectScope = sha256(project\0page) (P:117) names captures/<scope>/rN.json and docs/notes/decisions-pickup-<scope>-rN.pointer.json (P:241-248). The pointer packet itself contains no path (P:285-296), so the three untracked pointers under the new docs/notes stay valid if the receipt KEEPS its saved projectScope.
- Fixed lane code (closeRound P:1385, --owner, history admission) does not touch this. A pre-move path will not resolve to the new one.

(3) Minimal code change (fits spec item 3 and the stale-owner/path wedge; one new verb, ~60 lines + test):
Add `rebind` to decisions-pickup.mjs (parseArgs P:1536 list + runCli P:1557):
  node skills/decisions/scripts/decisions-pickup.mjs rebind --page <id> --repo <new project root> --from-project <old path> [--owner <lead>]
Body, modeled on settleRound (P:1394-1498), under acquireClaim(paths.claim):
 a. newProject = registeredProject(--repo,...) (P:647); receipt = readJson(receiptPaths(...).receipt); refuse unless receipt.project equals canonicalThroughExistingAncestor(--from-project) and the old path does NOT exist (so a live second project can never be stolen; keeps the "different project" refusal intact).
 b. Evidence check against the OLD identity first (verifyOnePrivateCapture P:425 for privateCaptureRef and reconciliationPrivateCaptureRef; skip the pointer, it lives at the old transportRepo).
 c. Rewrite `project` and `transportRepo` (= durableTransportRepo(newProject), P:827) in the receipt and in each saved private capture, atomically (atomicJson P:151), KEEPING projectScope, privateCaptureRef, detailsPath, noteId. Then verifyReceiptEvidence (P:~488) must return OK (pointer resolves under the new transportRepo to the existing untracked files).
 d. Item 3: if --owner differs from receipt.owner, set requestedOwner/handoffStatus PENDING_MANUAL_HANDOFF as P:1100-1108 does; settleRound already records accountedBy and clears that marker (P:1480-1484), so no further change. Do NOT rewrite receipt.owner (captures verify against it, P:436, SKILL.md:269).
 e. Tests in decisions-pickup.test.mjs from the 9/30 fixture: moved repo -> status OK after rebind; live old path refused; tampered capture refused.
Caveat: new rounds after rebind use projectScope(new project) (P:1157 uses paths.projectScope), the old round keeps its saved scope. Acceptable; say so in SKILL.md.

Then the live sequence (hand-edit registrations.json repo+owner to the new root and skills-o is the lead's call, no script):
  1 node skills/decisions/scripts/decisions-pickup.mjs rebind --page 3e1da11277a18174bccfea187d5c3972 --repo C:/Users/benzh/Code/zhuk-infra/claude-delegation --from-project C:/Users/benzh/Code/claude-delegation --owner skills-o
  2 (after merge to main) from main checkout: node skills/decisions/scripts/decisions-render.mjs publish --repo . --page 3e1da11277a18174bccfea187d5c3972 --reader ~/.claude/scripts/notion.js --clear-done --owner skills-o
  Gate: checkOnMain refuses a non-main branch, so step 2 only after merge (per live-report).
