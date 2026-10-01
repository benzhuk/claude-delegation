VERDICT: FAIL — KNOWN BASELINE ONLY 4aa46f3978c28ae901996e9cc4863a969704c4d5

# Lane40 merged-main native Windows gate

- Tested SHA: `4aa46f3978c28ae901996e9cc4863a969704c4d5`
- Parents: `3d5f21467fc3cf6ceea555c5e3481e3dc6b17dfe` and `0edd4d934a38e1c177ea6b0892aba4726089b2ae`
- Checkout: `C:\Users\benzh\Code\claude-delegation`
- Command, invoked exactly once in the normal native environment: `node scripts/run-tests.mjs --no-sweep`
- Raw output: `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\knowledge-triage-40\windows-merge-r1\raw.log`
- Exit: `1`
- Totals: 3,379 tests; 3,287 pass; 1 fail; 0 cancelled; 90 skipped; 1 todo.
- Duration: 178,187.0166 ms.
- Leak result: `leak check: 0 new temp entries`.

## Failure classification

### Preserved known baseline

The sole failure is the pre-existing durable-canonical-main baseline:

- Path: `skills/multi/scripts/mirror-shim.test.mjs:177:1`
- Name: `R4: Windows plans BOTH shims — .cmd for cmd/PowerShell, extensionless for Git Bash`
- Assertion: expected 8 shim actions, got 10 (`10 !== 8`). The additional actions are the durable-main `reclaim.cmd` and extensionless `reclaim` pair.

This baseline was independently reproduced before lane40 and proved byte-identical at first parent `07671c9ab4d855711e063dc0524dbb914c003c34`, the lane40b merge `4faa110328b9e5f7543e6a48d209a79ef859dc4c`, and reviewed candidate `4f4edbc4e470e6faa4f9598763dbb4800468bb3e`. Its retained diagnosis is:

`C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\census-reader-40b\merge-failure-diagnosis.md`

### New failures

None. Every lane40-specific test completed green, including the knowledge-triage installer, gather/reconciliation, archive safety, notification, and schedule behavior exercised by this suite.

## Execution controls

- HEAD matched the supplied SHA before and after the run.
- `DELEGATION_REVIEW_RUN` was naturally absent and was not changed.
- The runtime competing-suite check found zero `node.exe` processes running `run-tests.mjs` or `node --test`.
- Nonblocking acquisition of `Global\claude-verify` succeeded; the mutex was held through raw-log close and released in `finally`.
- `git status --porcelain --untracked-files=no` was empty before and after the run.
- The failing runner retained its sealed home at `C:\Users\benzh\AppData\Local\Temp\delegation-test-run-10512-omMbdx\sealed-home-IjK4QD` for inspection.
- No marker manipulation, environment adjustment, source or record edit, commit, rerun, repair, broad diagnosis, or cleanup was performed.
