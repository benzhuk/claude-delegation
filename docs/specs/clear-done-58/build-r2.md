DONE

# Lane 58 fix round 2: patch review-r2.md's F1 into decisions-render-publish.test.mjs

Worktree: /var/tmp/lane-58/wt (branch build/clear-done-accounted-1)
Scratch: /var/tmp/l58c-xTN8 (base/mut1/mut2 copies), TMPDIR=/var/tmp throughout. Nothing deleted.

## Patch applied

Applied docs/specs/clear-done-58/review-r2.md's F1 "Replacement" block verbatim to
skills/decisions/scripts/decisions-render-publish.test.mjs:193-209 (the two tests
"a NEEDS_RECONCILIATION wrapper still yields null and never opens the private capture"
and "an ACCOUNTED round whose unchecked page was already observed yields null and
never opens the capture"). The fake `openPrivateCapture` now returns
`Buffer.from(pageWithComment('hello'), 'utf8')` and records `opened = true` instead of
throwing; each test asserts `capture === null` AND `opened === false`. `pageWithComment`
is the file's existing hoisted helper (line 770); no new helper was added.

`git diff --stat`: 1 file changed, 6 insertions(+), 2 deletions(-). No other file touched.

## Mutation proof (on mktemp copies, not the worktree)

Scratch `/var/tmp/l58c-xTN8` holds three full rsync copies of the worktree (minus .git):
base (patched tests, unmutated source), mut1 (guard deleted), mut2 (NEEDS_RECONCILIATION
accepted). Each run via `node scripts/run-tests.mjs skills/decisions/scripts/decisions-render-publish.test.mjs`
inside its own copy, TMPDIR=/var/tmp.

- **base** (patched tests, real source): 54 tests, 54 pass, 0 fail.
- **mut1** — deleted `if (st.status === 'ACCOUNTED' && st.receipt.observedUncheckedAt) return null;`
  from decisions-render-publish.mjs: 54 tests, **53 pass, 1 fail** — the failing test is
  exactly "an ACCOUNTED round whose unchecked page was already observed yields null and
  never opens the capture" (assertion failed: expected null, got the real capture object).
- **mut2** — added `'NEEDS_RECONCILIATION'` to `acceptableStatuses` in
  decisions-render-publish.mjs: 54 tests, **53 pass, 1 fail** — the failing test is exactly
  "a NEEDS_RECONCILIATION wrapper still yields null and never opens the private capture"
  (assertion failed: expected null, got the real capture object).

Each mutation fails only its own named test; no other test regressed in either mutant. This
confirms the patch discriminates as claimed in review-r2.md's F1.

## Real-worktree test runs (unmutated, in /var/tmp/lane-58/wt)

- `node scripts/run-tests.mjs $(find skills/decisions/scripts -name "*.test.mjs")`:
  **509 tests, 509 pass, 0 fail.** (review-r2.md saw 508/509 on an archive copy because
  that copy wasn't a git repo; the real worktree has no such gap.)
- `TMPDIR=/var/tmp node scripts/run-tests.mjs` (full suite, once):
  **3035 tests, 3030 pass, 0 fail, 5 skipped.**

## Commit

`59b6222` on branch `build/clear-done-accounted-1`:
"test(decisions): use a valid fake capture in the NEEDS_RECONCILIATION and observed-unchecked tests"
Not pushed.

## Deviations / notes

None. Patch applied verbatim as specified; no source changes; scratch copies were rsync'd
manually (git archive HEAD would have missed the uncommitted test edit, and the repo has
no package.json/node_modules — plain node --test via scripts/run-tests.mjs). Scratch dir
/var/tmp/l58c-xTN8 (141M) left in place per no-delete rule.
