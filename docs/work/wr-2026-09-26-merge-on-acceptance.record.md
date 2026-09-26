Work: wr-2026-09-26-merge-on-acceptance
Scope: docs/specs/merge-on-acceptance-1/spec.md (read at origin/docs/lane-specs-0925 aa11302) with lead rulings in docs/specs/merge-on-acceptance-1/contracts.md; territories M1 (merge gate and page entry) and M2 (Done tick wakes an idle lead)
Owner: skills-n
Status: owned
Authority: build, review, integrate and push build/merge-on-acceptance-1 on green without Ben; the dogfood merge into main follows the M1 rule once the second-host suite is green
Artifact: none yet
Evidence: none yet
Next: one launch in setup mode (M1 docs, M2 reduced to the pickup status line), then second-host suite on Windows, then accept
Opened: 2026-09-26T19:30:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-26T15:12:00-04:00
Base: 6d8ba95a33019e30adf4ecb4c5367c4b756f3e1e
Log: 2026-09-26T19:30:00.000Z owned skills-n picked up after lane seven RESULT, base origin/main 6d8ba95 (release 0.20.11)
Log: 2026-09-26T19:45:00.000Z owned skills-n Opus red-team REWORK_M2 (M2 duplicated registered pickup, which is unfed); rulings R1-R8 in contracts.md, M2 reduced to a status line, Windows registration becomes a by-hand item for Ben
Log: 2026-09-26T20:10:00.000Z owned skills-n launch wf_fd1322af-501: setup succeeded, both builders and the integrator died on a revoked login token (401); partial uncommitted work left in both builder worktrees; relaunched in given mode on setup's worktrees and briefs with a recovery section

Observed: pending.
