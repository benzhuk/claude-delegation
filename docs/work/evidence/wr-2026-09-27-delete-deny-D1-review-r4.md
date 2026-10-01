VERDICT: APPROVE b7a3fef73b6dee4f977eb7d5685e0a50722653a2

# D1 review, round 4 (delta): delete-guard hook

Worktree C:/Users/benzh/Code/delete-deny/wt-d1. HEAD is b7a3fef73b6dee4f977eb7d5685e0a50722653a2, from my own `git rev-parse HEAD`. Range 087d37d..HEAD is one commit (b7a3fef), touching only hooks/delete-guard.mjs (+16/-3) and hooks/delete-guard.test.mjs (+42), both on the Owns list. `git status --short` was empty before and after this review.

**Judgment question:** does the guard refuse every recursive delete an agent can issue, without blocking ordinary work? **Yes, to the standard this territory needs.** The r3 MAJOR (a ReDoS that made the hook time out and fail open) is fixed, and I checked that end to end. The regex change is linear on every adversarial shape I tried. The regression test fails on the old regex: I reverted the fix on a scratch copy to confirm it. Nothing regressed on the deny or pass side. What remains is two MINOR items, neither of which blocks approval.

## Gate (rerun)
`node --test hooks/delete-guard.test.mjs hooks/agent-dispatch-guard.test.mjs skills/multi/scripts/hooks.test.mjs`: 251 tests, 251 pass, 0 fail, exit 0, about 11.7 s. N2 passes. Output went to my scratch dir, so the builder's D1-gate.log is untouched. The N2 twin (a child spawned with a hand-built env spread) is not present: the 7 new tests are pure `detectDelete` calls and spawn nothing.

## Prior findings: fix verification

| r3 finding | Status | Evidence |
|---|---|---|
| MAJOR R3-1: `PIPE_STAGE_SHELL_RE` exponential backtracking, fail-open | **FIXED** | See below. |
| n5: `env` launcher | FIXED as specified, but incomplete (see n9) | hooks/delete-guard.mjs:229. `\| env sh`, `\| /usr/bin/env bash`, `\| env -i bash`, `\| sudo env bash` and `\| sudo -u me /usr/bin/env -i sh` all deny. |
| n6: quoted git.exe path, `-C` with a glued value | FIXED | hooks/delete-guard.mjs:187. These deny: `"C:\Program Files\Git\bin\git.exe" clean -fdx`, `git -Cx clean -fdx`, `'git' clean -fdx`, `git -C"a b" clean -fdx`, `"git.exe" -C x clean -fdx`, `git -Cx worktree prune`. These still pass: `"C:\...\git.exe" status`, `git -Cx log`, `git -c core.x=1 log`, `git -C x status`. |
| n7, n8 | No action, as agreed | Unchanged. |

### MAJOR R3-1 verification
- **The patch.** hooks/delete-guard.mjs:229 contains the r3 patch verbatim: `(?:sudo(?:\s+-\S+(?:\s+[^-\s]\S*)?)*\s+)?`.
- **Timing sweep.** I ran each shape through `detectDelete` at n = 10, 40 and 95 tokens (the 300-char afterWindow cap admits about 95). Every one finished in ≤1.0 ms:
  - `sudo -a…y`
  - `sudo -a b…y`
  - `sudo -a-…`
  - `env -a…y`
  - `sudo -a env…`
  - `sudo -u /a/…`
  - `/env /env…`
  - `sudo -a… env -a…`
  - 95 pipe stages
  - a 285-char dash token
  - tab-separated tokens

  At 087d37d the `sudo -a…` shape took 3,429 ms at n=40.
- **GIT_PREFIX timing.** The regex changed at :187 and runs on the whole command with no length cap. I ran 20,000-repeat inputs of six shapes; the slowest took 4.7 ms. The shapes were `git -c…`, `git -Cx…`, `git -C-C-C…`, `git" --a=b -p -C "q"…`, `gitgit…` and `git -C` followed by 100k characters. The `{0,6}` bound holds.
- **End to end.** The exact r3 payload (`echo x | sudo -a ×42 y; rm -rf /tmp/zz`, with `agent_id` set) went through `node hooks/delete-guard.mjs` under `timeout 5`, with HOME and USERPROFILE pointed at a scratch dir. It returned the deny JSON in 123 ms, exit 0. At 087d37d it hit exit 124 with no output. The log line went to the scratch home only.
- **Mutation check.** On a scratch copy of hooks/ (plus test-child-env.mjs), I put back the 087d37d regex at :229. The new test, "detectDelete stays linear…" (hooks/delete-guard.test.mjs:391), then never finished, and I had to kill the run with `timeout 30` (exit 124). With the fix it passes in about 1 ms. So the test does discriminate, although it does so by hanging rather than failing; see n10. No test process was left running afterwards.

## MINOR (no fix required for approval)

### n9: the env launcher misses assignments and options that take an argument
- **Evidence.** hooks/delete-guard.mjs:229. At HEAD these all pass, with no deny:
  - ``echo 'rm -rf x' | env FOO=1 bash``
  - ``echo 'rm -rf x' | env -u HOME bash``
  - ``echo 'rm -rf x' | env -i A=1 -u B sh``
  - ``echo 'rm -rf x' | sudo -u me env A=b bash``

  The n5 group only admits bare dash flags. This is a gap in the r3 suggestion itself, not a builder error. It is MINOR because the attack requires deliberately piping a quoted delete into an interpreter through `env VAR=…`, which ordinary agent work does not do.
- **Patch** (hooks/delete-guard.mjs:229, the env group only):
  - old: `(?:(?:\S*[\\/])?env\s+(?:-\S+\s+)*)?`
  - new: `(?:(?:\S*[\\/])?env(?:\s+-\S+(?:\s+[^-\s=][^\s=]*)?|\s+\w+=\S*)*\s+)?`
  - Why it stays linear: an option's argument can start with neither `-` nor contain `=`, so each token has exactly one reading. The same trick fixed R3-1.
- **Verified on a scratch copy.**
  - All four cases above deny.
  - `| env -i bash`, `| env sh` and `| /usr/bin/env bash` still deny.
  - `| envsubst`, `| env A=1 node x.js` and `| env -u HOME cat` still pass.
  - Timing: `env -a A=1`×95, `env -a b`×95, `env A=1`×95 and `sudo -a b…env -a b…`×95 each took ≤0.6 ms.
  - hooks/delete-guard.test.mjs: 116/116 pass.
- **Tests to add.** Add one deny test each for `| env FOO=1 bash` and `| env -u HOME bash`.

### n10: the linearity test hangs instead of failing on a regression
- **Evidence.** hooks/delete-guard.test.mjs:392 uses `'-a '.repeat(90)`. At the old regex that is roughly Fib(90) steps. The synchronous regex cannot be interrupted, so the 200 ms assertion never runs and the gate hangs until an outer timeout kills it (verified above). A hung gate is not a false pass, but the failure is slower and less clear than it needs to be.
- **Patch:**
  - old: ``const command = `echo x | sudo ${'-a '.repeat(90)}y; rm -rf z`;``
  - new: ``const command = `echo x | sudo ${'-a '.repeat(40)}y; rm -rf z`;``
- **Predicted outcome.** At the old regex this takes about 3.4 s, so the 200 ms bound fails within seconds. At HEAD it takes ≤1 ms and passes.

## Verified absent (first-class findings)
- **Brief attack list, deny side.** All of these deny at HEAD:
  - `rm -r -f x`, `rm -fr x`, `rm --recursive x`, `\rm -rf x`
  - `command rm -rf x`, `sudo rm -rf x`, `ls | xargs rm -rf`
  - `sh -c "rm -rf x"`, `rm "-rf" x`
  - `ri -r x`, `Remove-Item -Recurse:$true x`, `gci | ri -r`
  - a here-doc that writes `rm -rf x` and then runs `bash s.sh`
  - the sudo-options pipe probes carried over from r2/r3: `| sudo -u me sh`, `-E -u me bash`, `sudo sh`, `-E sh`, `-u me -E /bin/bash`, `--user=me sh`, `-u -1 sh`, `-g wheel -u me sh`
  - `| tee f | sh` and `| /bin/sh`
- **Brief attack list, pass side (no new false refusals).** All of these pass at HEAD:
  - `grep -n "rm -rf" file`
  - `git commit -m "never rm -rf x"`
  - `git worktree remove ../wt-fix` and `git worktree remove C:/x/wt-f`
  - `rm -f file`, `git branch -D x`
  - `echo "rm -rf x" | grep rm`, `| sudo tee f`, `| sudo -u me tee f`, `| envsubst`, `| wc -l`, `| shellcheck -`
  - `git clean -n` and `--dry-run`
  - `rm -f C:\tmp\-r.log`, `docker rm -f c`, `ls -R`, `cp -r a b`
  - `git log --grep="git clean -fdx"` and `grep -rn "git -C x clean -fdx" .`
- **No new catastrophic-backtracking shape** in either changed regex (see the timing sweep above).
- **Untouched areas.** The deny JSON shape, fail-open on bad stdin, kill switches, the 80-character log cap and hooks.json are unchanged by this commit. Rounds 1 and 2 verified them. hooks.json still gives this hook `"timeout": 5`.
- **Scope.** Only the two Owns files changed. The worktree is clean.

## Integrator-owned (unchanged, still open)
- Spec item 4: the live `agent_id` presence check on a real subagent Bash payload, required before merge.
- Spec item 8: the live deny-vs-prompt timing check. Rerun it on this sha. The builder report's run instructions for both checks are adequate.

Cause: the r2-n2 sudo-options group let a `-`-token be read either as a new option or as the previous option's argument. That made the match ambiguous, so backtracking was exponential. b7a3fef removes the ambiguity by forbidding a leading `-` on an option argument.
Discriminating check: `detectDelete("echo x | sudo " + "-a ".repeat(40) + "y")` takes 3,429 ms at 087d37d and ≤1 ms at b7a3fef. The CLI on the 42-token `…; rm -rf /tmp/zz` payload exits 124 with no deny at 087d37d, and returns the deny JSON in 123 ms at b7a3fef. The new test at hooks/delete-guard.test.mjs:391 hangs when the old regex is swapped in on a scratch copy.
Fix location: hooks/delete-guard.mjs:229 (PIPE_STAGE_SHELL_RE) and :187 (GIT_PREFIX, n6); tests at hooks/delete-guard.test.mjs:360-417.
Simplification: give every token one reading, so an option argument never starts with `-`. This removes the ambiguity rather than capping repeats. Applying the same rule to `env` (no `-` or `=` in an option argument) closes n9 with no new ambiguity.
