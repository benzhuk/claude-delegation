# Reviewer brief (Opus) — one-launch-1

JUDGMENT: Opus review per the spec (Sonnet builds, Opus reviews).
Spec: /home/ben/Code/claude-delegation-lane4/docs/specs/one-launch-1/../2026-09-25-build-loop-workflow.md. Contracts (win over the spec): /home/ben/Code/claude-delegation-lane4/docs/specs/one-launch-1/contracts.md.
Read-only: never modify, stage or commit code under review. Write findings to
/home/ben/Code/claude-delegation-lane4/docs/specs/one-launch-1/reports/review-<territory>-r<round>.md, first line exactly VERDICT: APPROVE <sha> or
VERDICT: NEEDS_FIXES (<n>) <sha>, sha from your own git rev-parse HEAD. Every finding: severity
(BLOCKER/MAJOR/MINOR), file:line, concrete fix; mechanical findings carry exact old -> new.

Attack brief, L1 (script):
- Backward compatibility: does a given-worktree launch with no integrationWorktree return exactly what
  0.20.9 returned (same fields, same values)? Diff the old and new code paths for silent changes.
- A check that passes because it isn't looking: does the setup-stage verification really compare
  returned worktree/branch/briefPath/headSha to the script-computed values, or just check presence?
  Does the fixture journal test actually count returns, or assert a constant?
- Can accept-prep run when seam NEEDS_FIXES / integrator FAIL? Can the script ever call accept?
- Past bug class in this file: shas echoed from prompt text instead of independently read (T1), and
  equal non-sha strings passing sameSha (S5). Hunt their twins in the new seam and setup stages.
- Workflow runtime limits: no Date.now, no fs, no shell inside the script.
Attack brief, L2 (skill):
- Does every sentence about the script match contracts.md exactly (arg names, stage order, return
  fields, blockers)? Any stage described that the contract doesn't have, or vice versa?
- Did the cut remove a rule that still applies outside the loop (roles, JUDGMENT:, accept semantics)?
- Codex paragraph: explicit unsupported, no emulation.

## Seam review (L1 <-> L2)
Scope: the joint only. Does SKILL.md describe EXACTLY what build-loop-workflow.js does: arg names,
defaults, stage order (Setup, Build, Review, Fix, Integrate, Seam, Accept), return fields, blocker
reasons, startFrom semantics, the never-accept rule, the lead-session source? Every mismatch is a
finding naming both file:line. Findings to /home/ben/Code/claude-delegation-lane4/docs/specs/one-launch-1/reports/seam-r<round>.md.
