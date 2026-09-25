VERDICT: PASS (uncommitted integration-owned seam delta)

Finding L1: `hooks/lib/goal-context.mjs` no longer statically imports the bearings state module. `bearingsNotice` now dynamically imports it inside its existing `try`, so a missing optional bearings module returns no notice while the independent card import remains usable.

Observed regression check: `hooks/lib/goal-context.test.mjs` creates a temporary copied helper tree, junctions only the real `scripts` directory for the card dependency, and deliberately provides no copied `skills/bearings` path. It never renames or edits the actual bearings source. The copied helper returns `status: ok` and card text; its bearings notice is null.

Validation: `node scripts/run-tests.mjs hooks/lib/goal-context.test.mjs hooks/multi-codex-hook.test.mjs hooks/delegation-reminder.test.mjs` passed 57/57 under a sealed home (10.813 s). `git diff --check` passed.

Bounds: changed only `hooks/lib/goal-context.mjs` and added `hooks/lib/goal-context.test.mjs`; no source files outside this territory were touched. No `git add` or commit was performed because the integration index is owned by root. Existing unrelated integration worktree changes were preserved.
