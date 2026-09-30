Work: wr-2026-09-30-mirror-shim
Scope: docs/specs/mirror-shim-59b/spec.md (lane 59b), from skills-fable-janitor-59-4, written by the lead at b52757b9d78c328a4a3a4faaecec2581fa233e18
Owner: skills-n
Status: reviewed
Authority: build and review on plugin branch build/mirror-shim-59b-1; merge on acceptance under the standing grant of 2026-09-26
Next: accept, merge to main, close, RESULT to skills-fable
Artifact: 9bc94906728cb412a549d6147d44222f247fc8be
Evidence: docs/work/evidence/wr-2026-09-30-mirror-shim-review.md, docs/work/evidence/wr-2026-09-30-mirror-shim-windows.md
Worktree: /var/tmp/lane-59b/wt
Scratch: /var/tmp/lane-59b
Opened: 2026-09-30T13:34:35.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-from: 2026-09-30T13:34:00Z
Base: b52757b9d78c328a4a3a4faaecec2581fa233e18
Log: 2026-09-30T13:34:35.000Z owned skills-n opened lane 59b from skills-fable-janitor-59-4 (mirror-shim R4 expects 8 and plans 10 on a durable Windows checkout); Sonnet builder next
Log: 2026-09-30T13:38:49.000Z delivered skills-n Sonnet builder a5c129777cf8b7e8d at 9bc94906728cb412a549d6147d44222f247fc8be (R4 counts the four note shims by name, reclaim gate asserted, red in a durable clone before the fix); scratch clone left at /home/ben/Code/scratch-l59b-9vz1; build.md
Log: 2026-09-30T13:48:49.000Z reviewed skills-n Opus reviewer a5ccc5cd4a88c9966 APPROVE 9bc94906728cb412a549d6147d44222f247fc8be (R4 by name, reclaim gate assertion, no bare PATH shim counts left); Sonnet integrator a157c0ed991826c28 Windows suite in durable checkout C:\Users\benzh\Code\scratch-l59b-win1 PASS

Predicts: rework after acceptance drops, because a durable-path gated count is now tested by name and one gate ran in a durable checkout before merge.
Observed: R4 red in a durable clone before the fix and green after, on Linux and on the Windows durable checkout; one builder round, one Opus review round.
Stall: none.
Gap: lane 59 gates ran only in non-durable locations, so this reached main; the lesson is recorded as a lead memory, not yet a script check.

## Spec
See Scope.
