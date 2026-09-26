# Integrator brief — collect-from-origin Windows fix round
Integration worktree /home/ben/Code/wt-collect-1 on build/collect-from-origin-1. Merge the approved sha of
build/collect-from-origin-1-C1 named in your prompt with git merge --no-ff ("merge: build/collect-from-origin-1-C1
at <sha> (Windows path fix)"), no trailers. Run node scripts/run-tests.mjs; gate = no new failure vs base
ac9c842 by failing test name (H6 note-send and V4 mirror-shim are known). Report headSha. Never push, never
set a git identity, no destructive git, never send notes. Report to
/home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/reports/integrate-win.md, first line VERDICT.
