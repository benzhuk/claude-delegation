# Lane 59b: mirror-shim R4 count on a durable checkout (lane 59 follow-up)

Source: skills-fable-janitor-59-4. On merged main on Windows, skills/multi/scripts/mirror-shim.test.mjs:177 ("R4: Windows plans BOTH shims") expects 8 and gets 10. It reproduces on 07671c9a, so it predates lane 40b.

## Lead's reading, for the builder to confirm by reproducing it first
- R4 counts every plan action that matches `/PATH shim/`. Lane 59 added a reclaim PATH shim, which on win32 is both reclaim.cmd and an extensionless reclaim. It is published only when `isDurablePath(REPO) && !isLinkedWorktree(REPO)` (scripts/mirror-shared-skills.mjs, around line 571).
- Every lane run happened in a /var/tmp worktree or a C:\Temp clone, where the reclaim shim is skipped, so R4 saw only the four note commands. A durable main checkout, like skills-fable's Windows checkout (and probably the parked Linux main checkout too), also plans the reclaim shims, so the count goes up by 2 on win32 and 1 on POSIX.
- So the test expectation is wrong, not the planner: R4 is about the four note commands.

## Fix
- R4 counts only the shims for the four COMMANDS, matched by command name, not every PATH shim.
- Add one assertion: the reclaim shim appears in the plan exactly when the gate holds (2 on win32, 1 on POSIX), and is absent otherwise.
- Look through the same test file and scripts/mirror-shared-skills.test.mjs for any other count that uses a bare `/PATH shim/` match, and fix it the same way.
- No change to the planner unless reproduction shows the planner is wrong. If it is, stop and report instead.

## Proof
- Show the failure on a durable, non-linked checkout before the fix. A fresh `git clone` of the branch into a non-temp path under the home directory counts as durable; check isDurablePath in the script to be sure.
- Then show it green there, and still green in /var/tmp.
- Full suite at 0 fail on Linux. The lead runs Windows.

## Territory
skills/multi/scripts/mirror-shim.test.mjs, and scripts/mirror-shared-skills.test.mjs only if it has the same pattern.
