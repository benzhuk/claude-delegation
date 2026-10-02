# Lane 71: triage fetches before it commits (defect to a fed mechanism)

Written 10/1 8:30 PM America/New_York by skills-f. Measure moved: work lost or stalled. Evidence: docs/work/evidence/2026-10-01-post-install-first-runs.md. Today's first run archived 60 notes, committed in the chezmoi source, and could not push because origin had gained three commits during the run; it wrote ATTENTION and locked, and the 5:00 AM task now skips until Ben recovers it by hand.

## Scope, pinned
1. Before the triage commits anything in the chezmoi source, it fetches origin and fast-forwards its branch; if the working tree is dirty or the branch has diverged before it starts, it stops with ATTENTION before touching the knowledge store, so there is nothing of its own to recover.
2. If origin moves between that fetch and the push, it fetches again and rebases its own single commit once, then pushes; on any conflict it stops with ATTENTION as today. No force, no identity change.
3. The ATTENTION text keeps Ben as the one who recovers; it additionally names the three states it can be in (dirty before start, diverged before start, conflict on rebase) and the commands for each, so recovery is a paste, not an inspection.
4. Tests for 1 and 2 with a scratch bare repo as origin.
Not in scope: the lock mechanism, the gather list of hosts, the archive format, the Mac host.

## Build shape
Through the build-loop Workflow, Sonnet builds, Opus reviews, one red-team round at most, worktree under <repo>/.claude/worktrees/, full suite once on Netcup and once on Hetzner at accept, merge under the 9/26 grant, no release. Every execution brief carries: if any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Due on main: 10/2 12:00 PM America/New_York.
