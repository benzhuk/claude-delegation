VERDICT: PASS

# Setup report, lane 71 (triage fetches before it commits)

Spec: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/spec.md. Base sha 3438d7218730d43dcf37069031ff048b1e6d85c8.

## Worktree
- Command: `git worktree add C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-triage-fetch-first-71-triage71 -b build/triage-fetch-first-71-triage71 3438d7218730d43dcf37069031ff048b1e6d85c8` -> "HEAD is now at 3438d721 docs: open lane 71 (triage fetch first) spec and record".
- `git -C <worktree> rev-parse HEAD` full output: 3438d7218730d43dcf37069031ff048b1e6d85c8 (worktree clean).

## Files written (all under C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-71/docs/specs/triage-fetch-first-71/)
- briefs/scout-triage71.md (28 lines, four sections per scout-brief.md)
- briefs/triage71.md (builder brief, mandate-template fields)
- briefs/reviewer.md, briefs/integrator.md, briefs/seam.md
- reports/ created (empty); this file.
Nothing committed, nothing pushed, no identity touched. Baseline run at base: `node --test scripts/knowledge-triage.test.mjs` -> 20 pass, 0 fail, 11.7 s on Windows.

## Needs a lead ruling (scout section 4; the builder brief pins a default for each so the build is not blocked)
1. PREMISE DRIFT: the commit and push of the chezmoi source are done by the triage SKILL (~/.claude/skills/triage/SKILL.md l.96-110, nested Opus run), which lives in the chezmoi source, not in this repo; knowledge-triage.mjs and rev4.md l.37 say the outer job never commits or pushes. Spec item 1 maps cleanly onto the outer job (preflight before gather). Spec item 2 (rebase once, push) has no in-repo home except a new post-nested repair step in the outer job, which reverses rev4's "job never pushes" for that one case. Default pinned in the builder brief: outer-job repair in a new module, plus a proposed skill-text patch written to reports/triage71-skill-patch.md for the lead to apply. Lead to confirm, or move item 2 to the skill.
2. "Dirty" at the incident included mode-only changes and untracked `._*` files; read literally, a tracked-changes check would stop the 5:00 AM task daily on Ben-Desktop. Default: tracked changes only, mode-only counts as dirty (literal spec).
3. A repaired push leaves the skill's `.curated-update.lock` held by the dead nested session (lock is out of scope); the next run would defer on it. Default: leave alone, report.
4. Unresolvable repo, detached HEAD or no origin at preflight: default ATTENTION, not a silent continue.

## Other facts the briefs encode
- New logic goes in a new module scripts/knowledge-publish-sync.mjs plus scripts/knowledge-publish-sync.test.mjs (knowledge-triage.test.mjs is 645 lines; rev4 caps files under 800).
- The existing fake-git in knowledge-triage.test.mjs answers every unknown subcommand with the HEAD sha, so `status --porcelain` would read dirty; the builder must teach it the new subcommands.
- Tests use makeTempHome({ gitIdentity: true }) (scripts/test-home.mjs) for the scratch bare repo identity; N2 in skills/multi/scripts/hooks.test.mjs polices spawn env in test files.
- The integrator brief states the seam review runs AFTER Integrate on the merged head as a separate reviewer's job, and that the integrator never requires seam sign-off, waits, refuses or stops because a seam review is on. Its gate text: Windows has NO full suite, run node --test on the territory's changed test files; the full suite runs on Linux hosts; never touch the real chezmoi source repo or ~/.claude/knowledge; tests use a scratch bare repo.
