Task: In the territory worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-fresh-walk-66-merge66 (branch build/fresh-walk-66-merge66, at 77dac671164299d9c8df5d17c7acd2683ef692bd), merge main at the exact sha f976ca0a5958eeb90607492c2c42db8c5f28534b with `git merge --no-ff f976ca0a5958eeb90607492c2c42db8c5f28534b` (merge the sha, not the moving ref), resolve every conflict, and commit the merge. Done = a clean merge commit, no conflict markers, commit dee95ab's goal-card fix still present, the gate green, and the report written.

Goal: Lane 66 (fresh-walk) — land build/fresh-walk-1 so a fresh host installs from the docs without the lead; measure: hours ask to accepted.

Work: wr-2026-10-01-fresh-walk (docs/work/wr-2026-10-01-fresh-walk.record.md; the orchestrator owns it, you never edit it)

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-66/docs/specs/fresh-walk-66/spec.md (the lane 66 scope, pinned)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-66/docs/specs/fresh-walk-66/briefs/scout-merge66.md (this territory's scout addendum — read it first; a dry-run merge-tree shows exactly ONE textual conflict, docs/native-use.md; README.md, skills/janitor/SKILL.md, skills/multi/SKILL.md, scripts/goal-card.mjs and scripts/goal-card.test.mjs auto-merge. Where the scout disagrees with the spec the spec wins; the scout's open questions are yours to resolve and record how)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-fresh-walk-66-merge66/docs/work-record.md and C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-fresh-walk-66-merge66/templates/goal-card.md (after the merge: main's versions, to check the branch's new native-use.md section still matches them)

PROJECT FACTS:
- Repo is a plain Node ESM project, no build step, no package manager install needed. Windows host: there is NO full suite here. Run only the focused tests named in the Gate; the full suite runs later on the Linux hosts, by the lead.
- Why this merge: build/fresh-walk-1 (docs for a fresh project, plus the goal-card.mjs rejection-notice fix from commit dee95ab) was approved 9/26 but never merged; main has since retired the `continue` skill (nine skills became eight) and changed many files.
- Conflict rule (pinned by the spec): keep main's side for anything the continue-skill retirement or later lanes removed. In docs/native-use.md that means main's text for: the removed "Use `continue` at a pause or workstream closeout..." sentence, the removed "Use the native binding/accounting commands below only when current hook context is available..." sentence, "eight skills" and the skill list without `delegation:continue`, the removed Interrupt/Stop-bypass sentence, "inbox behavior" (not "inbox and continuation behavior"), and the removed "## Use the bounded continuation contract" section and the native-continuation-testing sentence. Keep the branch's additions that are not about continue: the team-build "one mid-tier builder and one independent reviewer" sentence, the bold "Before opening a record, read work-record.md for the exact field schema" sentence, the `multi` clause about a nested `claude -p` and `env -u ORCA_TERMINAL_HANDLE -u NOTE_SLUG`, and the whole "### Script paths, the goal card, and closing a build in a fresh project" section. The `multi` paragraph resolves to main's paragraph (no `continue` sentence) with the branch's `multi` clause kept.
- Commit dee95ab fixes a wrong script name in scripts/goal-card.mjs rejectionNotice (main's text is `node scripts/goal-card.mjs check`; the fix names the real script path via SELF_PATH). The merge result must contain it: in scripts/goal-card.mjs, `const SELF_PATH = fileURLToPath(import.meta.url)` and a rejectionNotice that says `node "${SELF_PATH}" check`, and in scripts/goal-card.test.mjs the two asserts on the notice's real path. Also check `git merge-base --is-ancestor dee95ab HEAD`.
- README.md's new paragraph links docs/native-use.md#script-paths-the-goal-card-and-closing-a-build-in-a-fresh-project; confirm the anchor still resolves to the heading after your resolution.
- After resolving: `grep -n -i "continue" docs/native-use.md` — list each hit and say why it stays (ordinary English "continue" is fine; a reference to a `continue` skill, `delegation:continue`, or the continuation contract is not).
- Commit message: `merge: origin/main f976ca0a into build/fresh-walk-66 (lane 66)`. Conventional style, no Co-Authored-By, no trailers, no AI byline. Use the git identity already configured; never set one.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.
- Never set a git identity, no --no-verify, no force, no recursive deletes, no reset --hard, no stash, no clean, never push, never send a peer note.

NOT (out of scope, stated explicitly):
- Any edit beyond resolving the merge: do not reword, improve, or re-order docs, do not fix other files, do not hand-edit any auto-merged file.
- docs/work/ and docs/specs/ (the orchestrator's), and the lane-66 integration worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-66 (never touch it, except writing your report, state file and gate log under its docs/specs/fresh-walk-66/reports/).
- Any push, release, install, version bump, or deleting a branch.

Evidence format: cite file:line for every claim; for each conflict hunk, quote which side you kept and the rule that decided it; paste the exact output of the grep and ancestor checks above; report the merge commit's full sha from `git rev-parse HEAD`, run after the commit, as headSha.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-66/docs/specs/fresh-walk-66/reports/merge66-report.md. Line 1 is the verdict, first word.

Gate: node --test scripts/goal-card.test.mjs hooks/lib/goal-context.test.mjs hooks/delegation-reminder.test.mjs > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-66/docs/specs/fresh-walk-66/reports/merge66-gate.log 2>&1, then node --test --test-name-pattern="J1 round 2 MINOR 5" scripts/janitor.test.mjs >> C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-66/docs/specs/fresh-walk-66/reports/merge66-gate.log 2>&1 (janitor's heading-list test polices skills/janitor/SKILL.md, which the merge touches). Read only the tail and the failing names. No wrapper script. Run both from C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-fresh-walk-66-merge66. A failure that also fails on main's own tree is not yours: say so with the evidence, do not fix it.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-66/docs/specs/fresh-walk-66/reports/merge66-state.md. Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you decide how to resolve each conflict hunk within the pinned conflict rule. Check in (park and report) before resolving anything not covered by the rule, or if the merge produces a conflict in a file other than docs/native-use.md.

Un-agent-able steps: none. The full suite on Netcup and Hetzner is the lead's later step and is outside "done".
ETA: 20-30 minutes; report or park by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
