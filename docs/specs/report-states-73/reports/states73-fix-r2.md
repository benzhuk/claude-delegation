VERDICT: PASS

Fix round 2, territory states73, scope add F1 (round bound visible and checked).

Files changed
- skills/team-build/references/accept-prep.mjs: new `--max-rounds <n>` (non-negative integer, default 3) and optional `--workflow <run id>`; editRecord sets the record's `Workflow:` to `<run id> maxRounds=<n>` when the record names a run (or --workflow is given); `none, <reason>` and an absent line are left alone; a second run replaces the bound.
- skills/team-build/references/build-loop-workflow.js: the accept-prep command now carries `--max-rounds <maxRounds>` (the value the loop used, default 3).
- scripts/work-record.mjs: `MAXROUNDS_FROM` (2026-10-02T03:00:00Z, judged on Spec-from, `opts.maxRoundsFrom` for tests); checkWorkflowField refuses `workflow-maxrounds-missing` for a run-id Workflow line with no `maxRounds=<n>`. Older Spec-from, `none, <reason>`: not refused. Only accept/check-acceptance call it, so accepted records are untouched.
- skills/team-build/SKILL.md, docs/work-record.md: round bound is the `maxRounds` argument, never a peer message; new refusal code documented.
- Tests: accept-prep.test.mjs (5 new + one lane-67 expectation updated), work-record.test.mjs (4 new), build-loop-workflow.test.mjs (2 new: explicit and default 3).

Gate (focused, no full suite): node --test accept-prep, build-loop-workflow, work-record, work-census tests: 449 pass, 0 fail. Docs-touching tests (agents, mirror-shared-skills, report-check, work-record): 354 pass, 0 fail.

Notes
- The cutoff MAXROUNDS_FROM is my choice (03:00Z, just after the 02:20Z ruling) so lane 73's own record (Spec-from 02:50Z, gets its bound from accept-prep) is not stranded.
- The lane's own record still reads `Workflow: wf_1a816e86-f8d`; the next accept-prep run rewrites it with maxRounds.
