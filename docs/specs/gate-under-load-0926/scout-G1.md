## Files and symbols
- Survey base: `68d2a154505665f98280d73e88e4a4d6cf05b020`; supplied spec text is present at this pack path, but `git show b786916:docs/specs/gate-under-load-0926/spec.md` does not exist (that commit instead adds `docs/specs/2026-09-26-gate-under-load.md`).
- `hooks/delegation-reminder.test.mjs` exists. Lines 340–356 seed tally 35, fan out 45 async hook processes, and require one output containing `GOAL:`; its own comment (344–348) describes the accepted lossy design.
- `hooks/delegation-reminder.test.mjs` lines 811–822 time five synchronous child-process calls, asserts `<400ms` at 820, then asserts the tally is five at 821.
- `docs/sealed-tests.md` exists; its Shape section says `scripts/run-tests.mjs` accepts the whole suite or an explicit file list, so one opt-in sentence fits without a runner change.
- Hook premise check: `delegation-reminder.js:239–252` has an unlocked append and returns 0 on any failed append/stat; `:417–428` fires only when tally `>=40` or overdue; overdue is 30 minutes (`:421`, `:82`). Thus after seed 35 and a fan-out that loses enough appends, one immediate sequential call can still be below 40. The stated “delayed, never cancelled” fallback is time-based (`:196–207`), so the spec’s proposed immediate-call guarantee conflicts with this base.

## Helpers to reuse
- `hooks/delegation-reminder.test.mjs:83–106` provides `runHook` (sequential) and `runHookAsync` (concurrent real-pipe child); use these rather than a new process harness.
- `hooks/delegation-reminder.test.mjs:140–149` provides `tally`/`seedTally`, including the `.fired` clock seed.
- `scripts/run-tests.mjs:56–110` provides the sealed runner; it rejects flags at `:113–120`, matching the spec’s no-new-runner-knob constraint.
- `docs/concurrency-budget.md` supplies the existing verification-mutex/load-runner guidance for the required under-load validation; no project-specific load helper was found.

## Tests that police this area
- `hooks/delegation-reminder.test.mjs:319–338` is the sibling loss test: upper bound `count <= n`, positive floor, and no early output. It constrains G1 not to weaken the accepted-loss protection.
- `hooks/delegation-reminder.test.mjs:368–385` pins ordinary threshold, reset, and next-batch behavior; `:387–401` separately pins the time-floor fallback.
- `hooks/delegation-reminder.test.mjs:803–809` prohibits child-process/network primitives in the hook source; G1 should remain test/docs-only.

## Open questions for the spec
- Given base behavior, should the new test prove a deterministic immediate threshold crossing (which needs a durable-count premise), or prove the existing 30-minute fallback by controlling/advancing the fired timestamp? One extra immediate call after a lossy fan-out cannot prove “never cancelled.”
- Is the supplied pack copy the authoritative spec artifact, or should builder provenance reference b786916’s differently named tracked spec file?
