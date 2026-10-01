DONE 25a523b84c101fa258e4520c66b9ec022e915a23

Cause: `gitRunner(args, cwd)` in `skills/multi/scripts/transport.mjs` called `execFileSync('git', args, { cwd, ... })` with no `env` option, so the child git process inherited the whole parent environment as-is. If the parent process (a hook run inside a git operation, an agent spawned from one, a timer unit with a stale environment) had `GIT_DIR` (or `GIT_WORK_TREE`/`GIT_COMMON_DIR`/`GIT_INDEX_FILE`) set, `git` used that to locate the repository instead of `cwd`, so `git rev-parse --git-common-dir` (and everything downstream of it — `mainCheckout`, `decisions-pickup.mjs`'s `registeredProject`/`projectIdentity`/`readRegistration`, note-send.mjs, note-inbox.mjs, collect-status.mjs) resolved identity for the GIT_DIR repo, not the caller's repo.

Discriminating check: `skills/multi/scripts/transport.test.mjs`, test `gitRunner resolves identity from cwd, not an inherited GIT_DIR` — makes two real scratch repos (`git init`, mktemp dirs, no identity config, no commits) via `fs.mkdtempSync`, sets the parent process's `GIT_DIR` to repo B's `.git`, then calls the REAL `gitRunner(['rev-parse','--git-common-dir'], repoA)` and `mainCheckout(repoA, gitRunner)` and asserts both resolve to repo A. On base 8b8c2f0 both resolve to repo B instead (red, shown below). A second test asserts a `gitRunner` call never mutates the parent environment's `GIT_DIR`.

Fix location: `skills/multi/scripts/transport.mjs`, `gitRunner` (the one shared runner; no per-caller patch, no change to any of the 10 direct `execFileSync('git', ...)` sites elsewhere, which are out of scope per the spec).

Simplification: none proposed — the fix is the one-line-of-substance change the spec pins (shallow-copy `process.env`, delete the four names, pass as `env`), plus the frozen `REPO_LOCATING_GIT_ENV` export the spec asks for so a test and later lanes can name it. No new printed string, so no census.md line (P3, matches the spec).

## Deviation from spec

None found. Read `docs/specs/transport-identity-1/spec.md` (P1–P3) before writing anything; the fix and test match the pinned rulings exactly:
- P1: `gitRunner` gets an explicit `env` — a shallow copy of `process.env` with `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR`, `GIT_INDEX_FILE` deleted (not emptied). `REPO_LOCATING_GIT_ENV` exported as a frozen array. The parent's own `process.env` object is never mutated (verified by the second test). Every other `execFileSync` option unchanged. No per-caller patch; no change to the 10 out-of-scope direct `execFileSync('git', ...)` sites.
- P2: the test runs the REAL `gitRunner` (no injected runner), builds two scratch repos with `git init` under `os.mkdtempSync` (mktemp-equivalent, no identity config, no commits — matches the existing convention already used in `note-send.test.mjs`'s `tmp()` helper, since no `mktemp -d` invocation happens directly in the test file itself), sets/restores the parent's `GIT_DIR` in `finally`, and asserts both `mainCheckout(repoA, gitRunner)` and a direct `gitRunner(['rev-parse','--git-common-dir'], repoA)` resolve to repo A. A second test asserts `process.env.GIT_DIR` is unchanged after a `gitRunner` call. No existing test file covered `gitRunner`, so it went into a new `skills/multi/scripts/transport.test.mjs`, which `scripts/run-tests.mjs` picks up automatically (it walks the repo for every `*.test.mjs`) — confirmed in the gate run below.
- P3: no new printed string; no census.md line.

## Red (unchanged transport.mjs, base 8b8c2f0 + new test file only)

```
✖ gitRunner resolves identity from cwd, not an inherited GIT_DIR (20.682385ms)
✔ gitRunner never mutates the parent environment's GIT_DIR (13.070818ms)
ℹ tests 2
ℹ suites 0
ℹ pass 1
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 114.84228

✖ failing tests:

test at skills/multi/scripts/transport.test.mjs:26:1
✖ gitRunner resolves identity from cwd, not an inherited GIT_DIR (20.682385ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected

  + '/tmp/transport-identity-b-kisFCd/.git'
  - '/tmp/transport-identity-a-IWkj2K/.git'
                             ^

      at TestContext.<anonymous> (file:///.../skills/multi/scripts/transport.test.mjs:36:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1325:25)
      at Test.start (node:internal/test_runner/test:1191:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '/tmp/transport-identity-b-kisFCd/.git',
    expected: '/tmp/transport-identity-a-IWkj2K/.git',
    operator: 'strictEqual',
    diff: 'simple'
  }
```

This confirms the bug: with `GIT_DIR` pointed at repo B, the real `gitRunner` (and `mainCheckout` through it) answered for repo B while asked about repo A.

## Green (with P1 applied)

```
✔ gitRunner resolves identity from cwd, not an inherited GIT_DIR (24.169179ms)
✔ gitRunner never mutates the parent environment's GIT_DIR (16.116565ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 135.64595
```

## Gate

`node --test skills/multi/scripts/transport.test.mjs skills/multi/scripts/*.test.mjs` (the touched file plus every other `*.test.mjs` in the same directory, per the gate command):

```
ℹ tests 580
ℹ suites 0
ℹ pass 580
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6062.176561
```

Both new tests (`gitRunner resolves identity from cwd, not an inherited GIT_DIR`, `gitRunner never mutates the parent environment's GIT_DIR`) are in that run and pass.

Full suite, `node scripts/run-tests.mjs` (run twice; totals identical both times, exit 0 both times):

```
ℹ tests 2659
ℹ suites 0
ℹ pass 2654
ℹ fail 0
ℹ cancelled 0
ℹ skipped 5
ℹ todo 0
ℹ duration_ms 21349.653969
```

`skills/multi/scripts/transport.test.mjs` is in the full run: confirmed both new test names appear in the full-suite output (`grep gitRunner` on the captured log matched both). The nested "probe" failure inside the run (a sub-invocation of `run-tests.mjs` testing its own sweep behavior, `run-tests-probe-RVc6XX/probe.test.mjs`) is the intentional one named in the brief — the top-level run still exits 0 with 0 failures.

## Stray files

None inside the worktree or the repo — `git status --short` after the commit shows a clean tree (only the committed `transport.mjs`/`transport.test.mjs` changes, now committed). The test runs (both the isolated file and the two full-suite runs) created real scratch git repos under the system temp dir via `fs.mkdtempSync(os.tmpdir(), ...)` — the same pattern the existing `note-send.test.mjs` `tmp()` helper already uses, and, like that helper, the test file does not delete them (no delete command was run for these, per the hard rule against any delete). Left behind, not removed:

```
/tmp/transport-identity-a-074gRb
/tmp/transport-identity-a-A5Ip9j
/tmp/transport-identity-a-IWkj2K
/tmp/transport-identity-a-kTBXKh
/tmp/transport-identity-a-yUtypC
/tmp/transport-identity-a-ZJBjdm
/tmp/transport-identity-b-4XknKd
/tmp/transport-identity-b-kisFCd
/tmp/transport-identity-b-lJBq35
/tmp/transport-identity-b-LLgcam
/tmp/transport-identity-b-RM07Ci
/tmp/transport-identity-b-w8yKK9
/tmp/transport-identity-c-1OfGiZ
/tmp/transport-identity-c-DJWXof
/tmp/transport-identity-c-Kv0Xhg
/tmp/transport-identity-c-qtNn4G
/tmp/transport-identity-c-vFi9y4
/tmp/transport-identity-c-ZU1zpa
/tmp/transport-identity-d-33KZyU
/tmp/transport-identity-d-8lc1ZK
/tmp/transport-identity-d-GGBBpI
/tmp/transport-identity-d-PHHcAr
/tmp/transport-identity-d-t2EnYE
/tmp/transport-identity-d-Vzzqtq
```

Each is an empty `git init`-only repo (no identity, no commits) — harmless, same class as the pre-existing pattern.

## Commit / push

Commit `25a523b84c101fa258e4520c66b9ec022e915a23` on `build/transport-identity-1` (conventional `fix:`, no trailers, no identity flags). Pushed: `6ce00c8..25a523b build/transport-identity-1 -> build/transport-identity-1`.

## Files touched

- `skills/multi/scripts/transport.mjs` — `gitRunner` fix + `REPO_LOCATING_GIT_ENV` export (P1).
- `skills/multi/scripts/transport.test.mjs` — new file, the P2 tests.
- `docs/specs/transport-identity-1/reports/build.md` — this report.
