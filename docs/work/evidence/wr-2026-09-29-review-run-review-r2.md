VERDICT: NEEDS_FIXES (6) cb66b711cd38c4df13a76bd58a9fe693b2017b5c

# Lane 53 delta review r2: review-run fix round 1 (`git diff 4c2b974 cb66b71`)

Scope: the code at cb66b71. The worktree HEAD 482a566 is byte-identical for `skills/` and `hooks/` (`git diff --quiet cb66b71 HEAD -- skills hooks`). Precedence: lead-ruling-r2 > lead-ruling-r1 > review-r1 > spec.

What I ran:
- I cloned the worktree at cb66b71 into `scratchpad/lane-53/r2-b5NK/repo`. All mutations, probes and fix simulations ran there or in sibling scratch dirs (`wsa/`, `wsa2/`, `fixsim/`).
- Suite on the clone: `node --test` over review-run, multi-inbox and delete-guard gives **280/280 pass**.
- 22 mutations of the r1 fixes (runner: `r2-b5NK/mutate.mjs`), plus the 10 r1 survivors re-run on the new anchors (runner: `r2-b5NK/mutate-r1.mjs`).
- `claude --help`, and a read-only `strings`/`grep -a` pass over the installed binary (2.1.284, `…/claude-code/bin/claude.exe`).

Not run:
- no real `claude -p`;
- no edit, stage or commit in the reviewed worktree. `git status` there shows only the pre-existing `?? relscratch/`.

Nothing was deleted. Leftovers, all in scratch:
- `r2-b5NK/repo/relscratch/`, left by my mutation 4, which leaks by design;
- `r2-b5NK/repo/skills/team-build/scripts/r2-sweep.test.mjs`, my proposed tests.

Mutant M13 hung the test runner, as described below. I stopped the one leftover fake child by its single PID (SIGKILL; it ignores SIGTERM by design). Its review-run parent then exited.

Totals: **1 BLOCKER, 2 MAJOR, 3 MINOR**.

---

## Per-finding verification (r1's 14)

"Killed" means that reverting the fix on the scratch clone turns at least one test red.

| r1 # | Fix present | Mutation check (reverting the fix) | Verdict |
|---|---|---|---|
| 1(a) no bare Write/Bash | yes, `review-run.mjs:245-248` | bare `Write` back: **killed**. Bare `Bash` back: **killed** (2 fails). No report rule: **killed**. | Partly. The scoped rule is **inert**, because the CLI never matches `Write(path)`; see N4. |
| 1(b) git global options | the space forms only (`:59`) | drop `git -C`: **killed** | Partly. The **equals forms are missing** (ruling r2); see N2. |
| 1(c) mode | `DEFAULT_PERMISSION_MODE='auto'` | the M4 call-site `bypassPermissions` mutant is **killed** | OK under ruling r2 |
| 2 CLAUDE_MDS | `:280` | drop the line: **killed**. The binary honours it (`MH(){return Boolean(a.CLAUDE_CODE_DISABLE_CLAUDE_MDS‖…)`), and the builder's probe 5 answered "none". | Verified |
| 3 PowerShell | `:231` | keep PowerShell: **killed** | Verified |
| 4 relative `--scratch` | `:131` | revert: **killed** (2 fails). The mutant leaked `relscratch/` into the clone, as the test predicts. | Verified |
| 5 tests | new tests | r1 survivors M4, M5, M6, M9, M10, M11 and M12: **killed**. M13 (SIGTERM without killTree): the suite **hangs** (200 s, no result) rather than fails. **M7 (sweep ignores liveness) and M8 (sweep ignores age) still SURVIVE.** | Partly; see N5 |
| 6 orphan reaping | `:360-396`, `:707-713` | killed: kill-young, never-kill, ignore-childPid, no-owner-rewrite. **Survives: ignore `owner.timeoutMin`.** | **The fix introduces a BLOCKER (N1)**, and has a test gap (N5) |
| 7 sweep symlink/EPERM | `:367`, `:353-355` | follow-symlink: **killed**. EPERM counted as dead: **killed**. | Verified |
| 8 symlinked `--repo` | `:513-515` | no realpath: **killed** | Verified |
| 9 `GIT_*` | `:85`, `:291` | child-env `/^GIT_/` dropped: **killed**. gitRunner back to the 6 names: **killed**. | Verified |
| 10 sidecar fields | `:595-598`, `:648-651` | body sha replaced by file sha: **killed**. The other fields are asserted in 3 tests. | Verified |
| 11 real P4 | probe only | `probes3-mlBQ/p4-{before,after}.txt` exist and match build-r1. The notes-dir tree hash changed, and the builder's attribution to `flush-last.json` from other sessions is **unconfirmed**. | Open; probe 4 below |
| 12 marker doc + stderr | `multi-inbox.js:269-278`, SKILL.md:466-468 | drop the stderr line: **killed** | Verified. No regression; see the verified-absent section. |
| 13 timeout cap | `:144` | drop the cap: **killed** | Verified |
| 14 sidecar claim + O_NOFOLLOW | `:323-331`, `:338-346` | wx claim reverted: **killed**. **O_NOFOLLOW removed: SURVIVES.** | **The wx claim holds. The O_NOFOLLOW write is defeated by its own fallback (N3). The doc sentence is missing (N6).** |

The builder's report claimed that the review's `Write(//abs)` form was a bug, and that it was "fixed" to `Write(/abs)`. That is a misdiagnosis: neither spelling is ever matched (N4). Its P5 "PASS through the scoped Write rule" was in fact the auto classifier approving the write.

---

## New findings

### N1. BLOCKER: finding 6's sweep SIGKILLs processes that are not its own child (a reused or forged `childPid`), measured

**Evidence**
- In `review-run.mjs:375-381`, if `owner.pid` is dead, `owner.childPid` is "alive" by `kill(pid,0)`, and the run is past its cutoff, the sweep calls `killOrphanFn(owner.childPid)`.
- `defaultKillOrphan` (`:390-396`) sends `process.kill(-pid,'SIGKILL')`, then **falls back to `process.kill(pid,'SIGKILL')`**. On win32 it sends `taskkill /PID <pid> /T /F`, which kills the whole tree.
- The runChild rewrite (`:707-713`) records `childPid` for **every** run. Nothing ever clears it, and `runDir/owner.json` outlives the run: only `wt/` is removed. The r1 test at `review-run.test.mjs:472-483` asserts exactly that.
- So every completed run leaves a stale `childPid` that every later sweep probes, forever.
- Once that pid is reused by any process of the same user, the next sweep SIGKILLs it:
  - on Linux after pid wrap; this host is at 1,857,820 of pid_max 4,194,304;
  - on Windows, where pids are reused quickly, much sooner.
- **Measured** (`r2-b5NK/orphan-probe.mjs`, which kills only `sleep` processes it spawned itself): a completed-run `owner.json` whose `childPid` is an unrelated `sleep`, then `sweepStaleRuns(scratch, 45)` with the production defaults.
  - Non-group-leader: `victim pid 1857523 -> SIGKILL`, through the fallback `kill(pid)`.
  - Group leader: `victim pid 1857524 -> SIGKILL`, through `kill(-pid)`, which takes the whole group down.
- **Forgery.** `owner.json` sits in the child's parent dir. Build-r1 probe 1 measured that a raw Bash redirect outside the clone runs under auto. So a prompt-injected reviewer can write `{"pid":<dead>,"startedAt":<old>,"childPid":<the lead's claude pid>,"timeoutMin":0}`, and the **next** review-run SIGKILLs the lead's session group.
  - Before this delta, a forged owner.json could at most get `<runDir>/wt` removed. The delta adds a new kill primitive.
- The brief's rule is "It must kill ONLY its own child's pid". This fails it.

**Fix.** Mechanical; verified on a scratch copy by `r2-b5NK/fixsim/apply.mjs` and `fixsim/probe.mjs`.

Current (`review-run.mjs:360`):
```js
export function sweepStaleRuns(scratchDir, timeoutMin, fsImpl = fs, isAliveFn = isProcessAlive, killOrphanFn = defaultKillOrphan) {
```
Replacement:
```js
export function sweepStaleRuns(scratchDir, timeoutMin, fsImpl = fs, isAliveFn = isProcessAlive, killOrphanFn = defaultKillOrphan, isOwnOrphanFn = isOwnOrphan) {
```
Current (`:375-385`):
```js
    const childAlive = typeof owner.childPid === 'number' && isAliveFn(owner.childPid);
    if (childAlive) {
      // finding 6: a detached child (the claude session) can outlive a SIGKILLed review-run.
      // Only reap it once IT is past its own deadline — a live orphan still inside its own
      // timeout is left alone, so its wt/ is never removed out from under it.
      if (!(age > cutoffMs)) continue;
      killOrphanFn(owner.childPid);
    } else if (!(age > cutoffMs)) {
      continue;
    }
    removeDirWithRetry(path.join(runDir, 'wt'), fsImpl);
```
Replacement:
```js
    if (!(age > cutoffMs)) continue; // young: never touched, live orphan or not
    const wtPath = path.join(runDir, 'wt');
    if (typeof owner.childPid === 'number' && isAliveFn(owner.childPid)) {
      // finding 6 (r2): a live pid is OUR orphan only if it still leads its own process group and
      // stands in this run's wt/. Anything else is a reused or forged pid: never signal it, and
      // leave wt/ for a later sweep.
      if (!isOwnOrphanFn(owner.childPid, wtPath)) continue;
      killOrphanFn(owner.childPid);
    }
    removeDirWithRetry(wtPath, fsImpl);
```
Current (`:389-396`):
```js
/** finding 6: reap an orphaned child the same way runChild's own killTree does. */
function defaultKillOrphan(pid) {
  if (process.platform === 'win32') {
    try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* already gone */ }
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
  }
}
```
Replacement:
```js
/** finding 6: reap an orphaned child — only ever reached after isOwnOrphan proved pid leads its own group. */
function defaultKillOrphan(pid) {
  try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
}

/** finding 6 (r2): identity check before any kill. Linux: /proc/<pid>/stat's pgrp must equal pid
 * (the child was spawned detached, so it leads its own group) and /proc/<pid>/cwd must be this
 * run's wt/ or inside it. No /proc (darwin, win32) → false: leak the dir, never kill a pid we
 * cannot identify. */
export function isOwnOrphan(pid, wtPath) {
  if (process.platform !== 'linux') return false;
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const pgrp = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2]);
    if (pgrp !== pid) return false;
    const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
    const wt = fs.realpathSync(wtPath);
    return cwd === wt || cwd.startsWith(wt + path.sep);
  } catch { return false; }
}
```

**Tests**
- The existing test "a live orphaned child PAST its own timeout is killed" (`review-run.test.mjs:461`) must pass `() => true` as the new 6th argument.
- Add a test: a runDir with a dead `pid`, an old `startedAt`, and `childPid` = a `sleep 30` the test spawns in an unrelated cwd, **non-detached**. Get the dead pid from `spawnSync('true').pid`. Call `sweepStaleRuns(scratch, 45)` with production defaults. Assert the sleep is still alive after 1 s, then SIGTERM it in `finally`.
- Add the same test with `detached: true`.
- Add a Linux-only test: a `sleep 30` spawned `detached: true` with `cwd: <runDir>/wt` gives `isOwnOrphan` true, and is killed with its wt/ removed.

**Predicted outcome.** Measured on the patched scratch copy:
```
unrelated non-leader pid -> still alive; wt kept: true
unrelated group-leader pid -> still alive; wt kept: true
isOwnOrphan(own): true
own orphan -> SIGKILL; wt kept: false
```
On cb66b71 the two "unrelated" tests are red: both victims were SIGKILLed.

**Cost of the fix.** On darwin and win32 a live orphan is no longer reaped; its wt/ leaks until the pid dies. That is fail-safe, and it is the r1 baseline on those hosts.

### N2. MAJOR: ruling r2's equals-joined git global options are not denied. The rule syntax exists, so the absence is a code gap.

**Evidence**
- `DISALLOWED_TOOLS` (`review-run.mjs:59`) holds only `:*` prefix rules: `Bash(git --git-dir:*)`, `Bash(git --work-tree:*)` and `Bash(git --exec-path:*)`.
- The CLI's Bash matcher (binary function `SK`, the `prefix` case) is `Pe===Ce || Pe.startsWith(Ce+" ")`: a word prefix followed by a space. `git --git-dir=/p config …` has `=` after `--git-dir`, so it never matches. That is consistent with build-r1 probes 1-2, where the form ran under both modes.
- `--exec-path` is worse than the ruling notes. Its **only** dangerous spelling is `--exec-path=<p>`: measured, `git --exec-path /tmp` just prints `/usr/lib/git-core`. So today's rule denies the harmless form and misses the one that redirects every git subcommand's binary.
- The fix syntax is in the ruling section below: a `*` that is not a trailing `:*` makes a wildcard rule `^git --git-dir=.*$`.

**Fix.** Current (`review-run.mjs:59-60`):
```js
  'Bash(git -C:*)', 'Bash(git -c:*)', 'Bash(git --git-dir:*)', 'Bash(git --work-tree:*)', 'Bash(git --exec-path:*)',
];
```
Replacement:
```js
  'Bash(git -C:*)', 'Bash(git -c:*)', 'Bash(git --git-dir:*)', 'Bash(git --work-tree:*)', 'Bash(git --exec-path:*)',
  // ruling r2: the equals-joined spellings. A trailing-`:*` rule is a word prefix (`git --git-dir`
  // then a space), so `git --git-dir=<p>` never matches it (build-r1 probes 1-2). A rule whose `*`
  // is not a trailing `:*` is a whole-command wildcard, `^git --git-dir=.*$`. Never write
  // `…=*:*`: the CLI reads `*` mixed with a trailing `:*` as a literal, unexpanded prefix.
  // --exec-path's only dangerous spelling is the equals one (the bare flag just prints the path).
  'Bash(git --git-dir=*)', 'Bash(git --work-tree=*)', 'Bash(git --exec-path=*)',
];
```

**Test.** Add after `review-run.test.mjs:760`:
```js
test('ruling r2: git global options are denied in their equals-joined spelling too, as wildcard (not :* prefix) rules', () => {
  const argv = buildArgv({ model: 'opus', effort: 'high', tools: ['Read', 'Bash'], sessionId: 's', agentsPath: '/tmp/a.json' });
  const denied = argv[argv.indexOf('--disallowedTools') + 1].split(',');
  for (const rule of ['Bash(git --git-dir=*)', 'Bash(git --work-tree=*)', 'Bash(git --exec-path=*)',
    'Bash(git -C:*)', 'Bash(git --git-dir:*)', 'Bash(git --work-tree:*)']) {
    assert.ok(denied.includes(rule), `${rule} must be disallowed`);
  }
  for (const rule of denied) {
    // The CLI treats "*" mixed with a trailing ":*" as an unexpanded literal prefix (never matches).
    const body = rule.slice(rule.indexOf('(') + 1, -1);
    if (body.endsWith(':*')) assert.ok(!body.slice(0, -2).includes('*'), `${rule} mixes * with :* and would never match`);
  }
});
```
Predicted: red on cb66b71 (the three equals rules are absent), green after the patch. The guard loop passes for every current rule. `Bash(find * -delete*)` ends in `*`, not `:*`.

**Optional hardening, lead's call; not required by the ruling.** Every rule above is anchored at `^git `. So a global option placed **after** another one still gets through: `git --no-pager --git-dir=<p> config …`, `git -P -C <p> push`.
- Wildcards `Bash(git -* --git-dir*)`, `Bash(git -* --work-tree*)` and `Bash(git -* -C *)` would close that.
- The cost is false positives on read-only commands like `git --no-pager log -C` (copy detection).
- Otherwise, name this in the build's Gap paragraph next to `/usr/bin/git …`.

### N3. MAJOR: finding 14's O_NOFOLLOW sidecar write still writes through a planted symlink, and a hard link, measured

**Evidence**
- `writeSidecarAtomic` (`review-run.mjs:338-346`) wraps the `O_NOFOLLOW` open in `try { … } catch { fsImpl.writeFileSync(sidecarPath, contents); }`.
- On a symlink the open fails with ELOOP, and the catch-all fallback then **follows the symlink**.
- `O_NOFOLLOW` also cannot see a **hard link**, and `O_TRUNC` truncates the victim.
- Measured with the function exported from a scratch copy (`r2-b5NK/wsa/`):
  - symlink → canary: `canary now: "{\"forged\":\"through the link\"}"`;
  - hard link → victim: `victim now: "{\"forged\":\"through the hard link\"}"`.
- The mutation that removes `O_NOFOLLOW` **survives**, so no test covers this half of finding 14.
- This is the r1 confused-deputy write, still open. The child can Bash-replace `<report>.identity.json` while it runs (under auto, the P7 raw redirect ran), and review-run then writes any same-user file the child picks.

**Fix.** Write a fresh file and rename it over the claimed name. `rename` replaces the directory entry itself, so it never writes through a symlink or a hard link, and it is portable to win32. Verified on a scratch copy (`r2-b5NK/wsa2/`): canary unchanged, sidecar now a regular file; victim unchanged.

Current (`review-run.mjs:334-346`):
```js
/** finding 14: the final sidecar write never follows a symlink the child may have planted at
 * <report>.identity.json while it ran (the child can Write anywhere until finding 1(a) is in
 * place, and even after, a stale symlink from a prior run's scratch could still be reused). Falls
 * back to a plain write if O_NOFOLLOW isn't available (some platforms/mocked fsImpl). */
function writeSidecarAtomic(sidecarPath, contents, fsImpl) {
  const flags = fs.constants.O_WRONLY | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW ?? 0);
  try {
    const fd = fsImpl.openSync(sidecarPath, flags);
    try { fsImpl.writeSync(fd, contents); } finally { fsImpl.closeSync(fd); }
  } catch {
    fsImpl.writeFileSync(sidecarPath, contents);
  }
}
```
Replacement:
```js
/** finding 14 (r2): the final sidecar write never goes THROUGH whatever the child may have planted
 * at <report>.identity.json while it ran — symlink or hard link. Write a fresh file beside it,
 * then rename over the claimed name: rename replaces the directory entry itself. */
export function writeSidecarAtomic(sidecarPath, contents, fsImpl = fs) {
  const tmp = `${sidecarPath}.${randomUUID()}.tmp`;
  fsImpl.writeFileSync(tmp, contents, { flag: 'wx' });
  fsImpl.renameSync(tmp, sidecarPath);
}
```
`randomUUID` is already imported at `:25`.

**Tests.** Import `writeSidecarAtomic`, then:
- plant `fs.symlinkSync(canary, sidecar)`, call it, and assert the canary bytes are unchanged and `lstat(sidecar).isFile()`;
- repeat with `fs.linkSync(victim, sidecar)`, asserting the victim is unchanged.

Both are red on cb66b71, per my measurements.

### N4. MINOR: the "scoped Write rule" is inert. The CLI never matches `Write(path)`; the documented form is `Edit(//abs)`.

**Evidence**
- The CLI's own settings docs, embedded in the binary: "path rules in `permissions` use `Edit(path)` for every file-writing tool (Write, Edit, NotebookEdit) and `Read(path)` for reads. `Write(path)`, `NotebookEdit(path)` and `Glob(path)` rules are not matched by file permission checks." The same text gives the example `"ask": ["Edit(//etc/*)"]`.
- The validator (`V_e`) emits: "`Write(…)` is not matched by file permission checks — only Edit(path) rules are. Use Edit(…) instead (Edit rules cover all file-editing tools)."
- The path root, from binary function `Ddt`:
  - a leading `//` is the filesystem root;
  - a single leading `/` is **relative to the rule source's root**, which for a CLI-arg rule is the session cwd (`UVn`: `cliArg` → `Ye(we())`);
  - on win32, `C:/…` or `//c/…` is taken as absolute.
- So `Write(/abs/report.md)` (`review-run.mjs:237`) pre-approves nothing. Even as an `Edit` rule, the single slash would point at `<wt>/abs/report.md`.
- Consequences:
  - dontAsk denied the report under both spellings (build-r1 probe 2);
  - under auto, the report write was the classifier's call, so P5's "through the scoped rule" is not what happened;
  - the test at `review-run.test.mjs:748-753` pins the inert literal.
- It is safe under auto: nothing is over-granted. It is MINOR because the ruling keeps auto, but it is the one line dontAsk needs.

**Fix.** Current (`review-run.mjs:237`):
```js
  const writeRule = reportPath ? [`Write(${reportPath.replace(/\\/g, '/')})`] : [];
```
Replacement:
```js
  // r2: the CLI never matches Write(path) in file permission checks — Edit(path) rules cover Write
  // (its own settings docs + validator). For a CLI-arg rule a single leading "/" is cwd-relative;
  // "//" is the filesystem root. win32 takes a drive-letter path as-is.
  const rulePath = reportPath ? reportPath.replace(/\\/g, '/') : null;
  const writeRule = rulePath ? [/^[A-Za-z]:\//.test(rulePath) ? `Edit(${rulePath})` : `Edit(/${rulePath})`] : [];
```
Current (`review-run.mjs:310`):
```js
  if (/[,)]/.test(reportPath)) usageError('--report must not contain , or ) (these break the Write allow-rule syntax)');
```
Replacement (the rule body is a gitignore-style glob, so glob metacharacters would widen it):
```js
  if (/[,)*?[\]{}]/.test(reportPath)) usageError('--report must not contain , ) * ? [ ] { } (these break or widen the Edit allow rule)');
```
Current (`review-run.test.mjs:748-753`):
```js
  assert.ok(allowed.some((r) => r.startsWith('Write(') && r.includes('/abs/out/report.md')), 'the Write rule must be scoped to exactly the report path');
  // Live probe (build-r1, item 2/P5): a `Write(//abs/out/report.md)` double-leading-slash rule
  // (an extra "/" prepended to an already-absolute reportPath) is NOT honored under `dontAsk`
  // and the report write is silently denied — this exact single-slash form is the one a real
  // `claude -p` run was confirmed (live) to honor for writing the report.
  assert.ok(allowed.includes('Write(/abs/out/report.md)'), 'the Write rule must be the single-leading-slash form, not a doubled "//" prefix');
```
Replacement:
```js
  // r2: Write(path) rules are never matched by the CLI's file permission checks; Edit(path) covers
  // the Write tool, and "//" roots it at "/" (a single "/" would be relative to the child's cwd).
  assert.ok(allowed.includes('Edit(//abs/out/report.md)'), 'the report rule must be Edit(//<abs path>)');
  assert.ok(!allowed.some((r) => r.startsWith('Write(')), 'never emit an inert Write(path) rule');
```
Predicted: green after the patch. The live effect is probe 2 and probe 3 below.

### N5. MINOR: finding 5's sweep tests are still missing. Three sweep mutants survive.

**Evidence**
- r1 finding 5 required tests for "a live run's wt/ survives" and "a young run's wt/ survives".
- None was added. The new sweep tests all use a dead `owner.pid` with an old or orphaned child.
- Surviving mutants (scratch runs):
  - M7, remove `if (isAliveFn(owner.pid)) continue;`;
  - M8, remove the young-run `continue` in the no-child branch;
  - `owner.timeoutMin` ignored in favour of the sweeping run's value.
- The sweep is the only code that removes a directory this run did not create.

**Fix.** Add these three tests, verbatim. They are verified on the scratch clone: pristine 3/3 pass, and each mutant fails exactly 1.
```js
test('finding 5: the sweep never touches a run whose review-run pid is alive, however old', () => {
  const scratch = scratchDir('review-run-sweep-live-');
  const runDir = makeRunDirWithOwner(scratch, { pid: 424242, startedAt: new Date(Date.now() - 999_999_999).toISOString() });
  sweepStaleRuns(scratch, 1, fs, (pid) => pid === 424242, () => assert.fail('must not kill'));
  assert.ok(fs.existsSync(path.join(runDir, 'wt', 'marker.txt')));
});

test('finding 5: a dead run younger than its timeout keeps its wt/', () => {
  const scratch = scratchDir('review-run-sweep-young-');
  const runDir = makeRunDirWithOwner(scratch, { pid: 424242, startedAt: new Date(Date.now() - 60_000).toISOString(), timeoutMin: 45 });
  sweepStaleRuns(scratch, 45, fs, () => false);
  assert.ok(fs.existsSync(path.join(runDir, 'wt', 'marker.txt')));
});

test("finding 6: the cutoff is the dead run's own owner.timeoutMin, not the sweeping run's", () => {
  const scratch = scratchDir('review-run-sweep-owntimeout-');
  const runDir = makeRunDirWithOwner(scratch, { pid: 424242, startedAt: new Date(Date.now() - 5 * 60_000).toISOString(), timeoutMin: 1 });
  sweepStaleRuns(scratch, 45, fs, () => false);
  assert.equal(fs.existsSync(path.join(runDir, 'wt')), false);
});
```
These still pass with the N1 patch: no `childPid`, so the identity check is never reached.

Also, not counted: mutant M13 (SIGTERM without killTree) makes the file **hang** rather than fail. The SIGTERM tests await an exit that never comes. Give those two tests `{ timeout: 30_000 }`, so a regression fails in 30 s rather than stalling CI.

### N6. MINOR: the empty-sidecar behaviour r1 finding 14 asked to document is only in a code comment

**Evidence**
- `validateReportPath` claims `<report>.identity.json` before the sha, plugin-root and host checks.
- Any exit 1, 4 or 7 after that point leaves an empty sidecar, and a retry with the same `--report` exits 1 with "identity sidecar already exists". Build-r1 accepted this as intended.
- r1's fix list says "Document that a failed run leaves an empty sidecar, so the report path must be fresh". `SKILL.md` has no such sentence; the only mention is the comment at `review-run.mjs:321`.

**Fix.** In `skills/team-build/SKILL.md`, after line 468 ("own shell must never export that marker."), add:
```
review-run claims `<report>.identity.json` before it does anything else, so a run that stops on
exit 1, 4 or 7 leaves that sidecar empty: retry with a fresh `--report` path, and never copy an
empty sidecar as evidence.
```

---

## Regression hunt: verified absent (first-class)

- **Finding 12's SessionStart line** (`hooks/multi-inbox.js:272-278`):
  - It prints one constant string: no env value, no path, no session id, no note content.
  - It goes to stderr only; the test asserts stdout is empty.
  - It exists only inside the `DELEGATION_REVIEW_RUN === "1"` branch, which returns immediately afterwards.
  - A normal lead never enters that branch, so its behaviour is byte-for-byte unchanged, including event parsing and registration.
- **Finding 14's atomic claim.**
  - `flag: 'wx'` gives O_CREAT|O_EXCL, so a concurrent second run exits 1. Tested, and the mutant is killed.
  - The claim comes after the kill-switch and recursion exits, so exits 5 and 6 leave no sidecar.
  - It comes after the report-exists check, so an exit 1 on an existing report claims nothing.
  - The one gap is N6's documentation.
- **Finding 9's full `GIT_*` strip.**
  - It changes nothing the child or the script needs. The clone, `remote remove` and `checkout` run on explicit `-C` and cwd.
  - A sealed test home keeps its identity through `FIXTURE_ROOT` (cb66b71), without any identity flag.
- **Finding 7's `lstat` guard and the EPERM-as-alive rule** are both fail-safe in the skip direction.
- **Finding 4.** `path.resolve` at parse time makes every later path absolute; the r1 leak does not recur.
- **Finding 10.** `which`/`where` runs once with the caller's env and no shell, and the result goes only into the sidecar.
- **Not a live defect: the `DONTASK_READONLY_BASH_ALLOWLIST`** (`review-run.mjs:66-72`).
  - It is inert under the default auto, but it is not read-only: `Bash(node:*)`, `Bash(npm run:*)` and `Bash(sed:*)` (so `sed -i`) execute or modify.
  - Any future dontAsk adoption must re-review that list; ruling r2 already defers dontAsk.

---

## Ruling r2, item 1: git's global-option equals forms

**Answer: expressible.** The rule strings are `Bash(git --git-dir=*)`, `Bash(git --work-tree=*)` and, beyond the ruling's list, `Bash(git --exec-path=*)`. They are wildcard rules, not `:*` rules. The ready patch and unit test are in N2.

**Evidence from `claude --help` and the binary (2.1.284):**
- `--help`: `--disallowedTools … (e.g. "Bash(git *) Edit")`. The documented pattern is a space-and-`*` wildcard.
- Embedded settings docs: `Prefix wildcard: "Bash(git *)" - matches git, git status, git commit`.
- **Rule classification** (`qyn`):
  - content ending in `:*` is `{type:"prefix"}`;
  - otherwise, any unescaped `*` (`Mzr`) makes it `{type:"wildcard"}`;
  - otherwise the rule is exact.
- **Prefix match** (`SK`): `Pe===Ce || Pe.startsWith(Ce+" ")`, plus the same test with `xargs ` in front. A `--git-dir=` token never satisfies it; that is the measured bypass.
- **Wildcard match** (`DR` is `K6(pattern, cmd, caseInsensitive=false, normalizeWs=true)`):
  - the pattern is regex-escaped, `*` becomes `.*`, and the result is compiled as `new RegExp('^…$','s')`;
  - runs of spaces and tabs normalize to one space.
  - So `git --git-dir=*` gives `^git --git-dir=.*$`, which matches `git --git-dir=/p/.git config core.hooksPath /tmp/x`.
- **Deny rules see stripped command forms.** They run with `stripAllEnvVars:true`: leading `FOO=1` assignments are removed (`nie`), and wrappers are peeled (`Hxt` over the `G$o` table: `env`, `sudo`, `nohup`, `timeout`, `watch`, …). So `env git --git-dir=…` is covered too. That is consistent with build-r1 probe 6, where `env claude` and `nohup claude` were denied by `Bash(claude:*)`.
- **Validator warnings to avoid** (`V_e`):
  - "…mixes * with the trailing :* prefix syntax, so it is matched as a literal prefix (the * is not expanded)". Never write `Bash(git --git-dir=*:*)`.
  - "…has a :* that is not at the end, so it is matched as a * wildcard".
  - The "wildcard before the rest of the command" warning applies to **allow** rules only, not deny.
- **An alternative single rule per option:** `Bash(git --git-dir*)` (`^git --git-dir.*$`) covers both the space and the equals spelling. I kept the proven `:*` space rules and added the equals rules, so each spelling has a rule already measured live or matched by simple regex semantics.
- **Measured git behaviour:**
  - `git -C/tmp status` gives `unknown option: -C/tmp`, so `-C` has no joined form to deny;
  - `git --exec-path /tmp` only prints `/usr/lib/git-core`, which is why the equals form is the one that matters.

## Ruling r2, the dontAsk question

**Answer: yes.** `Edit(//<absolute path>)` is the documented rule form that pre-approves the Write tool for one absolute path. `Write(...)` rules are documented as never matched.

**Evidence** (the binary's embedded docs and validator; quoted in N4):
- "path rules in `permissions` use `Edit(path)` for every file-writing tool (Write, Edit, NotebookEdit) … `Write(path)` … rules are not matched by file permission checks";
- the example `"ask": ["Edit(//etc/*)"]`;
- `Ddt`: `//x` resolves to root `/`, pattern `/x`, while a single `/x` is relative to the CLI-arg root (the cwd);
- win32 accepts `C:/…` and `//c/…`.

**Exact string to probe** (the report dir from build-r1's probe round, for example):
- POSIX: `--allowedTools 'Read,Grep,Glob,Edit(//tmp/claude-1000/<…>/lane-53/probes3-mlBQ/reports/p-dontask-edit.md),Bash(git status:*),…'`. That is `Edit(/` followed by the absolute path, which itself starts with `/`.
- win32 (ben-desktop, lead step): `Edit(C:/Users/<…>/report.md)`.

**Still unknown until probe 3:** whether dontAsk honours an Edit allow for a path **outside** the working directory. No binary string settled it.

## Probes only a live run can settle (for the lead; at most 4)

1. **Equals-form deny (auto, N2 patch applied), one run against a decoy.** Have the child run:
   - `git --git-dir=<decoy>/.git config core.hooksPath /tmp/x`;
   - `git --work-tree=<decoy> status`;
   - `git --exec-path=/tmp status`;
   - `git --git-dir <decoy>/.git log -1` (space form);
   - the benign `git log -1`.

   Expected: the first four are denied, each with verbatim `Permission to use Bash with command … has been denied`; the benign one runs; the decoy's `core.hooksPath` is unchanged (`git -C <decoy> config --get core.hooksPath`, read-only).
2. **P5 re-run under auto with N4's `Edit(//abs)` rule.** A benign review. Expected: `permissionDenials: 0` and the report written. This confirms that the Edit rule does not disturb the auto path and that the classifier is no longer the one approving the report write.
3. **dontAsk, the same argv plus `--permission-mode dontAsk`,** with `Edit(//<abs report>)` (ruling r2's "next step"). Expected on success: exit 0, report present, and the only denials are for commands outside the read-only allowlist. On failure, quote the denial verbatim; that settles whether dontAsk refuses out-of-cwd Edit allows.
4. **Real P4 on a quiet window.** Repeat the before/after hashes around one run, with the notes-dir listing per file and `inboxes.json` stat only. Its purpose is to confirm or refute the `flush-last.json` attribution, which build-r1 left unconfirmed (r1 finding 11).

---

## C4 (the bug the delta introduced: finding 6's orphan reaping)

Cause: `sweepStaleRuns` treats any live pid equal to a stale `owner.childPid` as its own orphan and SIGKILLs it (`review-run.mjs:375-381`). `defaultKillOrphan` even falls back to a plain `kill(pid)` for a pid that does not lead a group, which a detached child always does (`:394`). Every completed run leaves `childPid` in `owner.json` forever (`:707-713`), and the child can forge that file.
Discriminating check: an `owner.json` with a dead `pid`, an old `startedAt`, and a `childPid` of an unrelated `sleep` that the test spawned, then `sweepStaleRuns(scratch, 45)` with production defaults. On cb66b71 the sleep dies of SIGKILL (measured, for both a group leader and a non-leader). With the fix it stays alive, and an own detached orphan in `wt/` is still reaped (measured on the patched scratch copy).
Fix location: `skills/team-build/scripts/review-run.mjs` `sweepStaleRuns` (:360, :375-385) and `defaultKillOrphan` (:389-396), plus the new `isOwnOrphan`. Also `review-run.test.mjs:461`, which injects the new 6th argument, and two new victim-survives tests.
Simplification: prove identity (group leader plus cwd inside this run's `wt/`) before any signal, and drop the non-group fallback and the win32 `taskkill /T`. No new state and no new files; an unidentifiable pid just means "leave it".
