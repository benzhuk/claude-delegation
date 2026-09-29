VERDICT: APPROVE 216d56b

# Lane 44 transport identity: delta review r2

Scope: 8b8c2f0..216d56b, against review-r1 F1 to F6 and lead-ruling-r1.md. Everything above 216d56b is docs only: `git diff --stat 216d56b HEAD` touches build-r2.md and the record and nothing else. The worktree test file matches 216d56b byte for byte (`cmp` clean). I made no writes to the worktree apart from this report, and ran no delete commands.

## Prior findings

| r1 | Status | Evidence |
|---|---|---|
| F1 MAJOR (win32 separator) | Fixed | transport.test.mjs:65 is now `` assert.equal(resolvedCommon, `${repoA}/.git`); ``. The lead measured the old line failing on Windows at 25a523b. Linux is unchanged and green. |
| F2 MINOR (mkRepo inherits GIT_DIR) | Fixed | `mkRepo` gets its env from `cleanEnv()`, which is `childEnv(envHome)` with the four names removed case-insensitively (:33-37, :43). Measured: `GIT_DIR=<scratch>/B/.git … node --test transport.test.mjs` gives pass 3 / fail 0. At 25a523b the same run gave pass 0 / fail 2. |
| F3 MINOR (GIT_COMMON_DIR not covered) | Fixed | New test at :93-105. With the GIT_DIR-only mutant, only this test fails (see the table below). |
| F4 MINOR (win32 mixed-case key) | Fixed as patched | transport.mjs:426-431. I evaluated the predicate on its own: `Git_Dir` and `git_common_dir` give win32 true / posix false. `GIT_DIRX` and `GIT_CONFIG_GLOBAL` give false on both. The posix path is an exact match, the same behaviour as 25a523b. The parent env is still never touched, because the deletes go to the spread copy. |
| F5 MINOR (temp repo leak) | Fixed for the repos, with one small new leak (N1) | `tracked` plus `after()` under the FIXTURE_ROOT convention (:29-30, :42-53). `/tmp/transport-identity-[a-f]-*` stayed at 48 across my 3 runs of this file; all 30 repos those runs made went into my FIXTURE_ROOT scratch dir. |
| F6 NIT (count) | Resolved without code | The ruling records 9. |

## Discriminating checks (re-run by me)

The scratch copy `…/lane-44/rev2-xIJ1` is `git archive 216d56b` with only transport.mjs swapped. FIXTURE_ROOT is `…/lane-44/fx-UE5P`, so the file's own `after()` did not run a delete.

| transport.mjs | GIT_DIR test | never-mutates | GIT_COMMON_DIR test | Totals |
|---|---|---|---|---|
| base 8b8c2f0 | ✖ | ✔ | ✖ | pass 1 / fail 2 |
| 216d56b with the list cut to `'GIT_DIR',` (grep confirms exactly one such line) | ✔ | ✔ | ✖ | pass 2 / fail 1 |
| 216d56b | ✔ | ✔ | ✔ | pass 3 / fail 0 |

This is the red/green shape lead-ruling-r1 asked for.

## N2

It passes. `node --test skills/multi/scripts/*.test.mjs` shows `✔ N2: no test file in this suite inherits the runner environment on its own`, with tests 581, pass 581, fail 0 (run twice). transport.test.mjs does not contain the spread literal N2 scans for; the only spread is inside `childEnv` in test-child-env.mjs, which is the one place allowed to have it.

Gitrunner-caller suites (decisions-pickup and collect-status): 107 pass, 0 fail.

## Does the childEnv route still exercise inheritance? (brief item 4)

Yes, and the test does not pass vacuously. `childEnv`/`cleanEnv` only builds the env for `git init` inside `mkRepo`. It returns a new object, so its deletes never reach the live process environment. The tests then set GIT_DIR (:61) or GIT_COMMON_DIR (:99) on the live process environment. `gitRunner` spreads that same live object (transport.mjs:425), so the value set by the test is what gitRunner inherits. The proof is the base run above: base gitRunner receives the test-scoped value and resolves repo B, which makes both identity tests red. If the setting did not reach gitRunner, base would be green. The `finally` blocks restore the previous value, or its absence, so nothing leaks between tests.

## Regressions hunted

- N1 NIT: the env home leaks into the system temp dir on every gate run. Evidence: transport.test.mjs:30 is `const envHome = scratchHome(fs, 'transport-identity-env-');`. `scratchHome` always creates under `os.tmpdir()`, and test-home.mjs does not redirect TMPDIR, only FIXTURE_ROOT. Under scripts/run-tests.mjs FIXTURE_ROOT is set, so `after()` returns early (:47) and nothing removes the home. Measured: `/tmp/transport-identity-env-*` went from 8 to 11 over my 3 FIXTURE_ROOT runs, one empty dir per run. It is small (one inode per run, and note-send.test.mjs:865 `runScript` has the same pattern already), but lane 44 spent a hold on `/tmp` inode exhaustion. Not blocking; the lead can apply this at merge or send it to a later lane.
  Patch (transport.test.mjs):
  ```
  -import { childEnv, scratchHome } from './test-child-env.mjs';
  +import { childEnv } from './test-child-env.mjs';
  ```
  ```
  -const envHome = scratchHome(fs, 'transport-identity-env-');
  +const envHome = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), 'transport-identity-env-'));
  ```
  Then change the word `scratchHome` in the comment at :21-22 to "a mkdtemp fixture home". Predicted result: under run-tests the home lives in FIXTURE_ROOT, which makeTempHome removes. Run directly, it lands in tmpdir, is tracked, and `after()` removes it. N2 stays green because no spread literal is added.
- Production code between rounds: the only change is the F4 predicate. Posix behaviour is identical to 25a523b, which r1 already verified for every caller (Q3). No new caller, export or option changed.
- Test ordering: `mkRepo` runs before each test sets its variable, and `cleanEnv` strips an inherited one anyway. No test depends on another.
- Nothing I found needs fixing before merge.

## C4 fields

Cause: unchanged and confirmed in r1: `gitRunner` passed the parent's GIT_DIR / GIT_COMMON_DIR through to git, and git took the repository from them instead of from `cwd`.
Discriminating check: re-run by me as above. Base: both identity tests red. GIT_DIR-only mutant: the GIT_COMMON_DIR test red. 216d56b: all 3 green, and still green with an inherited GIT_DIR.
Fix location: `skills/multi/scripts/transport.mjs` `gitRunner` (the one shared runner) plus `skills/multi/scripts/transport.test.mjs`.
Simplification: N1's patch removes the one call that leaked, the `scratchHome` indirection. No production simplification is needed.

## Side effects of this review

Scratch only: `…/lane-44/rev2-xIJ1` (the archive copy; its transport.mjs is left at the 216d56b version) and `…/lane-44/fx-UE5P` (30 fixture repos). There are 3 new empty `/tmp/transport-identity-env-*` dirs from the N1 leak, 11 in total now. I removed none of them.
