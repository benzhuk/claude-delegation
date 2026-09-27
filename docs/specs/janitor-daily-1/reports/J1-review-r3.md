VERDICT: APPROVE 0b73c3809c1f50984be8769f2c4cadc7e70b23fe

# J1 review, round 3 (delta re-review): install-janitor-timer

Reviewed: worktree /home/ben/Code/claude-delegation-wt/wt-janitor-daily-1-J1. HEAD is
0b73c3809c1f50984be8769f2c4cadc7e70b23fe, from `git rev-parse HEAD`, which I ran myself. The range
8ffd077..HEAD is one commit, 0b73c38. It touches two files, both in scope:
scripts/install-janitor-timer.mjs (+18/-8) and scripts/install-janitor-timer.test.mjs (+56/-1).
janitor.mjs and SKILL.md did not change this round. After the review, `git status --short` in the
worktree is empty.

Gate re-run by me: `node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs scripts/janitor.test.mjs`
gave tests 102, pass 100, fail 0, skipped 2. That matches the builder's report.

Safety:
- Every live CLI run used a scratch HOME and XDG_CONFIG_HOME under my session scratchpad.
- I never passed `--enable` or `--apply`.
- The mutation checks ran on a copy of the tree in the scratchpad, never in the worktree.
- I deleted nothing.

Counts: 0 BLOCKER, 0 MAJOR, 0 MINOR.

## Prior findings: verification

| r2 | Status | Evidence |
|---|---|---|
| J1r2-M1 | FIXED | test.mjs:528-529 now checks the ExecStart line with `includes(... "${spaceRepo.replace(/\\/g,"\\\\")}" )`. I ran a Windows-shaped repo (`C:\Users\ben\AppData\Local\Temp\...\my repo`) through the exported `systemdServiceUnit` and applied the new assertion: `true`. A POSIX `/tmp/x/my repo` also gives `true`. Mutation: I made `systemdQuote` never quote, on the scratch copy. Exactly the B1 space-repo test failed (1 of 23). |
| J1r2-m1 | FIXED | mjs:542 is now `${dryRun ? "files would be removed" : "files removed"}`. A live `--remove --dry-run` prints `note: files would be removed, but the systemd-user entry may still be registered/running ...`. Mutation: with the old text restored, the `--remove --dry-run` test fails on its new `/^files would be removed/` assertion. |
| J1r2-m2 | FIXED | mjs:354-358 checks `argv.includes("--hour")` and requires `/^\d{1,2}$/`. Live runs, with node's own exit code: bare `--hour` gives 1 (`got (no value)`); `0x10`, `" "` and `24` give 1; `07` gives 0 with hour 7 in installed.json. The refused runs wrote nothing. Mutation: restoring the old block fails both the bad-value table test and the new valueless test. `parseArgFlag` (mjs:319-324) never supported `--hour=N`, so `argv.includes` introduces no regression for an `=` form. |
| J1r2-m3 | FIXED | mjs:527-532 pushes `${cmdText} (failed: ...)` into `result.commands`. The new test's fake exec throws only on `daemon-reload`, and the test asserts `(failed: boom: unit not found)` with exit 0. Mutation: restoring the bare catch fails exactly that test. |

## Attack brief, re-run against HEAD (no regressions)
- **`--apply` in generated text:** a grep of the installed service, timer and installed.json in a scratch home
  found no hits. No defect.
- **Refusal from the worktree without `--force-root`:** a live `--dry-run` from the worktree printed
  `refused: refusing to install a live janitor timer from a temporary checkout (...)` and exited 1. No defect.
- **`--dry-run` writes nothing:** a find over the scratch home after a dry run found no new paths. No defect.
- **Idempotency:** installed.json had sha256 `f7ef7cd3...` on both installs, and the second run reported
  `unchanged` for all three files. No defect.
- **installed.json shape:** `{"schema":1,"repo":...,"node":<fnm absolute node>,"hour":7,"scheduler":"systemd-user","name":"janitor-record"}`.
  The key order has not changed since r2. No defect.
- **Cause vs compensation:** all three r2 minors were silent fallbacks or silent swallows. Each is now a refusal
  or a recorded failure, which fixes the cause instead of hiding it.

## Observations (not findings, outside this delta)
- A valueless `--repo`, `--host` or `--name` still falls back to its default silently, because `parseArgFlag`
  returns null for them too. This is the same shape as J1r2-m2, but it predates this round, and a delta review
  does not re-open it. A valueless `--repo` still has to pass the `.git` existence check. A valueless `--host`
  falls back to `os.hostname()`, which is the documented default. Worth a follow-up if the orchestrator wants
  every flag to be strict.
- test.mjs:396 says "Install first (real exec, always succeeds)", but that install passes a fake
  `exec: () => ""`. The comment is inaccurate, but the behavior is correct and safe.
- The r2 observations still stand: a foreign `.timer` can let the sibling service be written first, and
  `%` passes through in `WorkingDirectory=` and `StandardOutput=`.

## Bug-fix fields (not a bug-fix lane; filled for gate compatibility)
Cause: not applicable. This is a new-feature territory, and the r2 findings were a portability miss in one test and three silent-fallback paths, all fixed at their source this round.
Discriminating check: four scratch-copy mutants, one reverting each fix. Each fails exactly its own regression test, and the restored copy passes 23 of 23.
Fix location: scripts/install-janitor-timer.mjs:354-358, :527-532 and :542, and scripts/install-janitor-timer.test.mjs:263, :331, :345-361, :390-412 and :528-529.
Simplification: not applicable.
