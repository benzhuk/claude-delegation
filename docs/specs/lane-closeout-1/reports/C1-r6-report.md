DONE b0f26339fac8346a4fedabe2e36d4c4adf6a8052

# C1 round 6 report (lane 36, lane-closeout): test files only

Round: 6. Territory: C1. Branch `wt/lane-closeout-1-C1`, started clean at
`22964783b1e26331ce3c3a503ee38028e1a09188` (verified `git status --short` empty), landed
at `b0f2633` after this round's commit.

Goal: this territory serves "rework after acceptance" (fix commits and review rounds on a
shipped territory) by closing the two review rounds' outstanding findings (R5-1/W3, R5-2)
with verbatim patches and mutation proof, so this lane does not recur as a fix commit after
merge. Nearest NOT: "a rule no script checks" - both new tests are backed by a mutation
proof that fails without them (m5, m6), not an unchecked assertion.

Per addendum-C1-r6.md, this round changes test files only: scripts/janitor.test.mjs and
scripts/work-record-closeout.test.mjs. No code file (janitor.mjs, work-record.mjs) or doc
was touched.

## Rulings applied

### R5-1 / W3 (MAJOR, lead re-ruled): host-foreign values in the two W1 spec tests

The lead lifted "do not edit these tests" for exactly these two tests and gave the
reviewer's one-line patch verbatim.

- **janitor.test.mjs:2575** (`closeoutWorktree: idempotent - a foreign-OS-shaped
  Worktree: value stays refused worktree-unresolved`): the hardcoded `worktreeField:
  "C:/Users/benzh/orca/workspaces/x/idem-foreign-1"` is replaced with
  `const foreign = process.platform === "win32" ? "/home/ben/orca/workspaces/x/idem-foreign-1" : "C:/Users/benzh/orca/workspaces/x/idem-foreign-1";`
  and `worktreeField: foreign`, applied verbatim from reports/C1-review-r5.md.
- **work-record-closeout.test.mjs:1531** (`closeoutRecord: idempotent - a foreign-OS-shaped
  Worktree: value stays refused worktree-unresolved (exit 2)`): the `worktree:` field is
  replaced with the same ternary inline, applied verbatim.
- Every asserted step, detail string and exit code is unchanged in both tests.
- No code file was touched; janitor.mjs:1256-1259 (`hostAbsolute`) is untouched.
- On this host (Linux/posix), both tests are functionally unchanged: they still use the
  `C:/...` value and pass. On win32 they will now use the `/home/ben/...` value and, per
  the reviewer's repro and the lead's Windows finding (W3), should pass there too.

### R5-2 (MINOR, advisory): two R4-5 `ls-remote` confirm tests, added verbatim

Added to work-record-closeout.test.mjs, immediately before `after(`, verbatim from
reports/C1-review-r5.md:
- `closeoutRecord: R4-5 - a narrow fetch refspec (no refs/remotes/origin tracking ref)
  with the branch still on origin is refused, never reported absent`
- `closeoutRecord: R4-5 - a failed git ls-remote on the absent path refuses UNVERIFIABLE
  (exit 2), never reports absent`

Both pass on `b0f2633` (see territory gate below).

### Suite collisions

Per the addendum, this is pre-existing and owned by lane 46 (per-run TMPDIR). Not touched
in this lane. All suite runs below were serial, one at a time, each under `timeout`.

## Mutant results

Mutation proofs ran only on scratch `git archive -o` extracts of the committed HEAD
(`b0f2633`), under
`/tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C1-r6-mut/`.
Each extract was made with `git archive --format=tar -o <file> HEAD` then untarred as a
separate command; no pipe was used at any step. The live worktree was never mutated. Each
suite ran serially, one copy at a time, under `timeout 300`.

Baseline (`base2/`, unmutated): `timeout 300 node --test --test-reporter=tap
scripts/work-record-closeout.test.mjs scripts/janitor.test.mjs` -> 162 tests, 160 pass,
0 fail, 2 skipped.

| Mutant | Edit | Result | Test(s) that caught it |
|---|---|---|---|
| m5 (R5-2) | work-record.mjs:2239, `if (!ls.error && ls.status === 2)` -> `if (true)` | **KILLED** (158/2) | both new R4-5 tests: the narrow-refspec test and the failed-ls-remote test |
| m6 (R5-2) | same line -> `if (ls.status !== 0)` (fail-open) | **KILLED** (159/1) | the failed-ls-remote test only, matching the reviewer's own prediction exactly |
| mHostAbsolute (R5-1, discriminating check) | janitor.mjs:1257, `const hostAbsolute = platform === "win32" ? ... : path.posix.isAbsolute(wf);` hardcoded to `const hostAbsolute = true;` (i.e. the classifier removed) | **KILLED** (155/5) | 5 tests fail, including the just-patched `closeoutWorktree: idempotent - a foreign-OS-shaped Worktree: value stays refused worktree-unresolved` (janitor.test.mjs). This is the addendum's discriminating check: on Linux, with `hostAbsolute` removed, the patched test still fails, as required. |

The mHostAbsolute mutant was not explicitly ordered by the Rulings section (only R5-2 asks
for mutation proof), but the addendum's "Research/Discriminating check" text describes
exactly this check, so it was run as additional verification of R5-1. m5 and m6 are the
two mutants the ruling (R5-2) explicitly asks each new test to kill.

## Gate numbers

Both runs used `timeout`, run one at a time, on the real worktree
(`/home/ben/Code/claude-delegation-wt/lane-closeout-1-C1`) at `b0f2633`. Full log:
`reports/C1-r6-gate.log`.

- **Territory** (`timeout 300 node --test --test-reporter=tap scripts/work-record.test.mjs
  scripts/work-record-closeout.test.mjs scripts/janitor.test.mjs
  scripts/record-closed-and-skip.contract.test.mjs`): **412 tests, 409 pass, 1 fail, 2
  skipped.** The one failure is the pre-existing `docs/GOALS.md ... STALE regexes` test
  (unrelated to this territory). This is +2 tests / +2 pass over round 5's 410/407,
  matching the 2 new R5-2 tests.
- **Full gate** (`timeout 900 node scripts/run-tests.mjs`): **2690 tests, 2684 pass, 1
  fail, 5 skipped.** The one real failure is the same pre-existing STALE test
  (`scripts/work-record.test.mjs:2458`); a "probe" child-run failure earlier in the log is
  an intentional test of `run-tests.mjs` itself, not a real failure (same as noted in
  C1-r5-windows-findings.md). +2 tests / +2 pass over round 5's 2688/2682, matching the 2
  new tests.

## Deviations / assumptions

- None from the addendum's rulings. The only judgment call was running the
  `mHostAbsolute` mutant in addition to the two explicitly required (m5, m6), since the
  addendum's research section describes exactly that check; it is additional evidence,
  not a substitute for m5/m6.
- Scratch mutation directories under `.../scratchpad/lane-closeout/C1-r6-mut/` were left in
  place (no `rm`), per the rule against shell deletion commands; they are outside any repo.

## Commit

`git add scripts/janitor.test.mjs scripts/work-record-closeout.test.mjs` then a single
conventional commit: `test(lane-closeout): host-foreign W1 spec values, add R4-5 ls-remote
confirm tests` -> `b0f2633`. Not pushed. `reports/C1-state.md` updated.
