# Lane 59 lead ruling r2: T1 review, adopted in full

Input: docs/specs/janitor-acts-59/t1-review.md, NEEDS_FIXES (14) on c12e190a9519186f5d5254726138099409b0497c.

All 14 findings are adopted. Where a finding carries a patch, the patch applies verbatim. Where it states a design, that design is the spec. Ruling r1 still holds for T1: every doubt resolves to "do not remove", and a check that cannot be completed refuses.

Rulings on the two HIGH findings:
- **HIGH 1 (inside a live worktree).** The containment check looks UPWARD from the target as well as down. It walks every ancestor up to the filesystem root. Reclaim refuses the target when any ancestor holds a `.git` file or directory, whether that marks a linked worktree or a repo. It also refuses when the target lies inside any path that `git worktree list` reports for that repo. Where the target sits no longer depends on the caller's cwd.
- **HIGH 2 (mount points).** Reclaim refuses a target that IS a mount point, contains one, or lies under a bind mount. The Linux check reads `/proc/self/mountinfo` and compares mount points by path, which covers binds on the same filesystem. The darwin check reads `mount` output. Where the mount table cannot be read, reclaim refuses: the check fails closed. The st_dev comparison stays in place as a second check.

Rulings on the rest:
- **3 and 5.** A failed rmSync is caught and recorded, and the loop goes on to the other targets. Every W and B removal carries the sha and the restore hint the same way applySafe does, including a partial W removal.
- **4.** B refuses a branch that is checked out in any worktree, and its dry-run output says why.
- **6.** T works on darwin for the convention's own paths (/var/tmp resolves to /private/var/tmp). Test it with a realpath fixture.
- **7, 8 and 9.** Each missing test is added, and each existing test is made to discriminate. Show a mutation that goes red for each one.
- **10.** Use ruling r1's labels: an unknown or future idle age gives a stated reason, never "active in last 24h".
- **11.** Fail closed on unreadable entries.
- **12, 13 and 14.** Adopt as written. For 14, the work-record refactor may only add refusals. Record that as intended, with a test.

Territory is T1's only: scripts/path-safety.mjs and its test, scripts/reclaim.mjs and its test, and scripts/work-record.mjs (its path-safety use only).
- janitor.mjs's `pathWithin` shares finding 12's defect. Report it as a seam note; do not edit janitor.mjs, which is T2's and is under review.
