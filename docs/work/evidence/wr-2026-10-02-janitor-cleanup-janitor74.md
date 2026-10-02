VERDICT: APPROVE 1275bcfefed305170059bc84649cf287ef9bbac5

# janitor74 review, round 5 (delta re-review of fix round 5)

APPROVE

- Worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-janitor-cleanup-74-janitor74
- HEAD: 1275bcfefed305170059bc84649cf287ef9bbac5. I got it from my own `git rev-parse HEAD`, before and after my checks.
- Range: `8bf2f89..1275bcfe` is one commit touching 6 files, +84/-18:
  - scripts/wiring-check.mjs and scripts/wiring-check.test.mjs
  - scripts/janitor-timer-refresh.mjs and scripts/janitor-timer-refresh.test.mjs
  - scripts/janitor-sweep.test.mjs
  - scripts/janitor.test.mjs
- `git status --short` in the reviewed worktree was empty before and after my checks. Every mutation and trial edit was made on a `git archive HEAD` copy in the session scratchpad (`.../scratchpad/j74r5/tree`). I restored each edited file there and confirmed with `cmp` that it matched the reviewed tree byte for byte.

Counts: 0 BLOCKER, 0 MAJOR, 0 MINOR, 2 NIT. Both NITs are non-blocking, and each comes with a patch.

## Gate re-run (mine)
- Command, run in the reviewed worktree:
  `node scripts/run-tests.mjs scripts/wiring-check.test.mjs scripts/janitor-timer-refresh.test.mjs scripts/janitor-sweep.test.mjs scripts/janitor.test.mjs scripts/install-janitor-timer.test.mjs skills/multi/scripts/hooks.test.mjs`
- Result: exit 0. `tests 356, pass 349, fail 0, skipped 7`, plus "leak check: 0 new temp entries". This matches the builder's numbers exactly.
- I did not run the full suite. No real scheduler, home, repo or timer was touched: every installer call is injected, and every probe home is a scratch directory.

## Prior findings

### MAJOR 1 (refresh from a stale or non-Claude-cache root): FIXED (option A)
- **Stale gate.** scripts/wiring-check.mjs:586 now reads `if (!stale.stale) refreshJanitorTimer(opts);`. The `stale` it uses is the same `staleness(opts)` result that printed the advisory at :552.
- **Root gate.**
  - scripts/wiring-check.mjs:524 is `if (!root || !isUnderClaudeCache(root, home)) return;`. It runs before the refresh function is resolved, so a missing root, a `.codex` cache root or a dev checkout never reaches `refreshIfRegistered`.
  - `isUnderClaudeCache` (:502-510) mirrors the installer's own `isInstalledPluginRoot` (install-janitor-timer.mjs:504-518): realpath on both sides, case-folding on win32 and darwin, and a trailing `/` in the prefix test. The only difference is that the `.codex` entry is dropped.
  - Both helpers hard-code `<home>/.claude`. A `CLAUDE_CONFIG_DIR` install is skipped here and refused by the installer, so the two stay consistent and fail safe.

**Revert-and-run checks (scratch copy, real test file, via `node scripts/run-tests.mjs`):**
- Stale gate removed (`refreshJanitorTimer(opts);` unconditionally): `fail 1`. The one failure is "lane 74: a STALE session's --hook never refreshes the timer and prints no janitor timer line". Restored copy: passes.
- Root gate removed (`if (!root) return;`): `tests 81, pass 80, fail 1`. The one failure is "lane 74: a root outside ~/.claude/plugins/cache ... makes 0 installer calls". Its first error is `expected to not match /janitor timer/`. Restored copy: passes.
- Both new tests therefore really detect the bug they target.
- The second half of the outside-cache test is the exception: it would pass even without the root gate. See NIT 1.

**Ping-pong and downgrade, end to end.** My probe used a sealed home with a registered systemd-user timer that bakes the `.claude` 0.20.16 root, the real `refreshIfRegistered`, an injected installer, and a `.codex` 0.20.16 session root:

| Code under test | Installer calls | Result |
|---|---|---|
| Gate removed | 1 | `refreshed: re-registered from ...\.codex\...\0.20.16 (was ...\.claude\...\0.20.16)`, which is the r4 ping-pong |
| Gate present | 0 | refresh never invoked |

**Existing tests moved to a current fixture.**
- :1500 now uses `running 0.20.16, installed 0.20.16` and drops the lean-rules write, so a wiring line prints and the order assertion still has output to check.
- The fail-open test (:1567) now counts calls (`called === 2`), so the throwing refresh provably ran. Before, the stale fixture would now have skipped it and the test would have passed vacuously.
- The older-release test (:1581) runs from an in-cache, current `rootOf(scriptPath)`. Its refresh overrides `pluginRoot: newRoot` with `forceRoot: true`, so it still drives the installer argv path.
- I checked all three. None passes for a hollow reason.

**Residual, not counted.** `checkStaleness` reports stale only when the running version is older than every installed entry (plugin-staleness.mjs:153-161).
- If installed_plugins.json ever held two Claude entries for this plugin at different versions (say, a user scope and an older project scope), a session on the older version would not count as stale. That session would re-register the timer, and the newer one would then re-register it back.
- This host has one entry (`delegation@benzhuk user:0.20.19`; I read only the scope and version fields).
- It is the same staleness rule the dispatch guard uses, and option B (forward-only) was the ruled-out alternative. I am noting it for the orchestrator, not asking for a fix.
- The accepted trade-off also stands: a Codex-only host is not refreshed until a Claude session runs.

### MINOR 2 (doubled `refused:` prefix and per-session dev-root noise): FIXED
- Dev-root noise: a dev checkout now exits at :524 and never prints. This is covered by the devRoot iteration of the outside-cache test, which was caught by the root-gate mutation above.
- Prefix:
  - janitor-timer-refresh.mjs:130 strips a leading `refused:\s*` from the reason, so wiring-check prints `janitor timer: refused: <installer text>` once.
  - janitor-timer-refresh.test.mjs:132 asserts that `doesNotMatch(r.reason, /^refused:/)` holds in the forceRoot:false refusal case. That test drives the real installer's refusal, so the assertion is not vacuous.
  - The strip applies to the `failed` action too. The installer prefixes its own text with `refused: ` only on code 1, so the change is harmless there.

### Integrator failure 2 (N2, janitor-sweep.test.mjs:619 spawn with no env): FIXED
- janitor-sweep.test.mjs:620 now passes `env: th.env`, where `th` is the module-scope `makeTempHome()` at :20. That env is the sealed one: it starts from `childEnv` and has the git-locating names removed (test-home.mjs:153-173).
- skills/multi/scripts/hooks.test.mjs "N2: no test file in this suite inherits the runner environment on its own" passes in my gate run.
- The test the spawn serves, "a live process in a dirty worktree's directory keeps it, through main()'s own in-use check", also passes (1945 ms). The holder still pins the worktree, because only the env changed and `cwd: wt` did not.

### Integrator failure 1 (fetchOrigin source test vs a CRLF working copy): FIXED, and it only normalises line endings
- janitor.test.mjs:2577 now does `.replace(/\r\n/g, "\n")` on the source text before the existing comment strip and the `\n}\n` anchor. The assertions are unchanged: `timeout:\s*\d+` and `GIT_TERMINAL_PROMPT:\s*"0"` inside the function body.
- I built the failing side the builder did not. I copied the test verbatim into two scratch test files (one with the normaliser, one without) and ran them through `run-tests.mjs` against the scratch `janitor.mjs`:

| Source | Old test (no normaliser) | New test |
|---|---|---|
| LF | pass | pass |
| CRLF | **fail** (the integrator's failure, reproduced) | pass |
| CRLF, `timeout: 120000,` deleted from fetchOrigin | fail | **fail** |

- So the normaliser makes the test pass on a CRLF checkout, and it still catches a real removal of the timeout. It hides nothing.
- One more note: the repo's `.gitattributes` is `* text=auto eol=lf`, and this worktree's `git ls-files --eol` shows `i/lf w/lf`. The integrator's `w/crlf` copy is the odd one out. Either way, the test now holds on both.

## Regression hunt (delta)
- **`refreshJanitorTimer` args.** `pluginRoot` is now always set, because the function returns early when there is no root. Before, it was set only when a root existed. Nothing downstream depended on its absence, so this does not change behaviour.
- **Order of the two gates.** The stale gate is checked before the function is even called, and the root gate before the refresh is resolved. So a stale or out-of-cache session costs no import and no realpath of the timer files.
- **The `--hook` module load** at wiring-check.mjs:65-67 is unchanged.
- **Non-hook modes.** `--line`, `--json` and the table still never refresh: the order test at :1522-1524 asserts `calls.length === 1` after both.
- **Exit codes.** Unchanged: `--hook` always returns 0, and the other modes return `(result.ok && !stale.stale) ? 0 : 1`.
- **Untouched files.** No change to install-janitor-timer.mjs, janitor.mjs, janitor-sweep.mjs, hooks/*.json or SKILL.md, so the r4 analysis of those files still holds.

## NIT 1: the "through the real refresh" half of the outside-cache test cannot fail
- Where: scripts/wiring-check.test.mjs:1560-1564.
- The fixture's `installed.json` comes from `wireEverythingElse` (:62) and is `{ "schema": 1 }`. It has no scheduler, so `refreshIfRegistered` returns `{ action: "none", reason: "unknown scheduler in installed.json" }` before it ever reaches `install`.
- Measured on the scratch copy with the root gate removed: this half gives `installs: 0` and `none: unknown scheduler`. In other words, it passes whether or not the gate is there.
- Non-blocking, because the first half of the same test does catch the gate's removal (the root-gate mutation above). This half adds nothing but a claim of coverage. The builder report describes it as a discriminating check, and it is not one.

Patch: register a timer before the real-refresh call, so the installer would be reached if the root gate let the session through.

Current (:1560-1561):
```
  // and through the real refresh with an injected installer: the installer is never reached
  const installs = [];
```
Replacement:
```
  // and through the real refresh with an injected installer: register a timer first, so the installer
  // WOULD be reached if the root gate let this session through
  write(home, ".agents/janitor/installed.json", `${JSON.stringify({ scheduler: "systemd-user", name: "janitor-record", repo: path.join(home, "repo"), hour: 7 })}\n`);
  write(home, ".config/systemd/user/janitor-record.service", `[Service]\nExecStart=node "${rootOf(scriptPath)}/scripts/janitor.mjs" --record --host fixture-host\n`);
  const installs = [];
```

Predicted outcome, verified with the same fixture in a probe:
- Root gate present: `installs.length === 0`, and the refresh is never invoked.
- Root gate removed: `installs.length === 1`, with "re-registered from ...\.codex\...". The first half of the test already fails first in that state, so the patch makes the test's claim true without changing its pass/fail on the current code.
- `installed.json` stays present and `last-run.log` stays fresh, so the wiring check's own findings do not change.

## NIT 2: a stray literal newline inside a template literal
- Where: scripts/wiring-check.test.mjs:1511-1512. This is likely a leftover of the bad `sed` the builder mentions.
  ```
    console.log = (s) => { order.push(String(s).startsWith("janitor timer") ? "refresh-line" : "line"); out += `${s}
  `; };
  ```
- It behaves the same as `` `${s}\n` ``, because JS normalises a raw newline, even CRLF, to LF in a template literal. It is only cosmetic.
- Patch: put it back on one line:
  ```
    console.log = (s) => { order.push(String(s).startsWith("janitor timer") ? "refresh-line" : "line"); out += `${s}\n`; };
  ```

## Bug-fix fields (MAJOR 1 as fixed this round)
Cause: the refresh treated the session's own plugin root as the installed release. That is false for a stale Claude pane, and for a Codex cache root it names a second, equally valid cache that fought Claude's over the one timer.
Discriminating check: on a scratch copy, removing `!stale.stale` fails "a STALE session's --hook never refreshes"; removing `isUnderClaudeCache` fails "a root outside ~/.claude/plugins/cache ..."; and a sealed-home probe with a registered timer shows a `.codex` root re-registers (installs 1) without the gate and makes 0 installer calls with it.
Fix location: scripts/wiring-check.mjs:502-510 (`isUnderClaudeCache`), :524 (root gate), :586 (stale gate); scripts/janitor-timer-refresh.mjs:130 (prefix strip).
Simplification: one call-site condition (not stale, and root under `<home>/.claude/plugins/cache`) with no new module and no version parser. It covers the stale downgrade, the Codex ping-pong, the 400 ms Codex kill window and the dev-root noise.

## Hygiene
- All probes and mutations ran on the scratch `git archive` copy or in sealed scratch homes under `.../scratchpad/j74r5/`. Each mutated file was restored there and checked with `cmp` against the reviewed tree.
- The reviewed worktree is unmodified (`git status --short` is empty).
- No command was denied. I started no process that is still running.
