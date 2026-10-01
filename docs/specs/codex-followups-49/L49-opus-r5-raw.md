APPROVE d7625e0

Reviewer: lane49-review (Claude Opus 5.5). Delta review in worktree scratchpad/wt-review-49e, detached at d7625e031a61bc34a9bcc8d0fbcdfb8c99114d87. The prior verdict was APPROVE at 4c80552.

## Delta

- `git diff 4c80552..d7625e0 --stat` touches one test file, hooks/codex-unsupported.test.mjs, with 7 lines changed. The rest is evidence and the record, and there is no production change.
- The real-route Stop test now enables `t.mock.timers` for `setTimeout` only. That is the test-context mock tracker, which Node restores automatically when that test ends.
- The test also gets its own 2000 ms timeout.
- The child and outer deadline tests are defined earlier in the file and run on the real clock. Later tests also pass, so the mock does not leak.
- The real backlog-notice child is still spawned, not stubbed. The test asserts that child's exact-session sentinel file in addition to the backlog text.
- The 400 ms and 450 ms deadlines and the 2 s bounds are unchanged.

## Verified directly

- Scoped `node --test hooks/multi-codex-hook.test.mjs hooks/codex-unsupported.test.mjs`: 26 tests, 26 pass, 0 fail.
- Stop-null mutant (`routes = event === 'Stop' ? null : NATIVE_ROUTES[event]`): 25 pass, 1 fails, "Codex Stop must carry the real backlog line in additionalContext text".
- Stop text fallback mutant (drop `?? output?.systemMessage`): 25 pass, 1 fails with the same assertion.
- The file was restored after each mutant, and git status for hooks is clean.
- Not rerun: the 80 ms scratch watchdog claim.

## Test design

This round is done. A functional Stop check should never have raced the production 400 ms kill, and freezing only the parent timer fixes exactly that. Meanwhile the real-clock deadline tests keep the timing guarantees, so no further change is needed.

## Findings

None.
