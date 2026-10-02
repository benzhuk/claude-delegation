VERDICT: NEEDS_FIXES (2) 196fb620a9ee026803818f4fed4ddaabb0cae74b

Territory rebind64b, round 1. Worktree wt-pickup-rebind-64b-rebind64b, branch build/pickup-rebind-64b-rebind64b,
HEAD 196fb620a9ee026803818f4fed4ddaabb0cae74b (from `git rev-parse HEAD`), base b52e3faeb197dcb32f2fdfaf5931dc13a2f1b516.
Read-only review. I edited nothing in the worktree (`git status --short` empty before and after). Every probe and
mutation ran in sealed homes (`makeTempHome`) or on a `git archive` copy under the scratch folder
`.../scratchpad/lane-64b/reviewer-rebind64b/` (probe.mjs, probe.log, prefix.log, copy/, patch.mjs). Nothing touched
real `~/.agents` state, registrations.json, or a live page. No command was denied.

Summary: the verb does what it was briefed to do. It refuses take-over in every shape I built. It verifies
before it writes, never rewrites `receipt.owner`, and cannot cause a send or accounting of an uncertain round.
Two defects remain. One path-bearing field is left stale (`accountingOutcome.path`). In that case rebind
writes, exits 0, and leaves a receipt status reports NEEDS_RECONCILIATION/OUTCOME_MISSING, and a second rebind
cannot repair it (MAJOR). The `--owner` marker can also be set on an ACCOUNTED receipt, where closeRound or
account cannot clear it (MINOR). Both patches below were trial-applied to the scratch copy: the full
decisions-pickup.test.mjs passes there (83/83) and the two failing probes turn green.

## Findings

### F1 (MAJOR): `accountingOutcome.path` is a path-bearing field the verb leaves stale; rebind reports success with evidence not OK
- Evidence: decisions-pickup.mjs:1617-1634. `rebound` rewrites project, transportRepo and argv but not
  `accountingOutcome.path`. `account` stores whatever `--outcome` the lead passed, resolved to an absolute
  path (decisions-pickup.mjs:1369-1371; SKILL.md:270 says only `--outcome <existing-report-path>`). An
  outcome written inside the repo therefore names the dead path after a move. `verifyAccountingOutcome`
  (decisions-pickup.mjs:494-503) runs in `verifyReceiptEvidence`, but rebind never checks it before writing,
  and never checks after writing that the result is OK (spec item 2: "verifyReceiptEvidence returns OK
  afterwards").
- Constructed (probe.mjs section 3b, sealed home): pickupOnce gives RECORDED, then `account --outcome
  <repo>/docs/outcome.md` gives ACCOUNTED. Then the repo is renamed and rebind runs.
  - Before: status `PENDING_MANUAL_HANDOFF`.
  - Rebind: no error, returns `NEEDS_RECONCILIATION` / evidenceIntegrity `OUTCOME_MISSING`.
  - Status after: `NEEDS_RECONCILIATION/OUTCOME_MISSING`, with outcome.path still
    `...\fixtures\pickup-5pvKim\docs\outcome.md` (the old root).
  - A second rebind: "the saved project binding is not --from-project".
  - Result: the receipt and captures are rewritten, the page stays stranded (pickupOnce returns early on
    non-OK evidence, decisions-pickup.mjs:1015-1018), and no verb can move it again. This is the outcome the
    lane exists to prevent, and it happens in the most common resting state (ACCOUNTED). The live receipt
    (NEEDS_RECONCILIATION round 3) is not affected.
- Fix: before the first write, move an outcome path that lies under the old project root to the same
  relative path under the new root, then require `verifyAccountingOutcome` to pass (digest match) or refuse
  with no write. An outcome under AGENTS_HOME (the closeRound / `publish --clear-done` route) is not under
  the old root, so it is left unchanged and verified as is. Patch, exact current -> exact replacement:

  Current (decisions-pickup.mjs:1617-1619):
  ```
      const argv = receipt.exactSendInputs?.argv;
      const rebound = {
        ...next,
  ```
  Replacement:
  ```
      const argv = receipt.exactSendInputs?.argv;
      const outcome = receipt.accountingOutcome;
      const outcomeFile = typeof outcome?.path === 'string' ? path.resolve(outcome.path) : null;
      const movedOutcome = outcomeFile && sameOrInside(outcomeFile, path.resolve(receipt.project))
        ? { accountingOutcome: { ...outcome, path: path.join(newProject, path.relative(path.resolve(receipt.project), outcomeFile)) } } : {};
      const rebound = {
        ...next,
        ...movedOutcome,
  ```
  Current (decisions-pickup.mjs:1625-1627):
  ```
        throw new PickupError(`the details pointer is not present under the new transport repository (${pointer.status})`);
      }
  ```
  Replacement:
  ```
        throw new PickupError(`the details pointer is not present under the new transport repository (${pointer.status})`);
      }
      const outcomeFailure = verifyAccountingOutcome(rebound, null, fsImpl);
      if (outcomeFailure) {
        throw new PickupError(`the accounting outcome does not verify under the new project (${outcomeFailure.status})`);
      }
  ```
  Add a test `rebind 64b: an ACCOUNTED round whose outcome lived in the repo is rebound with its outcome
  verified`, built as in probe 3b: assert status after is `ACCOUNTED`, evidenceIntegrity `OK`, and
  `accountingOutcome.path` is under the new root. Add one more case: outcome deleted, so rebind refuses with
  every file byte-identical.
- Predicted outcome, measured on the scratch copy: probe 3b gives rebind `ACCOUNTED/OK`, status after
  `ACCOUNTED/OK`, and outcome.path `...\fixtures\moved-pickup\docs\outcome.md`. decisions-pickup.test.mjs
  passes 83/83. `sameOrInside` uses `path.relative`, which is case-insensitive on win32. The digest is
  re-verified, so no evidence is rewritten without first being checked.

### F2 (MINOR): a differing `--owner` sets the handoff marker on an ACCOUNTED receipt, where closeRound and account cannot clear it
- Evidence: decisions-pickup.mjs:1621-1622 sets the marker in any state. At base the marker write
  (decisions-pickup.mjs:1146-1157) is never reached on ACCOUNTED: an ACCOUNTED receipt returns at 1124-1128
  or 1143-1145, or is excluded by `!(ACCOUNTED && observedUncheckedAt)`. settleRound refuses outside
  RECORDED/admitted (decisions-pickup.mjs:1468-1470), so "a later closeRound/account settles it" (brief
  attack 4, builder ruling 7) is false for ACCOUNTED.
- Constructed (probe 3c): closeRound gives ACCOUNTED. After the move, `rebind --owner skills-o` returns
  `state=ACCOUNTED handoff=PENDING_MANUAL_HANDOFF`. closeRound with skills-o then refuses: "cannot account a
  round outside RECORDED; uncertain delivery never becomes repeat-safe". A pickupOnce tick then returns the
  receipt with the marker and owner skills-a. `runRegisteredPickup` maps that to
  `PICKUP_RECONCILIATION_REQUIRED` (decisions-pickup.mjs:812-815) on every tick until a new round is
  admitted, and it names an action that refuses. The marker clears itself at the next round (the fresh
  intent object), so nothing is lost; it is a false alarm. It never permits a send.
- Fix (mechanical), current (decisions-pickup.mjs:1621):
  ```
        ...(lead && receipt.owner && lead !== receipt.owner
  ```
  Replacement:
  ```
        ...(lead && receipt.owner && lead !== receipt.owner && receipt.state !== 'ACCOUNTED'
  ```
  Extend the `--owner` test with an ACCOUNTED case that asserts `handoffStatus` stays undefined. Predicted
  (measured on the scratch copy): probe 3c gives `handoff=undefined`, and the existing `--owner` test (built
  on RECORDED) still passes.

### Nits (no fix required)
- N1: an old path left as a junction or symlink to the new root is refused, which is correct and writes
  nothing. The message is "the saved project binding is not --from-project", not "still exists", because
  `canonicalThroughExistingAncestor` (decisions-pickup.mjs:1589) resolves through the link before the
  existence check at 1593. A lead who leaves a compatibility junction will get a misleading error. Optional
  fix: run `pathAbsent(path.resolve(options.fromProject), fsImpl)` before canonicalising, with the same
  "still exists" error.
- N2: SKILL.md:254 is 133 columns. The pin at skill-text.test.mjs:115-117 needs the literal command on one
  line, so this is unavoidable without changing the pin. The brief asked for "one sentence"; the paragraph
  at SKILL.md:254-257 has two. Acceptable as is.

## Attack brief, item by item

1. Take-over: every shape refused, with sha256 of every file under AGENTS_HOME and the new docs/ tree
   identical before and after (probe.log):
   - old path as a file: "still exists"
   - dangling junction: "still exists"
   - junction to the new root: refused, "not --from-project" (N1)
   - case-variant directory recreated, with both the original and the variant `--from-project`: "still exists"
   - `--from-project` equal to the new root, the old root's parent, or a child of the old root: "not
     --from-project"
   - `--repo` with no project.json: "no registered decisions_url"
   - `--repo` binding another page: "page is not this project's registered decisions_url"
   - claim held: "exclusive pickup claim"
   - bad `--owner` slug: refused before any write

   A case-variant `--from-project` with the old path gone is accepted (win32 key, OK), as briefed. A linked
   worktree `--repo` resolves to its main checkout through `registeredProject` and `projectIdentity`, the
   same identity status, pickupOnce and settleRound use. Rebind adds no new route to authorization.
2. Evidence order: no write happens before every named capture, every extra capture, the pointer, and the
   owner slug have been checked (decisions-pickup.mjs:1598-1627, writes only at 1628-1633). Each of these was
   refused with all files byte-identical:
   - tampered `originalBytes`, `digest`, `page`, `projectScope`, `from`, `round`, `transportRepo`, `project`,
     or `owner` in the named capture
   - capture made unreadable (replaced by a directory)
   - pointer tampered or missing under the new root
   - an extra capture with a third identity

   Gap: the outcome file is not checked (F1).
3. Completeness:
   - Path-bearing fields: receipt project/transportRepo, capture project/transportRepo, and
     exactSendInputs.argv (both repo flags) are rewritten. The pointer carries no path. `ledgerFiles` and
     `readOriginHistory` read `receipt.transportRepo`, which is now the new root. The note id, topic and
     projectScope are unchanged (asserted at test :1959).
   - Stale: `accountingOutcome.path` (F1).
   - PREPARED and SENDING receipts (probe section 3, built by halting pickupOnce at that transition): after
     rebind no file under the receipt or captures contains the old path. PREPARED then dispatches with
     `--recipient-repo <new root>`.
   - `projectScope`, `privateCaptureRef`, `detailsPath` and `noteId` are byte-identical (test :1959 loop).
4. Owner: `receipt.owner` is never rewritten (test :1985, :1996). The same `--owner` sets no marker (:2004),
   and a differing one sets the marker, which closeRound clears on RECORDED (:2000). Exception: ACCOUNTED
   (F2). No send in the new tests: the only send seams are the `deps()` fakes inside fixture builders, and
   the PREPARED dispatch exists only in my probe. A SENDING receipt after rebind recovers to UNKNOWN with a
   send that throws if called (it was not called), and UNKNOWN still refuses accounting.
5. Atomicity and crash:
   - Injected failure at the second capture rename, at the receipt rename, and in the builder's own test
     (:2098): the intermediate status is `PENDING_MANUAL_HANDOFF` (not TAMPERED from the new project's
     view), and a re-run finishes with status RECORDED/OK. One `.tmp-` file is left per crash (atomicJson
     behaviour; the capture regex and every reader ignore it).
   - A second rebind after success is a clean refusal with no change (test :2089, CLI :2123, probe).
6. Regression:
   - The four refusal sites keep their text and line numbers (970, 1001, 1292, 1416; 1511 for open is
     unchanged).
   - The test-file diff is a pure append: one hunk, `@@ -1889,0 +1890,259 @@`, so 833-896 and 1358-1480 are
     untouched.
   - `receiptPaths` is unchanged.
   - Focused run at HEAD: decisions-pickup, registered-pickup.contract and skill-text, 110/110 pass. The
     builder's gate log tail shows 183/183.
7. Scope:
   - numstat: SKILL.md +5, decisions-pickup.mjs +121/-3, test +259, skill-text.test +4. Nothing else.
   - No waiver flag, no publish change, no registrations.json handling.
   - One SKILL.md paragraph and one pin; the pin literal matches the SKILL.md text and the parseArgs verb
     list and error.
8. Fixture honesty:
   - The fixture builds the 9/30 shape synthetically (`buildWedge`, then the repo directory is renamed),
     keeps project.json and the untracked pointers, and asserts the old path is gone (test :1902).
   - The builder's fixture is non-git. My probe repeated it on a moved real git main checkout: before
     `PENDING_MANUAL_HANDOFF`, after `RECORDED` with evidence OK, project = transportRepo = the new root.
   - `node scripts/prefix-test.mjs --base b52e3faeb197dcb32f2fdfaf5931dc13a2f1b516 --test
     skills/decisions/scripts/decisions-pickup.test.mjs --repo .` exited 0: "reproduces at base ... and
     passes at the fix revision". The tool works per file; at base the rebind tests fail on the missing
     export.
   - Mutations on the scratch copy, counted over the 11 `rebind 64b` tests:

     | Mutation | Tests failing |
     |---|---|
     | `pathAbsent` check dropped | 1 |
     | argv rewrite dropped | 1 |
     | extra-capture scan dropped | 3 |
     | receipt-identity check dropped | 3 |
     | pointer check dropped | 1 |
     | copy restored | 0 |

     The tests discriminate.
9. Rulings needed (builder report):
   - R1 (states): acceptable. PREPARED and SENDING are safe, as shown above. The real edge is CAPTURE_INTENT
     with its capture or pointer not yet written (a crash in that window). Rebind then refuses ("not
     intact" / pointer MISSING), and such a page cannot be moved. That matches the spec's "MISSING refuses";
     the lead should accept it consciously.
   - R2 (argv): acceptable and necessary; the alternative strands a PREPARED send on a dead path.
   - R3 (extra captures): acceptable for safety. The lead should know the live run refuses if any earlier
     round capture under the saved scope fails page, scope, identity or digest. The alternative is to skip
     unreferenced earlier rounds, which nothing reads after accounting. Let the live run decide; a refusal
     there writes nothing.
   - R4 (order and crash): acceptable; verified above.
   - R5 (pointer refusal): acceptable; the alternative would write a receipt status calls POINTER_INVALID.
   - R6 (output): as briefed.
   - R7 (owner marker in any state): not acceptable as is for ACCOUNTED (F2). Otherwise fine.

## C4 fields
Cause: rebind rewrites only the identity fields it was told about; the receipt's `accountingOutcome.path`, set from `account --outcome`, still names the dead root, and rebind neither verifies it before writing nor checks evidence after.
Discriminating check: sealed probe 3b: an ACCOUNTED receipt with an in-repo outcome, then the move, then rebind; HEAD gives NEEDS_RECONCILIATION/OUTCOME_MISSING (exit 0, and a second rebind refuses); the patched copy gives ACCOUNTED/OK.
Fix location: skills/decisions/scripts/decisions-pickup.mjs:1617-1627 (outcome path moved and verified before the first write) and :1621 (no marker on ACCOUNTED).
Simplification: reuse `sameOrInside` and `verifyAccountingOutcome` as they are; no new helper, two guarded lines plus one spread.
