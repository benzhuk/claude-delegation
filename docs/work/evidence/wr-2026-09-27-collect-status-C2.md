VERDICT: APPROVE 6b08cec63d0bcde89997cccdf015f6049616e549

# C2 review, round 3 (collect-status-1)

Reviewed: `/home/ben/Code/wt-collect-status-1-C2`, branch `build/collect-status-1-C2`, HEAD
`6b08cec63d0bcde89997cccdf015f6049616e549` (from `git rev-parse HEAD`), range `73d4be8..6b08cec`.
The range is one commit:
- `scripts/install-janitor-timer.mjs`: +19/-1
- `scripts/install-janitor-timer.test.mjs`: +122/-0. It only adds tests; no existing test was
  edited.
- the report, state file and gate log

Written 2026-09-27 15:02 America/New_York. This is a delta re-review. I did not modify the
reviewed tree (`git status --short` is empty). All probes and mutations ran on `git archive`
copies under `.../scratchpad/c2r3rev/`.

## Gate, re-run by me

I ran `node scripts/run-tests.mjs scripts/install-janitor-timer.test.mjs` in the worktree:
tests 48, pass 48, fail 0.

## Prior findings, each verified

| id | status | evidence |
|---|---|---|
| N1 (major) | fixed | The patch is applied verbatim at install-janitor-timer.mjs:671-687. It runs before `const result` (:689), and the `refusals.length > 0` return comes before any write or exec. I re-ran the round-2 probe on HEAD (win32, injected exec). All three cases now exit 1 with **0 exec calls**: collect `--enable --name janitor-record`, collect `--remove --enable --name janitor-record`, and the default job's `--remove --enable --name collect-status`. Each gives the refusal `--name <n> is already the <other> job's scheduled task`. Linux and darwin behave as they did before. Mutation `if (platform === "win32")` -> `if (false)`: gate 47/48, and only the new N1 test fails. |
| N2 (major) | fixed | :313 is now `String(a).replace(...)`. Probe on HEAD: `--remove --job collect-status` with no `--to` exits 0 and removes the plist and the collect installed.json on darwin. It also exits 0 on win32 and linux. Mutation back to `a.replace`: gate 47/48, and only the new N2 test fails. |

## Attack brief, re-run for this delta

**Does `--job`'s default drift a byte? (C2): no drift.** I re-ran the 120-case harness: 20 argv
shapes x linux/win32/darwin x {fresh home, pre-installed home}. It compares every file under the
home, stdout, the exit code and the exec calls.
- Base 31a23e2 vs HEAD: 18 diffs. All 18 are the stdout usage/help text only, identical to round
  2. There are 0 file diffs, 0 exit-code diffs and 0 exec diffs.
- Round-2 tree 73d4be8 vs HEAD: **0 diffs of any kind across all 120 cases.**

This matches the round-2 prediction:
- The N1 check can fire only when `~/.agents/collect/<name>.task.xml` exists, which no
  pre-C2 state contains.
- `String(a)` on an argv that is already all strings is the identity.

**Crafted input reaching shell, unit text or envelope:** this delta adds no new input surface.
The N1 check only calls `fs.existsSync` on a path built from `--name`. `--name` is unvalidated,
but that is pre-existing, the flag is tests-only, and it is not counted.

**Un-agent-able:** I ran no `schtasks`, `launchctl` or live `systemctl --user enable`. The
Windows and macOS verification comes from the generated text and the injected-exec argv only.

## Regression hunt: none found

- A same-job reinstall on win32 is not refused, because the check only looks at the *other*
  job's directory. The probe's `collect install --enable default name` exits 0 after a janitor
  install.
- The new tests do look at what they claim to check:
  - The N1 test clears `calls` after setup and asserts `calls.length === 0`. It also checks the
    refusal text and that both the janitor's task XML and its installed.json are byte-identical.
  - The N2 test's darwin iteration is the one that exercises the throw. The mutation above proves
    this.
- The builder's report names the residual the round-2 review asked for: a hand-deleted task XML
  whose live task still exists cannot be detected without querying `schtasks`.

## Not counted (nits, carried forward or new)

- **Nit (new):** the N1 comment at :674-675 says "the marker check **above**". The marker and
  foreign-file checks are actually *below* it, at :772 and :851/:868. Suggested wording: "the
  marker check below".
- **Nit (carried from round 2, still open):** :443 help text still says `passed through as-is`
  for `--out`, which is now resolved to an absolute path. The same is true of the comment at :582.
- **Advisory (carried):** m3 still has no regression test.

## Verified clean (first-class)

- N1 and N2 are fixed exactly as prescribed, and each new test is mutation-proven (47/48 when its
  fix is reverted).
- The default job has 0 byte drift in generated files, installed.json, exit codes and exec calls
  against both base 31a23e2 and round-2 73d4be8.
- All 46 pre-existing tests pass and none was edited.
