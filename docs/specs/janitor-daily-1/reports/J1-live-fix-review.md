VERDICT: NEEDS_FIXES 3ea1493bc31dd3ac0d6ade12bf31dc3676650a44

Adversarial review of 3ea1493 (`git diff c4b6633..3ea1493`) against J1-live-findings.md L1/L2 and contracts.md "J1 rulings".
Work: wr-2026-09-27-janitor-daily. Scratch: /tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/jd-rv (all installer runs used HOME/XDG_CONFIG_HOME there, never the real home).

Cause: argv values were parsed with a "missing value -> silently use the default" helper (`parseArgFlag` returns null, callers `||` a default), and the L2 regression test used fixture roots that every other refusal (tmp prefix, missing janitor.mjs, non-git repo) already rejects, so it could not see whether the allowlist did anything.
Discriminating check: `main(["--remove","--name","--enable"])` against a fixture with a real `janitor-record` install returns 0, runs `systemctl --user disable --now janitor-record.timer`, and removes the real unit files (probe4, below); the new L2 refusal test passes unchanged on c4b6633 and with `isInstalledPluginRoot` forced to `return true`.
Fix location: scripts/install-janitor-timer.mjs:334-341 (allowlist) and :429-431 (value-flag parsing); scripts/install-janitor-timer.test.mjs:161-180 (L2 refusal test).
Simplification: refuse any valueless/empty/repeated value flag in one loop next to the existing `--hour` refusal, rather than adding per-flag handling; export the allowlist and unit-test it with plain path strings, which needs no fixture tree and cannot be masked by other refusals.

## Gate

`node scripts/run-tests.mjs` (run once, in the worktree, exit 0):
```
ℹ tests 2045
ℹ suites 0
ℹ pass 2042
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
ℹ duration_ms 17833.056945
```
Matches the builder's J1-live-fix-gate.log.

## Findings

### F1 — HIGH — valueless, empty, or repeated value flags still reach a write path (twin of L1)

`unknownArgs` (scripts/install-janitor-timer.mjs:361-373) accepts a value flag even when no value follows it. `parseArgFlag` (:375-380) then returns null, and :429-431 fall back to the default. `--hour` alone was fixed for this in round 2 (:423-427). `--repo`, `--host` and `--name` were not. Repeated value flags silently take the first value.

Evidence from probe2: `main()` with a Claude-cache fixture root, a fresh home each time, and an injected `exec`.
```
["--repo"]                    exit 0 | installed.json: {"repo":"<H>/Code/claude-delegation",...} | units: janitor-record.service,janitor-record.timer
["--repo",""]                 exit 0 | same real install with the default repo
["--host"] / ["--host",""]    exit 0 | real install, host silently = os.hostname()
["--name"]                    exit 0 | real install under the default name
["--enable","--repo"]         exit 0 | real install + exec: systemctl --user daemon-reload; systemctl --user enable --now janitor-record.timer
["--repo","--dry-run"]        exit 0 | dry-run with the default repo
["--hour","3","--hour","5","--dry-run"]   exit 0 | hour=3, second value ignored
["--repo",A,"--repo","/nope","--dry-run"] exit 0 | first value used, second ignored
```
The destructive case is probe4. It installs the default `janitor-record`, then runs the "remove the test entry" command with its value forgotten, as with `--name "$NAME"` when NAME is unset:
```
main(["--remove","--name","--enable"]) -> exit 0
  removed: .../.config/systemd/user/janitor-record.service
  removed: .../.config/systemd/user/janitor-record.timer
  removed: .../.agents/janitor/installed.json
  exec: systemctl --user disable --now janitor-record.timer; systemctl --user daemon-reload
```
So a forgotten `--name janitor-record-test` value disables and removes the real timer. That is the same class as the live `--help` incident: a malformed argv falls through to a default and a real write.

Fix. Exact current code at scripts/install-janitor-timer.mjs:429-431:
```js
  const repoFlag = parseArgFlag(argv, "--repo");
  const hostFlag = parseArgFlag(argv, "--host");
  const name = parseArgFlag(argv, "--name") || DEFAULT_NAME;
```
Replace with:
```js
  // J1 live-fix review F1: a value flag given with no value (or an empty one) must never fall back to
  // its default — `--remove --name` with the value forgotten used to remove the REAL janitor-record.
  // A repeated value flag is ambiguous (parseArgFlag silently takes the first), so it is refused too.
  for (const flag of ["--repo", "--host", "--name"]) {
    if (argv.includes(flag) && parseArgFlag(argv, flag) === null) refusals.push(`${flag} needs a value`);
  }
  for (const flag of KNOWN_VALUE_FLAGS) {
    if (argv.filter((a) => a === flag).length > 1) refusals.push(`${flag} given more than once`);
  }

  const repoFlag = parseArgFlag(argv, "--repo");
  const hostFlag = parseArgFlag(argv, "--host");
  const name = parseArgFlag(argv, "--name") || DEFAULT_NAME;
```
This goes through the existing refusal return at :489, which fires before both the install branch and the `--remove` branch. The exit code is 1, like the valueless `--hour` refusal, so the round-2 `--hour` test (test.mjs:419-435, which asserts exit 1 and the `--hour must be an integer` text) is unaffected.

Test to add at the end of scripts/install-janitor-timer.test.mjs, before `after(`:
```js
test("L1 review: a valueless/empty --repo/--host/--name, or a repeated value flag, refuses and touches nothing", () => {
  const cases = [["--repo"], ["--repo", ""], ["--repo", "--dry-run"], ["--host"], ["--host", ""], ["--name"], ["--enable", "--repo"], ["--hour", "3", "--hour", "5"], ["--repo", "/a", "--repo", "/b"]];
  for (const argvTail of cases) {
    const home = mkTmp("janitor-timer-home-l1-noval-");
    fixtureDefaultRepoGit(home);
    const calls = [];
    const cap = capture();
    const code = main(["--force-root", "--json", ...argvTail], {
      home, env: { XDG_CONFIG_HOME: path.join(home, ".config") }, platform: "linux", execPath: "/usr/bin/node",
      pluginRoot: fixturePluginRoot(), exec: (c, a) => calls.push([c, ...a].join(" ")), ...cap,
    });
    assert.equal(code, 1, JSON.stringify(argvTail));
    assert.ok(!fs.existsSync(path.join(home, ".agents")), JSON.stringify(argvTail));
    assert.deepEqual(calls, [], JSON.stringify(argvTail));
  }
  // --remove with the --name value forgotten must never fall back to removing the real janitor-record.
  const home = mkTmp("janitor-timer-home-l1-remove-noname-");
  fixtureDefaultRepoGit(home);
  const env = { XDG_CONFIG_HOME: path.join(home, ".config") };
  const pluginRoot = fixturePluginRoot();
  assert.equal(main(["--force-root"], { home, env, platform: "linux", execPath: "/usr/bin/node", pluginRoot, stdout: () => {} }), 0);
  const calls = [];
  const code = main(["--remove", "--name", "--enable"], { home, env, platform: "linux", pluginRoot, exec: (c, a) => calls.push([c, ...a].join(" ")), stdout: () => {} });
  assert.equal(code, 1);
  assert.deepEqual(calls, []);
  assert.ok(fs.existsSync(path.join(home, ".config", "systemd", "user", "janitor-record.timer")));
});
```
Checked on scratch copies. Against 3ea1493 this test FAILS (29 pass, 1 fail). With the patch it PASSES (30 pass, 0 fail). With the patch, the probe2 matrix exits 1 on every row above, with no installed.json, no units and no exec.

### F2 — HIGH — the new L2 refusal test does not discriminate, and the new refusal branch has no coverage

This is the requested twin of the `wt-`-only miss. The test "L2: a real worktree name, a durable non-cache path, and an os.tmpdir() path all refuse..." (test.mjs:161-180) asserts only `code === 1 && refusals.length > 0`. Every fixture root lives under `os.tmpdir()`, has no `scripts/janitor.mjs`, and the fixture home has no git repo. Three other refusals therefore fire regardless of the allowlist.

- The new test file run against c4b6633's installer (scratch copy): 25 pass, 4 fail. The L2 refusal test is one of the 25 that PASS on the old code.
- Mutation `isInstalledPluginRoot` -> `return true` (scratch copy): the L2 refusal test still PASSES. Refusals emitted for the worktree-name fixture under the mutation:
  ```
  missing janitor script .../pr-Z58b4F/Code/claude-delegation-wt/x/scripts/janitor.mjs
  repo .../pr-Z58b4F/Code/claude-delegation is not a git checkout
  ```
- The new message "root that is not an installed plugin location" (:455-459), the only branch that catches the real L2 case, is exercised by no test. `grep -n "not an installed plugin" scripts/install-janitor-timer.test.mjs` returns nothing. Every fixture takes the `isDurablePath` "temporary checkout" branch because of the tmp prefix. The builder report's claim that the pre-existing test now goes "via the 'not an installed plugin location' / 'temporary checkout' message pair" is inaccurate: only the latter is reached.
- The L2 positive test (test.mjs:145) fails on c4b6633, but only because its root is under tmp. It proves the cache is accepted, not that a worktree is refused.
- The three L1 tests do discriminate. On c4b6633, `--help` returns 1 instead of 0, and `--bogus` and the positional return 1 instead of 2.

Fix:
1. scripts/install-janitor-timer.mjs:334. Change `function isInstalledPluginRoot(` to `export function isInstalledPluginRoot(`.
2. Add a path-only unit test. It needs no filesystem, so nothing can mask it:
```js
test("L2 review: the allowlist itself rejects this host's real worktree layout and accepts only the two caches", () => {
  const home = "/home/u";
  for (const p of [
    "/home/u/Code/claude-delegation-wt/janitor-daily-base",
    "/home/u/Code/claude-delegation",
    "/home/u/.claude/plugins/cache-evil/x",
    "/home/u/.claude/plugins/cache/../../../Code/x",
    "/home/u/.claude/plugins",
  ]) assert.equal(isInstalledPluginRoot(p, { home }), false, p);
  for (const p of [
    "/home/u/.claude/plugins/cache/benzhuk/delegation/0.0.0",
    "/home/u/.claude/plugins/cache/benzhuk/delegation/0.0.0/",
    "/home/u/.codex/plugins/cache/delegation/delegation/0.0.0",
  ]) assert.equal(isInstalledPluginRoot(p, { home }), true, p);
});
```
   Add `isInstalledPluginRoot` to the import list at test.mjs:17-26.
3. In the existing L2 refusal test (test.mjs:161-180), make the pluginRoot refusal the only possible refusal:
   - Replace the third maker, `() => path.join(os.tmpdir(), "janitor-timer-l2-outside-cache")`, with `() => mkTmp("janitor-timer-l2-outside-cache-")`.
   - After `const home = mkTmp(...)`, add `fixtureDefaultRepoGit(home);` and, for the root, `const root = makeRoot(home); fs.mkdirSync(path.join(root, "scripts"), { recursive: true }); fs.writeFileSync(path.join(root, "scripts", "janitor.mjs"), "//\n");`. Pass `pluginRoot: root`.
   - Replace `assert.ok(result.refusals.length > 0);` with `assert.equal(result.refusals.length, 1, JSON.stringify(result.refusals)); assert.match(result.refusals[0], /temporary checkout|not an installed plugin location/);`.

Checked on scratch copies with an equivalent standalone test:

| Test | 3ea1493 + export | c4b6633 | `return true` mutation |
|---|---|---|---|
| Unit test | PASS | FAIL | FAIL |
| Tightened main-level test | PASS | PASS (unavoidable: the old tmp-prefix rule catches tmp fixtures) | FAIL |

The unit test carries the c4b6633 discrimination.

### F3 — MEDIUM — the allowlist compares `path.resolve`, not realpath, and case-folds on Linux

`norm` at :335 is `path.resolve(String(p)).toLowerCase().split("\\").join("/")`. It does not resolve symlinks, and it lowercases on every platform.

- **Symlink inside the cache pointing at a worktree is accepted.** At the API level (probe3), `pluginRoot = <home>/.claude/plugins/cache/link-to-worktree`, where the link points to /home/ben/Code/claude-delegation-wt/janitor-daily-base: exit 0, no refusals.
  - From the CLI it is normally unreachable, because Node realpaths the entry, so `isMainModule` sees a mismatch and silently does nothing (see I1).
  - With `node --preserve-symlinks-main --preserve-symlinks <home>/.claude/plugins/cache/benzhuk/delegation/9.9.9/scripts/install-janitor-timer.mjs --dry-run --repo <worktree>` (or the same flags via NODE_OPTIONS), it runs and succeeds. The planned unit then carries `ExecStart=... <home>/.claude/plugins/cache/benzhuk/delegation/9.9.9/scripts/janitor.mjs ...`, which executes the worktree's code.
- **Case-folding on Linux accepts a different directory.** `pluginRoot = <home>/.CLAUDE/Plugins/Cache/x`, a real, distinct directory on ext4, returns exit 0 with no refusals.
- **Reverse direction (fail-safe, but wrong).** If `~/.claude` (or `$HOME`) is a symlink, the CLI's realpath'd `pluginRoot` never matches the unresolved allowlist root, so a genuine install is refused.

What already holds, verified by probe3: `..` segments (refused), the `cache-evil` sibling prefix (refused), and a trailing slash (accepted, correctly).

Fix. Exact current code at scripts/install-janitor-timer.mjs:334-335:
```js
function isInstalledPluginRoot(target, { home = os.homedir() } = {}) {
  const norm = (p) => path.resolve(String(p)).toLowerCase().split("\\").join("/");
```
Replace with (this includes F2's `export`):
```js
export function isInstalledPluginRoot(target, { home = os.homedir() } = {}) {
  // Realpath both sides: a symlink planted inside the cache must not carry a worktree through, and
  // a symlinked ~/.claude must not refuse a genuine install. Case-fold only on case-insensitive hosts.
  const real = (p) => { try { return fs.realpathSync.native(p); } catch { return p; } };
  const foldCase = process.platform === "win32" || process.platform === "darwin";
  const norm = (p) => {
    const s = real(path.resolve(String(p))).split("\\").join("/");
    return foldCase ? s.toLowerCase() : s;
  };
```
Use `process.platform`, not main's injected `platform`: tests inject `platform: "linux"` on any host, but case sensitivity belongs to the real filesystem. Checked on a scratch copy:
- the existing file: 29/29;
- F2's unit test: passes (nonexistent paths fall back to `path.resolve`);
- probe3: symlink->worktree and `.CLAUDE` are now refused; the cache, codex cache and trailing-slash cases are still accepted.

Optional follow-up: pass the realpath'd root into the generated command too, so a symlink repointed later cannot change what runs. Not required for this round.

### F4 — LOW — the bare cache root is itself accepted as a plugin root

`t === root ||` at :340 accepts `pluginRoot = <home>/.claude/plugins/cache` itself (probe3: "cache root itself: exit 0; refusals: none"). No plugin ever lives there, and accepting it widens the allowlist for nothing.

Fix, at :340. Current code:
```js
  ].some((root) => t === root || t.startsWith(`${root}/`));
```
Replacement:
```js
  ].some((root) => t.startsWith(`${root}/`));
```
Predicted outcome: the cache root is refused, every real `<cache>/<pub>/<name>/<ver>` is still accepted, and F2's unit test still passes (it does not list the bare root; optionally add it to the reject list).

### F5 — LOW — the Codex-root citation overstates its source, and alternate config homes are silently refused

- docs/work/evidence/native-package-review.md:10 does confirm the path. It reads: "installedPath under disposable .codex/plugins/cache/delegation/delegation/0.17.1", run under a disposable CODEX_HOME. The claim is TRUE.
- scripts/mirror-shared-skills.mjs:48 is `const CODEX_AGENTS = path.join(HOME, '.codex', 'agents');`. It does not mention CODEX_HOME. The authority for "`~/.codex` plus `$CODEX_HOME`" is scripts/codex-hook-trust.mjs:585-591 (`codexHomes`: `push(path.join(home, '.codex')); push(env.CODEX_HOME);`, plus Orca-managed account homes).
- The code honors neither `CODEX_HOME` nor `CLAUDE_CONFIG_DIR`. This host has `~/.claude-acct2` through `~/.claude-acct6`. A plugin installed under those, or under an Orca-managed CODEX_HOME, is refused. That is fail-safe, not a hole: a CODEX_HOME pointed at a scratch dir had no effect, and the root was refused (checked).

Fix (comment only; no behavior change is required). In the doc comment at :326-328, current text:
```
 * `<CODEX_HOME>/plugins/cache/delegation/delegation/<version>/`, CODEX_HOME defaulting to
 * `<home>/.codex` (scripts/mirror-shared-skills.mjs:48); confirmed live (docs/work/evidence/
```
Replacement:
```
 * `<CODEX_HOME>/plugins/cache/delegation/delegation/<version>/`; only the default `<home>/.codex`
 * is allowlisted here (Codex's homes: scripts/codex-hook-trust.mjs:585-591 — a non-default
 * CODEX_HOME / CLAUDE_CONFIG_DIR install is refused, fail-safe); confirmed live (docs/work/evidence/
```

### I1 — INFO (pre-existing, outside this diff; no fix required this round)

Running the installer through a symlinked path is a silent no-op with exit 0 and no output. `isMainModule` (:700-705) compares the realpath'd `import.meta.url` against the unresolved `argv[1]`.

Checked: `node <home>/.claude/plugins/cache/benzhuk/delegation/9.9.9/scripts/install-janitor-timer.mjs --dry-run ...` (a symlink) printed nothing and exited 0. So did the same run with `~/.claude` as a symlink. An operator would believe the install ran. Worth its own ticket.

## Attack brief, item by item

**1. Argument parsing** (probe2 and the scratch-HOME CLI runs)

| Input | Result |
|---|---|
| `--help=x`, `--Help`, `--dry-run=false`, positional-first (`pos --dry-run`), `--` alone | exit 2, nothing written. Verified clean. |
| `-h`, `--help` | exit 0, usage printed, nothing written. Verified from the real CLI in the worktree with a scratch HOME: `exit 0`, and `find` of the scratch home showed only the home dir itself. |
| `--help` ordering | The check at :396 runs before `unknownArgs`, before any refusal, and before any fs call. The only earlier code is the opts destructure and module load. Verified: nothing writes before the refusal check. |
| A value that looks like a flag | `--repo --x`: `--x` is flagged unknown, exit 2. `--repo -h`: help wins, exit 0. `--repo -x`: accepted as the value `-x`, then refused because the repo is not a git checkout. All safe. |
| `--repo` with no value, `--repo --dry-run`, `--repo ""`, a repeated `--hour` | NOT refused. See F1. |

**2. Allowlist**

| Attack | Result |
|---|---|
| `..` segments | refused. Verified clean. |
| `cache-evil` sibling prefix | refused. Verified clean. |
| trailing slash | normalized and accepted. Verified clean. |
| Windows backslashes and drive-letter case | handled by the lowercase and `\` -> `/` normalization on a win32 host (code-read only; not executable on Linux). |
| symlink cache -> worktree | accepted. See F3. |
| symlink worktree -> cache | refused at the API level; accepted from the CLI, where the realpath is the genuine cache, which is correct. |
| realpath before comparison | not done. See F3. |
| Linux case-folding | wrong. See F3. |
| `CODEX_HOME` set to a temp dir | no bypass. See F5. |
| Codex root claim | true per the evidence file; the mirror-shared-skills citation is weak. See F5. |

**3. Existing guarantees**

- `--remove` is still ungated by the root check. From the real CLI in the worktree with a scratch HOME it returned `refusals: []`.
- `--remove` is still marker-only (`planRemove` is unchanged).
- `--dry-run` from the worktree refuses: `refused: ... not an installed plugin location (/home/ben/Code/claude-delegation-wt/janitor-daily-base)`, exit 1.
- A real install from the worktree with `--repo <worktree>` refuses the same way, exit 1, nothing written. The actual L2 scenario is fixed.
- `--apply` appears nowhere in the diff. The only occurrence in the file is the refusal guard at :468.

**4. Tests**

The new test file was run against c4b6633's installer, with the whole 3ea1493 tree copied to scratch and only the installer swapped: 25 pass, 4 fail. The L1 tests (3) and the L2 cache-accept test (1) discriminate. The L2 refusal test does not (F2).

**5. Gate**: see above. 2045 tests, 2042 pass, 0 fail, 3 skipped.

## Reviewer hygiene

- No file in the worktree was edited, staged or committed by this review, apart from this report.
- All mutations and patch trials ran on scratch copies under jd-rv/{new,old,mut,t-*}.
- `git status` in the worktree during this review also shows ` M docs/work/wr-2026-09-27-janitor-daily.record.md`, mtime 10:07:38 EDT. It was absent from the first status check at the start of the review. No command in this review writes to that path; it is presumably the orchestrator's concurrent edit.
