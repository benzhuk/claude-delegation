VERDICT: PASS

# loop74 fix round 2

All reviewer findings from loop74-review-r1.md applied except F4, which is the lead's ruling.

- F1 (BLOCKER): `adoptCommit` in skills/team-build/references/build-loop-workflow.js; the six commitPhase call sites now carry a real commit's sha into `build` / `seamFixBuild`. The stale-sha test was fixed (reviewer sha is the 40-char commit sha). New tests: territory commit moves HEAD and APPROVE at the new sha, refused/clean commit keeps the builder sha, seam-fix commit moves HEAD and APPROVE.
- F2 (MAJOR): phase-commit.mjs refuses `not-worktree-root` and `main-checkout`; phaseCommitPrompt lists both as answers. phase-commit.test.mjs fixtures are linked worktrees (git worktree add); no-identity test reads the same repo with an empty global config. New test covers sub dir and main checkout, HEAD unmoved.
- F3: work-record.mjs closeoutTerritories: exact branches from `<work>.loop-state.json` setup.territories when present, else the tip must be an ancestor of the lane's Artifact sha (refused "not part of this lane"). closeout-territories.test.mjs fixtures merge territories into the lane; two new tests.
- F5: transport.mjs `agentsHomeOf(home, env)`; resolveDetailsPath and packetPathFor follow AGENTS_HOME; note-send and note-inbox pass env.
- F6: resolveDetailsPath returns null for any Details with a `..` segment.
- F4: not changed (local .git/info/exclude ledger ruling awaits the lead).

Gate: the brief's 15 files plus phase-commit.test.mjs and closeout-territories.test.mjs: 1145 tests, 1140 pass, 0 fail, 5 skipped. Log: reports/loop74-gate.log.
