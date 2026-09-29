## Files and symbols
- `hooks/multi-codex-hook.mjs:66-106` exists: `ROUTE_TIMEOUT_MS = 400`; `runRoute()` kills then waits for `close` (Windows-safe). The live adapter calls it for wiring/backlog at `:110-131`.
- `hooks/multi-codex-hook.mjs:216-223,294-300` applies a separate outer `withBudget(..., ROUTE_TIMEOUT_MS + 50)`: 450 ms when the constant is 400. The premise holds, but the current test has no elapsed assertion.
- `hooks/backlog-notice.js:27-28,98-103,292-305` already documents and implements `<agentsHome>/ws/backlog-notice.<session_id>`. Claude and Codex pass their hook input unchanged (`multi-codex-hook.mjs:122`), so distinct sessions do not share cadence.
- `codex/README.md:53-68` exists but has no backlog-scope sentence. `docs/census.md` has no stated per-session backlog capability near its wake metrics (`:217-300`).
- `hooks/codex-unsupported.json:1-8` exists; T1 may amend reasons only. No Claude-side source should change.

## Helpers to reuse
- Reuse exported `runRoute` and injected `nativeRouteForLead` in `hooks/multi-codex-hook.test.mjs:209-243`; do not add a production test seam.
- `hooks/backlog-notice.js` exports `sentinelPathFor`, `readSentinel`, and `writeSentinel` (`:349-360`); its child-process fixture helper is `backlog-notice.test.mjs:129-141`.
- `nativeRouteForLead` is the route/matcher evidence; Codex command wiring is read by `nativeCommands()` in `hooks/codex-unsupported.test.mjs:40-43`.

## Tests that police this area
- `hooks/multi-codex-hook.test.mjs:209-243` proves child close/timeout silence and peer/advisory preservation, but never measures elapsed time. Add monotonic elapsed checks: actual 5s child via `runRoute` proves 400 ms kill; injected never-resolving route through `runCodexHook` proves its 450 ms outer limit; each `<2000ms`. Mutating governing `ROUTE_TIMEOUT_MS` to 5000 must make both fail.
- `hooks/backlog-notice.test.mjs:195-203` proves same-session 120s suppression only. Add two distinct session ids against one fixture home/project: first emits, second also emits, then first remains silent; inspect two distinct sentinel paths. This is deterministic and needs no wall-clock wait.
- `hooks/codex-unsupported.test.mjs:209-243` is the current actual native wrapper route test; retain its peer/advisory preservation assertion.

## Open questions for the spec
- The timer finding is stale against base: this is neither a host-wide design nor a defect needing a forbidden Claude-file change; existing shared code is per-session. Should root treat the requested README/census sentence as a documentation-only completion after the two-session test, or waive it because it is a supported guarantee (not an unsupported capability)?
- Does root require an explicit same-session cross-provider contract (same `session_id` intentionally shares a cadence), or is the documented per-session key the complete scope?
