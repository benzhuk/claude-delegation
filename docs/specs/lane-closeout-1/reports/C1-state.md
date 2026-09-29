## Territory
C1 (lane-closeout): rulings a/b/c in `scripts/work-record.mjs` (`Scratch:` field, `close
--closeout`, `sweep-origin`), one export in `scripts/janitor.mjs` (`closeoutWorktree`, plus
`pathWithin`), docs in `docs/work-record.md` and `skills/janitor/SKILL.md`.

## Contracts I rely on
`docs/specs/lane-closeout-1/contracts.md` rulings a, b, c. Round-3 binding rulings in
`addendum-C1-r3.md` (R2-1..R2-10, L5 replaced). Round-4 binding rulings in
`addendum-C1-r4.md`: exact patches for reports/C1-review-r3.md's R3-1..R3-7, plus the
idempotent-closeout ruling (worktree genuinely gone + no local branch -> absent, no exit-code
raise; genuinely gone + local branch survives -> go on to the branch step as usual; a
foreign-OS-shaped or still-real-but-unregistered value -> stays refused worktree-unresolved,
exit 2, per R2-8).

## Done
Round 5 (this round), HEAD `2296478` on `wt/lane-closeout-1-C1` (already committed by the prior
builder before it hung; this round verified the diff against every ruling, ran the mutation
proof and the gate, wrote the round-5 report - no code changes were needed, diff was correct):
- R4-1 (seam), R4-2 (carries R4-4, R4-7: `branchName`/`hostAbsolute`/`ownBranch`), R4-3
  (dry-run test), R4-5 (`ls-remote` confirm), R4-6 (doc text), W1 (closed by R4-4, no 2nd
  classifier, spec tests untouched, pure classifier test added), W2 (`path.resolve` on both
  sides) - all applied verbatim per reports/C1-review-r4.md and C1-r4-windows-findings.md.
  See reports/C1-r5-report.md for the full disposition table and diff excerpts.
- Mutation proof, 4 mutants (remove ownBranch check; remove hostAbsolute; remove R4-3
  dry-run guard; make the default seam ignore listWorktreesImpl), each on its own fresh
  `git archive` extract under `.../scratchpad/lane-closeout/C1-r5-mut/{m1,m2,m3,m4}/` (never
  the live worktree): all 4 KILLED. Table in reports/C1-r5-report.md.
- Territory: 410 tests, 407 pass, 1 fail (pre-existing STALE), 2 skipped.
- Full gate: 2688 tests, 2682 pass, 1 fail (pre-existing STALE), 5 skipped. Log:
  `reports/C1-r5-gate.log`.

Round 4 (prior): R3-1 blocker mutation-proof test, R3-2..R3-7 applied, idempotent-closeout
ruling implemented. Details in git history of this file and reports/C1-r4-report.md.
Round 3 (prior): all R2-1..R2-4 blockers + R2-6..R2-10, L5 replaced, fixed and committed.
Round 2/1 (prior): see round-3 state entry in git history of this file.

## Next
Nothing pending in my territory that I know of. Round 5 was the exact-patches-only round (past
the cap); all of R4-1..R4-7, W1, W2 verified applied and correct on disk, gate green. Lead may
merge `wt/lane-closeout-1-C1` to main. M7 (performance) stays deferred, per the round-3 ruling.

## Open questions
None outstanding.

## How to run my gate
Territory tests (NOTE: pass only the 4 `*.test.mjs` files, not `work-record.mjs`/
`janitor.mjs` directly - those two, run standalone via `node --test`, execute their own CLI
`main()` against the real repo and node's runner reports that as a spurious "test failed";
harmless but noisy, so the 4-file form below is what actually isolates this territory):
`cd /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1 && node --test scripts/work-record.test.mjs scripts/work-record-closeout.test.mjs scripts/janitor.test.mjs scripts/record-closed-and-skip.contract.test.mjs`

Full gate (already run, see `reports/C1-r5-gate.log`):
`node scripts/run-tests.mjs > /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/reports/C1-r5-gate.log 2>&1`
