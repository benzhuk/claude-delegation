VERDICT: NEEDS_FIXES 2455f1d

# Lane 46 (test-temp-hygiene) review, round 1

Reviewed `git diff 357fc15..2455f1d` (scripts/run-tests.mjs, scripts/run-tests.test.mjs, scripts/test-home.mjs, docs/census.md) against docs/specs/test-temp-hygiene-1/spec.md and reports/build.md. Everything was run on a `git archive 2455f1d` copy under the lane scratch dir. The worktree was never edited: HEAD is 7813444, which is docs-only after 2455f1d, `git status` is clean, and `diff -r wt/scripts <copy>/scripts` shows them identical.

Summary: the core fix is right and it addresses the cause. P1 points TMPDIR/TEMP/TMP into a per-run root in one place, `runSealed`'s env. Signal handling, removal containment and the seal all hold, and I checked each one by running it. I am asking for fixes because of three MAJORs:
- P2's retention silently deletes the retained home under a symlinked temp dir.
- P4's leak regex was not extended as the spec requires, so the reader cannot see about 18 prefix families that tests really create under `os.tmpdir()`. Two of them have 217 leaked dirs in Netcup's /tmp right now.
- The Windows full-suite log for this very commit (`lane-46/win-2455f1d.log`) is red on the leak check, and nobody has worked out why.

## MAJOR

### M1. On a failing run, a symlinked temp dir deletes the "retained" sealed home, and the runner prints a path that no longer exists
- Evidence: scripts/run-tests.mjs:325-329 (`trimRootExceptHome`). `keepPath` is `makeTempHome`'s **realpath'd** `home` (test-home.mjs:119). `full` is `path.resolve(path.join(root, name))`, which uses the **raw** mkdtemp spelling of `tmpRoot` (run-tests.mjs:373). Under any temp dir reached through a symlink the two never compare equal, so the kept home gets `rmSync`'d with everything else. That covers macOS always (`/var` -> `/private/var`) and any Linux TMPDIR that goes through a symlink.
- Reproduced on the scratch copy: `TMPDIR=<B>/link` (a symlink to `<B>/real`), with a probe that fails. The stderr said `run-tests: leaving the sealed home for inspection: .../real/delegation-test-run-4088183-mjFce5/sealed-home-i2NGWz`. Afterwards `find <B>/real` showed the root **empty**. The sealed home was gone, which breaks P2 ("leaves the root holding only that home") and RT-18/F6.
- Fix (mechanical). Compare under the realpath of `root`. In scripts/run-tests.mjs, replace exactly:
  ```js
  const keep = keepPath ? path.resolve(keepPath) : null;
  for (const name of entries) {
    const full = path.resolve(path.join(root, name));
    if (keep && full === keep) continue;
  ```
  with:
  ```js
  // `keepPath` is makeTempHome's REALPATH'd home, while `root` is the unresolved mkdtemp path; under
  // a symlinked temp dir (macOS /var -> /private/var, or any TMPDIR reached through a symlink) the
  // two spellings differ, so entries are compared under the realpath of `root`, never its raw one.
  let realRoot = root;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    // readdir above just succeeded, so this is near-impossible; fall back to the raw spelling
  }
  const keep = keepPath ? path.resolve(keepPath) : null;
  for (const name of entries) {
    const full = path.join(realRoot, name);
    if (keep && full === keep) continue;
  ```
  Verified on the scratch copy. With this patch the same symlink repro leaves `real/delegation-test-run-4099679-SHcX6m/sealed-home-kpj7c6` as the root's only entry, and `node --test scripts/run-tests.test.mjs` is 24 pass / 0 fail. I restored the copy afterwards, checked with `cmp`.
- Regression test to add to scripts/run-tests.test.mjs. It fails at 2455f1d (see the repro above) and passes with the patch:
  ```js
  test("P2: a failing run under a SYMLINKED temp dir still keeps the sealed home (POSIX only)", { skip: process.platform === "win32" ? "dir symlinks need privileges on win32" : false }, () => {
    const real = scratchDir("run-tests-root-symreal-");
    const link = path.join(scratchDir("run-tests-root-symlink-"), "tmp");
    fs.symlinkSync(real, link, "dir");
    const { file } = writeEnvProbe({ passes: false });
    const fixtureHome = scratchDir("run-tests-root-symhome-");
    const env = childEnv(fixtureHome, { TMPDIR: link, TEMP: link, TMP: link });
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(NODE, [RUN_TESTS_MODULE, "--no-sweep", file], { env, encoding: "utf8" });
    assert.notEqual(r.status, 0);
    const home = r.stdout.split("\n")[0].trim();
    cleanups.push(() => fs.rmSync(path.dirname(home), { recursive: true, force: true }));
    assert.equal(fs.existsSync(home), true, "the printed retained home must exist after a failing run");
    assert.deepEqual(fs.readdirSync(path.dirname(home)), [path.basename(home)]);
  });
  ```

### M2. `LEAK_PREFIX_RE` was not extended as P4 requires, so the reader cannot see about 18 prefix families tests really use (false green)
- Contract: spec P4 says "Extend it with any other prefix the builder finds a test file using in a mkdtemp call; list them in the report." Build report §P5 says "no extra prefix beyond the pinned `LEAK_PREFIX_RE` list was needed". That reads "extend" as "extend only if seen leaking", which is not what the spec says.
- Measured. These are `mkdtemp(path.join(os.tmpdir(), <literal or helper prefix>))` sites that the pinned regex does not match:
  - `bearings-state-` (skills/bearings/scripts/bearings-state.test.mjs:12)
  - `knowledge-count-` (scripts/knowledge-count.test.mjs:17; the pinned regex only has `knowledge-counts`)
  - `work-census-*` (scripts/work-census.test.mjs, 17 prefixes)
  - `census-*` (scripts/token-census.test.mjs, 18)
  - `build-census-*` (scripts/build-census.test.mjs, about 50)
  - `record-closed-*` (scripts/record-closed-and-skip.contract.test.mjs)
  - `wiring-home-` (scripts/wiring-check.test.mjs)
  - `plugin-staleness-`, `pconfig-owner-hosts-`, `other-home-`, `codex-child-hook-`, `codex-goal-hook-project-`, `child-env-` (test-child-env.mjs `scratchHome` default)
  - `run-tests-*` (this lane's own file)
  - plus the `FIXTURE_ROOT || os.tmpdir()` fallbacks `cstatus-`, `janitor-`, `collect-`, `transport-`
- This is not theoretical. Netcup's /tmp right now holds **154 `bearings-state-*` and 63 `knowledge-count-*`** dirs, created today in batches of 31 between 17:30 and 18:25. The pinned regex matches 30,543 entries in /tmp and the extended one matches 30,760. Those 217 came from direct or legacy runs. I checked on the scratch copy that the NEW runner contains these two files: `run-tests.mjs --no-sweep bearings-state.test.mjs knowledge-count.test.mjs` created 0 new real-/tmp entries. But a future straggler in any of these families would read `leak check: 0` and pass the gate.
- Fix (mechanical). Replace the regex literal at scripts/run-tests.mjs:288 exactly:
  ```js
    /^(note-send|note-flush|hook-core|multi-hook|inbox|note-inbox|pane-binding|multi-inbox-home|session-name|resume-notice|resume-size|delete-guard|continuation-native|note-cursor-fallback|bugfix-fields|build-loop-check|goal|state-hold|decisions-handback|decisions-render|work-record|backlog|reminder|mirror|knowledge-log|knowledge-counts|codex-census|four-read|goal-card|accept-prep|discrim|dispatch|decisions|transport-identity)-/;
  ```
  with:
  ```js
    /^(note-send|note-flush|hook-core|multi-hook|inbox|note-inbox|pane-binding|multi-inbox-home|session-name|resume-notice|resume-size|delete-guard|continuation-native|note-cursor-fallback|bugfix-fields|build-loop-check|goal|state-hold|decisions-handback|decisions-render|work-record|backlog|reminder|mirror|knowledge-log|knowledge-counts|codex-census|four-read|goal-card|accept-prep|discrim|dispatch|decisions|transport-identity|bearings-state|codex-child-hook|codex-goal-hook-project|other-home|pconfig-owner-hosts|plugin-staleness|record-closed|wiring-home|work-census|census|build-census|knowledge-count|child-env|run-tests|cstatus|janitor|collect|transport)-/;
  ```
  I checked it with node. All 22 sample names from the families above match. `sealed-home-a`, `delegation-test-run-1-a`, `unrelated-dir`, `claude-1000` and `systemd-private-x` do not. The existing `LEAK_PREFIX_RE` test stays green. Also list the added prefixes in build.md §P5, as the spec asks. Mirror the added families in the doc comment above the constant.

### M3. The Windows full suite at 2455f1d is red on the leak check, and the cause has not been found
- Evidence: `lane-46/win-2455f1d.log`. It shows `tests 2668 / pass 2655 / fail 0 / skipped 13`, then the final line `leak check: 56 new temp entries: four-read-accept-at-PBgLeD, four-read-build-cli-lead-nz2srm, four-read-build-pvTiEI, four-read-census-end-Vxlj67, four-read-census-window-yORbMY`. By P4 that forces exit 1 on a passing suite, so the Windows gate is red for this commit. build.md does not mention it (it predates the log).
- What I could establish from Linux:
  - On Windows the root works. The sealed home and every visible fixture path sit under `C:\Users\benzh\AppData\Local\Temp\delegation-test-run-58284-09cJBu\`, and all of this lane's own tests pass there (log lines 1257-1264).
  - The names are readdir-alphabetical, and the first five are all `four-read-*`. So nothing leaked with a b/c/d prefix, such as `backlog-`, `bugfix-fields-`, `codex-census-`, `decisions-`, `delete-guard-` or `dispatch-`. That rules out a whole legacy-runner suite running at the same time.
  - scripts/four-read.test.mjs makes about 51 `mkTmp` calls (os.tmpdir() in-process, line 39-41) and never removes them. A single concurrent direct `node --test scripts/four-read.test.mjs` on that host would leave about 56 `four-read-*` dirs, which fits the count exactly.
  - The other possibility is a Windows-only straggler inside four-read.test.mjs. I found no TEMP/TMP override in four-read.test.mjs, four-read.mjs or build-census.mjs.
- Discriminating check, on Windows, with no other agent or test process running: run `node scripts/run-tests.mjs scripts/four-read.test.mjs` and read its `leak check:` line.
  - If it is 0, this was a concurrency false red. That is the accepted class, but record it and apply m4 (the comment is wrong about which concurrency causes it).
  - If it is nonzero, it is a P5 straggler to fix in four-read.test.mjs, and this lane is not done on Windows.
- Either way, a lane whose own deliverable has a red gate log on one of its two platforms should not be accepted until this is resolved.

## MINOR

### m1. The EPERM ("alive") branch of the sweep's pid test is untested. The mutation survives.
- scripts/run-tests.mjs:61-68. A mutation run on the scratch copy replaced `return Boolean(e) && e.code !== "ESRCH";` with `return false;`, which treats EPERM as dead and would sweep another user's live run. `scripts/run-tests.test.mjs` stayed **24 pass / 0 fail**.
- The code itself is correct. On this host, `process.kill(1,0)` gives EPERM (so alive), `process.kill(0,0)` returns (group, so alive), 99999999999 gives ERR_INVALID_ARG_TYPE (not ESRCH, so alive, fail-safe), and 4194305 gives ESRCH. `\d+` rules out NaN and negative pids. A root carrying our own pid is alive and is kept.
- Fix. In the `P3: sweepStaleHomes removes a stale test-run root...` test, insert before `const result = sweepStaleHomes(...)`:
  ```js
  // EPERM (pid 1 is init/launchd, owned by another user) must count as ALIVE, never swept.
  const epermPath = path.join(tmpDir, `${TEST_RUN_ROOT_PREFIX}1-stuvwx`);
  if (process.platform !== "win32") {
    fs.mkdirSync(epermPath);
    fs.utimesSync(epermPath, new Date(now - TWENTY_FIVE_HOURS), new Date(now - TWENTY_FIVE_HOURS));
  }
  ```
  and after the existing assertions:
  ```js
  if (process.platform !== "win32") {
    assert.equal(fs.existsSync(epermPath), true, "an old root whose pid answers EPERM must survive (counts as alive)");
  }
  ```
  `sweptRoots` stays 1. Predicted: this fails under the `return false` mutation and passes on 2455f1d. It also passes when run as root, where kill(1,0) returns, which still means alive.

### m2. A failed run that never got a home leaves an empty root behind
- scripts/run-tests.mjs:423-426. If `runSealed` throws before `onHome`, `home` is undefined. That can happen when `makeTempHome` hits ENOSPC, which is exactly the full-/tmp case. `trimRootExceptHome(tmpRoot, undefined)` then empties the root but leaves the root dir itself, one leftover per failure until the 24 h sweep.
- Fix: replace
  ```js
      else trimRootExceptHome(tmpRoot, home);
  ```
  with
  ```js
      else if (home) trimRootExceptHome(tmpRoot, home);
      else removeRootBestEffort(); // no home was ever made, so there is nothing to retain
  ```
  Verified on the scratch copy together with the M1 patch: 24/24 pass.

### m3. The leak check only snapshots directories, but the spec says "names"
- scripts/run-tests.mjs:299. A test that writes a *file* such as `goal-x.json` straight into the real temp dir is invisible to the check.
- Fix: replace
  ```js
      if (entry.isDirectory() && LEAK_PREFIX_RE.test(entry.name)) names.add(entry.name);
  ```
  with
  ```js
      if (LEAK_PREFIX_RE.test(entry.name)) names.add(entry.name);
  ```
  I found no production code that creates matching names in the temp dir, so this adds no new false-red source. Every mkdtemp outside tests is `native-continuation-smoke-`, `codex-parity-probe-` or `sealed-home-`.

### m4. The leak-check comment understates what can false-red it
- scripts/run-tests.mjs:283-285 names only "a concurrent legacy run of an older runner" and "`--no-sweep` racing". On a shared host the common case is a builder running `node --test <file>` directly. That puts the file's mkdtemps in the real temp dir (four-read.test.mjs never cleans them), and it is the most likely explanation for M3.
- Fix: add that sentence to the comment. It is the lead's call whether the accepted false-red class still holds once it is written down, because every lane's gate on Netcup runs next to other lanes' direct test runs.

### m5. The nested-run case is fixed at one call site, not where it comes from
- 2455f1d fixes the straggler inside the one test (run-tests.test.mjs:376-388). The underlying hazard remains: when the CLI runs with an inherited TMPDIR that is itself a per-run root, it snapshots a dir that its sibling test files are writing to at the same moment. Any future test that spawns the CLI without injecting TMPDIR will false-red again.
- There is also a false-green half. If the invoking shell has TMPDIR set to something other than the OS default, a straggler that builds its env from scratch lands in the OS default (/tmp), which is never snapshotted.
- This is a judgment call, not a required patch. One option is to have `main` detect `TEST_RUN_ROOT_RE.test(path.basename(os.tmpdir()))` and treat the check as nested. Any change to the single-line format has to be squared with P4's "always exactly one line" rule, so the lead decides. At minimum, name the hazard in the comment above `withInjectedTmp` or `spawnRunner`.

## NIT

- n1. The spec said "reuse test-home.mjs's registry pattern, or add the root to it". The builder added a separate `onRootSignal`. It does not compete: it re-raises only when it is the last listener, and I verified the ordering below. But it has no `exit` coverage, so an uncaught throw elsewhere leaves the root until the 24 h sweep. That is acceptable and bounded.
- n2. The P1 test checks "directly under" with `root.startsWith(fs.realpathSync(tmp))`. `path.dirname(root) === fs.realpathSync(tmp)` would pin "directly".
- n3. `sweepStaleHomes`'s skipped return `{ swept: 0, skipped: true }` has no `sweptRoots: 0` (run-tests.mjs:88). Callers don't read it today.

## Verified absence of defects (attack brief)

1. **Removal safety.** Every `rmSync` target is `tmpRoot`, which is a fresh `mkdtempSync` result, or an entry read from `readdirSync(tmpRoot)`, or a sweep match.
   - Symlinks inside the root are unlinked, not followed. A probe planted `link-out` and `nest/link-out2` pointing at an outside dir holding `precious.txt`. Both the exit-0 path and the trim path left `precious.txt` intact.
   - Sweep entries are filtered with `Dirent.isDirectory()`, which is false for a symlink, so a `delegation-test-run-<dead>-x` symlink is never followed.
   - The regex is anchored to our own prefix.
   - pid 0, pid 1, our own pid, over-range and NaN pids all fail safe to "alive" (m1 lists the measured outcomes).
   - If `tmpRoot` creation fails, main throws before any listener or removal exists, so it can never be undefined when a removal runs.
2. **The seal.**
   - The home is created inside the root, and the child's `os.tmpdir()` is the root, so `checkSeal` is stricter than before.
   - Mutation: a home created outside the root makes the canary refuse with `...is not a fresh dir inside .../delegation-test-run-4104126-rayEPQ - not a sealed home` and exit 1.
   - Programmatic `runSealed` without `tmpRoot`: `makeTempHome({ gitIdentity: true })`, no env mutation, and `onHome` undefined, so it matches base exactly.
   - `makeTempHome`'s `tmpDir` default is evaluated per call, same as before.
   - Tests still see the real /tmp only through hard-coded literals, which is unchanged and was left alone on purpose by P5.
3. **Signals.**
   - Listener order is onRootSignal, then test-home's registry (installed synchronously in `makeTempHome`, before the first await), then `forwardSignal`. EventEmitter iterates a copy, so all three run. onRootSignal and the registry see other listeners and do not re-raise. `forwardSignal` signals the child first and then re-raises. So there is (a) no early re-raise, and (b) no orphan beyond the pre-existing forwardSignal shape, (c) no double removal thanks to the `rootGone` guard.
   - (d) Listener hygiene: `main()` called in-process twice gives SIGINT/SIGTERM/SIGHUP counts of `0,0,0` before, `1,1,1` after the first call and `1,1,1` after the second. The 1 is test-home's install-once registry, which predates this lane, so nothing accumulates.
   - Stress: 3 of 3 SIGTERMs sent mid-run to a runner whose test was writing into `os.tmpdir()/busy/...` in a tight loop gave exit 143 and an empty temp dir. The root was neither left behind nor recreated.
   - On Windows, SIGHUP is excluded (same as test-home and runChild) and `process.kill(self, SIGINT)` terminates the process. If Windows file locks make the removal fail, the root falls to the 24 h sweep. The SIGTERM test is correctly skipped on win32.
4. **The leak check.** New-runner roots (`delegation-test-run-`) and sealed homes don't match, so concurrent new-runner runs cannot false-red it. `code === 0` gating keeps a failing suite's own code. It always prints one line. The false-green and false-red gaps are M2, m3, m4 and m5.
5. **Retention.** A failed run leaves the root plus the sealed home (apart from M1). The path is printed by `runSealed` (`leaving the sealed home for inspection: <home>`). The root's mtime is refreshed by the trim, and it is swept after 24 h once its pid is dead. That is bounded.
6. **The tests fail when the fix is reverted.** Mutation runs on the scratch copy:
   - M1-no-env-tmp: P1 test fails.
   - M2-no-trim: P2 trim test fails.
   - M3-no-root-signal: P2 SIGTERM test fails.
   - M4-no-leak-force: CLI leak test fails.
   - M6-no-remove-on-0: P1 test fails.
   - M5-eperm-dead: **survives** (see m1).
   
   The tests touch the real /tmp only through `scratchDir` when the file is run directly with `node --test`, and those dirs are cleaned in `test.after`. Under the runner they land in the root. Every CLI spawn injects TMPDIR/TEMP/TMP. A full `node --test scripts/run-tests.test.mjs scripts/test-home.test.mjs` with TMPDIR pointed at scratch gave 52 tests, 51 pass, 1 skipped, and left the scratch temp dir empty.
7. **Is any fix a compensation?** The P1 env change is at the cause: one place, and every sealed child inherits it. The sweep extension and the leak check are backstop and reader by design. The 2455f1d straggler fix is a compensation at one call site for the leak check's nested-run scope (m5). It is acceptable for this lane, but the hazard it papers over remains.

## C4 fields

Cause: every sealed test child inherited the real TMPDIR/TEMP/TMP. `makeTempHome` sealed HOME but not the temp dir, so each test's own `mkdtempSync(os.tmpdir(), ...)` landed directly in the real /tmp, with no owner to remove it.
Discriminating check: a before/after snapshot of `LEAK_PREFIX_RE` names directly under the real `os.tmpdir()` around one CLI run. It is only as good as the prefix list (M2) and the entry types it reads (m3). On the scratch copy the new runner added 0 real-/tmp entries for bearings-state and knowledge-count.
Fix location: `runSealed`'s child env (scripts/run-tests.mjs:210-217), plus the per-run root lifecycle in `main` (run-tests.mjs:373-436), plus the `tmpDir` parameter of `makeTempHome` (test-home.mjs:113-115).
Simplification: one per-run root containing the sealed home and every test temp dir, so removal is a single `rmSync` of a path the runner itself created. The sweep's root branch stays as the only backstop, and no per-test-file cleanup is needed.

## Commands run (all read-only against the worktree; writes only under lane-46 scratch)

- `cat ~/.agents/lean-rules.md`, the spec, build.md; `git diff --stat 357fc15..2455f1d`; `git diff 357fc15..2455f1d -- scripts/...`
- `git -C wt archive 2455f1d | tar -x -C lane-46/rev-BWsRlP` (mktemp -d copy)
- `TMPDIR=<scratch> node --test scripts/run-tests.test.mjs scripts/test-home.test.mjs` on the copy: 52 tests, 51 pass, 1 skip
- `lane-46/mut.sh` for six mutations (M1 to M6 above) plus the canary mutation. Each one copied `run-tests.orig.mjs` back and confirmed the restore with `cmp`.
- The symlink repro: `TMPDIR=<B>/link node scripts/run-tests.mjs --no-sweep fail.test.mjs`, then `find <B>/real`. Repeated with the M1 and m2 patches applied, then the copy was restored.
- The symlink-escape probe (passing and failing), the SIGTERM stress loop (3 runs, one PID signalled each), the in-process listener-count script
- `node -e` probes of `process.kill(pid,0)` outcomes, and prefix scans of all `*.test.mjs` mkdtemp sites
- `/tmp` name counts for the pinned and extended regex, and a creation-time histogram of `bearings-state-*` and `knowledge-count-*`
- `grep` of `win-2455f1d.log` for the leak line, the root path and the lane test results
- Final check: `git -C wt status --short` (empty) and `diff -r -q wt/scripts rev-BWsRlP/scripts` (identical)

Denied commands: one. A read-only `grep` over four-read.test.mjs was blocked by the secret-guard hook with `SECRET-GUARD: blocked — command dumps the process environment` because the pattern contained the word for the environment object. I re-ran it with a narrower pattern (TEMP|TMP|tmpdir|rmSync). Nothing was printed from the environment.

Scratch hygiene note. Most scratch went under `mktemp -d` dirs (rev-BWsRlP, tmp-HlOgJc, symtest-*, sigrace-*, lc-*, bs-*, canary-*, symesc-*). Three helper files, however, were written directly in `lane-46/` instead: `mut.sh`, `run-tests.orig.mjs` and `x.mjs` (a stray copy). I did not remove them, per the no-delete rule. None of them is inside the worktree.
