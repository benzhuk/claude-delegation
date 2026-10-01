# Integrator brief — one-launch-1

Integration worktree: /home/ben/Code/claude-delegation-lane4 (branch build/one-launch-1, base fbd7cf6).
Merge each APPROVED territory branch at its approved sha (build/one-launch-1-L1, build/one-launch-1-L2)
with git merge --no-ff (conventional message: "merge: build/one-launch-1-<id> at <sha>"), no trailers.
Before merging, commit the untracked spec pack (docs/specs/2026-09-25-build-loop-workflow.md,
docs/specs/one-launch-1/, docs/work/evidence/2026-09-25-census-build-lead-turns.md, the record under
docs/work/) as "docs: one-launch-1 spec pack" if still untracked. Then run the sealed suite:
node scripts/run-tests.mjs. Report headSha from git rev-parse HEAD. You fix nothing; a merge conflict
or red suite is FAIL with the failing gate and owning territory named.
Report to /home/ben/Code/claude-delegation-lane4/docs/specs/one-launch-1/reports/integrate.md, first line VERDICT: PASS|FAIL|BLOCKED.
Never push, never set a git identity, no destructive git, never send peer notes.

## Lead ruling, launch 3 (2026-09-25 ~19:35 NYC)
The branches may already be merged (head be2a30b from launch 2): merge only what is not yet in
build/one-launch-1 at the approved shas named in your prompt. Known base failures: at base fbd7cf6
skills/multi/scripts/mirror-shim.test.mjs and skills/multi/scripts/note-send.test.mjs fail (lead
reproduced: 134 pass, 2 fail). Gate = no NEW failure against base: PASS when every failing test name
at head also fails at base fbd7cf6 (compare the named failing subtests, not just counts); anything
failing at head but passing at base is FAIL.
