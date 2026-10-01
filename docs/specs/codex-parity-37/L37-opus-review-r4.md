APPROVE 11a1023e47aeb94d7646d21c1b4c9b4cdc0bc883

Lane 37 codex-parity delta review, 66bd1b4..11a1023, production change in hooks/multi-codex-hook.mjs. Reviewer: Claude Opus 5.5 (claude-opus-5-5), subagent of skills-fable session 9c61c35a-82dd-4aef-8eca-c99bb0e72e31. Worktree scratchpad/wt-review-37c, detached at 11a1023, left in place and clean.

## The fix is correct

- Before, the goal advisory and the native route shared one Promise.all under one 450 ms deadline, so a hung route threw away an advisory that had already finished. Now each gets its own withBudget(…, ROUTE_TIMEOUT_MS + 50) (hooks/multi-codex-hook.mjs:216-223), and both are awaited together at :259.
- A slow route no longer starves a ready one. Each promise resolves on its own value or on its own timer.
- A rejected promise is caught inside its own chain and becomes null. A hung promise becomes null when its own 450 ms timer fires. In both cases the other result is kept.
- Wall clock does not grow. Both start at the same instant and run while peer delivery runs, so the worst case is still about 450 ms after start, the same as before. That fits the 700 ms PostToolUse budget and the 2500 ms general budget, and is far under the 30 s and 60 s handler timeouts in hooks/codex-hooks.json.
- Peer delivery is outside both deadlines and is still composed first.

## The never-route proof is a real test

The test gives the route a promise that never settles and checks that the finished advisory survives. I ran it against the 66bd1b4 wrapper source: 0 pass, 1 fail. It passes against 11a1023. The expectation is unchanged; only the bug differs. The file was restored and the worktree is clean. A second case checks that a route that finishes and an advisory that finishes both appear, alongside peer delivery.

## Gates at 11a1023, run once

| Test file | Pass | Fail |
|---|---|---|
| hooks/codex-unsupported.test.mjs | 8 | 0 |
| hooks/multi-codex-hook.test.mjs | 13 | 0 |

The SessionStart wiring and backlog-notice tests from the earlier delta reviews are in that file and still pass.

## MINOR, non-blocking

- The test no longer checks how long runRoute takes when a route hangs. It used to assert under 650 ms, and that assertion was dropped. The bound still exists in code: runRoute kills the child at 400 ms, and withBudget caps the wait at 450 ms. Nothing now fails if a later edit removes the kill timer. Suggested fix: restore a loose check, for example `assert.ok(Date.now() - started < 2000)`, which survives a loaded host and still catches a missing kill.

No regression to the wiring or backlog paths. Earlier non-blocking follow-ups are unchanged: the routed list in the parity test is typed by hand, and the backlog timer is shared by Claude and Codex panes on one host.

I would merge 11a1023 to main as is.
