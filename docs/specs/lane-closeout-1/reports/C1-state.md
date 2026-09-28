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
Round 4 (this round), HEAD `dd99ae1` on `wt/lane-closeout-1-C1`:
- R3-1 (blocker): `closeoutRecord: R2-2 ...` test now asserts the scratch step's own
  fail-closed refusal directly. Verified KILLED on a scratch copy (never the live tree):
  mutating `work-record.mjs:2064-2066` to `listWorktrees(root) ?? []` makes this one test
  fail (`removed` vs expected `refused`); the rest of the territory suite still passes
  except the pre-existing STALE test. Mutant restored, confirmed byte-equal to source.
- R3-2..R3-7: applied exactly as the reviewer's patches specified (see
  `reports/C1-r4-report.md` for the disposition table).
- Idempotent closeout: `closeoutWorktree`'s `!entry` branch now distinguishes "genuinely
  absent" (no dir, no local branch -> absent/absent) from "dir gone, branch survives" (absent
  + a real `git branch -d`) from "still ambiguous" (foreign-OS path, or a real unregistered
  dir -> unchanged R2-8 refusal). `closeoutRecord`'s origin-branch step reports `absent`
  (not `refused`) specifically when the reason is "not found on origin" - every other keep
  reason is still a real refusal. New tests: a full `closeoutRecord` run twice on one
  fixture (exit 0 both times, every step `absent` on run 2), plus targeted
  `closeoutWorktree` unit tests for all three branches, in both janitor.test.mjs and
  work-record-closeout.test.mjs.
- Territory (4 test files, no source files as direct args - see gate note below): 406
  tests, 403 pass, 1 fail (pre-existing STALE), 2 skipped.
- Full gate: 2684 tests, 2678 pass, 1 fail (pre-existing, out-of-scope docs/GOALS.md
  STALE-regex drift test), 5 skipped. Log: `reports/C1-r4-gate.log`.

Round 3 (prior): all R2-1..R2-4 blockers + R2-6..R2-10, L5 replaced, fixed and committed.
Round 2/1 (prior): see round-3 state entry in git history of this file.

## Next
Nothing pending in my territory that I know of. Lead may merge `wt/lane-closeout-1-C1` to
main. M7 (performance) stays deferred, per the round-3 ruling.

## Open questions
None outstanding.

## How to run my gate
Territory tests (NOTE: pass only the 4 `*.test.mjs` files, not `work-record.mjs`/
`janitor.mjs` directly - those two, run standalone via `node --test`, execute their own CLI
`main()` against the real repo and node's runner reports that as a spurious "test failed";
harmless but noisy, so the 4-file form below is what actually isolates this territory):
`cd /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1 && node --test scripts/work-record.test.mjs scripts/work-record-closeout.test.mjs scripts/janitor.test.mjs scripts/record-closed-and-skip.contract.test.mjs`

Full gate (already run, see `reports/C1-r4-gate.log`):
`node scripts/run-tests.mjs > /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/reports/C1-r4-gate.log 2>&1`
