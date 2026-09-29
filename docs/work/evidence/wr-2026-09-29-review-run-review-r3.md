VERDICT: NEEDS_FIXES (3) 1b62edb1e5f2584af28936ca0c3c2c6bc02a97a8

# Lane 53 delta review r3: review-run fix round 2 (`git diff cb66b71 1b62edb`)

Scope: the code at 1b62edb. The worktree HEAD a530eb9 is byte-identical to it for `skills/` and `hooks/` (`git diff --quiet 1b62edb HEAD -- skills hooks`). Precedence: lead-ruling-r3 > lead-ruling-r2 > review-r2 > build-r2.

What I ran (all in `scratchpad/lane-53/r3-tP8P/`, a mktemp dir):
- A local clone at 1b62edb (`repo/`). Every mutant, revert and fix simulation ran in its own fresh clone of that (`mut-*`, `revert-*`, `fixsim*-*`), with TMPDIR inside the same scratch dir.
- **Suite: `node --test skills/team-build/scripts/review-run.test.mjs` gives tests 65, pass 65, fail 0, cancelled 0, skipped 0 (10.7 s).** I ran it on the clone rather than in the worktree so that nothing could write into the reviewed tree. The file is byte-identical.
- 24 single-point mutants (`mutate.mjs`) and 5 per-commit reverts (`revert.mjs`: `git show <fix> -- <code path> | git apply -R`, with the tests left at 1b62edb).
- Fix simulations for every patch below (`fixsim.mjs`, `fixsim2.mjs`, `fixsim3.mjs`), and probes (`probe.mjs`, `zombie.mjs`).
- A read-only strings pass over the installed CLI binary (2.1.284), to settle N4's rule parsing and path matching.

Not run: no real `claude -p`, and no edit, stage or commit in the worktree. `git status` there shows only the pre-existing `?? relscratch/`. Nothing was deleted.

Processes: the three killTree mutants hang by design. I stopped their leftovers by single PID with SIGKILL, 7 in total: fake-claude processes, orphaned test-file processes and a review-run process. I identified each one by `/proc/<pid>/cwd` inside my own `r3-tP8P/mut-*` or `fixsim3-*` dirs. Nothing else was signalled.

Disclosure: the N1 revert (the old code) runs `defaultKillOrphan` against the fixture pid 555555 in the new "PAST its own recorded timeout" test. Before and after that run, `ps` showed no process and no process group with id 555555 or 424242. This host's pids are about 2.1M and have not wrapped (pid_max 4194304), so the signal found nothing. The builder's own RED run had the same exposure (see nit 6).

Totals: **1 MAJOR, 2 MINOR**, plus 11 non-blocking items.

---

## Verification table

"Killed" means that reverting the fix, or the mutant, turns at least one test red on the scratch copy.

| Item | Fix present at 1b62edb | Red without its fix? | Verdict |
|---|---|---|---|
| **N1** the sweep never signals | Yes. `defaultKillOrphan` and the `killOrphanFn` parameter are gone. `sweepStaleRuns` (`review-run.mjs:378-403`) prints one line and `continue`s when the childPid is live. A grep of the file for `process.kill`, `taskkill` and `.kill(` finds only `:364`, which is `kill(pid,0)` and sends no signal, and runChild's `killTree` (`:786`, `:788`). | Revert e9852a8: 4 fail. Mutants: no-continue, which removes wt/, gives 3 fails; no-print gives 1; ignore-childPid gives 4. **Reintroducing a SIGKILL in the live branch while keeping the dir SURVIVES**, in all three forms (group then pid, pid only, group only): 65/65 pass. | **The code is correct. The "sends no signal" tests are blind to a signal: F1 (MAJOR).** The skipped dir is left in place and the line is printed (verified). Measured: a completed run prints a false line: F3. |
| Own-child kill (runChild `killTree`, the only permitted kill) | Unchanged by the delta. Called from the timeout timer (`:792-796`) and from abort on SIGINT, SIGTERM or SIGHUP (`:801-806`). Pristine tests show the fake is gone after the timeout and after SIGTERM. | abort without killTree: the 2 SIGTERM tests fail at 30 s, **but the file never finishes**. Timeout without killTree, or a killTree no-op: the file **hangs** with no summary. Group kill replaced by pid-only kill: **survives**. | Works and is tested, but a regression stalls the suite rather than failing it (nit 1). The tree half is untested (nit 7). |
| **N2** equals forms | `:65`: `Bash(git --git-dir=*)`, `Bash(git --work-tree=*)`, `Bash(git --exec-path=*)` | Revert af8ccc9: 1 fail. Drop the rules: killed. The `=*:*` mixed-syntax mutant: killed. | Verified. The binary's wildcard matcher `Z6` builds `^…$` with `*` becoming `.*`. The builder's live probe 1 sidecar shows `permissionDenials: 4`. |
| **N3** rename-based sidecar write | `:352-356`: a `wx` temp named `${sidecar}.${randomUUID()}.tmp`, then `renameSync` | Revert 9e96cd7: the file fails to load (no `writeSidecarAtomic` export). O_NOFOLLOW-with-fallback: killed (2). Plain write: killed (2). O_NOFOLLOW without fallback: killed (2). **`wx` dropped from the temp: survives** (nit 2). | Verified. Attack surface below. |
| **N4** `Edit(//abs)` rule | `:246-247`, and validation at `:322` | Revert 7446ae0: 1 fail. Back to `Write(`: killed. Single-slash `Edit(/abs)`: killed. **Win32 branch changed to `Edit(/C:/…)`: SURVIVES. Validation back to `/[,)]/`: SURVIVES.** | The code is correct (character analysis below). **Two halves of the fix have no red test: F2 (MINOR).** build-r2's "unit-tested" claim for the win32 branch is false. |
| **N5** sweep tests | `review-run.test.mjs:581-600`; 30 s caps at `:765` and `:1055` | M7: killed (1). M8: killed (1). `owner.timeoutMin` ignored: killed (1). | Verified for the three named mutants. The 30 s caps do not stop the hang (nit 1). |
| **N6** empty-sidecar doc | `SKILL.md:470-472`, and a test | Revert 1b62edb: 1 fail. | Verified. The wording is slightly broad (nit 10). |
| r1 1(a) no bare Write or Bash, scoped rule | Yes. The rule is now the documented `Edit(//abs)`. | See N4. | **Closed.** The builder's probe 3 (dontAsk; its scratch copy differs from 1b62edb **only** at line 229, the mode; I checked with `diff`) wrote the report through the rule, with `permissionDenials: 1`, and that one denial was Bash. This is live proof that the rule is honoured outside cwd. |
| r1 1(b) git global options | Space and equals forms | See N2. | **Closed as ruled.** A global option placed *before* the subcommand still bypasses the subcommand denies (nit 9, lead's call, as r2 already offered). |
| r1 5 tests | See N5 | M7 and M8 killed | **Closed for the named mutants.** |
| r1 6 orphan reaping | Replaced by ruling r3's never-signal design | See N1 | **Closed in code.** Tests: F1. |
| r1 11 real P4 | Probe only | n/a | **Corroborated.** `~/.agents/notes/flush-last.json` has mtime 01:55:04 EDT today, and was rewritten while no review-run or `claude -p` of mine was running. So other sessions write it, which is the builder's attribution, now confirmed independently. |
| r1 14 sidecar claim + no write-through | `wx` claim unchanged; rename write | See N3 | **Closed.** |

---

## Findings (count toward NEEDS_FIXES)

### F1. MAJOR: the N1 "victim survives" tests cannot detect a signal, so a reintroduced sweep kill passes the suite (measured)

**Evidence**
- `review-run.test.mjs:511` and `:526` assert `isProcessAlive(victim.pid) === true` synchronously, straight after `sweepStaleRuns`.
- The victim is a child of the test process. A SIGKILLed child stays a zombie until Node's event loop reaps it, and `kill(pid,0)` succeeds on a zombie.
- Measured by `r3-tP8P/zombie.mjs`: `isProcessAlive right after SIGKILL = true; after 300ms signalCode = SIGKILL, isProcessAlive = false`, for both the detached and the non-detached victim.
- Mutation: `mutate.mjs` adds `process.kill(-childPid,'SIGKILL')`, or `process.kill(childPid,'SIGKILL')`, or both, before the print line in the live branch, keeping the `continue`. Every form gives **65/65 pass**.
- Ruling r3 requires the test "an unrelated live `sleep` … survives the sweep". As written, the test only proves that the dir survives.
- build-r2's RED for these tests came from the wt/ assertion (the old code also removed wt/), never from the liveness assertion.

**Fix: mechanical, verified** (`fixsim.mjs`). Pristine with the patch: 65/65. With a kill mutant: 2 fail, both victim tests, for the group-then-pid form and for the pid-only form.

`review-run.test.mjs:511`, current:
```js
    assert.equal(isProcessAlive(victim.pid), true, 'the sweep must never have sent the victim any signal');
```
replacement:
```js
    // A SIGKILLed child of this test process stays a zombie until the event loop reaps it, and
    // kill(pid,0) succeeds on a zombie — so let the loop run, then ask the handle how it ended.
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(victim.signalCode, null, 'the sweep must never have sent the victim any signal');
    assert.equal(victim.exitCode, null, 'the victim must still be running');
```
`review-run.test.mjs:526`, current:
```js
    assert.equal(isProcessAlive(victim.pid), true, 'the sweep must never have sent the victim any signal, group leader or not');
```
replacement:
```js
    // A SIGKILLed child of this test process stays a zombie until the event loop reaps it, and
    // kill(pid,0) succeeds on a zombie — so let the loop run, then ask the handle how it ended.
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(victim.signalCode, null, 'the sweep must never have sent the victim any signal, group leader or not');
    assert.equal(victim.exitCode, null, 'the victim must still be running');
```
Both tests are already `async`, and `isProcessAlive` is still used elsewhere in the file, so the import stays.

### F2. MINOR: two halves of the N4 fix have no red test (the win32 rule and the glob-character refusal); measured survivors

**Evidence**
- Mutant `Edit(${rulePath})` changed to `Edit(/${rulePath})` in the drive-letter branch (`review-run.mjs:247`): 65/65 pass.
- Mutant `/[,)*?[\]{}]/` changed back to `/[,)]/` (`:322`): 65/65 pass.
- No test passes a `C:\…` report path, and no test passes a glob character. The only validation test (`:894-898`) uses `,` and `)`, which the old regex already refused.
- build-r2 says "`Edit(C:/...)` … is unit-tested only". No such test exists.

**Fix: mechanical, verified** (`fixsim.mjs`). Pristine with the patch: 65/65. The win32 mutant fails 1, and the validation mutant fails 1.

After `review-run.test.mjs:871`, current:
```js
  assert.ok(!allowed.some((r) => r.startsWith('Write(')), 'never emit an inert Write(path) rule');
```
replacement:
```js
  assert.ok(!allowed.some((r) => r.startsWith('Write(')), 'never emit an inert Write(path) rule');
  // N4: a win32 drive-letter path is already absolute to the CLI (C:/…), so it takes no extra "/".
  const winArgv = buildArgv({ model: 'opus', effort: 'high', tools: ['Read', 'Write'], sessionId: 's', agentsPath: 'C:\\a.json', reportPath: 'C:\\Users\\me\\out dir\\report.md' });
  assert.equal(winArgv[winArgv.indexOf('--allowedTools') + 1], 'Read,Edit(C:/Users/me/out dir/report.md)');
```
After `review-run.test.mjs:897`, current:
```js
  assert.throws(() => validateReportPath(path.join(scratch, '..', 'report)paren.md'), scratch));
```
replacement:
```js
  assert.throws(() => validateReportPath(path.join(scratch, '..', 'report)paren.md'), scratch));
  // N4: the Edit rule body is a gitignore glob — a glob metacharacter would widen it past --report.
  for (const name of ['r*.md', 'r?.md', 'r[1].md', 'r{a}.md']) {
    assert.throws(() => validateReportPath(path.join(scratch, '..', name), scratch), /must not contain/, name);
  }
```

### F3. MINOR: a *completed* run prints a false "leaving stale run … in place" line on every later sweep once its old childPid is reused (measured)

**Evidence**
- runChild writes `childPid` into `owner.json` for every run (`:716-720`). A completed run removes only `wt/`, and `owner.json` stays forever.
- `sweepStaleRuns` probes that childPid (`:394`) whether or not anything is left to reclaim.
- Once the pid is reused by any process, every later review-run prints "leaving stale run <dir> in place — its recorded childPid <pid> still answers kill(pid,0) … reap it by hand if it is not yours".
  - That line is false: nothing is being left, because wt/ is already gone.
  - It points a human at an unrelated live pid.
  - It repeats forever. Pids are reused quickly on win32.
- Measured by `probe.mjs`: a run dir with no `wt/` and `childPid` set to a live `sleep` gives `wt/ existed: false; lines printed over 2 sweeps: 2`.

**Fix: mechanical, verified** (`fixsim2.mjs`). The new test fails without the code change and passes with it: 66/66, with no other test affected.

`review-run.mjs:393-394`, current:
```js
    if (!(age > cutoffMs)) continue; // young: never touched, live orphan or not
    if (typeof owner.childPid === 'number' && isAliveFn(owner.childPid)) {
```
replacement:
```js
    if (!(age > cutoffMs)) continue; // young: never touched, live orphan or not
    const wtPath = path.join(runDir, 'wt');
    // A completed run already removed its own wt/: nothing to reclaim, so nothing to report — its
    // stale childPid (reused or not) is never even probed.
    try { fsImpl.lstatSync(wtPath); } catch { continue; }
    if (typeof owner.childPid === 'number' && isAliveFn(owner.childPid)) {
```
Test to add before `review-run.test.mjs:532` (`test('N1 (ruling r3): a dead childPid still gets the existing cleanup'`):
```js
test('N1: a completed run whose wt/ is already gone is skipped silently, even when its old childPid now names a live process', () => {
  const scratch = scratchDir('review-run-orphan-done-');
  const victim = spawn('sleep', ['30'], { stdio: 'ignore' });
  const runDir = path.join(scratch, 'review-run-abc1234-done0001');
  fs.mkdirSync(runDir);
  fs.writeFileSync(path.join(runDir, 'owner.json'), JSON.stringify({
    pid: 424242, startedAt: new Date(Date.now() - 999_999_999).toISOString(), childPid: victim.pid, timeoutMin: 1,
  }));
  const origWrite = process.stderr.write;
  let captured = '';
  process.stderr.write = (chunk) => { captured += chunk; return true; };
  try { sweepStaleRuns(scratch, 45); } finally { process.stderr.write = origWrite; victim.kill('SIGTERM'); }
  assert.equal(captured, '', 'a run with nothing left to reclaim must not print a leave-in-place line');
  assert.ok(fs.existsSync(path.join(runDir, 'owner.json')));
});
```
Predicted outcome: a live orphan whose wt/ still exists keeps the ruling's behaviour (line printed, dir kept). A dead or absent childPid with wt/ present is still reclaimed. A completed run is silent.

---

## Brief questions answered

### N1: can any code path still signal a process?

No, apart from the permitted one. The only calls in `review-run.mjs` are:
- `:364`, `process.kill(pid, 0)` in `isProcessAlive`. Signal 0 sends nothing.
- `:786`, `taskkill /PID child.pid /T /F` (win32), and `:788`, `process.kill(-child.pid,'SIGKILL')`, falling back to `child.kill('SIGKILL')`.
  - Both are inside runChild's `killTree`, reached only from the run's own timeout timer or from `onAbort`, which `main()` wires to SIGINT, SIGTERM and SIGHUP (SIGBREAK on win32) sent to review-run.
  - `child` is the handle this run spawned. Nothing reads a pid from disk before signalling.

`sweepStaleRuns` has no kill parameter. A live childPid prints one line and `continue`s, so the dir is left in place. A dead one is reclaimed (tested).

The own-child path works: pristine tests show the fake is gone after the timeout and after SIGTERM. The gaps are F1 (the sweep's no-signal tests are blind), F3, and nits 1 and 7.

### N3: can the rename-based sidecar write still be redirected? (measured with `probe.mjs` unless noted)

- **A symlinked target dir.** If the report dir is, or becomes, a symlink, the temp file and the rename land in the link's target dir, under the fixed name `<report basename>.identity.json`. Measured: the victim dir afterwards holds exactly `['r.md.identity.json']`.
  - The child already has classifier-gated Bash writes outside the clone (ruling r2's accepted residual). It cannot choose the name or the bytes, and nothing is written *through* an existing file.
  - Verdict: no escalation over the residual. Not a defect.
- **A pre-planted temp name.** The name carries a 122-bit `randomUUID`, so it cannot be predicted. Even if it were forced, `flag: 'wx'` is O_CREAT|O_EXCL, which refuses an existing entry, symlinks included. Measured: `refused with EEXIST ; canary = safe`.
  - Fail-closed: exit 7 and an empty sidecar.
  - Dropping `wx` survives mutation (nit 2), but the UUID alone already defeats the plant.
- **A cross-device rename.** The temp file and the sidecar sit in the same directory, so `rename` never crosses devices; EXDEV is not reachable.
  - A dir swapped between the write and the rename makes the source path resolve elsewhere, which gives ENOENT, which gives exit 7. Fail-closed.
  - A directory planted at the sidecar name gives EISDIR, which gives exit 7 (measured). It leaves one `<sidecar>.<uuid>.tmp` behind (nit 3).
- **Windows rename-over-existing.** Node's `renameSync` is libuv `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`.
  - It replaces the claimed empty file.
  - A planted symlink is replaced as a link and never followed.
  - The risk is a transient `EPERM` or `EBUSY` when another process holds the destination open without share-delete (antivirus, indexer). The run then exits 7 after a good review.
  - This is not measurable here. It is live probe 1.

### N4: character handling, from the binary (2.1.284)

- **Splitting of `--allowedTools`** (`Wp`): it splits on `,` and space **only outside parentheses**. It tracks a boolean "inside parens": `(` sets it and `)` clears it.
  - So spaces and commas inside `Edit(…)` stay in one rule.
  - An inner `)` would end the rule early, which is why `)` is refused.
- **Rule parse** (`DBe`): the tool name is everything before the first unescaped `(`. The content runs to the last unescaped `)`, which must be the final character. `B2r` then unescapes `\(`, `\)` and `\\`. So an inner `(` is harmless.
- **Path root** (`Ddt`):
  - `//x` gives root `/` and pattern `/x`.
  - On win32, `^[A-Za-z]:[/\\]` gives root `<DRIVE>:\` (the letter is uppercased) and pattern `/rest`.
  - `//c/…` is also a drive form.
- **Matching**: gitignore semantics, through the `ignore` library (`Jt.default().add(p).ignores(…)`). The specials are `*`, `?`, `[…]` and `\`, a leading `!` or `#`, and trailing whitespace. Braces are literal, so refusing them is harmless.

Results (`probe.mjs`):

| `--report` | Validation | Rule emitted | Correct? |
|---|---|---|---|
| `/tmp/a b/report.md` | accepted | `Edit(//tmp/a b/report.md)` | yes |
| `/tmp/a(b/report.md` | accepted | `Edit(//tmp/a(b/report.md)` | yes |
| `…a)b.md`, `…a,b.md`, `…a*b.md`, `…a?b.md`, `…a[b.md`, `…a{b.md` | **refused** (usage) | n/a | yes |
| `C:\Users\ben\out dir\report.md` (win32) | n/a on Linux | `Edit(C:/Users/ben/out dir/report.md)` | yes: `Ddt` gives root `C:\`, pattern `/Users/ben/out dir/report.md` |
| `c:\x\r.md` | n/a | `Edit(c:/x/r.md)` | yes (`Ddt` uppercases the drive) |
| `\\server\share\r.md` (UNC) | n/a | `Edit(///server/share/r.md)` | never matches. Fail-safe under auto (nit 5). |
| `/tmp/a\b/report.md` (POSIX) | **accepted** | `Edit(//tmp/a/b/report.md)` | **no, it names a different path** (nit 4) |
| `/tmp/x/report.md ` (trailing space) | **accepted** | `Edit(//tmp/x/report.md )` | gitignore trims it to the sibling path (nit 4) |

---

## Non-blocking (nits; not counted)

1. **The N5 30 s caps turn the SIGTERM tests red, but the file still never exits.**
   - Leftover fake processes (they ignore SIGTERM by design) keep the test process alive.
   - The in-process timeout test (`review-run.test.mjs:175`) has no cap at all. A timeout-path killTree regression hangs the suite with no fail.
   - I measured this with three killTree mutants: the summary line never printed, and the file was stopped at 180 s.
   - The test comments at `:763-764` and `:1053` ("a 30s cap turns a hang into a fail") overstate what the caps do.
   - A cap plus a watchdog on two tests (`fixsim3.mjs`) was **not** enough, because other `FAKE_MODE: 'timeout'` tests also hang.
   - Instruction: make the fake's `timeout` mode self-exit after about 25 s (`setTimeout(() => process.exit(9), 25_000)` in `FAKE_CLAUDE_SOURCE`, so no leftover can pin the file). Give each own-child kill test a watchdog or bounded wait at about 15 s that fails the test (the two patches in `r3-tP8P/fixsim3.mjs` are ready to reuse).
   - Predicted: each killTree mutant fails within 15 s and the file exits by about 25 s.
2. **N3: dropping `wx` on the temp file survives mutation.** Its value is small, because the 122-bit name already defeats a plant. An optional test: an `fsImpl` whose `writeFileSync` plants a symlink at the `.tmp` path before delegating must throw EEXIST (as `probe.mjs` does).
3. **`writeSidecarAtomic` leaves `<sidecar>.<uuid>.tmp` behind when `renameSync` throws** (measured with EISDIR). Wrap the rename in `try { … } catch (e) { try { fsImpl.unlinkSync(tmp) } catch {} throw e; }`.
4. **POSIX `--report` containing `\` or trailing whitespace.**
   - The `\` becomes `/` (`:246` is platform-blind), so the rule names a different path.
   - Trailing whitespace is trimmed by gitignore.
   - The input is chosen by the lead, not by the child, so this is robustness only.
   - Patch at `:322`: add `if (process.platform !== 'win32' && reportPath.includes('\\')) usageError('--report must not contain \\ on this platform');` and `if (/\s$/.test(reportPath)) usageError('--report must not end in whitespace');`.
5. **win32 UNC and `\\?\` report paths** produce `Edit(///…)`, which never matches. That is fail-safe under auto (classifier parity), and dontAsk is out of scope. Optionally document "a drive-letter `--report` on win32".
6. **The fixture pid 555555 would really be signalled by a regressed sweep.**
   - The new N1 test at `:493` injects `isAliveFn: pid === 555555` but no longer injects any kill, so a regression sends a real SIGKILL (or `taskkill /T` on win32) to whatever holds pid 555555.
   - Prefer the real spawned `sleep` victims, which F1 now makes discriminating. Or record a pid that is proven dead (`spawnSync('true').pid`) and inject `isAliveFn` to call it alive.
7. **killTree's "tree" half is untested** (pre-existing, not in the delta). Replacing `kill(-pid)` with `child.kill` alone survives, because the fake spawns no grandchild. Optional: a fake mode that spawns a grandchild `sleep` and writes its pid; assert it is gone after the timeout.
8. **Pre-existing:** killTree could skip signalling once `child.exitCode !== null || child.signalCode !== null`. That closes the window between 'exit' and 'close' in which a reaped pid (fast reuse on win32, where `taskkill /T` is used) could be signalled.
9. **Pre-existing (1(b)), the lead's call, as r2 offered.**
   - Any git global option placed before the subcommand bypasses every subcommand prefix deny. Examples: `git --no-pager push <path> HEAD:x`, `git -P -C <p> config …`, `git --config-env=core.hooksPath=V commit`.
   - Either adopt r2's wildcard rules (for example `Bash(git -* push*)`, `Bash(git -* commit*)`, `Bash(git -* -C *)`, `Bash(git --config-env*)`), or name the gap in the Gap: paragraph.
10. **The N6 wording is broad.**
    - The sidecar is claimed after argument parsing, the kill-switch and recursion exits, and the report-exists check. So not every exit 1 leaves one.
    - A spawn-failure exit 4 writes a full sidecar.
    - Suggested: "…so a run that stops early (exit 1, 4 or 7) can leave that sidecar empty: …".
11. **build-r2 inaccuracies.**
    - It says win32 `Edit(C:/…)` is "unit-tested": no such test exists (F2).
    - N1's RED was attributed to the victims being killed; the red actually came from the wt/ assertion (F1).

---

## C4 (the bug the delta's own tests leave open: N1's no-signal guarantee)

Cause: the N1 regression tests check "not signalled" with `kill(pid,0)` straight after the sweep, but a SIGKILLed child of the test process is a zombie until it is reaped, and `kill(pid,0)` succeeds on a zombie. So a sweep that signals and keeps the dir passes (`review-run.test.mjs:511`, `:526`).
Discriminating check: add `process.kill(-owner.childPid,'SIGKILL')` (or the pid-only form) before the print line in `sweepStaleRuns`. At 1b62edb: 65/65 pass. With F1's patch: 2 fail, the two victim tests; pristine with the patch is 65/65 (`r3-tP8P/fixsim.mjs`).
Fix location: `skills/team-build/scripts/review-run.test.mjs:511` and `:526`: wait about 300 ms, then assert `victim.signalCode === null && victim.exitCode === null`. Separately, `review-run.mjs:393` for F3.
Simplification: ask the ChildProcess handle how the victim ended instead of probing a pid. No new helper, no /proc, the same on every platform.

---

## Live probes for the lead (at most 3; no real `claude -p` was run here)

1. **Windows (ben-desktop): the win32 Edit rule plus P5, two runs at 1b62edb.**
   - Use a `--report` under a dir with a space, for example `C:\Users\ben\<scratch>\lane53 r3\p5.md`, with a benign brief.
   - Run (a) with the shipped default `auto`. Expected: exit 0, `permissionDenials: 0`, the report present.
   - For the sidecar, check with `Get-Item`, not by reading the transcript: it must be a regular, non-empty file. This also exercises NTFS rename-over-existing (N3): no EPERM or EBUSY, and no leftover `*.tmp` beside it.
   - Run (b) through a scratch copy that differs only in `DEFAULT_PERMISSION_MODE = 'dontAsk'`, with a fresh report path. Expected: exit 0, the report written, and no denial for Write or Edit on the report. This proves that `Edit(C:/…)` is honoured, which under auto the classifier can mask. On failure, quote the denial verbatim.
2. **Linux (Netcup): a report path with a space and `(`, under the dontAsk scratch copy.**
   - For example `<scratch>/lane53 r3 (p)/p.md`.
   - Expected: exit 0, and the Write to the report not denied. This confirms, live, the `Wp` and `DBe` parsing I read from the binary.
3. **Optional (either host): sweep behaviour after a hard kill of review-run.**
   - Start a run with `--timeout-min 5`. Stop *that review-run process only*, by its own PID (SIGKILL, or `taskkill /PID <pid> /F` without `/T`), so its claude child becomes an orphan.
   - Then start a second run into the same `--scratch` after about 5 min. Expected: the second run prints the one leave-in-place line naming the first run's dir, signals nothing (the orphan's pid is still alive), and the first run's `wt/` is still present.
   - Afterwards the lead stops the orphan by its single PID.
