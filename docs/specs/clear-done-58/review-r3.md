VERDICT: APPROVE 59b6222d6fc80960e451d003f6bf22272f9ea49c

# Lane 58 delta verify r3: 14fc09d..59b6222 (branch head e1bf6c9)

Scope: this checks the review-r2 F1 test patch only. The worktree was not modified: `git status --short` is empty. The mutation copies are `git archive 59b6222` extracts under /var/tmp/l58r3-bkoa, and every run used TMPDIR=/var/tmp. Written 2026-09-29 15:51 EDT.

Cause: the two "yields null and never opens the capture" tests used a fake `openPrivateCapture` that threw. The read layer's `catch { return null; }` swallowed that throw, so both tests passed even with their guard deleted.
Discriminating check: the fake now returns a valid capture, and each test asserts it returned null and was never opened. Each guard, removed on its own scratch copy, now turns exactly its own test red.
Fix location: skills/decisions/scripts/decisions-render-publish.test.mjs:193-211, commit 59b6222. No source change.
Simplification: none needed. The fix adds one flag and one assertion per test, and no helper.

## Checks

1. **The patch is verbatim.** The file `skills/decisions/scripts/decisions-render-publish.test.mjs` at 59b6222 is byte-identical (`diff` prints nothing) to my scratch copy with the r2 patch applied (/var/tmp/l58r-6SaC/r2).
2. **Nothing else changed in code.**
   - `git diff --stat 14fc09d 59b6222 -- skills/ scripts/` touches only `decisions-render-publish.test.mjs` (+6 −2).
   - The other files in that range are docs (docs/specs/clear-done-58/build-r1.md, review-r2.md, and the work record).
   - The branch-head commit e1bf6c9, on top of 59b6222, touches only docs/specs/clear-done-58/build-r2.md and the work record.
   - The source `decisions-render-publish.mjs` is unchanged from 14fc09d.
3. **Both tests now discriminate. Measured:**

   | copy | publish test file |
   |---|---|
   | 59b6222 unmodified | 54/54 pass |
   | observedUncheckedAt guard deleted | 53/54; fails only "an ACCOUNTED round whose unchecked page was already observed yields null and never opens the capture" |
   | NEEDS_RECONCILIATION added to `acceptableStatuses` | 53/54; fails only "a NEEDS_RECONCILIATION wrapper still yields null and never opens the private capture". It fails on the null assertion: actual `{ round: 4, tickAt: null, triples: [...] }` |

## Prior findings
- r1 F1 (MAJOR, the M8 hole): fixed at 14fc09d, verified in r2.
- r1 F2 (MINOR, SKILL.md wording): fixed at 14fc09d, verified in r2.
- r2 F1 (MINOR, tests that could not fail): **fixed** at 59b6222, verified above.

No open findings.

Scratch: /var/tmp/l58r3-bkoa (the base, mutA and mutB copies). Nothing was deleted, per the brief.
