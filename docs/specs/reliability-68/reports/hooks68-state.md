# hooks68 state

## Territory
Lane 68 items 1, 2 and the item 3 sentence check. Worktree wt-reliability-68-hooks68, branch build/reliability-68-hooks68, base 0f910a7a. Owns scripts/plugin-staleness*, scripts/wiring-check*, hooks/multi-inbox.js, hooks/multi-codex-hook.mjs, skills/multi/scripts/{transport,note-send}.mjs and their tests, and the 11 template files.

## Contracts I rely on
- checkStaleness (scripts/plugin-staleness.mjs) reused unchanged.
- Spec docs/specs/reliability-68/spec.md and brief hooks68.md. census68 owns build-loop-workflow.js (it needs the sentence).

## Done
- Round 2: F1 ledger files dropped, F2 C11 fixed; gate (plus inbox.test.mjs) 535 pass 0 fail.
- A: restartAdvisoryLine plus wiring-check --hook one-liner (d5f88e2b).
- B: insideGitCheckout, registerMainSessionInbox, both hooks, note-send fallback, agent_id guards (79f7c6ba).
- C: sentence in 11 places plus agents.test.mjs test (8fd52133).
- Fixture fixes in three out-of-gate tests (34faa09a).
- Gate: 462 pass, 0 fail. skills/multi/scripts/*.test.mjs plus hooks/*.test.mjs: 1142 pass, 0 fail.
- Report: docs/specs/reliability-68/reports/hooks68.md, VERDICT: PASS.

## Next
- Nothing in territory. Lead: live SessionStart check, Linux suite, census68 adds the sentence to build-loop-workflow.js, mirror-shared-skills on install.

## Open questions
- A main session in a non-git directory is no longer registered (contract). Is some other reach path wanted for it?
- scripts/janitor.test.mjs, collect-status.test.mjs, mirror-shared-skills.test.mjs not confirmed (slow, untouched by this diff).

## How to run my gate
From the worktree root: node --test hooks/multi-inbox.test.mjs hooks/multi-codex-hook.test.mjs hooks/agent-dispatch-guard.test.mjs scripts/plugin-staleness.test.mjs scripts/wiring-check.test.mjs agents/agents.test.mjs skills/multi/scripts/note-send.test.mjs skills/multi/scripts/transport.test.mjs > docs/specs/reliability-68/reports/hooks68-gate.log 2>&1 (the log path is under the lane-68 worktree). Also run skills/multi/scripts/hooks.test.mjs, skills/multi/scripts/inbox.test.mjs, hooks/multi-hook-core.test.mjs.
