# C1 round 2: lead rulings on reports/C1-review.md

- Round: 2.
- Findings file: /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/reports/C1-review.md. It is the only source of what to fix. Where it gives an exact old → new patch, use that patch unless a ruling below changes it.
- Start from wt/lane-closeout-1-C1 at ad2aac97d7ff48836809b69e6584694841a03120, in the same worktree.
- Default: fix every finding, critical to minor, as the report proposes. The rulings below override the report where they differ, and settle the two open questions it put to the lead.

## Rulings
- **L1, the origin delete is a lease.** Delete with `git push --force-with-lease=refs/heads/<b>:<checked-sha> origin :refs/heads/<b>`. `<checked-sha>` is the tip that every rule was evaluated against, right after the fetch. A branch that moved since then fails the push, and that is reported as `refused moved`. This is not a force: it only ever deletes the exact sha that was checked. The printed restore line uses that same sha.
- **L2, fetch first everywhere.** `sweep-origin` runs `git fetch --prune origin` before it evaluates anything, in dry-run mode too. If the fetch fails, every branch is refused, the output says `UNVERIFIABLE: fetch failed`, and the exit code is 2. closeout already does this, so keep it.
- **L3, `--by` gates the whole closeout.** If `--by` does not equal `Lead-session:`, refuse before any step, including the dry run's `would` lines. The Log line's owner is the record's `Owner:` slug, never the session id. Use the report's fix so `continuation.mjs` accepts the record afterwards.
- **L4, ignored files count as dirty.** Before removing a worktree, `git status --porcelain --ignored` (run in that worktree) must print nothing. Anything it lists, tracked, untracked or ignored, makes the step `dirty` and the worktree stays. Dry run and live run share this one check, with no second code path.
- **L5, scratch containment.** Refuse the scratch step when any of these is true:
  - A registered worktree path, the repo root or `--repo` equals the target, or lies inside it (a normalized prefix check).
  - A `.git` entry exists anywhere under the target. The walk has a bounded depth, and if it hits the bound it refuses.
  - Listing worktrees fails. That is fail-closed, as `refused unverifiable`.
- **L6, scratch roots match the real layout.** The real layout is `/tmp/claude-<uid>/<project>/<session-id>/scratchpad/<lane>`. A root is any configured root that is an ancestor of the target. The session id must be a whole segment strictly between the root and the target, at any depth. Add a test that uses exactly this layout, with the session dir itself refused.
- **L7, Windows paths.**
  - A `Scratch:` value counts as absolute when either `path.posix.isAbsolute` or `path.win32.isAbsolute` is true, so a Windows value is valid on any host.
  - When a closeout runs on a platform that does not match the value's form, the scratch step is refused as `refused other-platform path`.
  - Every path comparison normalizes separators to `/` first, and compares case-insensitively on win32. That covers cwd, `--repo`, worktrees and roots.
  - The worktree step refuses a target equal to `--repo` or containing it, as well as the one that contains cwd.
- **L8, open-record matching.** Normalize branch names before comparing: strip `refs/heads/`, `refs/remotes/origin/`, `origin/` and a trailing `/`. Resolve an open record's `Worktree:` path to its branch through `git worktree list`. If a record's `Worktree:` path cannot be resolved, keep any branch whose last segment equals the path's basename, and say so.
- **L9, plain `close`.** `close` without `--closeout`, including `close --dry-run`, behaves exactly as at base. Add a test that pins the base behavior of `close --dry-run`.
- **L10.** The identity-guard hook block the reviewer hit was on its own read-only command. No fix is needed.

## Gate and report
- Gate as in brief-C1.md. The one docs/GOALS.md STALE failure is pre-existing at base.
- Commit on wt/lane-closeout-1-C1. Do not push.
- Report to reports/C1-r2-report.md:
  - line 1: `DONE <full sha>` or `BLOCKED <reason>`;
  - a table of the 18 findings, one row each: finding, disposition, test name, commit;
  - the gate numbers, quoted from reports/C1-r2-gate.log.
- The reviewer's repro scripts are in /tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C1-review/. Re-run the two critical repros on fresh fixture copies, before and after the fix, and quote both results.
- ETA 75 minutes.
