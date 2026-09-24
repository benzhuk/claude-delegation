VERDICT: BUILD THE NARROW PRIVATE-CAPTURE REPAIR; DO NOT MIGRATE EXISTING STATE AUTOMATICALLY.

# Private decisions capture contract — September 23, 2026 (America/New_York)

Read-only architecture review of current decisions-pickup.mjs, its tests, decisions-read.mjs and pickup skill instructions. No source edit, page read, transport send, provider call or installed-state mutation. Ran only a pure parseDocument check of synthetic strings.

## Confirmed cause and scope

captureRelative and changedCaptureRelative place JSON under the consumer transport repository's docs/notes. Initial capture, CAPTURE_INTENT recovery and changedReceipt all persist originalBytes (the entire Notion reader output, base64) plus selected text/comments there. sendInputs then exposes that file as repo-relative Details. The plugin repository's ignore file cannot protect arbitrary consumer repositories; base64 is not sanitization.

Preserve the single existing receipt/claim store, page-to-project binding, projectScope, round and note ID algorithms. Move only private evidence storage and separate the public Details artifact. No new scheduler, work engine, remote store or automatic synchronization.

## Target layout and schema

Under the existing local AGENTS_HOME/ws/decisions-pickup:
- existing page-key receipt and claim remain;
- private immutable captures live at captures/<projectScope>/r<round>.json;
- changed snapshots live at captures/<projectScope>/r<round>-changed-<digest>.json.

The capture retains originalBytes, exact raw digest and parsed items, plus existing page/project/transportRepo/round/from/owner bindings. Treat both raw bytes and parsed choice/comment text as private. Use exclusive creation and private file/directory modes where supported; do not claim POSIX mode alone establishes a Windows ACL boundary.

Use an explicitly versioned new receipt/capture shape (v2) so capturePath cannot silently switch from repository-relative to private-store-relative. For example: privateCaptureRef plus detailsPath; keep raw digest in the private receipt. Never resolve a private reference relative to cwd or transportRepo.

The **repo-relative Details packet** remains in durable transportRepo/docs/notes, with a distinct sanitized filename such as decisions-pickup-<projectScope>-r<round>.pointer.json. Use an allowlist serializer; do not spread the capture or receipt. Include only:
- packet schema/type and local-only availability marker;
- opaque capture reference, projectScope, round and expected digest/identity sufficient to verify the immutable snapshot;
- generic instructions to open that exact local evidence using the pickup helper, or request manual handoff if unavailable.

Omit originalBytes, items, titles, choice text, comments, page body, excerpts, full Notion URL, owner-written report content and machine-absolute paths. Opaque hashes/reference IDs are evidence identity, not authorization. Existing generic envelope wording can remain. Neither raw content nor a raw base64 payload may appear in ledger text, pointer packet, error output or diagnostics.

**Out-of-Git must be enforced, not assumed:** canonicalize the private store through existing ancestors, reject path traversal/symlink escape, and refuse raw persistence if the resolved location is within the authorization/transport checkout or another detected Git worktree. An AGENTS_HOME redirected inside a repository is not private merely because its directory is named .agents. Prefer an explicit failure requiring an external private home over adding .gitignore entries or silently falling back elsewhere.

## Exact code changes

1. Extend receiptPaths (or an adjacent pure path helper) to derive private capture references and the existing repo-relative sanitized details path. Retain current page key/projectScope/claim identity.
2. Refactor writeCaptureExclusive, verifyOneCapture, verifyReceiptEvidence and requiredItemsFromCapture to use one private-store resolver. Require the existing binding checks plus round, raw-byte digest and capture format. Account must continue deriving all required selection-NNN/comment-NNN refs from the verified immutable raw bytes, not pointer fields, cached items or the fresh page.
3. Write the sanitized pointer with exclusive-create/reuse checks. It is an artifact of the saved receipt, never a new authorization fact. Validate it against the saved expected packet before PREPARED/SENDING dispatch; conflicting existing pointers require reconciliation.
4. Change sendInputs to set Details to detailsPath while preserving the current from/topic/projectScope/round note ID. Persist the exact new envelope argv in CAPTURE_INTENT as today. Do not recompute an already-saved uncertain send when file locations change.
5. Change every capture writer: initial admission, CAPTURE_INTENT reconstruction and changedReceipt. Changed snapshots are private too; do not leave that second writer in docs/notes.
6. Provide a small explicit local capture-open/read mode in the existing helper, or a precise existing-helper invocation, that validates receipt/round/reference/digest and returns the exact private snapshot to the owner. Validate before opening; a public pointer alone cannot choose arbitrary filesystem paths. If the local private evidence is absent/unreadable, return PRIVATE_CAPTURE_UNAVAILABLE / manual handoff with no Notion fetch. A fresh page is for reconciliation, never a replacement for missing submitted bytes.
7. Update the pickup skill text and focused tests that currently require original captures under durable main-checkout docs/notes. The durable main checkout still owns the sanitized Details artifact and ledger; private evidence does not.

This separates two roles currently conflated by capturePath without creating another source of truth.

## Crash and delivery ordering

Retain: claim -> read/validate registered page -> persist CAPTURE_INTENT with fixed round, locations, digest and exact intended send -> private immutable capture -> sanitized pointer -> WAITING_OWNER or PREPARED -> verify both -> SENDING -> actual send -> RECORDED.

A crash after either file write resumes the same saved round:
- existing matching private capture is reused, never rewritten;
- missing private capture may be reconstructed only in the existing CAPTURE_INTENT case from the same unchanged checked bytes and saved digest/bindings;
- complete private capture with missing pointer can recreate only the deterministic sanitized packet for that intent;
- partial/conflicting private capture or pointer means reconciliation, no send;
- pointer alone is never proof the capture exists;
- SENDING still recovers solely from positive exact matching transport evidence. ABSENT/unreadable evidence never authorizes a resend.
- changed checked bytes preserve the later snapshot privately and remain NEEDS_RECONCILIATION.

These are current state transitions with two explicitly typed artifacts, not a second state machine. Keep round and selected reference order stable. No account operation clears Done or proves user consequences automatically.

## Same-host and cross-host behavior

An owner on the pickup host can open the verified local capture. On another host the sanitized Details packet may be visible while the exact private bytes are not; surface that availability boundary and request an explicit manual handoff. Do not send raw content automatically through peer transport, copy credentials, create shared private storage or read today's Notion page and call it the old submitted snapshot.

If an explicit future handoff makes the exact capture locally available, digest/binding verification remains necessary. This repair need not implement that transfer. Existing pickup “RECORDED” proves delivery of a pointer, not recipient access to private bytes or accounting.

## Legacy policy

Read and recognize v1 distinctly; do not reinterpret its capturePath as v2, regenerate its exactSendInputs, advance its round, alter note ID, overwrite its raw file with a pointer, or delete/move existing files. A format change must not erase UNKNOWN/SENDING/NEEDS_RECONCILIATION uncertainty.

A narrow safe policy:
- status reports the saved v1 state plus LEGACY_REPO_CAPTURE / manual-reconciliation requirement; merely being legacy is not corruption or proof a send happened;
- --once on a legacy receipt does no new read/capture/send and reports the concrete location problem, preserving receipt and claim recovery evidence;
- explicit accounting of an already RECORDED legacy round may remain available through a separate legacy verifier using its existing exact original snapshot and refs; it must not send or relocate content;
- authorize any eventual migration/cleanup separately after reviewing state and exact envelope history. No general migration command is required in this repair.

Document the existing private files' location without echoing content. A new version prevents new exposure; it cannot unpublish old Git history. Do not claim otherwise or automatically rewrite history. Ambiguous legacy rounds remain ambiguous.

## Empty checked Done: a separate admission rule

Pure parser observation: this valid input yields done=true, no warnings, no shapeless entries, one decision and **zero selected options/comments/unattached items**:

<summary>Choose transport</summary>
- [ ] Keep transport
No default: owner action required
- [x] Done

Current fresh-admission code computes items=[] and still creates CAPTURE_INTENT, full-page capture and an ASK when owner is supplied. The Done control itself is correctly excluded from capturedItems. A bare Done with no title remains BLIND; a grouping-only page remains shapeless/invalid. Do not relabel either malformed case as an empty valid submission.

Add **NO_ACTION** only immediately before fresh round allocation/persistence, after all existing active-round, changed-byte, recovery and accounted/uncheck handling. If capturedItems(doc).length === 0 for an otherwise valid checked page, return a truthful no-action result with sent:false; no new round, receipt, private snapshot, pointer or ASK. Release the transient claim normally. Do not clear Done, mark goal complete, select defaults or infer the owner abandoned open questions.

Use exact zero items for this narrow fix. Do not newly drop replied comments or change selection/comment reference semantics. Unattached comments and existing parsed comments remain actionable under the current contract.

Crucially, a fresh empty page cannot erase an already admitted nonempty round: changed checked bytes must reconcile; PREPARED/SENDING/UNKNOWN retain their saved evidence; ACCOUNTED still needs the existing observed unchecked episode before a later new round. An old v1 empty round is not permission for silent migration/deletion and must use the legacy policy above.

## Focused acceptance tests

- Consumer fixture with no ignore rules: an initial page and later changed page with unique private canaries leave no raw/base64 canary, title, choice or comment anywhere written inside either project checkout, pointer, envelope or ledger. The local private capture retains exact bytes.
- Separate worktree/main checkout: sanitized Details resolves in durable transportRepo; private capture remains solely in AGENTS_HOME, with stable project/round/note identity.
- AGENTS_HOME inside a repo, symlinked private root, traversal and altered pointer identity cannot route raw bytes into Git or outside the allowed private store.
- Same-host open verifies exact evidence; missing cross-host/local capture returns explicit unavailable, invokes no reader and sends nothing.
- Faults after intent, private capture, pointer and SENDING preserve same round; tampered/partial/missing evidence follows the rules above. Existing exact-envelope recovery tests remain.
- Account derives refs from original bytes despite tampered receipt/pointer items; changed snapshot and raw digest/round checks remain.
- v1 in CAPTURE_INTENT/PREPARED/SENDING/UNKNOWN/RECORDED/ACCOUNTED: no automatic move/delete/overwrite/resend/rebind. Status preserves actual state and legacy location flag; explicitly allowed accounting verifies original refs.
- Fresh valid zero-item checked Done yields NO_ACTION, zero sends and no persistent new artifacts; comments-only and selection-only still admit. Invalid/BLIND remains invalid.
- Existing nonempty round followed by valid zero-item checked page reconciles, never becomes NO_ACTION or automatically ACCOUNTED. Accounted-unchecked-next-empty then next-nonempty follows existing episode rules.
- Existing switches still short-circuit before project/page/receipt/transport work.

No broad infrastructure build is needed. The selected patch is private path resolution plus a sanitized Details artifact, version-aware refusal of unsafe legacy pickup, and a correctly placed zero-item admission guard.

