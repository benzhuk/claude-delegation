VERDICT: PASS

# T7: sealed test runner

Worktree: `.../scratchpad/next-build/wt-T7`, branch `feat/next-build-T7`, base
`95d54535e1d6deb3ed242a95a23beb8b43c11d7c`. Commits: `25d0b6d` (run-tests.mjs,
test-home.mjs, test-home.test.mjs), `9586189` (docs/sealed-baseline.json).

## What I built

- `scripts/test-home.mjs` — `makeTempHome({ files, gitIdentity = true }) -> { home,
  agentsHome, env, cleanup }`. Builds on `skills/multi/scripts/test-child-env.mjs`'s
  `childEnv(home)` (pre-existing, blanks `CLAUDE_CODE_MESSAGING_SOCKET`/`_TOKEN`) rather than
  duplicating it. Adds `AGENTS_HOME`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM=1`. Realpaths
  the mkdtemp'd home first (`test-home.mjs:38`). Seeds `<home>/.gitconfig` with
  `[includeIf "gitdir/i:<realpath(os.tmpdir())>/**"]` -> `path = <home>/.gitconfig-fixture`
  (`test-home.mjs:52-56`), and `.gitconfig-fixture` with `[user] name = Fixture / email =
  fixture@example.invalid` (`test-home.mjs:57-60`) — every path forward-slashed via a `toGitPath`
  helper (`test-home.mjs:19-21`), per spec-addendum-r3 A3 (applied; see below). `gitIdentity:
  false` writes an empty `.gitconfig` instead, so nothing under the seal has an identity.
  Also exports `checkSeal()` (`test-home.mjs:84-99`): the RT-18 canary, self-contained (derives
  the expected home from `AGENTS_HOME` itself, no side-channel env var), callable in-process
  or in a spawned child.
- `scripts/run-tests.mjs` — builds a sealed home, prints `<sealed>` unconditionally as the
  first stdout line (`run-tests.mjs:54-55`), then spawns `checkSeal()` inside a REAL child
  process (an ESM `node --input-type=module -e` that imports the same function from
  `test-home.mjs` — one source of truth for the canary, `run-tests.mjs:39-50`) and refuses to
  run the suite if that fails. Then runs `node --test <files>` in the same sealed env; default
  file list is a full repo walk for `*.test.mjs`, excluding `node_modules`, `.claude`, and (a
  defensive addition beyond the spec's named two) `.git`. Forwards the child's exit code.
- `scripts/test-home.test.mjs` — 16 tests: `makeTempHome` shape/isolation/env-blanking/
  `opts.files`/`cleanup`; gitconfig + fixture-identity seeding with an explicit
  no-backslashes assertion; a fixture commit succeeding under the seal with the Fixture
  identity; a commit attempted OUTSIDE the system temp dir (this worktree itself) being
  refused under the seal; `gitIdentity: false` refusing a commit even inside the temp dir;
  `checkSeal` passing/failing in-process; `checkSeal` passing in a real sealed child and
  FAILING in a child when the seal is broken on purpose (two ways: `AGENTS_HOME` redirected
  to another temp dir, and `AGENTS_HOME` not shaped as `<home>/.agents`).
- `docs/sealed-baseline.json` — `{"files": []}`. One sealed run
  (`node scripts/run-tests.mjs`, no args, full repo walk) over the base tree at the base
  commit: **903 pass, 0 fail** (`reports/T7-sealed.log`, first line
  `C:\Users\benzh\AppData\Local\Temp\sealed-home-tKDXnT`). For comparison, an UNSEALED
  `node --test` over the same 22 `*.test.mjs` files also gave 903 pass, 0 fail — so nothing
  is silently skipped under the seal; the base tree is genuinely clean. No pre-existing test
  file was edited to reach this (per the brief, T7 changes none of them). 903 = 887
  pre-existing (879 named in the brief + 8 stub smoke tests) + 16 new from
  `test-home.test.mjs`.
- `package.json` — confirmed absent (`test -f package.json` -> false, both before and after
  my changes). Per the brief, `scripts.test` is added "only if package.json exists (it does
  not today)" — no file created, correctly.

## Spec-addendum-r3 A3 (received mid-task, applied)

Read `spec-addendum-r3.md` item A3 as instructed. My implementation already satisfied it
(forward-slashed gitconfig values via `toGitPath`, `fs.realpathSync(os.tmpdir())` before
writing the `gitdir/i:` pattern) — verified by re-reading `test-home.mjs:48-63` against the
addendum text. Added the documented rule to `makeTempHome`'s JSDoc (`test-home.mjs:23-31`) so
T1/T3, who build their own fixture repos against this module's `env`, see explicitly that a
fixture repo must be built with `fs.mkdtempSync(path.join(os.tmpdir(), ...))` — never inside
a repo or scratch path — or its commit gets no identity. Also added `test-home.test.mjs`'s
own fixture-repo helper (`fixtureRepoDir()`) doing exactly that, with an inline comment
citing A3.

## Gate (exact commands from T7.md)

```
node --test scripts/test-home.test.mjs   -> 16 pass, 0 fail   (reports/T7-gate.log)
node scripts/run-tests.mjs               -> exit 0, 903 pass, 0 fail (reports/T7-sealed.log)
```

Both logs attached at the paths given in the brief.

## Deviations / notes

- `run-tests.mjs`'s default walk excludes `.git` in addition to the spec's named
  `node_modules`/`.claude` — defensive only (no functional difference expected; `.git` never
  contains `*.test.mjs`), flagged as a deviation rather than silently added.
- `docs/sealed-baseline.json`'s empty list means the integrator's "sealed run must fail in no
  file outside the baseline" gate is already at its post-ratchet bar (empty) from this build
  onward, for the base tree as it stood at the base commit — a new failure introduced by
  another territory's own files (T1/T2/T3/T4/T6) after merge is a fresh finding against this
  baseline, not evidence my run was wrong.

## Needs (nothing outside my territory required)

None. No read-only file was touched; no cross-territory file was edited.

## Round 2

Reviewer verdict: NEEDS_FIXES (6): F1-F3 MAJOR, F4-F6 MINOR
(`reports/T7-review.md`). Applied F1, F2, F3, F5, F6 verbatim as specified, plus the
JSDoc line on `opts.files`/`.gitconfig` from the review's Notes; F4 is spec-mandated
(the includeIf itself is not changed) so only its false comment was fixed. Commit
`c439be0`.

- **F1** (`test-home.mjs`) — `makeTempHome`'s env only overrode HOME/USERPROFILE/
  AGENTS_HOME/messaging socket-token; `APPDATA`, `LOCALAPPDATA`, `HOMEDRIVE`,
  `HOMEPATH`, `XDG_CONFIG_HOME` and `CODEX_HOME`/`CLAUDE_CONFIG_DIR`/`ORCA_*`/
  `NOTE_SLUG` still leaked the real profile through. Now redirected under the sealed
  home, or deleted (for keys a caller like `codex-hook-trust.mjs` branches on by
  presence, not value) — applied the reviewer's patch verbatim.
- **F2** (`test-home.mjs` + `test-home.test.mjs`) — `checkSeal` only checked
  `AGENTS_HOME`/`os.homedir()` self-consistency, which a REAL unsealed home satisfies
  trivially. Added the containment check (`os.homedir()` must be a fresh dir under the
  realpath'd system temp dir), applied verbatim. Rewrote the paired test
  (`test-home.test.mjs:167-178` before the fix) as a child-process case. Deviation
  from the coordinator's literal wording ("asserting ok === false for the real
  home"): I could not read the LIVE real home inside the test, because
  `test-home.test.mjs` is itself one of the files `scripts/run-tests.mjs` walks and
  runs — under the outer seal, "the real home" as read at test-run-time is already
  the OUTER sealed home, not the machine profile, which made the test's outcome
  depend on which runner invoked it (confirmed: it failed exactly this way on the
  first re-run of the full sealed suite, `actual: true, expected: false`). Fixed by
  building the "unsealed" home deterministically — `path.dirname(fs.realpathSync(os.tmpdir()))`,
  an ancestor of the temp root and therefore never "inside" it, in any execution
  context — which tests the same invariant (self-consistent but not sealed) without
  depending on ambient state. Re-verified both standalone (`node --test
  scripts/test-home.test.mjs`, 16/16) and nested (`node scripts/run-tests.mjs`,
  903/903).
- **F3** (`test-home.test.mjs`) — the "commit refused outside the temp dir" test used
  `assert.throws(..., /./)` (any error passes) around a real `git commit
  --allow-empty` in this checkout's own working tree — a latent risk of writing a
  real commit if identity had ever resolved there. Replaced with `git var
  GIT_COMMITTER_IDENT` (identity resolution, no write) and an error-message-shaped
  matcher, applied verbatim.
- **F4** (not fixed, spec-mandated) — the includeIf's scope (whole system temp dir,
  not just T7's fixture repos) is unchanged. Fixed only the false comment the test
  carried ("the repo running this suite is not under `os.tmpdir()`" — false: the
  WORKING TREE is, under this build's scratchpad; only the WORKTREE GITDIR, under the
  main checkout's `.git/worktrees/<name>`, is not — that gitdir/worktree distinction
  is what the test actually exercises). For the record, per the coordinator's
  instruction: **a repo cloned under the system temp dir gets the Fixture identity
  with hooksPath hidden.**
- **F5** (`run-tests.mjs`) — `main()` silently dropped any `-`-prefixed argv entry
  instead of refusing it, and resolved relative file args against `REPO_ROOT` rather
  than the real invocation directory. Now rejects any flag (exit 2, verified:
  `node scripts/run-tests.mjs --test-name-pattern foo` → `run-tests: flags are not
  supported`, exit 2) and resolves argv paths against `process.cwd()` in `main()`
  before handing them to `runSealed`.
- **F6** (`run-tests.mjs`) — the sealed home was removed in `finally` unconditionally,
  so a failing run's line-1 path was already gone. Now kept (with a stderr note)
  whenever the run's exit code is non-zero; only a clean (exit 0) run cleans up.

Re-ran both gates after all fixes:
- `node --test scripts/test-home.test.mjs` → 16 pass, 0 fail (`reports/T7-gate.log`).
- `node scripts/run-tests.mjs` (full repo walk, tighter env) → exit 0, **903 pass, 0
  fail** (`reports/T7-sealed.log`) — reproduces the reviewer's own re-measured number
  from the review report ("Builder's numbers reproduce... Patch (full suite re-run
  with this env: 903 pass/0 fail").

One leftover from mid-fix debugging: a sealed temp dir at
`%TEMP%\sealed-home-zmiFaW` (from an interim failing run, before the F2 test fix) was
left in place rather than force-deleted — `rm -rf` is a gated cleanup command per this
build's rules and I did not want to chain it onto productive work; it is empty of any
real content (a disposable fixture home) and safe to delete or leave.

State file kept current throughout at
`.../scratchpad/next-build/reports/T7-state.md`.
