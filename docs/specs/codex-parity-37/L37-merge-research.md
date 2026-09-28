VERDICT: BLOCKED

# Lane 37 main-merge advisory research

## Observed failure

The sealed Windows suite on local-only merge `2bad23a593d3c86bf808e6ee0da6a1dd61c21e09` had one failure: `hooks/codex-unsupported.test.mjs:209`, which retained peer context but lost `ADVISORY-PRESERVED`. The suite report is `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/main-merge-windows/sealed-suite.raw.log` (2675 pass, 1 fail, 12 skipped).

## Cause

`runCodexHook` puts the independent goal/card advisory and native route into one `Promise.all`, then applies one 450 ms `withBudget` race. If the route remains unresolved at that deadline, the race returns `null`; destructuring then makes *both* `advisory` and `route` absent. A completed advisory is therefore discarded solely because the route missed its advisory deadline. Peer delivery survives because it is composed before this await.

This is at `hooks/multi-codex-hook.mjs:216-219` and `:255-257`. The nearby comment at `:208-210` says advisory work is raced separately from peer delivery and an unresolved/rejected advisory drops only goal context. The implementation additionally drops a resolved advisory when the unrelated route is unresolved.

## Deterministic discriminating probe

No source or test was edited. From the integration checkout, an in-process module probe injected an immediate `goalContextForLead` result (`ADVISORY-READY`) and a `nativeRouteForLead` that never resolves, while holding the process alive just long enough for the existing unref'd budget timer. It produced:

```json
{"immediate":"ADVISORY-READY","never":""}
```

Replacing the route with immediate `null` produced the advisory. This isolates the aggregate `Promise.all` deadline from child exit timing, trust, metadata, fixture HOME, and the test's wall-clock assertion. The full-suite test becomes host-load sensitive because child close can sometimes complete before 450 ms, but its missing-advisory observation is an actual aggregate-race behavior, not a false timing requirement.

## Minimal ruling recommendation

Treat this as an advisory-isolation defect: preserve a resolved advisory when a route times out, without increasing any deadline. Apply the existing 450 ms bound independently to advisory and route promises, then compose their settled-or-null values. Keep `ROUTE_TIMEOUT_MS = 400`, preserve the outer native PostToolUse budget, route silence on timeout, and existing child kill/close behavior. Do not introduce state, a new runner, or a wider SessionStart budget.

This is a bounded adapter-only change. The route may still contribute no context after its deadline; the requested behavior is only that it must not erase independently completed goal/card context. A focused regression should use the deterministic never-resolving injected route plus immediate advisory, rather than a child-process wall-clock threshold.

## Limitation

This research does not modify the failed local merge, source, tests, docs/work records, or remote refs, and does not rerun the sealed suite. A code change and focused gate remain required before the merge can proceed.
