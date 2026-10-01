VERDICT: APPROVE 08151bfaf3fbad64ea3363f028d364b34cd1ecbf

# P1 review, round 3 (delta): decisions-pickup (pickup-complete-1)

Reviewed sha: 08151bfaf3fbad64ea3363f028d364b34cd1ecbf, from my own `git rev-parse HEAD` in /home/ben/Code/wt-pickup-complete-1-P1. The worktree is clean (`git status --short` is empty), and I changed nothing in it.
Range: 91cdd218453d28e03b77982daa398c683f1159f1..HEAD is one commit (08151bf, "test(decisions-pickup): guard byte-derived owner-input read against items drift"). It touches one file, skills/decisions/scripts/decisions-pickup.test.mjs, +37/-0. No production code changed.
Gate, which I ran first with the sealed runner: `node scripts/run-tests.mjs skills/decisions/scripts/decisions-pickup.test.mjs skills/decisions/scripts/registered-pickup.contract.test.mjs`. It exited 0 with 61 pass, 0 fail, 0 skipped.

Failure class watched for P1: "a check that passes because it isn't looking, or an unknown rendered as a confident number". For this round that means one question: does a test now fail if the multiset compare reads the saved `items` field instead of the digest-verified bytes? It does.

## Prior finding: fix verification

### A (MINOR, round 2): reverting the byte-derived reader passed every test. Now fixed.
- The inserted test is a verbatim copy of the round-2 patch. It sits at decisions-pickup.test.mjs:551-586, directly before the uncertain-delivery test, which is where the patch said to put it. I compared the diff to the patch line by line and found no drift.
- Mutant, run on a scratch copy made with `git archive HEAD` under my session scratchpad (p1r3/mut), never in the worktree. I reverted `loadCaptureOwnerInputs` (decisions-pickup.mjs:344-354) to trust `capture.items`, keeping the verify call. Result: 60 pass, 1 fail. The only failure is the new test, with `AssertionError [ERR_ASSERTION]: Missing expected exception`. That means the mutant accounted a round whose verified bytes held a new owner comment, and HEAD refuses it.
- Why that failure is meaningful and not incidental: under the mutant the same fixture gets through the provenance half of the gate and is accounted. So at HEAD the refusal comes from the sub-multiset half, reading bytes, and not from some unrelated provenance refusal.

Cause: round 2 replaced the test that depended on the `items` gap but added no test where `items` and the bytes disagree. That left the byte-derived reader unguarded.
Discriminating check: the `capture.items` revert mutant above. It gives 60/1 at HEAD's test file, where round 2's test file gave 60/0.
Fix location: skills/decisions/scripts/decisions-pickup.test.mjs:551-586 (test only).
Simplification: none. Production already has a single byte-derived source of truth. The fix is one test.

## Regression hunt (checked, no defect)
- The delta is test-only, so no production behaviour can have regressed. `git diff --name-only` lists only decisions-pickup.test.mjs.
- The new test registers its fixture cleanup through `t.after` before it writes anything. Its writes go only under the fixture's temp agentsHome and repo. It uses the injected `send` and no network.
- The test count went from 60 to 61 with 0 skipped, so no existing test was removed or weakened.

## Notes (no action for P1)
- The builder report's Gate line now names the sealed runner, which resolves the round-2 note. The report says the builder ran its mutant with `node --test` against a scratch copy. That was outside the worktree and not the gate, so it is not a finding. My own mutant run used the sealed runner.
- These are carried forward for the lead and the seam reviewer. The C1 wording amendment in contracts.md (previousState RECORDED, or NEEDS_RECONCILIATION with receipt-evidenced `recordedAt`) is still the lead's to make. The byte-derived reader re-parses old captures with P2's changed decisions-read.mjs. That is a seam concern and I have not ruled on it here.
