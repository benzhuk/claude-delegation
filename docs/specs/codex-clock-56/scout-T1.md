## Files and symbols
- `hooks/codex-unsupported.test.mjs` exists. Base `c0818c9` has the wrapper CLI check at 233-244, timeout/deadline checks at 277-334, two-session sentinels at 352-380, and the Lane 49 Stop functional pattern at 382-391.
- The stated premise holds: production timeout sources are `runRoute`'s 400 ms child kill (`hooks/multi-codex-hook.mjs:94-99`) and `withBudget`'s 450 ms route/advisory deadline at 226-233, 304-309. This territory need not change production.
- `docs/census.md` is not implicated: the spec supplies no changed census marker, so no census line is presently necessary.

## Helpers to reuse
- `scratch`, `rmLater`, `runnableRecord`, `transcript`, `childEnv`, `context`, and imported `sentinelPathFor` in `hooks/codex-unsupported.test.mjs` already form the fixture/CLI/sentinel harness.
- `t.mock.timers.enable({ apis: ['setTimeout'] })` in the real Stop route check at 387 is the Lane 49 pattern; add explicit `t.after(() => t.mock.timers.reset())` when reusing it.
- `childEnv` (`skills/multi/scripts/test-child-env.mjs`) seals child credentials while allowing a test-only `NODE_OPTIONS` preload when an actual wrapper CLI process must fake its own timers.

## Tests that police this area
- `hooks/codex-unsupported.test.mjs:277-315` is the existing deadline check: real elapsed bounds and no route-content claim; `:317-334` separately proves the outer injected-route deadline.
- `:233-244` is an actual wrapper CLI output assertion, but it currently runs real clocks and asserts no supplied-session sentinel.
- `:352-380` proves exact Claude/Codex per-session sentinel separation and same-id cadence silence; `:382-391` already proves a real spawned Stop child writes its supplied-session sentinel under mocked parent timers.
- No other base test uses `t.mock.timers`; the Lane 49 Stop test is the only existing timer-isolation pattern.

## Open questions for the spec
- Functional direct calls can freeze this test process's 400/450 timers while their real backlog child completes. `spawnSync([WRAPPER])` is a separate process, so the parent mock cannot reach it. Is a per-test temporary preload (passed as sealed `NODE_OPTIONS`, intercepting only 400/450 ms timers and inherited by the real child) approved as test-only injection for the CLI functional check?
- The preload route is technically feasible without a production interface change; its temporary module must be cleaned via `rmLater`, and functional assertions should use Stop to avoid the unrelated 2500 ms main budget.
