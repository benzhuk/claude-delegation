APPROVE 3def5cf

Reviewer: lane49-review (Claude Opus 5.5), worktree scratchpad/wt-review-49 detached at 3def5cf193ae8e175c88153446831a3410c5b47f, merge-base f7df941.

## Findings

MINOR hooks/codex-unsupported.test.mjs:168 and :170. Inside the parameterized `assertManifestParity`, the route-reaches-wrapper checks call `nativeCommands(route)` with the default on-disk Codex manifest instead of the `codexManifest` argument. With the real files this is equivalent, and the in-memory fake-event test still fails for the right reason, but a validator fed a mutated Codex manifest checks the wrong document on these two lines. Patch:
- old: `assert.ok(nativeCommands(route).some((command) => command.includes('delete-guard.mjs')), 'delete guard must be native PreToolUse');`
- new: `assert.ok(nativeCommands(route, codexManifest).some((command) => command.includes('delete-guard.mjs')), 'delete guard must be native PreToolUse');`
- old: `assert.ok(nativeCommands(route).some((command) => command.includes('multi-codex-hook.mjs')), `${pair.script}/${pair.event} must reach the native wrapper`);`
- new: `assert.ok(nativeCommands(route, codexManifest).some((command) => command.includes('multi-codex-hook.mjs')), `${pair.script}/${pair.event} must reach the native wrapper`);`
Not blocking.

NIT docs/work/wr-2026-09-28-codex-followups.record.md:6. Artifact names 552025157e17 not 3def5cf. The only difference between the two commits is this record file (git diff --stat 5520251 3def5cf: record only), so the code under review is identical; line 9 already says the Artifact is pinned to the approved candidate at acceptance. Set `Artifact: 3def5cf193ae8e175c88153446831a3410c5b47f` at acceptance.

Spec-from reads 2026-09-28T23:59:00Z and the correction from the pickup's 00:03Z is logged on lines 15 and 26. OK.

## Item verdicts

1. Timing: PASS. Two monotonic performance.now() bounds under 2000 ms on the right measurements: runRoute reaping a real hung child, and runCodexHook wall clock with an injected never-resolving route, plus a separate outer-route test that also keeps peer delivery and the ready advisory. Loose enough for a loaded host (whole scoped run 2.8 s here).
2. Parity: PASS. Both inventories are read from hooks/hooks.json and hooks/codex-hooks.json at test time. NATIVE_ROUTES is exported from multi-codex-hook.mjs and consumed by nativeRouteForLead (a test proves changing it changes routing). Interrupt is the single allowance, with its reason inline; no codex-unsupported.json change.
3. Timer: PASS, closed as no-defect. backlog-notice.js keys its sentinel by session_id (line 102, `unknown` fallback). The test runs the real Claude hook and the real runCodexHook with two ids in one home and project, and checks a repeat is silent. The record states the premise was mistaken, and README plus one census line document the shared `unknown` fallback for id-less sessions.
4. Territory: the only hooks/ files changed are codex-unsupported.test.mjs and multi-codex-hook.mjs, both Codex-side. No Claude-side hook file changed. codex/README.md and docs/census.md add two lines each.

## Verified directly (all mutants run in the worktree, files restored, git status clean)

- Scoped `node --test hooks/multi-codex-hook.test.mjs hooks/codex-unsupported.test.mjs`: 25 tests, 25 pass, 0 fail, 2849 ms.
- Outer route limit ROUTE_TIMEOUT_MS+50 to 5000: 2 fail, "runCodexHook must bound an injected never-resolving native route" and "outer route budget must reject the 5-second timeout mutant".
- ROUTE_TIMEOUT_MS 400 to 5000: 2 fail, "default runRoute kill must reap a real hung child" and the outer-budget assertion.
- On-disk fake Claude event: fails "coverage must be exactly one for hooks/fake.mjs/FakeClaude".
- On-disk second Codex wrapper-only event (clone of Interrupt): fails with the Interrupt allowance message.
- On-disk Codex Stop hook with a non-wrapper script: fails the same way.
- Deleting the Codex Stop wrapper event, so a route has no manifest entry: fails "NATIVE_ROUTES.Stop must have an installed Codex wrapper event".
- Dropping session_id in the Codex route input: fails "Codex must write its exact sentinel".

## Taken from the brief or record, not rerun

- The second-host sealed run, and skills-a's own mutant receipts under orca/gates.
