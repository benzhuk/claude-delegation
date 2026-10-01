DONE 3ea1493bc31dd3ac0d6ade12bf31dc3676650a44

Fixes L1 and L2 from docs/specs/janitor-daily-1/reports/J1-live-findings.md, in
scripts/install-janitor-timer.mjs and scripts/install-janitor-timer.test.mjs only.
Committed on build/janitor-daily-1 as 3ea1493bc31dd3ac0d6ade12bf31dc3676650a44.

## Codex installed-plugin root (found)

`<CODEX_HOME>/plugins/cache/delegation/delegation/<version>/`, with `CODEX_HOME`
defaulting to `<home>/.codex` — cited:
- docs/work/evidence/native-package-review.md:10 — a live probe: "plugin add
  delegation@delegation --json: exit 0, version 0.17.1, installedPath under disposable
  .codex/plugins/cache/delegation/delegation/0.17.1."
- scripts/mirror-shared-skills.mjs:48 — `CODEX_AGENTS = path.join(HOME, '.codex',
  'agents')`, the same base Codex's own config/state uses, confirming `<home>/.codex`
  is the default `CODEX_HOME`.
- docs/native-use.md:65-67 — the native install route (`codex plugin marketplace add .`
  / `codex plugin add delegation@delegation`) that produces this cache path; only
  reached via that route, not the mirror route (which never writes a Codex plugin
  cache — mirror-shared-skills.mjs:14-15).

For contrast, the Claude plugin cache is `<home>/.claude/plugins/cache/<publisher>/
<name>/<version>/`, cited from README.md:117.

## L1 — unknown flag / --help fix

- scripts/install-janitor-timer.mjs:334-368 — new `isInstalledPluginRoot` (L2, see
  below), `KNOWN_BOOLEAN_FLAGS`/`KNOWN_VALUE_FLAGS`, `usageText()`, `unknownArgs()`.
- scripts/install-janitor-timer.mjs:393-403 — in `main()`: `--help`/`-h` prints usage
  and returns 0 before anything else runs; any other unrecognized argv token (typo'd
  flag, or a value-flag's stray value that itself looks like a flag, or a bare
  positional) makes `unknownArgs(argv)` non-empty and returns 2 with a usage message,
  before any refusal/write logic executes.
- scripts/install-janitor-timer.mjs:38-44 (top-of-file doc comment, the `CLI:` line)
  updated to document `--help/-h` and the exit-2 usage-error behavior.

Tests (scripts/install-janitor-timer.test.mjs):
- `L1: --help prints usage, exits 0, and writes nothing — even against the installer's
  own default (worktree) pluginRoot` (line 635) — asserts code 0, usage text in
  stdout, and nothing written under a fixture home.
- `L1: an unrecognized flag (--bogus) exits 2 and writes nothing` (line 644).
- `L1: a stray positional argument exits 2 and writes nothing` (line 653) — uses
  `["--dry-run", "extra-positional"]` to prove a stray positional is caught even
  alongside otherwise-valid flags.

## L2 — non-durable-checkout refusal fix

- scripts/install-janitor-timer.mjs:334-341 — `isInstalledPluginRoot(target, { home })`:
  positive check, true only when the resolved target sits inside
  `<home>/.claude/plugins/cache/` or `<home>/.codex/plugins/cache/`.
- scripts/install-janitor-timer.mjs:440-459 — in `main()`: install is refused unless
  `pluginRoot` passes `isInstalledPluginRoot`, or `--force-root`/`--remove` apply.
  `isDurablePath` (scripts/mirror-shared-skills.mjs:691) is still called as an
  additional, more specific refusal reason (kept per the finding's instruction) when
  the allowlist rejects a root that also looks like a temp/worktree checkout;
  otherwise the refusal names it as "not an installed plugin location." Both paths
  are refusals — nothing is written either way. `--remove` remains ungated (unchanged
  from before), `--force-root` remains tests-only (unchanged).

Tests (scripts/install-janitor-timer.test.mjs):
- `L2: a plugin root inside the installed Claude plugin cache installs without
  --force-root` (line 145) — fixture `<home>/.claude/plugins/cache/benzhuk/
  delegation/0.0.0`, real install, exit 0, zero refusals.
- `L2: a real worktree name, a durable non-cache path, and an os.tmpdir() path all
  refuse under --dry-run and a real install, nothing written` (line 161) — covers all
  three named cases (`<fixture>/Code/claude-delegation-wt/x`,
  `<fixture>/Code/claude-delegation`, and a path under `os.tmpdir()`) crossed with
  both `--dry-run` and a real install; asserts exit 1, refusals present, and nothing
  written under `<home>/.agents`.

The pre-existing durability test (`refuses to install from a temporary/worktree
checkout unless --force-root...`) still passes unchanged: the default `fixturePluginRoot()`
lives under `os.tmpdir()`, which is neither in the Claude nor Codex cache, so it still
refuses (now via the "not an installed plugin location" / "temporary checkout"
message pair instead of the old bare `isDurablePath` check), and the fix's message
still matches the test's `/temporary checkout/` assertion because the fixture root is
also caught by `isDurablePath` (it lives under the real system temp dir).

## Gate

`node --test scripts/install-janitor-timer.test.mjs`: 29/29 pass (0 fail), including
all 5 new tests above.

`node scripts/run-tests.mjs` (full sealed suite, log at
docs/specs/janitor-daily-1/reports/J1-live-fix-gate.log): tests 2045, pass 2042, fail
0, skipped 3, cancelled 0. Tail:

```
ℹ tests 2045
ℹ suites 0
ℹ pass 2042
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
ℹ duration_ms 17838.285889
```

## Scope

Only scripts/install-janitor-timer.mjs and scripts/install-janitor-timer.test.mjs
were touched, per the findings file and the brief's NOT list. No installer run was
ever pointed at a real home; every `main()` call in every new/changed test injects a
fixture `home` under `os.tmpdir()`/`FIXTURE_ROOT`, never `os.homedir()`. No `rm`/`git
clean`/deletion commands were run; test cleanup is the pre-existing `after()` hook's
`fs.rmSync` inside the test process. No `--enable`, `--apply`, or push was used.
