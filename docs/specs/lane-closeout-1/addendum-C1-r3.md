# C1 round 3: lead rulings on reports/C1-review-r2.md

Round: 3
Findings file (the only source of what to fix): /home/ben/Code/claude-delegation-wt/lane-closeout-1/docs/specs/lane-closeout-1/reports/C1-review-r2.md
Start from: wt/lane-closeout-1-C1 at f10c7929711134ce0260741b2ade293ac8e4deb0, same worktree.

Research (round 3): the reviewer reproduced every blocker. Its scripts are in /tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C1-review-r2/, and its mutation results are listed under R2-3.
- Re-run each repro on a fresh fixture copy before you edit, and record the result.
- The shared cause: delete checks shipped without a test that fails when the check is removed.
- The discriminating check: for every refusal, remove that one check on a scratch copy. The suite must fail. Record which test failed.

## Rulings
- **R2-1 (L8 fallback).**
  - An open record whose `Worktree:` path cannot be resolved (a Windows path on Linux, a symlink, a missing dir) protects every origin branch whose last path segment equals that path's basename, compared case-insensitively.
  - It also protects the branch named in its `Artifact:` ref.
  - Each protected branch is reported `keep open-record-unresolved <record>`.
- **R2-2.**
  - A failed `git worktree list` refuses every branch in sweep-origin with exit 2, as `UNVERIFIABLE`.
  - The same failure refuses the worktree step and the scratch step in closeout.
- **R2-3.**
  - Add one test per delete check that fails when that check is removed. That covers the five checks that survived mutation, the win32 case-fold, and every refusal that has no test.
  - Report a mutation table: the check, the test that catches its removal, and the result on your scratch copy.
- **L5 replaced (the reviewer's open question).** Lanes keep fixture git repos in their scratch, so a recursive `.git` walk would refuse almost every real closeout. Drop the walk. The scratch step now refuses only when one of these holds:
  - the target equals, contains, or lies inside any path from this repo's `git worktree list`;
  - the target equals, contains, or lies inside the repo root or `--repo`.
  
  An unregistered git repo inside the lead's own session scratch is throwaway by construction, and it is removed with the directory. This also closes R2-4, a target inside a registered worktree. The docs and the spec paragraph in docs/work-record.md must say so.
- **R2-6 to R2-10.** Apply the reviewer's patches as given.
  - R2-6: report a rejected push by its real reason, never `moved` by default. Report `moved` only when the lease sha no longer matches.
  - R2-8: an unmatched `Worktree:` is reported `refused worktree-unresolved`, with exit 2, never `absent`.
- **M7 (performance).** It stays deferred. Say so in the report.

## Gate and report
- Gate as in brief-C1.md. The GOALS.md STALE failure is pre-existing.
- Commit, and do not push.
- Report to reports/C1-r3-report.md:
  - line 1: `DONE <sha>` or `BLOCKED <reason>`;
  - a table per finding: disposition and test;
  - the mutation table;
  - the gate numbers, with the log in reports/C1-r3-gate.log.
- ETA 60 minutes.
