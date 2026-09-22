# Sealed tests

`scripts/run-tests.mjs` is the sealed test runner. It runs the whole suite (or an
explicit file list) inside a fresh, disposable fake home built by
`scripts/test-home.mjs`'s `makeTempHome` - never the real machine's `HOME`,
`USERPROFILE`, or git identity - so a test that touches any of those can no longer
reach the real machine by accident, and a test that builds its own fixture git commits
gets a scoped, disposable identity to do it with instead of resolving nothing (and
refusing) or, worse, resolving the real one.

## Shape

`makeTempHome({ files, gitIdentity })` builds the fake home and returns:

```
{ home, agentsHome, env, fixtureRoot, cleanup }
```

- `home` - a fresh `mkdtemp` directory under `os.tmpdir()`, realpath'd. Stands in for
  `HOME`/`USERPROFILE`.
- `agentsHome` - `<home>/.agents`. Never `<home>` itself.
- `fixtureRoot` - `<home>/fixtures`, realpath'd, created before `makeTempHome` returns.
  The ONLY place a fixture git repo may be built and still get an identity under the
  seal (see "Fixture identity scope," below).
- `env` - the full child-process environment: `HOME`, `USERPROFILE`, `AGENTS_HOME`,
  `APPDATA`/`LOCALAPPDATA`/`XDG_CONFIG_HOME`, `HOMEDRIVE`/`HOMEPATH`,
  `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM`, and `FIXTURE_ROOT` (`fixtureRoot`'s
  realpath, forward-slashed). Built through `childEnv()`
  (`skills/multi/scripts/test-child-env.mjs`), which also blanks the messaging
  socket/token so a sealed child never inherits this session's own credentials.
- `cleanup` - removes `home` recursively. Best-effort; a leftover directory under the
  system temp root is harmless.

`scripts/run-tests.mjs`'s `runSealed({ files, cwd })` builds one `makeTempHome` per
run, prints `home` on stdout's first line (so a failed run can still be inspected),
runs the RT-18 canary (`checkSeal`, confirming the seal is actually holding before
trusting it with the suite), then spawns the suite - `node --test <files>` when given
an explicit list, or every `*.test.mjs` under the repo (`node_modules`/`.claude`/`.git`
excluded) otherwise - with the WHOLE `env` object forwarded. A test file never needs
separate wiring to reach `FIXTURE_ROOT`: once `makeTempHome` sets it, `runSealed`
carries it through for free.

Cleanup only happens when the run exits 0; a non-zero exit leaves the sealed home in
place (path printed on line 1) for inspection.

`runSealed` is importable, not just a CLI - it also strips `NODE_TEST_CONTEXT` and
`NODE_TEST_WORKER_ID` from the env it builds before spawning either child. Without
this, a caller running `runSealed` from inside its OWN `node --test` process (e.g. a
test that exercises `run-tests.mjs` itself) would silently break the suite spawn: node
inherits those two vars through `childEnv`'s `process.env` spread, sees them on the
grandchild `node --test` invocation, decides it's a "recursive" run, and SKIPS
executing the suite entirely - while `runSealed` still returns exit 0, as if every
test had passed. Confirmed directly: a deliberately-failing probe test returned 0
through the leak, and 1 once these two vars were stripped. The same fix already
existed at `scripts/prefix-test.mjs`'s own `node --test` spawn site before this was
found here too - any NEW `node --test` spawn site added to this repo needs the same
strip if it might ever run from inside another `node --test` process.

### Fixture identity scope

`gitIdentity: true` (the default) seeds `<home>/.gitconfig` with exactly one directive:

```
[includeIf "gitdir/i:<realpath of fixtureRoot>/**"]
	path = <home>/.gitconfig-fixture
```

`.gitconfig-fixture` carries `[user] name = Fixture / email = fixture@example.invalid`.
This resolves an identity ONLY for a repo whose gitdir is itself under `fixtureRoot` -
not merely somewhere under the system temp dir, and never a real repo. Build every
fixture repo with `fs.mkdtempSync(path.join(fixtureRoot, <prefix>))` (or
`path.join(process.env.FIXTURE_ROOT || os.tmpdir(), <prefix>)` in a helper that only
has the env, not the `makeTempHome` return, with a same-process fallback for when it
runs outside `run-tests.mjs`'s seal). A repo built anywhere else under the seal - the
system temp dir at large, a project scratch path, this repo's own checkout - gets no
identity and any commit into it is refused.

`gitIdentity: false` leaves `GIT_CONFIG_GLOBAL` pointed at an empty file: no identity
resolves anywhere under the seal, on purpose (used to test that the seal itself refuses
a commit, not just that the fixture identity happens to be scoped correctly).

## Fields

| Field | Meaning |
|---|---|
| `home` | fresh, disposable fake `HOME`/`USERPROFILE`, realpath'd |
| `agentsHome` | `<home>/.agents` |
| `fixtureRoot` | `<home>/fixtures`; the only location a fixture git repo resolves an identity under the seal |
| `env.FIXTURE_ROOT` | `fixtureRoot`'s realpath, forward-slashed; reaches a spawned sealed child for free via `runSealed`'s env forwarding |
| `env.GIT_CONFIG_GLOBAL` | `<home>/.gitconfig`; the seeded `includeIf` (or empty, when `gitIdentity: false`) |
| `env.GIT_CONFIG_NOSYSTEM` | `"1"`; hides the machine's real system-level git config under the seal |
| `cleanup` | removes `home` recursively; call only when the caller's own work with it is done |

## Class rule

Exactly ONE construction of an `includeIf "gitdir` directive is allowed to exist across
`scripts/`, `hooks/`, and `skills/multi/scripts/` - `makeTempHome`'s own, in
`scripts/test-home.mjs`. A second, private copy anywhere in that scope is exactly the
duplication a prior seam review collapsed once already; a test file that needs a
fixture git identity gets it from `makeTempHome`, never by hand-seeding its own
`.gitconfig`. Enforced mechanically (`scripts/test-home.test.mjs`'s class test), which
counts only an actual construction - a string/template literal WRITTEN to a file - and
skips comment lines and a regex literal used purely to check the pattern (e.g.
`assert.match(gitconfig, /\[includeIf "gitdir\/i:/)` is a check, not a construction).

## Worked examples

A fixture commit, built under `fixtureRoot`, succeeds and carries the fixture
identity:

```js
const { env, fixtureRoot } = makeTempHome({ gitIdentity: true });
const repo = fs.mkdtempSync(path.join(fixtureRoot, "my-fixture-"));
execFileSync("git", ["init", "-q"], { cwd: repo, env });
fs.writeFileSync(path.join(repo, "a.txt"), "hi");
execFileSync("git", ["add", "a.txt"], { cwd: repo, env });
execFileSync("git", ["commit", "-q", "-m", "fixture commit"], { cwd: repo, env });
// git log -1 --format=%an <%ae> -> "Fixture <fixture@example.invalid>"
```

The same repo built as a SIBLING of `fixtureRoot` - still under the system temp dir,
but not inside `fixtureRoot` - gets no identity and the commit is refused:

```js
const { env, fixtureRoot } = makeTempHome({ gitIdentity: true });
const outsideRoot = path.dirname(fixtureRoot); // the sealed home itself
const repo = fs.mkdtempSync(path.join(outsideRoot, "outside-fixture-root-"));
execFileSync("git", ["init", "-q"], { cwd: repo, env });
// ... git commit here throws: no identity resolves for this gitdir
```

Running the sealed suite from the CLI:

```
$ node scripts/run-tests.mjs
C:\Users\ben\AppData\Local\Temp\sealed-home-abc123
<node --test output for the whole repo>
```

Running one file (or a few) explicitly, still sealed:

```
$ node scripts/run-tests.mjs scripts/test-home.test.mjs scripts/prefix-test.test.mjs
```

A test file that needs `FIXTURE_ROOT` but only has an `env`-shaped object (not the full
`makeTempHome` return) reads it with a standalone-safe fallback, exactly the shape
`scripts/janitor.test.mjs`'s `mkTmp` helper uses:

```js
const dir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix));
```
