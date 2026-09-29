# S1: seam fix after merging main (lead)

- Found when origin/main (f7df941) was merged into build/lane-closeout-1 as 103e636.
- On main, 7248ba5 ("fix(P2): wrap every direct git call's env with withoutRepoLocatingGitEnv") wraps every git child call's env. That way an inherited GIT_DIR, GIT_WORK_TREE or GIT_COMMON_DIR (for example inside a git hook) can never point a call at a different repo.
- Lane 36's new code in scripts/work-record.mjs, the closeout and sweep-origin region (about lines 1830-2360 at 103e636), makes these git calls without that wrapper:
  - `push --force-with-lease ... :refs/heads/<b>` (the origin delete);
  - `show-ref`, `rev-list`, `rev-parse`, `merge-base`, `fetch --prune`, `ls-remote`, `for-each-ref`.
- janitor.mjs's closeout goes through its wrapped `git()` helper, so it is fine. Confirm this by reading it.

## Fix
- In scripts/work-record.mjs, add the same `env:` option main's 7248ba5 uses to the options object of every `execImpl("git", ...)` and `spawnImpl("git", ...)` call in lane 36's code.
  - Copy the exact form from line 425 or 665 of that file.
  - The import already exists at line 12.
  - Change nothing else.
- List every call site you changed, with its line number.
- Grep the whole file afterwards. Any git call still without the wrapper must be named in the report, with the reason, or fixed.
- Test, modeled on main's test "checkAcceptance resolves against repoRoot, not an inherited GIT_DIR pointed at another repo" in scripts/work-record.test.mjs:
  - Add it to scripts/work-record-closeout.test.mjs.
  - Build two fixture repos, A and B, each with its own local bare origin.
  - With GIT_DIR set to repo B's .git, run `sweepOrigin` live against repo A on a branch that is deletable in A. Also run `closeoutRecord` on a record in A.
  - Assert that A's origin branch is removed and B's origin refs are identical, comparing `git for-each-ref` output captured before and after.
  - Restore GIT_DIR exactly as main's test does.
  - Mutation proof on a `git archive -o` extract, untarred as a separate command: removing the wrapper from the push call makes the test fail.

## Gate
- Territory tests plus the full suite, under `timeout`, one at a time.
- Write the log to docs/specs/lane-closeout-1/reports/S1-gate.log. The GOALS.md STALE failure is pre-existing. Check whether it still fails after the main merge, and report the result either way.
- Commit on build/lane-closeout-1 in /home/ben/Code/claude-delegation-wt/lane-closeout-1. Do not push.
- Report to docs/specs/lane-closeout-1/reports/S1-report.md: line 1 `DONE <sha>` or `BLOCKED <reason>`.
