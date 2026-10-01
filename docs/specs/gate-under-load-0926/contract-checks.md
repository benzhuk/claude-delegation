# G1 independent contract checks

Run focused checks with `node --test --test-name-pattern <pattern> hooks/delegation-reminder.test.mjs`; this is a reviewer playbook, not evidence that any check has run. Revert every temporary mutation before the next check.

## Concurrency and fallback
1. Confirm the revised MAJOR 2 test retains the 45-process `runHookAsync` fan-out and exit-zero loop. It may accept zero immediate cards only if it then stale-dates the existing `.fired` fixture past `REINJECT_MAX_MS` and requires one sequential `runHook('PostToolBatch', ...)` card output plus exit zero. It must name this time fallback.
2. Temporarily replace the `markFired(sessionId, agentId);` call in `hooks/delegation-reminder.js`'s `PostToolBatch` firing path (base lines 417–436) with `return nothing;`. Focused MAJOR 2 must fail: neither immediate nor forced-due fallback may silently pass when the hook never emits.
3. Force the fallback branch without load: temporarily make the revised test's fan-out count one while retaining its seed of `BATCHES_PER_REINJECT - 5`. Its child is quiet; the test must advance the existing fired timestamp and the next sequential call must emit `GOAL:`. This is a branch fixture, not a concurrency claim.
4. Temporarily change the hook guard to fire one batch early (`n < BATCHES_PER_REINJECT - 1`). The unchanged `PostToolBatch injects on the 40th batch, resets, and not before` sibling must fail at its quiet pre-threshold assertion.
5. Temporarily prevent `markFired` from truncating the tally. That unchanged sibling must fail its reset/next-batch assertions, catching repeat output after a single deterministic crossing. Do not interpret concurrent double fires as a violation: base source explicitly permits racing hooks to fire twice.

## Performance opt-in
6. Inspect the timing test only: it must print the calculated average milliseconds and whether its assertion is armed; the condition must be exact `process.env.DELEGATION_PERF_ASSERT === '1'` (or an equivalent exact-string comparison).
7. Temporarily set its calculated `each` value to `401`. With `DELEGATION_PERF_ASSERT` absent, its focused run must pass and print 401 plus unarmed; with `DELEGATION_PERF_ASSERT=1`, it must fail the 400-ms assertion and print armed. A value other than `1` is an allowed extra negative check, not required evidence.
8. `rg -n "DELEGATION_PERF_ASSERT" hooks/delegation-reminder.test.mjs docs/sealed-tests.md hooks/delegation-reminder.js scripts/run-tests.mjs` must find the runtime env read only in the one timing test; docs may name the opt-in and neither production hook nor runner may read it.

## Scope and unchanged contracts
9. Diff against base `68d2a154505665f98280d73e88e4a4d6cf05b020`: only the two named tests in `hooks/delegation-reminder.test.mjs` and one sentence in `docs/sealed-tests.md` may differ. `hooks/delegation-reminder.js` and `scripts/run-tests.mjs` must be unchanged.
10. Byte-compare the sibling loss test at base lines 319–338; its upper bound, positive floor, and no-early-output assertions must be unchanged. Its focused run remains the control for accepted lossy counting.

## Unknowns
- The controlled branch fixture proves the test exercises the documented time fallback; it cannot prove Windows append-loss frequency. Record that distinction rather than claiming a load measurement.
