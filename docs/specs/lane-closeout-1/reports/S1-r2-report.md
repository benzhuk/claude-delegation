DONE 5bc082a

- scripts/work-record-closeout.test.mjs:1667-1744 — replaced the "sweepOrigin and closeoutRecord never let an inherited GIT_DIR redirect their git calls at a different repo" test block (F1 in S1-review.md) with the reviewer's verbatim patch. No other file, and no other test, was touched.
- Byte-identical check: `diff` of the inserted region (lines 1667-1744 of the file after the edit) against the reviewer's `new-test.txt` produced no output and exit code 0.
- `git diff --stat` confirms exactly one file changed: `scripts/work-record-closeout.test.mjs | 48 +++++++++++++++++++++++++----------` (35 insertions, 13 deletions).

## Gate results (docs/specs/lane-closeout-1/reports/S1-r2-gate.log)

- `timeout 300 node scripts/run-tests.mjs scripts/work-record-closeout.test.mjs`: tests 68, pass 68, fail 0, cancelled 0, skipped 0, todo 0. Exit 0. `leak check: 0 new temp entries`.
- `timeout 900 node scripts/run-tests.mjs` (full suite): tests 2907, pass 2902, fail 0, cancelled 0, skipped 5, todo 0. Exit 0. `leak check: 0 new temp entries`.

## Commit

- Staged only `scripts/work-record-closeout.test.mjs` (verified with `git status --short` before commit; the gate log stayed untracked).
- Commit `5bc082a` on `build/lane-closeout-1`: "test(work-record): seam test kills every per-call env mutant (S1 r2)", no trailers, not pushed.
