# Lane 44, transport identity: lead spec

Source: packet.md beside this file (skills-fable-lane-44-1), from lane 34 review r1 F3. Base 8b8c2f0.

## Defect

skills/multi/scripts/transport.mjs:412 `gitRunner(args, cwd)` runs `execFileSync('git', args, { cwd, ... })` with no `env` option, so the child inherits the caller's GIT_DIR, GIT_WORK_TREE, GIT_COMMON_DIR and GIT_INDEX_FILE. With GIT_DIR set (a hook run inside a git operation, an agent spawned from one, a timer unit with a stale environment), `git rev-parse --git-common-dir` in any cwd answers for the GIT_DIR repository, not for `cwd`. Callers that take identity from it: `mainCheckout` (transport.mjs:421), decisions-pickup.mjs `registeredProject`/`projectIdentity`/`readRegistration` (:638, :652, :677, all default to gitRunner), note-send.mjs, note-inbox.mjs, collect-status.mjs. Result: a note, a pickup or a collector pass acts on the wrong project. Measure: work lost or stalled.

## Pinned rulings

P1: one shared change in transport.mjs. `gitRunner` passes an explicit `env` option to the child: a shallow copy of the parent process environment with GIT_DIR, GIT_WORK_TREE, GIT_COMMON_DIR and GIT_INDEX_FILE removed (removed, not set to empty: an empty GIT_DIR is itself an error). Export the four names as a frozen constant (e.g. `REPO_LOCATING_GIT_ENV`) so a test and later lanes can name it. The parent's own environment object is never mutated. Every other option is unchanged. No per-caller patch, and no change to the 10 direct `execFileSync('git', ...)` sites elsewhere (out of scope, listed by the reviewer).

P2: the discriminating unit test runs the REAL gitRunner (no injected runner). It makes two scratch repos with `git init` (mktemp dirs, no identity config, no commits), sets the parent environment's GIT_DIR to repo B's .git for the test and restores the previous value (or its absence) in `finally`, then asserts `mainCheckout(repoA, gitRunner)` and a direct `gitRunner(['rev-parse','--git-common-dir'], repoA)` resolve to repo A. It must fail on base 8b8c2f0 (red) and pass with P1 (green); the builder shows both runs in the report. A second test asserts a gitRunner call leaves the parent environment's GIT_DIR unchanged. Put the tests in a new skills/multi/scripts/transport.test.mjs if no existing test file covers gitRunner, and check scripts/run-tests.mjs picks the new file up.

P3: no new printed string, so no census.md line (the packet asks for one only for a new marker).

## Efficacy

Unit: P2, red then green. Live proof (lead, after review): `decisions-pickup.mjs status --page 3e1da11277a18174bccfea187d5c3972 --repo <a clean claude-delegation checkout>` run with GIT_DIR exported to a scratch repo's .git: from base code it reports the wrong identity or fails, and from the branch it reports the claude-delegation identity.
