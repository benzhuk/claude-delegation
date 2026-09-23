VERDICT: PASS a409774b360433098d4930c44328fd48891a71f3

Parent intervention after three builder rounds. Cause: strong capture integrity was checked on status/ordinary resume but not on every path into consequential dispatch; CAPTURE_INTENT and fresh admission could reach transport with corrupted original bytes or a wrong round.
Discriminating check: before mutation, a new sealed regression failed on first-admission/originalBytes with sends=1; see next-E-parent-before.log. The independent round3 review separately reproduced intent recovery. Hypothesis: one shared pre-send integrity precondition prevents invalid evidence dispatch across all entry paths without another state-specific rule.
Fix location: dispatchPrepared applies existing verifyReceiptEvidence before SENDING or send, recording existing NEEDS_RECONCILIATION on failure. No parser, transport, receipt engine or state added.
Simplification: reuse one verification function at one consequential boundary, covering existing and future dispatch callers.
Verification: existing sealed runner,22/22 focused tests passed. New regression covers first admission and intent recovery with originalBytes and round corruption, zero sends, noSENDING transition and zero retry sends. Full integration and independent review still required. No live actions or installed-use claim.
