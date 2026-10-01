VERDICT: FAIL 1775 of 1777

## Windows second-host gate — withdraw-status-1

- Windows HEAD sha: `481b6d736e2ab8f45277a382a883796aea2616a3` (confirmed via `git rev-parse HEAD` after `git checkout --detach` in a bundle clone at `C:\Temp\wd-suite`)
- Bundle source: `git -C /home/ben/Code/wt-withdraw bundle create ... build/withdraw-status-1 main`. `build/withdraw-status-1` on the Linux source repo already pointed at `481b6d736e2ab8f45277a382a883796aea2616a3` (confirmed by `git rev-parse` before bundling), so no temporary ref was needed.
- Node version on the Windows host: `v24.18.0`
- Command: `node scripts/run-tests.mjs > C:\Temp\wd-suite-gate.log 2>&1`, run in the background via `start /b` over SSH, polled to completion (~458s runtime).

### Totals

```
tests 1777
suites 0
pass 1775
fail 2
cancelled 0
skipped 0
todo 0
duration_ms 458191.7566
```

### Failing tests

Both failures are in `hooks\delegation-reminder.test.mjs`, both timing/concurrency-threshold assertions.

1. **`MAJOR 2: concurrent PostToolBatch hooks past the threshold DO fire (round 1 fired zero times)`** (`hooks\delegation-reminder.test.mjs:340`)
   AssertionError: `45 concurrent batches fired 0 times; never firing is the one unacceptable outcome`
   **Fails on base b7ddf11 too** — rerun of the full test file alone in a second clone (`C:\Temp\wd-base`, `git checkout --detach b7ddf11`) via `node --test hooks\delegation-reminder.test.mjs` reproduced the identical failure at base, with the identical assertion message. Pre-existing/timing-sensitive on this host, not a withdraw-status-1 regression.

2. **`the hook is fast enough to sit on every tool batch`** (`hooks\delegation-reminder.test.mjs:811`)
   AssertionError: `below-threshold PostToolBatch averaged 414.4ms`
   **Does not fail on base b7ddf11** — same isolated rerun of the file at base passed this test (`✔ the hook is fast enough to sit on every tool batch (1091.3849ms)`). Note the base rerun was of this one file alone, not the full 1777-test suite; the branch failure occurred under the CPU contention of the full concurrent suite run, so this reads as a load/timing-sensitive threshold flake rather than a confirmed functional regression, but it did not reproduce under the base comparison run as executed.

### Evidence

- Full sealed-suite log copied unedited to `/home/ben/Code/wt-withdraw/docs/work/evidence/wr-2026-09-26-withdraw-status-windows-gate.log`.
- Base rerun log (`hooks\delegation-reminder.test.mjs` only, at b7ddf11) was inspected on the Windows host and not retained under `docs/work/evidence/` (not requested by the method) — its content is summarized above.

### Cleanup

`C:\Temp\wd-suite`, `C:\Temp\wd-base`, `C:\Temp\wd-suite-gate.log`, `C:\Temp\wd-base-delegation-reminder.log`, and `C:\Temp\wd.bundle` were all removed in one separate SSH command; `C:\Users\benzh\Code\claude-delegation` was never touched.

## Isolated reruns

Fresh bundle clones at each commit (`C:\Temp\wd-suite` = `481b6d736e2ab8f45277a382a883796aea2616a3`, `C:\Temp\wd-base` = `b7ddf11a07f8988f01e9e44f2061bc49f587fe53`, both re-verified by `git rev-parse HEAD` after `git checkout --detach`), then `node --test hooks\delegation-reminder.test.mjs` run alone three times in each clone in turn (branch's three runs completed before the base clone's three runs started).

`git diff --stat b7ddf11 481b6d7 -- hooks/delegation-reminder.js hooks/delegation-reminder.test.mjs hooks/lib` on Linux produced **no output** — none of those files differ between the two commits.

| Run | Commit | "the hook is fast enough to sit on every tool batch" | averaged ms | "MAJOR 2: concurrent PostToolBatch hooks past the threshold DO fire" |
|---|---|---|---|---|
| 1 | 481b6d7 (branch) | PASS | not printed on pass (checkmark total 639.5772ms) | PASS |
| 2 | 481b6d7 (branch) | PASS | not printed on pass (checkmark total 451.5449ms) | PASS |
| 3 | 481b6d7 (branch) | PASS | not printed on pass (checkmark total 1868.7986ms) | PASS |
| 1 | b7ddf11 (base) | PASS | not printed on pass (checkmark total 1247.9896ms) | PASS |
| 2 | b7ddf11 (base) | PASS | not printed on pass (checkmark total 1200.5613ms) | PASS |
| 3 | b7ddf11 (base) | PASS | not printed on pass (checkmark total 1459.4357ms) | PASS |

(The test only prints an explicit "averaged Xms" figure inside its `assert.ok` message when it fails; all six isolated runs passed, so no such string was emitted — the checkmark total shown by the runner is reported instead as the closest available printed number.)

**Conclusion:** both tests pass cleanly in every one of the six isolated single-file runs, at both commits, and the three touched files are byte-identical between b7ddf11 and 481b6d7 — the two full-suite failures are host CPU-contention flakes from running under the sealed suite's concurrency, not a withdraw-status-1 regression.
