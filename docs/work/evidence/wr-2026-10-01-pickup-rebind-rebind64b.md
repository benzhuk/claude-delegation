VERDICT: APPROVE acf861883084a1c742428a785b4039930bd973e7

Territory rebind64b, round 2 (delta re-review). Worktree wt-pickup-rebind-64b-rebind64b.
- HEAD: acf861883084a1c742428a785b4039930bd973e7, from my own `git rev-parse HEAD`.
- Range: 196fb620a9ee026803818f4fed4ddaabb0cae74b..HEAD, one commit, acf86188 "fix(decisions): rebind moves and verifies the accounting outcome, no handoff marker on ACCOUNTED".
- Read-only: I edited nothing in the worktree, and `git status --short` was empty after the run.
- Scratch: every mutation and probe ran on a `git archive HEAD` copy under `.../scratchpad/lane-64b/reviewer-rebind64b-r2/` (copy/, orig.mjs, orig.test.mjs). Each was restored and `cmp`-verified afterwards.
- No real `~/.agents` state, registrations.json or live page was touched. No command was denied.
- Report path: this file is reviewer-report-r2.md, so the round-1 findings at reviewer-report.md stay intact. That mirrors the builder's -r2 naming.

## Prior findings, verified

### F1 (MAJOR, stale `accountingOutcome.path`): FIXED
- The patch was applied verbatim at decisions-pickup.mjs:1618-1622 (outcome under the old root moved to the same relative path under the new root) and :1633-1636 (`verifyAccountingOutcome` must pass before the first write). The write loop starts at :1637, so ordering is intact.
- Tests: decisions-pickup.test.mjs:2161 (ACCOUNTED in-repo outcome gives status ACCOUNTED, evidence OK, path under the new root, digest unchanged) and :2177 (outcome deleted gives a refusal, with the AGENTS_HOME tree byte-identical).
- Mutation on the scratch copy:
  - Both F1 hunks reverted: 3 of 14 `rebind 64b` tests fail (2161, 2177, and 2185 through its status assertion).
  - Only the verify reverted: the outcome-gone test 2177 fails. It discriminates.
- Extra probes on the scratch copy (all as expected):
  - RV1, closeRound route (outcome under AGENTS_HOME): the path is left as is, and rebind gives ACCOUNTED/OK; status after is ACCOUNTED/OK.
  - RV2, outcome path stored in a different case on win32: moved, ACCOUNTED/OK. `path.relative` is case-insensitive on win32.
  - RV3, outcome tampered by one byte at the new location: refused with "the accounting outcome does not verify under the new project (OUTCOME_TAMPERED)", AGENTS_HOME tree byte-identical.
  - RV4, ACCOUNTED receipt with the receipt rename failing once: the intermediate status is PENDING_MANUAL_HANDOFF (still bound to the old project). The rerun gives ACCOUNTED/OK, and a third run is a clean refusal ("the saved project binding is not --from-project"). The outcome move is recomputed from the unchanged old receipt on every run, so it is idempotent.
  - RV5, NEEDS_RECONCILIATION carrying a prior round's `accountingOutcome` (changedReceipt keeps it, decisions-pickup.mjs:881-889) with the file deleted: rebinds, evidence OK. `verifyAccountingOutcome` only checks ACCOUNTED (:493), and the only other reader is the `!= null` provenance check at :1431, which moving the path preserves. Harmless; no finding.

### F2 (MINOR, handoff marker on ACCOUNTED): FIXED
- Applied verbatim at decisions-pickup.mjs:1626.
- This now mirrors base pickupOnce, which never reaches the marker write (:1146-1157) on ACCOUNTED.
- Test decisions-pickup.test.mjs:2185 asserts no `handoffStatus` or `requestedOwner`, `owner` still skills-a, and status ACCOUNTED.
- Reverting the `&& receipt.state !== 'ACCOUNTED'` guard on the scratch copy fails exactly that test (1 of 14).
- In the other non-settleable states (UNKNOWN, NEEDS_RECONCILIATION, PREPARED, SENDING) the marker behaviour matches base pickupOnce, which also writes it there. No new divergence.

### N1, N2: left as advised. No change needed.

## Regression hunt (delta)
- Scope: base..HEAD numstat is SKILL.md +5, decisions-pickup.mjs +130/-3, decisions-pickup.test.mjs +304, skill-text.test.mjs +4. Nothing else.
- The round-2 test diff is a pure append, one hunk `@@ -2146,3 +2146,48 @@`. No existing test changed.
- Evidence order: the outcome is verified after the pointer and before any capture or receipt write (decisions-pickup.mjs:1629-1636 before :1637-1642). A refusal there writes nothing (test 2177, probe RV3).
- `receipt.owner` is never rewritten. `projectScope`, `privateCaptureRef`, `detailsPath` and `noteId` are untouched by the new hunk, which only spreads `accountingOutcome`.
- Focused run at HEAD (decisions-pickup, registered-pickup.contract, skill-text): 113 tests, 113 pass, 0 fail. The builder's gate log tail shows 186/186 with decisions-render-publish included.
- Commit metadata: conventional message, no trailers, configured identity.

Verified absence: no defect found in the round-2 delta. The outcome move cannot rewrite evidence without verifying it (the digest is re-checked at the new path). It cannot enable a send or accounting (no state change, and no new route into settleRound). The crash-resume and second-rebind guarantees still hold for ACCOUNTED receipts.

## C4 fields
Cause: in round 1, rebind rewrote only the project/transport identity fields and left `accountingOutcome.path` naming the dead root, unverified, so an ACCOUNTED receipt went to NEEDS_RECONCILIATION/OUTCOME_MISSING after a "successful" rebind. The `--owner` marker could also land on ACCOUNTED, where settleRound cannot clear it.
Discriminating check: on the scratch copy, reverting the F1 hunks fails tests 2161, 2177 and 2185; reverting only the verify fails 2177; reverting the F2 guard fails 2185. At HEAD all 14 `rebind 64b` tests pass, along with probes RV1-RV5.
Fix location: skills/decisions/scripts/decisions-pickup.mjs:1618-1622 and :1633-1636 (outcome moved and verified before the first write), and :1626 (no marker on ACCOUNTED).
Simplification: reuses `sameOrInside` and `verifyAccountingOutcome` unchanged, with no new helper: one spread and two guarded lines in the verb.
