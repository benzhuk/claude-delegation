---
name: janitor
description: Use when a build, worktree, or run has finished and something needs cleaning up, before starting a new build in a project that hasn't been swept in a while, or when asked what's stale, what's using disk, or what can be removed. Reports two classes, SAFE and JUDGMENT, and only ever acts on SAFE. NOT a replacement for a builder's own cleanup: a builder that leaves a worktree behind still has to say so, by name, in its report.
---

# Janitor: mechanical cleanup, two classes, one owner call

Cleanup is nobody's job by default, so it doesn't happen. This skill makes it a
five-second check: run `janitor.mjs`, read two short tables and five numbers, done.

## The two classes

**SAFE**: a human would agree without looking.
- a git worktree that is not locked, not the main working tree, not the one janitor is
  running from, whose branch is fully merged into main AND (when an `origin/<main>` ref
  exists) confirmed on origin, has no submodules, and is fully clean including ignored
  files (`git status --porcelain --ignored`, not just tracked changes)
- a local branch merged into main, not a protected name (`main`, `master`, `develop`,
  `release`, `release/*`, `hotfix/*`, ...), never the current branch, never main
- a registry entry the tool itself created, past its end condition, whose `ref`
  resolves strictly inside the project root

**JUDGMENT**: the tool cannot prove it, a person has to look.
- a dirty worktree, including one that is clean by `git status` but holds ignored
  files with real content (build output, local config): both count
- a locked worktree (its lock reason is shown), or one with submodules
- a merged worktree whose branch has no confirmed `origin/<main>` copy
- an unmerged branch with no commit in 14 days
- a branch that is merged but carries a protected name (a bookmark IS an ancestor of
  main by construction; the name is the only signal it has one)
- a registry entry past its end condition that the tool did not create, or whose `ref`
  resolves outside the project root even if it claims `created_by_tool`
- an untracked file matching the project's scratch patterns

The dry run (no flags) always prints both tables plus five drift numbers: disk used by
the project root, worktree count, open local branch count, untracked file count, and
registry entries past their end condition (plus a count of unreadable/malformed
registry lines, when there are any). `--apply` acts on SAFE only, and a registry-line
`--apply` UNLINKS the file at that entry's `ref` from disk, not just the registry line
- read that as a real deletion before appending a line with `created_by_tool: true`.
`--json` emits the same safe/judgment/drift shape as machine-readable JSON instead of
the printed tables, for a caller that wants to parse the result. JUDGMENT is never
executed automatically, by this tool or by an agent reading its output. It is one
batched question to the owner, not N separate ones. Collect everything dispatchable
first, then ask JUDGMENT as ONE multiple-choice pass: "these N things look stale, keep
or remove each?" Never surface JUDGMENT items one at a time as they're found; never act
on one without asking.

## What janitor will never do

No forced removal, no wiping of uncommitted changes, no resetting a tree, no touching a
work-in-progress shelf, no recursive delete of a path it did not create, no unlinking a
path that resolves outside the project root or through a symlink. If it isn't sure, it
reports and stops.

Reading state and destroying state follow different rules. While only reading, a crash,
a timeout, or state it can't parse is silent and exits clean (0), never a false claim of
safety - EXCEPT that an unreadable project config, an unreadable registry, or no git at
all is BLIND (exit 3, one line on stderr), never silently reported as "nothing found."
Once `--apply` has taken even one destructive action, nothing is silent again: a later
failure prints everything already done before it, and the run exits 1 or 3, never 0.

## Definition of done, for any builder

A builder's work is not done when the code is green. It is done when:
1. the branch is pushed
2. the report is on disk
3. its worktree is either removed, or handed over by name to whoever owns it next

A worktree with no owner named is a JUDGMENT item forever. Naming it in the report is
what turns it into something janitor (or the next builder) can act on.

## Cleanup is never chained onto productive work

Gated, permission-requiring cleanup (removing a worktree, deleting a branch, unlinking
a file) runs as its own standalone step, never appended to a command that's doing real
work. A build that ends "...and also let me clean up" turns one permission prompt into
a blocker for everything before it. Run the build, report it, then run janitor
separately, or leave the cleanup named and unresolved for the next pass.

## Registry

Anything janitor should later be able to reason about (a scratch file, a packet, a
worktree it didn't create through git directly) gets one line appended to the artifact
registry: `ref`, `kind`, `owner`, `purpose`, `end_condition`, `created`, and
`created_by_tool` if the tool itself made it. No line, no lifecycle: an unregistered
file matching no scratch pattern is invisible to janitor and stays forever.

## commit-check

A separate, smaller script: given a set of staged paths, refuses any that match the
project's scratch patterns. It is not wired into anything by default. A project wires
it into its own pre-commit path if it wants that gate. Running it standalone any time
before a commit is always safe.

## Adapters

Tool-neutral by design: reads `.agents/project.json` for `main_branch` and
`scratch_patterns`, nothing project-specific. `git worktree` / `git branch` are the only
VCS assumed; `vcs: "none"` in project config makes every git-dependent check a silent
no-op. No adapter has been written for a non-git VCS; a project on one should either set
`vcs: "none"` (janitor stays silent) or extend the git wrappers in `janitor.mjs` behind
the same SAFE/JUDGMENT contract.
