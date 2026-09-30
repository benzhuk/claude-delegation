VERDICT: APPROVE 72f736b62bce9c53ab9cf7aa3a92490bd08472c1

# Lane 59 seam delta review r3: janitor acts, diff 483af6e..72f736b

Scope: the fixes for seam-review-r2.md's five findings, checked against rulings r1 to r3. HEAD 906eadf adds only docs on top of 72f736b.

Method:
- Read-only on /var/tmp/lane-59/wt. `git status --short` there is empty at the end.
- Scratch is /var/tmp/delegation-l59sr3-e082. It holds:
  - `clone/` at 72f736b, used for the full suite;
  - `mut/` at 72f736b, used for the mutations. Every edit was restored from the original bytes, and `git status --short` is empty;
  - `tools/`, `mut.log` and `fullsuite.log`.
- Nothing was deleted and nothing was killed. No command was denied this round.

## Gate: full suite, run once at 72f736b
`TMPDIR=/var/tmp node scripts/run-tests.mjs`:
- 3205 tests: 3192 pass, 0 fail, 0 cancelled, 12 skipped, 1 todo;
- leak check: 0 new temp entries; exit 0.

Touched files (path-safety, reclaim and janitor tests): 220 tests, 211 pass, 0 fail, 9 skipped.

## Each fix reverted in `mut/`, the touched test files run, then restored

| revert | red |
|---|---|
| F1: win32 busy treated as ok | 1: `checkOpenProcess refuses on every platform branch...` |
| F1: unknown platform passes | 1 (same test) |
| F1: catastrophic probe ignored | 1 (same test) |
| F1: dry-run skip removed | 1 (same test; the probe now runs and throws `neverWin`) |
| F2: namespace guard removed | 1: `worktreeHasOpenProcess fails closed inside a private PID namespace...` |
| F2: stat-failure `catch` passes instead of `"unknown"` | **0** (see the recommendation below) |
| F3: `flag: "w"` (truncate) | 1: `seam review MEDIUM 2...` (the third same-second call) |
| F3: no `-2..-99` names | 1 (same test) |
| F4: forward-slash clause dropped | 1: `pathEscapesRoot - ...` |
| F4: `isAbsolute` clause dropped | 1 (same test) |
| F5: checkS / checkT loose copy restored | 0. Expected: no test was asked for, and r2 measured the two forms as functionally equivalent (fail-closed). |

## Verified at the cause (first-class findings)

**F1.**
- `checkOpenProcess` is exported (reclaim.mjs:573). The new host-agnostic unit test pins every branch of it:
  - win32 busy, catastrophic, not-busy and dry-run;
  - darwin unknown and busy;
  - an unknown platform.
- The subdirectory-cwd live test passes on Linux.
- seamfix2-build.md:38-41 carries the corrected statement about win32 coverage, and seamfix-build.md is untouched, as ruling r3 requires.

**F2.**
- The patch is applied verbatim (janitor.mjs:1395-1405). `statImpl` is an options seam that defaults to `statSync`.
- Both production callers pass a single argument: applySafe's `worktreeHasOpenProcess(w.ref)` and reclaim's `ctx.openProcessImpl(resolved)`. So the seam cannot be reached from outside a test.
- I checked the real sandbox arguments in the installed claude binary:
  - it pushes `--unshare-pid` and `--unshare-user` with no `--uid` mapping (`hV` adds only `--cap-drop`/`--cap-add`);
  - it pushes `--proc /proc` unless `/proc` is bound from the host.
  - In the private-proc case PID 1 is bwrap, owned by the caller's uid, so the discriminator fires. In the bind case the host /proc is visible and the scan is complete.
- r2 measured the host namespace: PID 1 is uid 0, so the guard does not fire. The daily timer's act and the janitor tests are therefore unaffected, and the full suite is green.

**F3.**
- Create-only `wx` over `base`, then `-HHMMSS`, then `-HHMMSS-2..99`. Anything other than EEXIST rethrows into writeRecordIfRequested's catch.
- Nothing is ever truncated. A corrupt base is never read (measured in r2 with the identical patch).

**F4.** Applied verbatim, with the drive, UNC and forward-slash cases pinned. On posix, `"../x"` behaves exactly as before, since `sep` is `/`.

**F5.** Both copies are replaced (reclaim.mjs:398, :467), and `pathEscapesRoot` is already imported (:24). No loose `startsWith("..")` copy remains in the three reviewed files.

## Regression hunt against r1 to r3: none found
- Every change only adds refusals or create-only writes:
  - the namespace guard and the stat-failure catch both resolve to `"unknown"`, which is skip;
  - `wx` cannot truncate;
  - the predicate change widens "escapes" only for a win32 `../` form no caller produces.
- The ancestor-`.git` walk, the mount checks and the W and B paths are untouched by this diff.
- SKILL.md is untouched, per ruling r3's out-of-scope note.

## Recommended, non-blocking (not counted)
**LOW: the stat-failure branch of the F2 guard has no discriminating test.**
- Evidence: reverting janitor.mjs:1403-1404's `return "unknown"` to a fall-through leaves every test green.
- This branch is the fail-closed answer on a `hidepid` /proc, where `/proc/1` is invisible.

Patch, in scripts/janitor.test.mjs:3344. Current:
```js
    assert.equal(namespaced, "unknown", "PID 1 owned by the caller's own uid must fail closed, never read as clean");
```
Replacement:
```js
    assert.equal(namespaced, "unknown", "PID 1 owned by the caller's own uid must fail closed, never read as clean");
    assert.equal(pathHasOpenProcess("/", { statImpl: () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); } }), "unknown", "a /proc/1 that cannot be stat'd (hidepid) must fail closed too");
```
Measured, trial-applied in `mut/`:
- with the fix intact: 1 pass, 0 fail;
- with the catch reverted: 0 pass, 1 fail.

**Residual, noted:**
- A root caller (uid 0) inside a private PID namespace is not detected: PID 1 is uid 0 there too. The sandbox does not map to uid 0, so this matters only for agents run as root.
- The new test returns early as root, with no skip message.
