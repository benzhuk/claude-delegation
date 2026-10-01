VERDICT: PASS

# Lane 37 independent advisory-budget fix

Base artifact: 786d1d5592e1e40b141c72002814b8ab3bab5dc5.

Cause: runCodexHook applied one existing 450 ms withBudget race to Promise.all([advisory, route]). A route that missed its deadline caused the completed advisory to be discarded with the route, even though peer delivery had already been composed.

Discriminating check: an in-process probe with an immediate goalContextForLead and a never-resolving injected nativeRouteForLead yielded empty context after the 450 ms race; replacing the route with immediate null yielded ADVISORY-READY. This removes child-process scheduling, metadata, trust, and fixture environment from the explanation.

Fix location: hooks/multi-codex-hook.mjs. Advisory and native route now have independent withBudget calls using the unchanged ROUTE_TIMEOUT_MS + 50 (450 ms) ceiling and are awaited together. A timed-out route remains silent without erasing a completed advisory.

Gate: node --check hooks/multi-codex-hook.mjs exit 0; node --test hooks/multi-codex-hook.test.mjs exit 0, 13 tests, 13 pass, 0 fail, 0 skipped. The process-owned Global\claude-verify mutex was acquired with a 60 s bound and released. Raw output and immediate native exit: C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/builder/final-budget-fix.raw.log and .exit.

Simplification: no timeout was enlarged and no state, runner, child lifecycle, or host-event policy changed. The adapter still uses the existing 400 ms route timeout, preserving the outer 700 ms PostToolUse budget.

Limitations: this lane did not rerun the full suite. The independent test author owns the deterministic regression in hooks/codex-unsupported.test.mjs; that file remains unstaged here.
