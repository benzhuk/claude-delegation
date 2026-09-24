VERDICT: APPROVE e9a556d345871bf50352f680c2b2f41bce763cae

# Delta re-review: F1 and F2 fix round (native Claude, Opus 5.5)

Reviewer: the same native Claude Code session `2ccdbe03-d922-418e-8215-c375d3e9538c`, model `claude-opus-5-5`, that wrote `native-claude-instruction-delta-review.md` (verdict `NEEDS_FIXES (2)` on `aa42a11`).
Scope: `delta-review-brief.md`. This checks the fix round as a delta from `aa42a11`; it is not a fresh review. No prior report, work record, candidate packet, plugin, or source checkout was edited. No git, hash, test, or search command was run.

## Reviewed identity

| Item | Value |
|---|---|
| Repair candidate | `e9a556d345871bf50352f680c2b2f41bce763cae` |
| Prior candidate | `aa42a11772998a7b3d95a04c8e43aa37c22ce2b0` |
| Base | `03e3bcee0bbc54884778dee4be1101c933197d47` |
| `skills/team-build/SKILL.md` | blob `cc41356f7b6b05986434d1f9cee5b2a8e099ad2f` (was `bf2f842…`) |
| `docs/agent-pacing.md` | blob `f6335f5f0c3415bfd65623ebfa980fa7791c1902` (was `5aee6da…`) |
| `docs/subagent-contract.md` | blob `e503ea7a2a80cd8fcf71b3ea643d27fe10bb8c3c` (unchanged; not re-read, per brief) |
| `delta-e9a556d/aa42a11-to-e9a556d.patch` | sha256 `bfaaa22a…df84` (manifest) |
| `delta-e9a556d/builder-report.md` | sha256 `db3a2d3e…b5fa` (manifest) |

The identity receipt is the host verification in `delta-e9a556d/snapshot-manifest.json:1-13`. I did not recompute it.

Citations: `PATCH` = `delta-e9a556d/aa42a11-to-e9a556d.patch`, `SKILL` = `delta-e9a556d/skills/team-build/SKILL.md`, `PACING` = `delta-e9a556d/docs/agent-pacing.md`.

## F1: hard budget binding on every rung. RESOLVED

- PACING:37-38 now opens the whole ladder with: "A hard user- or project-supplied budget stays binding on every rung; no extension goes past it". That applies to the On-track rung (PACING:40, "extend the timer once") and the silent-past-2× progress extension (PACING:62). A visible-progress extension can therefore no longer go past the budget.
- SKILL:181-184 now says: "Recorded native progress can justify a bounded extension under that ladder, never past a hard user/project budget, which remains binding; a documented stall, wrong approach, or exceeded hard limit permits stop and recovery." The caller skill and the shared ladder now say the same thing.
- Scenario 4 now has one next action: no extension past the budget, then stop and recover within authority. The reading "progress permits another extension" is gone. The remaining "permits" (SKILL:183) now only names the recovery path. It can't be read as allowing continuation, because both files forbid the extension that continuation would need.
- PACING:65 still ends with "A hard user- or project-supplied budget remains binding." That repeats PACING:37-38 and does not contradict it.
- The fix is my exact proposed wording (PATCH:18-20, PATCH:72-78).

## F2: consumer waits for exact prerequisite until integration. RESOLVED

- SKILL:162-166 now says: "A workstream that consumes a named prerequisite waits until that exact prerequisite is integrated, whatever its current status (`owned`, `delivered`, `rejected`, or `reviewed`); record the dependency in its own work record. Disjoint work with no such unmet prerequisite may continue under the continue skill."
- The hold now ends only when that exact named prerequisite is integrated, whatever state it is in before then. That covers a prerequisite still being built (`owned`), the gap F2 reported. "Whatever its current status" also covers states the parenthetical doesn't list, such as `runnable`, so the list is examples and nothing more.
- Disjoint work stays admissible (SKILL:165-166). "Unmet" now reads consistently as "not yet integrated".
- The fix is my exact proposed wording (PATCH:49-56).

## Regression check on the two repair hunks

These are the only changed regions: PATCH:5-32 (PACING `@@ -25,25 +25,26`) and PATCH:37-91 (SKILL `@@ -151,46 +151,47`). Every other line in the hunks is unchanged context.

- **No local contradiction.** The new ladder preamble (PACING:37-38) agrees with every rung, and the caller wording (SKILL:181-184) matches it. The dependency rule (SKILL:162-166) agrees with the no-barrier pipelined reviews (SKILL:152-154, context) and with independent ready work under the continue skill.
- **No new idle stop or stopping behavior.** ETA is still "a progress checkpoint, not a hard kill" (SKILL:180-181). One check per ETA window is kept (PACING:29-33), and so is "never infer death from silence alone or poll repeatedly" (SKILL:184). The budget ceiling bounds extensions but never forces an early stop before the budget is reached.
- **No serial barrier for disjoint work.** The wait is scoped to "a named prerequisite", specifically "that exact prerequisite", and disjoint work "may continue" (SKILL:162-166).
- **No authority or tier change.** Neither hunk touches roles, tiers, model IDs, `Authority:`, record ownership, or the verdict/evidence rules. `docs/subagent-contract.md` is byte-identical (manifest blob `e503ea7…`).

One non-blocking cosmetic note: SKILL:185 is longer than the surrounding wrap width after the reflow. Meaning isn't affected, and the builder reports `git diff --check` exited 0 (builder-report:9).

## Residual limits

- This is a delta check of F1/F2 and the two hunks only. The prior eight-scenario review stands for everything else in `aa42a11`, and I did not redo it. Its limits still apply: live model compliance, `docs/model-tiers.md`, the `continue` skill, and the `validateRecord` tooling are all outside the packet.
- The builder's validator and diff-check exits (builder-report:9) are supplied evidence, not re-run.
- I made no continuation bind or accounting call. The brief says the frozen plugin's public status omits the current revision, and it supplies no bind command for this round.
- This review approves the instruction consistency of `e9a556d` only. The source owner decides integration, acceptance, and release.
