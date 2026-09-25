VERDICT: PASS f0f32e91209101ec3886cbb77c6e7c4cf887defe

Work: wr-2026-09-25-codex-parity-p1 (P1 Codex hook parity)
Base observed: 7f188b0d0aea4dd5539285aa92b3abab03358d94
Commit: 5225d2181d907ed0d39960c445599c59683a9a45 (`feat(hooks): add Codex goal context parity`)
Parity correction delta: 455b3ab3371aca809ee644189295f4ac4f5a6b78 (`fix(hooks): preserve Codex advisory parity`)
Isolation correction delta: f0f32e91209101ec3886cbb77c6e7c4cf887defe (`test(hooks): isolate Codex goal fixtures`)

Changed only owned P1 files: `hooks/multi-codex-hook.mjs`, `hooks/multi-codex-hook.test.mjs`, `hooks/lib/goal-context.mjs`, and `hooks/delegation-reminder.js`.

The shared helper now supplies card rendering, rejection text, bearings text, and the SessionStart lead-id hint to both adapters with explicit injected environments. The Codex hook adds advisory context only for positively classified leads at SessionStart/UserPromptSubmit, preserves all existing peer/continuation output and pane messages, and applies a separate 500 ms advisory budget. Synchronous filesystem work remains non-preemptible by that budget.

Validation: `node scripts/run-tests.mjs hooks/multi-codex-hook.test.mjs hooks/delegation-reminder.test.mjs scripts/goal-card.test.mjs` passed 84/84 tests in 9.878 s under a fresh sealed home. `git diff --check` passed. Baseline before edits: 80/80 plain-node scoped tests.

Delta validation: the same sealed focused command passed 87/87 tests in 11.518 s. It covers two-newline advisory separation, compact pane suppression, shared Claude lead-id wording, missing/rejected-card peer preservation, and rejecting/stalled advisory isolation.

Limits: no native installed/live hook smoke, no full suite, no new events/registrations/state/timers, and no Codex cadence beyond SessionStart/UserPromptSubmit.

Post-build integration probe: FAIL. The independently authored probe's child fixture omits `agent_id` while using a parent `session_id`; the pinned native classifier therefore returns `unknown` and preserves existing peer delivery. Its expectation of child suppression conflicts with the pinned unknown-identity behavior. The probe was not modified and source was not broadened.

## Independent review correction

Cause: a pre-existing confirmed-lead test fixture omitted `AGENTS_HOME`, so the new advisory could consult the real home; its continuation handler also lacked a scratch environment. New tests had ambient and injected homes equal, so they did not prove dependency injection won.

Discriminating check: an ambient scratch home carrying `ws-off` and a distinct clean injected scratch home still produces the goal card. This fails if the adapter is changed to use `process.env` instead of its injected environment.

Fix location: `hooks/multi-codex-hook.test.mjs` supplies scratch `AGENTS_HOME` to both the fixture environment and `continuationDeps`; `hooks/multi-codex-hook.mjs` now accurately states that the advisory race cannot preempt synchronous card or bearings receipt/evidence reads.

Simplification: no runtime behavior changed. Existing lazy imports, composition, and the separately documented unref-timer limitation remain unchanged.

Validation: `node scripts/run-tests.mjs hooks/multi-codex-hook.test.mjs hooks/delegation-reminder.test.mjs scripts/goal-card.test.mjs` passed 88/88 in 12.882 s under a sealed home; `git diff --check` passed.
