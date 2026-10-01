DONE 9bc94906728cb412a549d6147d44222f247fc8be

Cause: skills/multi/scripts/mirror-shim.test.mjs:177 ("R4: Windows plans BOTH shims")
counted plan.actions with a bare `/PATH shim/` regex. Lane 59 added a reclaim PATH
shim (F12), published from collectSources() whenever `isDurablePath(REPO) &&
!isLinkedWorktree(REPO)` holds. That gate is false for every /var/tmp worktree and
C:\Temp clone lane runs used, so R4 only ever saw the four note-* shim action lines
there. On a durable, non-linked checkout the reclaim shim's own
"would install PATH shim: …/reclaim -> …/scripts/reclaim.mjs" action line also
matches `/PATH shim/`, inflating the count by 1 on POSIX (2 on win32: reclaim +
reclaim.cmd). The planner is correct; the test's assertion was wrong, exactly as
the lead's reading predicted.

Discriminating check: cloned the branch with `git clone --branch build/mirror-shim-59b-1`
into a fresh `mktemp -d /home/ben/Code/scratch-l59b-XXXX` (a real `.git` directory,
not a linked worktree — confirmed `isLinkedWorktree` false and `isDurablePath` true
for that path per scripts/mirror-shared-skills.mjs). Running
`node --test skills/multi/scripts/mirror-shim.test.mjs` there before the fix failed
R4 with "expected 4 shim(s) on linux, got: 5" — the 5th line named
`/home/ben/Code/scratch-l59b-9vz1/scripts/reclaim.mjs` as the shim target. After
copying the fixed test file into that same clone, all 22 tests passed (0 fail).
Re-ran the fixed test in /var/tmp/lane-59b/wt (a linked worktree — gate does not
hold there) and it stayed green (22 tests / 0 fail across mirror-shim.test.mjs, 65
tests / 0 fail combined with mirror-shared-skills.test.mjs). Full suite:
`TMPDIR=/var/tmp node scripts/run-tests.mjs` -> 3364 pass, 0 fail, 14 skipped,
1 todo.

Fix location: skills/multi/scripts/mirror-shim.test.mjs, the R4 test at (old)
line 177. Added a `shimActionFor(actions, command)` helper that matches a PATH-shim
action line by the command name in its `dest -> target` text
(`[\\/]<command>(\.cmd)? -> `), used to build `shimActions` from the four COMMANDS
only (was the bare `/PATH shim/` filter). Added a new assertion in the same test:
`isDurablePath(REPO_ROOT) && !isLinkedWorktree(REPO_ROOT)` (both imported from
scripts/mirror-shared-skills.mjs) computes whether the reclaim gate holds for this
checkout, and `reclaimActions` (same `shimActionFor` helper, command 'reclaim')
must equal `IS_WINDOWS ? 2 : 1` when it holds and 0 when it doesn't — pinning the
reclaim shim's presence/count explicitly rather than folding it into R4's note-shim
count. Checked scripts/mirror-shared-skills.test.mjs for the same bare-match
pattern (spec's territory note): its own F12 test at "the reclaim shim is gated by
isDurablePath(REPO)…" already asserts via collectSources() directly, gated the
same way, so no change was needed there.

Simplification: none beyond the fix — this was a one-file, one-test-function
change per the spec's territory scope. No change to the planner
(scripts/mirror-shared-skills.mjs): reproduction confirmed the planner's behavior
(publishing the reclaim shim only when durable and non-linked) is correct and
matches its own F12 comment and mirror-shared-skills.test.mjs's existing coverage.

Scratch clone left in place per instructions, not deleted: /home/ben/Code/scratch-l59b-9vz1
(the lead can list/remove it).
