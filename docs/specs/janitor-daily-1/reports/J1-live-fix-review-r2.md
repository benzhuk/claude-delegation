VERDICT: APPROVE b9fc40e34d80320aab6286c2849cca93fe6b9d8f

This is a delta re-review of `git diff 3ea1493..b9fc40e` (2 files, +77/-9) against findings F1-F5 in J1-live-fix-review.md.
Work: wr-2026-09-27-janitor-daily.
Every installer run below used HOME and XDG_CONFIG_HOME under the scratch folder /tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/jd-rv, never the real home. All mutations ran on scratch copies extracted with `git archive b9fc40e`.

Cause: `--repo`, `--host` and `--name` fell back to their defaults when given no value. The L2 test could not see the allowlist because other refusals masked it. The allowlist compared paths without resolving symlinks, and case-folded paths on Linux.
Discriminating check: `main(["--remove","--name","--enable"])` against a fixture that has a real `janitor-record` install. It now exits 1 with `refused: --name needs a value`, runs no exec, and removes nothing. The allowlist unit test fails on c4b6633 semantics and fails on an always-accept mutation.
Fix location: scripts/install-janitor-timer.mjs:334-349 (`isInstalledPluginRoot`) and :437-445 (value-flag refusals). Tests are in scripts/install-janitor-timer.test.mjs, at :162-176 (allowlist unit test), :178-202 (the tightened L2 refusal test) and :684-710 (the F1 test).
Simplification: one refusal loop covers the valueless flags and one covers the repeated ones, both next to the existing `--hour` refusal. The allowlist is exported and unit-tested on plain path strings, with no fixture tree that another refusal could mask.

## Per-finding verification

- **F1: FIXED.** The patch was applied verbatim at :437-445.
  - probe4 (install the default entry, then `--remove --name --enable`): `exit 1, refused: --name needs a value, exec: (none)`. Before the fix this was exit 0; it ran `systemctl --user disable --now janitor-record.timer` and removed the unit files.
  - probe2 (a fresh home per case): every one of the following exits 1 with no installed.json, no units and no exec:
    - `--repo`
    - `--repo ""`
    - `--repo --dry-run`
    - `--host`
    - `--host ""`
    - `--name`
    - `--enable --repo`
    - `--hour 3 --hour 5`
    - `--repo A --repo B`
  - The earlier probe2 rows are unchanged: `--help=x`, `--Help`, `--dry-run=false`, `pos --dry-run` and `--` exit 2; `-h` exits 0.
- **F2: FIXED.** The new file runs 31 tests, 31 pass. Discrimination was checked on scratch copies:

  | Installer under test | Result |
  |---|---|
  | c4b6633 as shipped | The whole file fails at import (`isInstalledPluginRoot` is not exported). |
  | c4b6633 plus an export shim with the old semantics (`isInstalledPluginRoot = (p,{home}) => isDurablePath(path.join(p,"scripts","janitor.mjs"),{home})`) | 6 fail, including the `L2 review: the allowlist itself...` unit test and `L1 review: a valueless/empty...`. |
  | b9fc40e with `isInstalledPluginRoot` forced to `return true` | 3 fail: the L2 review unit test, the tightened L2 refusal test ("on the pluginRoot check alone"), and the pre-existing temp-checkout test. |
  | b9fc40e unmodified | 31/31 pass. |

  The tightened L2 test now builds a janitor.mjs stub and a git repo fixture. It asserts that there is exactly one refusal and that it is the pluginRoot refusal, so other refusals can no longer mask it.
- **F3: FIXED.** The patch was applied verbatim at :334-349: realpath on both sides, and case-folding only on win32 and darwin.
  - probe3: a symlink in the cache pointing at a worktree is refused (exit 1), and `.CLAUDE/Plugins/Cache/x` on Linux is refused (exit 1).
  - Still correct: `..` and `cache-evil` are refused; a trailing slash and the Codex cache are accepted.
  - The fix does not refuse genuine installs. A CLI dry-run from a real copy under a scratch `<home>/.claude/plugins/cache/benzhuk/delegation/0.0.0` exits 0.
- **F4: FIXED.** The `t === root ||` clause was removed at :348. probe3 shows the bare cache root is now refused (exit 1).
- **F5: FIXED.** The comment at :327-329 now cites scripts/codex-hook-trust.mjs:585-591 and states the fail-safe refusal of a non-default CODEX_HOME or CLAUDE_CONFIG_DIR. Behavior is unchanged, as intended.

## Regression hunt: no defects found

- **Real CLI from the worktree, scratch HOME.**
  - `--help`: exit 0.
  - A real install with `--repo <worktree>`: exit 1, "not an installed plugin location (/home/ben/Code/claude-delegation-wt/janitor-daily-base)".
  - `--dry-run`: exit 1, same refusal.
  - `--remove --json`: `refusals: []`, exit 0, so `--remove` is still ungated and `planRemove` is still marker-only (unchanged).
  - After all four runs, `find` of the scratch home listed nothing: no writes.
- **Realpath fallback.** A nonexistent path falls back to `path.resolve`, which is the pre-fix behavior, so it is never less strict than before. A missing target also triggers the existing missing-janitor-script refusal.
- **Test interaction.**
  - The new value-flag refusals return through the existing refusal exit at :497, so their exit code is 1. The round-2 valueless `--hour` test is unaffected: it still asserts exit 1 and the `--hour must be an integer` text, and it passes.
  - No existing test passes a repeated value flag.
- **`--apply`.** It appears 0 times in `git diff 3ea1493..b9fc40e`. The only code occurrence is still the refusal guard.
- **Scope.** Only the installer and its test file changed.

## Advisory (non-blocking; the round-1 F3/F4 fix instructions did not require a test)

The F3 and F4 behavior has no regression test. On 3ea1493 with only the `export` added, all 31 tests pass except the F1 test, so reintroducing the non-realpath comparison or `t === root` would go unnoticed. A ready test, checked to FAIL on 3ea1493+export and PASS on b9fc40e:
```js
test("L2 review r2: a symlink planted in the cache, and the bare cache root, are not installed plugin roots", () => {
  const home = mkTmp("janitor-timer-l2-symlink-");
  const cache = path.join(home, ".claude", "plugins", "cache");
  const outside = path.join(home, "Code", "claude-delegation-wt", "x");
  fs.mkdirSync(cache, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.symlinkSync(outside, path.join(cache, "planted"), "junction");
  assert.equal(isInstalledPluginRoot(path.join(cache, "planted"), { home }), false);
  assert.equal(isInstalledPluginRoot(cache, { home }), false);
  fs.mkdirSync(path.join(cache, "benzhuk", "delegation", "0.0.0"), { recursive: true });
  assert.equal(isInstalledPluginRoot(path.join(cache, "benzhuk", "delegation", "0.0.0"), { home }), true);
});
```
The `"junction"` type is ignored on POSIX and lets the test create a directory link on Windows without admin rights.

## Gate

`node scripts/run-tests.mjs`, run once in the worktree, exit 0:
```
ℹ tests 2047
ℹ suites 0
ℹ pass 2044
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
ℹ duration_ms 17403.98106
```
That is 2045 + 2, consistent with the two added tests (the L2 refusal test was replaced in place).

## Reviewer hygiene

No file in the worktree was edited, staged or committed except this report. `docs/work/wr-2026-09-27-janitor-daily.record.md` is still ` M`, from the orchestrator's earlier edit, which I noted in round 1.
