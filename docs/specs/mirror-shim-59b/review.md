VERDICT: APPROVE 9bc94906728cb412a549d6147d44222f247fc8be

# Lane 59b review: mirror-shim R4 count on a durable checkout

Artifact: 9bc94906728cb412a549d6147d44222f247fc8be on build/mirror-shim-59b-1
Diff reviewed: b52757b9d78c328a4a3a4faaecec2581fa233e18..9bc9490. The only code change is skills/multi/scripts/mirror-shim.test.mjs, +24/-2. The rest is the spec and record docs.
Planner (scripts/mirror-shared-skills.mjs): unchanged, which is correct.

Blocking findings: none.

## C4 fields

Cause: R4 (skills/multi/scripts/mirror-shim.test.mjs, old line 182) counted every plan action matching a bare `/PATH shim/`. When `isDurablePath(REPO) && !isLinkedWorktree(REPO)` holds (scripts/mirror-shared-skills.mjs:571), collectSources() also adds the lane-59 reclaim shim (RECLAIM_SHIM_SPECS, :130-135: 2 entries on win32, 1 on POSIX). That shim emits the same `would install PATH shim: <dest> -> <target>` line (:802). The test over-counted. The planner is right.
Discriminating check: I made a fresh clone at /home/ben/Code/scratch-l59brv-l6eI/repo (isDurablePath true, isLinkedWorktree false). The pre-fix test (b52757b) failed there, 22 tests / 21 pass / 1 fail, with R4 reporting "expected 4 shim(s) on linux". The extra line was `would install PATH shim: .../.local/bin/reclaim -> /home/ben/Code/scratch-l59brv-l6eI/repo/scripts/reclaim.mjs`. The fixed test at 9bc9490 passes in the same clone: 22 / 22 / 0.
Fix location: skills/multi/scripts/mirror-shim.test.mjs, in the R4 test. The new shimActionFor() helper matches each command by name. R4 now counts only the four COMMANDS, and a new reclaim-gate assertion follows. Nothing else changed.
Simplification: none needed. The helper is one line and the gate recomputation mirrors the existing F12 test in scripts/mirror-shared-skills.test.mjs:317-340.

## Attack brief answers

### 1. Cause or compensation? It is the cause, and the test was over-counting.
- The gate is at scripts/mirror-shared-skills.mjs:571, `if (isDurablePath(REPO) && !isLinkedWorktree(REPO))`. It pushes RECLAIM_SHIM_SPECS: 2 on win32 (reclaim.cmd + reclaim), 1 on POSIX. Otherwise it logs `SKIP reclaim shim` (:582).
- plan.shims and plan.shimCommands (:1275-1276) come from SHIM_SPECS and SHIM_COMMANDS only, so they never include reclaim. That is why only the action-line count moved and the `plan.shims.length` assertion stayed green on the durable checkout.
- The planner behaves as its own F12 comment (:120-128) and the existing F12 test describe. No planner change is warranted.
- I checked that the parent-side gate matches the child-side gate:
  - isDurablePath's `home` argument only feeds the `<home>/AppData/Local/Temp` entry.
  - tmpdir is inherited through childEnv, so it is the same in both processes.
  - Any Windows Temp path is also caught by the `temp/` segment regex.
  - REPO and REPO_ROOT both come from module URLs.
  - So the test process and the mirror child reach the same verdict, including under scripts/run-tests.mjs, which sets TMPDIR/TEMP/TMP for both.

### 2. Does the new R4 still discriminate? Yes.
- Mutation: in the durable scratch clone, change the collectSources() loop at :562 to `for (const spec of SHIM_SPECS.filter((s) => s.command !== "note-flush"))`. This drops one note shim's action but leaves plan.shims and shimCommands intact, so only the action count can catch it.
- New test: red, 22 / 19 / 3. R4 fails with "expected 4 note-command shim(s) on linux". Both V4 tests also go red.
- Old test (b52757b) under the same mutation on the durable clone: `--test-name-pattern=R4` gives 3 tests / 3 pass / 0 fail. The reclaim line exactly replaces the missing note-flush line, so the old count stays at 4. The old R4 masked a real regression on durable checkouts, and the new one does not.
- The planner was restored from HEAD afterwards and `git status` is clean.

### 3. Does the reclaim assertion discriminate in both directions? Yes.
- Gate true, shim missing: durable clone with :571 changed to `if (false)`. Red, 22 / 21 / 1. The message is "expected 1 reclaim shim action(s) on linux (gate holds for /home/ben/Code/scratch-l59brv-l6eI/repo), got:".
- Gate false, shim present: /var/tmp clone /var/tmp/lane-59b/rv-KSDS/repo (durable false, linked false) with :571 changed to `if (true)`. Red, 22 / 21 / 1. The message is "expected 0 reclaim shim action(s) on linux (gate does not hold for /var/tmp/lane-59b/rv-KSDS/repo), got:".
- The same clone without the mutation is green, 22 / 22 / 0. Both mutations were restored from HEAD and both clones are clean.
- Extra case, the Orca shape: a durable linked worktree at /home/ben/Code/scratch-l59brv-l6eI/linked (durable true, linked true) passes 22 / 22 / 0.

### 4. Any other bare `/PATH shim/` count in skills/ or scripts/ tests? No.
- skills/multi/scripts/mirror-shim.test.mjs:224 (V4) uses `.find` with a command-name regex (`bin[\\/]<command>( |$)`), not a count. It is unaffected by reclaim.
- scripts/mirror-shared-skills.test.mjs counts reclaim entries through collectSources() under the same gate (:317-340), and its SKIP-line test (:377-390) is gated too.
- No other test file matches `PATH shim` or counts `.local/bin` entries. The wiring-check, collect-status, note-send, inbox and codex-unsupported hits are fixtures or single-path asserts.
- Empirical check: every test file that references mirror-shared-skills, isDurablePath or reclaim (11 files) ran in the durable clone: 720 tests / 710 pass / 0 fail / 9 skipped / 1 todo.

### 5. Runs (counts only)
- Durable non-linked clone /home/ben/Code/scratch-l59brv-l6eI/repo at 9bc9490, isDurablePath true:
  - mirror-shim.test.mjs: 22 / 22 pass / 0 fail.
  - With mirror-shared-skills.test.mjs: 65 / 64 pass / 0 fail / 1 todo.
- /var/tmp:
  - Lane worktree /var/tmp/lane-59b/wt (durable false, linked true), both files: 65 / 64 pass / 0 fail / 1 todo.
  - Clone /var/tmp/lane-59b/rv-KSDS/repo, mirror-shim: 22 / 22 / 0.
- Full suite, once, in /var/tmp/lane-59b/rv-KSDS/repo at 9bc9490 (`TMPDIR=/var/tmp node scripts/run-tests.mjs`): 3379 tests, 3364 pass, 0 fail, 0 cancelled, 14 skipped, 1 todo, exit 0. This matches the builder's report.
- Windows was not run here; the lead runs it. By reading the code: on win32 the dest paths use `\`, which `[\\/]` accepts. shimActionFor's `(\.cmd)?` picks up both reclaim actions, giving the expected 2. No note command name is a suffix of another in a way that could double-match.

## Non-blocking observation (no patch required)
- The test recomputes the gate in-process with the runner's environment, while the mirror child gets GIT_DIR, GIT_WORK_TREE and similar stripped (test-child-env.mjs → withoutRepoLocatingGitEnv).
- The two answers could differ only if the suite ran from a git hook of a different repository than REPO_ROOT, which is a contrived setup.
- The existing F12 test has the same shape, so this is not a regression and needs no action.

## Scratch left in place (nothing deleted, per brief)
- /home/ben/Code/scratch-l59brv-l6eI (clone `repo`, plus linked worktree `linked` registered in that clone)
- /var/tmp/lane-59b/rv-KSDS (clone `repo`, plus suite.log)
- The reviewed worktree /var/tmp/lane-59b/wt was not modified; `git status` is clean.
