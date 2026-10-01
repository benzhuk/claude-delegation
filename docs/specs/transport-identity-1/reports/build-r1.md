DONE fc8f7fdb2e0d825aa39fbe7c4cea7ecfd2e2ed9c

Cause: unchanged from round 0. `gitRunner(args, cwd)` in `skills/multi/scripts/transport.mjs` called `execFileSync('git', args, { cwd, ... })` with no `env`, so the child inherited the parent's `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR`/`GIT_INDEX_FILE` and git resolved identity from those instead of from `cwd`. Review r1 (Opus, `docs/specs/transport-identity-1/reports/review-r1.md`) confirmed this cause independently and confirmed the four names are the right, complete set for the two commands `gitRunner`'s callers actually run. The NEEDS_FIXES verdict was against the round-0 *test file*, not the production cause: F1 (MAJOR) the first assertion compared a POSIX-slashed path against a native one, so it goes red on win32 whether or not the fix is present; F2 the test ran `git init` with the inherited environment, so under an inherited `GIT_DIR` it re-inits the caller's own repository instead of testing anything; F3 the test only ever set `GIT_DIR`, so a mutant that strips `GIT_DIR` alone but leaves `GIT_COMMON_DIR` unstripped still passed; F5 the test leaked two temp git repos per run, unbounded; F4 (separate, production) `gitRunner`'s `delete env[name]` is an exact-case match, so on win32 a differently-cased key (`Git_Dir`) surviving the spread would still reach git, which treats env names case-insensitively there.

Discriminating check: `skills/multi/scripts/transport.test.mjs`. Per the lead's ruling (`docs/specs/transport-identity-1/lead-ruling-r1.md`), applied the reviewer's combined test-file patch verbatim for F1/F2/F3/F5 (local `LOCATING` list, not an import of `REPO_LOCATING_GIT_ENV`) and the F4 patch verbatim in `transport.mjs`. Full red/green/mutant proof below, plus the F2 demonstration (GIT_DIR exported to a real scratch repo's `.git`, one command only).

Fix location: `skills/multi/scripts/transport.mjs` `gitRunner` (F4, case-insensitive delete on win32 only, production) and `skills/multi/scripts/transport.test.mjs` (F1/F2/F3/F5, test-only). No other file touched.

Simplification: none beyond what the ruling specifies — both patches applied byte-for-byte as given in review-r1.md's "Combined test-file patch" and F4 sections.

## IMPORTANT — new finding surfaced by this round's gate, not requested by the ruling

Applying the combined test-file patch **verbatim**, as instructed, introduces one new failure in the directory-scoped gate: `hooks.test.mjs`'s `N2: no test file in this suite inherits the runner environment on its own` now fails, because the patch's `cleanEnv()` helper contains the literal source text `{ ...process.env }` inside a `.test.mjs` file — exactly the pattern N2 scans every test file for and forbids (its rule: every child environment is built through `childEnv()` from `test-child-env.mjs`, so no test file spreads `process.env` on its own — see that file's header on the 2026-09-17 incident). N2 was passing before this round (the round-0 test file spread `process.env` only inside a `try`/`finally` mutation of `process.env.GIT_DIR` itself, never as a spawn-env build; this round's `cleanEnv()` is a new spawn-env build that trips the pattern).

I did not deviate from the ruling to fix this — the ruling says "verbatim," and I did not have authorization to substitute `childEnv()` or another form for the `{ ...process.env }` in `cleanEnv()`, so the patch is committed exactly as specified and the regression is reported here, not silently patched around. It shows up as this single new failure in the directory-scoped gate below, and is not present in the F1/F2/F3/F5-relevant tests themselves (all three new/edited tests in `transport.test.mjs` pass in isolation, and the F2 demonstration below is clean). The reviewer flagged in review-r1.md that the combined patch's predictions were "not measured" — a guard hook denied a trial run on their scratch copy — so this is the first time it has actually been run against the rest of the suite.

## Red (base 8b8c2f0's transport.mjs, with the r1 test file)

Scratch copy of the worktree's committed tree at HEAD (files copied directly, not `git archive`, to include the uncommitted test-file edits), `transport.mjs` swapped for `git show 8b8c2f0:skills/multi/scripts/transport.mjs` (diffed byte-identical to base). Run with `FIXTURE_ROOT` set to a fresh mktemp dir so scratch repos land under the scratchpad, not bare `/tmp`:

```
✖ gitRunner resolves identity from cwd, not an inherited GIT_DIR (22.459546ms)
✔ gitRunner never mutates the parent environment's GIT_DIR (17.085597ms)
✖ gitRunner resolves identity from cwd, not an inherited GIT_COMMON_DIR (16.706742ms)
ℹ tests 3
ℹ suites 0
ℹ pass 1
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 151.04639

✖ failing tests:

test at skills/multi/scripts/transport.test.mjs:47:1
✖ gitRunner resolves identity from cwd, not an inherited GIT_DIR (22.459546ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + '.../fixture-root-zqz2/transport-identity-b-hltAvD/.git'
  - '.../fixture-root-zqz2/transport-identity-a-nO3BU2/.git'

test at skills/multi/scripts/transport.test.mjs:85:1
✖ gitRunner resolves identity from cwd, not an inherited GIT_COMMON_DIR (16.706742ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + '.../fixture-root-zqz2/transport-identity-f-w7c5Ov'
  - '.../fixture-root-zqz2/transport-identity-e-3kx0Dm'
```

Both the GIT_DIR test and the new GIT_COMMON_DIR test fail on base, as required.

## Red on the GIT_DIR-only mutant (`REPO_LOCATING_GIT_ENV = ['GIT_DIR']` only, everything else at the r1 fix)

```
✔ gitRunner resolves identity from cwd, not an inherited GIT_DIR (20.271233ms)
✔ gitRunner never mutates the parent environment's GIT_DIR (13.230708ms)
✖ gitRunner resolves identity from cwd, not an inherited GIT_COMMON_DIR (19.068662ms)
ℹ tests 3
ℹ suites 0
ℹ pass 2
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 126.870663

✖ failing tests:

test at skills/multi/scripts/transport.test.mjs:85:1
✖ gitRunner resolves identity from cwd, not an inherited GIT_COMMON_DIR (19.068662ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + '.../fixture-root-os1k/transport-identity-f-MUg8ad'
  - '.../fixture-root-os1k/transport-identity-e-7xvonq'
```

The GIT_DIR-only mutant now passes the GIT_DIR test but fails exactly the new GIT_COMMON_DIR test — F3 is fixed: the suite now discriminates a fix that strips GIT_DIR alone.

## Green (r1 fix: F4 in transport.mjs, combined patch in transport.test.mjs)

```
✔ gitRunner resolves identity from cwd, not an inherited GIT_DIR (23.867234ms)
✔ gitRunner never mutates the parent environment's GIT_DIR (14.808902ms)
✔ gitRunner resolves identity from cwd, not an inherited GIT_COMMON_DIR (16.768282ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 152.222604
```

All three tests pass at the fix.

## F2 demonstration: GIT_DIR exported to a scratch repo's .git, one command, real test file

Built one throwaway scratch repo (`git init`, mktemp dir, no commits). Ran the test file exactly once with `GIT_DIR` exported to that repo's `.git` on that single command only (never printed, no other command in this session carried it):

```
GIT_DIR="<scratch-f2-repo>/.git" FIXTURE_ROOT="<scratch>" node --test skills/multi/scripts/transport.test.mjs
```
```
✔ gitRunner resolves identity from cwd, not an inherited GIT_DIR (20.248035ms)
✔ gitRunner never mutates the parent environment's GIT_DIR (15.162496ms)
✔ gitRunner resolves identity from cwd, not an inherited GIT_COMMON_DIR (13.616874ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 125.748841
```

F2 is gone: the run passes, and the scratch repo the parent's `GIT_DIR` pointed at was left untouched — `git -C <that repo> log` afterward still reports "your current branch 'master' does not have any commits yet" (never re-inited, never touched), confirming `mkRepo`'s `cleanEnv()` strips the inherited name before running `git init`.

## Gate

`node --test skills/multi/scripts/transport.test.mjs skills/multi/scripts/*.test.mjs`:

```
ℹ tests 581
ℹ suites 0
ℹ pass 580
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5816.394853

✖ failing tests:

test at skills/multi/scripts/hooks.test.mjs:429:1
✖ N2: no test file in this suite inherits the runner environment on its own (21.41419ms)
  AssertionError [ERR_ASSERTION]: these spawn sites build their own env instead of using childEnv(): skills/multi/scripts/transport.test.mjs:25
  actual: [ 'skills/multi/scripts/transport.test.mjs:25' ]
  expected: []
```

The one failure is the N2 regression flagged above — a direct, reproducible consequence of applying the combined patch verbatim (its `cleanEnv()` at line 25 spreads `process.env`). All three of `transport.test.mjs`'s own tests pass (581 = 580 base + 1 new test added; the previous round had 580 total across the directory).

Full suite, `node scripts/run-tests.mjs` (run once, as instructed):

```
ℹ tests 2660
ℹ suites 0
ℹ pass 2440
ℹ fail 215
ℹ cancelled 0
ℹ skipped 5
ℹ todo 0
```

This total is not a reliable signal of code correctness: `/tmp`'s tmpfs was inode-exhausted machine-wide during this run (`df -i /tmp` showed `1046151/1048576` used, 2425 free, both before and after), and the bulk of the 215 failures are `ENOSPC: no space left on device` errors inside test files that have nothing to do with lane 44 or transport.mjs — e.g. `mirror-guard-equal-*`, `reminder-home-*`, `reminder-proj-*` mkdtemp/mkdir failures. This is a shared-host resource exhaustion, not a regression from this round's patch; the directory-scoped gate above (which ran before the exhaustion worsened) is the trustworthy signal for this territory, and it isolates exactly one failure: the N2 finding already reported. Per the brief, I made no delete of any kind to try to relieve the inode pressure.

`skills/multi/scripts/transport.test.mjs` is confirmed present in both gate runs (its 3 test names appear in both logs).

## Stray files

- The round-0 report's 24 `/tmp/transport-identity-{a,b,c,d}-*` dirs are still present (still not removed, per the hard rule).
- This round's red/mutant/green/F2 runs, run with `FIXTURE_ROOT` set to fresh `mktemp -d .../scratchpad/lane-44/fixture-root-XXXX` dirs, left those `fixture-root-*` directories and the `transport-identity-{a,b,c,d,e,f}-*` repos inside them in place (the test file's `after()` hook only cleans up when `FIXTURE_ROOT` is unset, matching `scripts/collect-status.test.mjs`'s convention where `makeTempHome`'s cleanup owns that tree under `run-tests.mjs`; run directly here, nothing else did). Also left: the `rev-uNdt` scratch copy of the tree used for the red/mutant runs, and one throwaway `f2-repo-*` git repo used for the F2 demonstration. None deleted.
- No stray files inside the worktree or the repo itself — `git status --short` is clean after the commit.

## Commit / push

Commit `fc8f7fdb2e0d825aa39fbe7c4cea7ecfd2e2ed9c` on `build/transport-identity-1` (conventional `fix:`, no trailers, no identity flags). Pushed: `9257c59..fc8f7fd build/transport-identity-1 -> build/transport-identity-1`.

## Files touched

- `skills/multi/scripts/transport.mjs` — F4 patch (win32 case-insensitive delete), verbatim per the ruling.
- `skills/multi/scripts/transport.test.mjs` — combined F1/F2/F3/F5 patch, verbatim per the ruling.
- `docs/specs/transport-identity-1/reports/build-r1.md` — this report.
