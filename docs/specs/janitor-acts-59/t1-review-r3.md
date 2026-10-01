VERDICT: NEEDS_FIXES 3c555f26c55051b9ca29bcffb90a9fea547b13c6 (2)

# Lane 59 T1 delta re-review r3: reclaim (3c555f2 on cb5cda0)

**SHA note.** This review was briefed as `3c555f2ac5ba1b1e01c17a3999f77c93cef2c43d`. No such object exists in the repo:
- `git cat-file -t 3c555f2ac5ba...` fails with "could not get object info".
- `git rev-parse 3c555f2` resolves to **3c555f26c55051b9ca29bcffb90a9fea547b13c6** ("fix(reclaim): address T1 fix-round-2 re-review findings 1-5", parent 4c24fc4, cb5cda0 is an ancestor).
- The bad full sha comes from the builder's report (finding 2).
- This verdict pins the real object. The brief's verdict line would have named a commit that does not exist.

Scope:
- 3c555f2 touches only scripts/reclaim.mjs (+179/-59) and scripts/reclaim.test.mjs (+277/-1).
- path-safety.mjs and work-record.mjs are unchanged since cb5cda0.
- Worktree /var/tmp/lane-59/wt stayed clean at a1b22f7 throughout; nothing in it was written.

Cause: fix round 2's LOW 5 junction test builds its context with the POSIX-only `baseCtx()` (`platform: "linux"`, `uid: process.getuid()`) and accepts any exit 3. On the only host where it runs, it therefore throws before `mklink` (process.getuid is undefined on win32). Even once that is fixed, reclaim refuses the Windows path as "not absolute on this host", so the junction is never reached. Separately, the build report records a full commit sha that does not exist.
Discriminating check: `node -e 'process.getuid=undefined; ({uid: process.getuid()})'` gives `TypeError: process.getuid is not a function`, which is what reclaim.test.mjs:60 hits on win32; and `git cat-file -t 3c555f2ac5ba1b1e01c17a3999f77c93cef2c43d` fails, while `git rev-parse 3c555f2` gives 3c555f26c550….
Fix location: scripts/reclaim.test.mjs:1174-1191 (the LOW5 test body); docs/specs/janitor-acts-59/t1-fix2-build.md lines 1 and 17, and its copy /var/tmp/lane-59/t1-fix2-report.md.
Simplification: the junction test needs its own four-field win32 context, not `baseCtx()` plus a disjunctive assertion. Asserting "the sentinel survives" unconditionally makes the either/or branch a plain check on the reason.

## Gate results
- **Territory:** `TMPDIR=/var/tmp node --test scripts/path-safety.test.mjs scripts/reclaim.test.mjs scripts/work-record.test.mjs scripts/work-record-closeout.test.mjs` gave 400 tests, 399 pass, 0 fail, 1 skipped (LOW5, win32-only).
- **Full suite:** `TMPDIR=/var/tmp node scripts/run-tests.mjs` gave 3183 pass, 0 fail, 6 skipped, 1 todo. Leak check: 0 new temp entries. Exit 0. The log is at /var/tmp/l59r2-scratch-UU2X/fullsuite-r3.log.
- **Denials:** none this round.

## The 5 r2 findings: all closed in code
| r2 finding | Status | Evidence (dry-run, unrelated cwd, fixtures only) |
|---|---|---|
| HIGH 1: plain repo's main checkout | **Closed.** checkAncestorsForGit refuses on ANY `.git` above the target (reclaim.mjs:285-300), matching ruling r2. The dead `git worktree list` branch is deleted. | P2 `r/src`, `r/src/a.txt`, `r/src/new.txt` (untracked) and `r/.git/objects` all give `refused: lies inside a git checkout at .../r`, exit 3. P2b (the T top is the repo) and P2c (empty `worktrees/`) are refused. P1, P1b and P4 are still refused. Mutation H1e (let an ancestor `.git` DIR pass): 3 tests red. |
| HIGH 2: bare repo backing live worktrees | **Closed.** `looksLikeGitDir` (HEAD file, `objects/` and `refs/` dirs) is applied downward (:138-145) and upward (:275-285). | P3 `<T>` gives `contains a repo with linked worktrees elsewhere at .../b.git`; `b.git/objects` gives `lies inside a git directory at .../b.git`; both exit 3. The upward (G1) and downward (G2) shape checks off: each red. |
| MEDIUM 3: `..`-prefix twins | **Closed.** `escapesUp` in the mount check (:227), and a local `within()` for F8 (:317-331, :675). | Under `unshare -rm`, a same-fs bind at `<T>/..m` gives `crosses a mount point at .../..m`, exit 3; at cb5cda0 it gave `would-remove 4`. A cwd of `<T>/..work` gives `equals process.cwd() or contains it`, exit 3. E1 (escapesUp loosened) and E2 (F8 back to pathWithin) are both red. |
| MEDIUM 4: named mutants | **Closed.** All five now red: M5b (1 red), H1d (1), H2c (1), L11 readdir (1), M5c (1). H1c is gone with the deleted branch; H1e replaces it. | See the mutation table. |
| LOW 5: junction gate | **Recorded, but the test cannot measure its subject** (finding 1). The build report does record it as a deferred Windows gate item, which the r2 option allowed. | reclaim.test.mjs:60, :1174-1191 |

Full mount set re-run under `unshare -rm` at 3c555f2:
- **Refused:** tmpfs at the target; same-fs bind at the target, below it, at the T top (target under it), at `..m`, and at `a b`.
- **Control:** `would-remove 1`.
- **Mount table unreadable** (tmpfs over /proc): `could not read the mount table`, exit 3.
- **Sentinel:** /var/tmp/l59r2-sent-* still holds keep.txt and sub/.

## Mutation table (scratch copy /var/tmp/l59r3-mut-DcfZ from `git archive 3c555f2`, restored, `diff -r` identical)
Baseline: 63 pass, 1 skipped.

**Red** (fail count in brackets):
- M1 (1), M2 (1), M4 (1), M5 (1), **M5b (1)**, M7 (2)
- H1 (6), H1e (3), **H1d (1)**
- G1 (1), G2 (1), G6 (2)
- E1 (2), E2 (1)
- H2 (5), H2b (1), **H2c (1)**, H2d (2)
- M3 (whole file), M4b (1), **M5c (1)**, M6 (1)
- **L11 (1)**, L11b (1), L13 (1)

**Survive, not counted:**
- **G3/G4:** the new shape check's non-ENOENT lstat error, made to fail open, upward and downward.
  - On a real filesystem these are masked. An EACCES on `<dir>/HEAD` means `<dir>` is not searchable, so the `<dir>/.git` lstat (H1d, red) or the child lstat (L11b, red) refuses on the same call.
  - Only an injected fsImpl separates them. A one-line test each would pin them; optional.
- **G5:** the shape test weakened to "HEAD file alone". That direction only over-refuses, never deletes, so it is not a safety hole.

## Regression hunt, this commit only
**Does the widened refusal block reclaim's own intended S/T targets?** No. Measured side by side against cb5cda0 (p3.sh):
- **L1:** a `mktemp` T dir holding a fixture repo plus its bare `origin.git`, with no worktrees.
  - `<T>` gives `would-remove T 85` in both versions.
  - `<T>/repo` and `<T>/origin.git` give `is the main worktree` (W) in both.
  - An absent path gives `absent` in both.
- **L2:** a T dir holding a repo AND its linked worktree (the subagent-contract layout) is refused in both versions with the same F3 reason. Nothing changed.
- **Plain scratch:** a `delegation-*` dir with only files gives `would-remove` (control M7). A T dir holding a plain fixture repo (P2's `<T>`) gives `would-remove T 49`.
- **Newly refused, all in the fail-closed direction, none a whole-T target of the convention:**
  - Paths INSIDE any checkout or git dir. This is intended, per ruling r2.
  - A T dir holding a bare repo whose `worktrees/` has only a stale, prunable entry (L3: old `would-remove 95`, new `contains a repo with linked worktrees elsewhere`). `git worktree prune` clears it, which is the same treatment a non-bare `.git/worktrees` stale entry already got.
  - A sub-target of a T dir that happens to hold a `HEAD` file plus `objects/` and `refs/` dirs (L4: `<T>/sub` gives `lies inside a git directory at <T>`). This is a false positive, but the whole `<T>` stays removable.
- **Upward walk above the class root** (/var/tmp, /var, / on this host): no `.git` and no git-dir shape. The control dry-runs pass.
- **Cost:** 1 to 3 extra lstats per directory downward, and 3 more per ancestor.
  - Measured on a 5,100-dir, 10,101-entry T fixture: cb5cda0 took 164 ms, 3c555f2 took 227 ms.
  - The full suite's time is unchanged (30.0 s).
- **`within()`:** a faithful copy of pathWithin's realpath and win32 case-fold, with the corrected escape test. It is used only at F8. `samePathResolved` (W matching) still uses janitor's pathWithin. A `..`-named miss there makes W fail to CLAIM a worktree, which then falls to S/T, where the ancestor `.git` file refuses it. That is fail-closed. The T2 seam note stays open.
- **`applySafeImpl` seam:** defaults to the real applySafe. Both call sites are switched, and nothing else changes.

---

## LOW 1. The LOW 5 junction gate test cannot test junctions on the only host where it runs
Evidence:
- The test (reclaim.test.mjs:1174-1191) builds its context with `baseCtx()`.
- baseCtx sets `uid: process.getuid()` (line 60). On win32, `process.getuid` is undefined, so the test dies with `TypeError: process.getuid is not a function` before `mklink` runs (simulated: `node -e 'process.getuid=undefined; ({uid: process.getuid()})'`).
- If that were fixed, baseCtx still forces `platform: "linux"` with roots under os.tmpdir(). A `C:\...` target then fails `path.posix.isAbsolute`, and reclaim exits 3 with "not absolute on this host".
- The assertion `code === 3 || (...)` accepts that, so the junction is never walked. This is a check that passes because it is not looking, deferred to exactly the Windows gate that is meant to rely on it.
- Pre-existing and not counted: every other baseCtx test in reclaim.test.mjs hits the same `process.getuid()` on win32. The Windows gate should expect the whole file to fail there until baseCtx uses `typeof process.getuid === "function" ? process.getuid() : 0`.

Fix (exact). Replace the test body, from `}, () => {` through the closing `});` at reclaim.test.mjs:1178-1191. Current:
```js
}, () => {
  const ctx = baseCtx();
  const { target } = tTarget(ctx);
  const sentinel = mkTmp("reclaim-junction-sentinel-");
  fs.writeFileSync(path.join(sentinel, "keep.txt"), "keep me\n");
  const junction = path.join(target, "linked");
  execFileSync("cmd", ["/c", "mklink", "/J", junction, sentinel], { encoding: "utf8" });
  const c = collector();
  const code = reclaimMain([target], { ...ctx, print: c.print });
  // Either the whole T removal is refused because the walk treats the junction as an
  // untraversable reparse point, or the T removal goes ahead and takes only the junction LINK
  // with it - what must never happen is the sentinel's own contents being deleted.
  assert.ok(code === 3 || (code === 0 && fs.existsSync(path.join(sentinel, "keep.txt"))));
});
```
Replacement:
```js
}, () => {
  // A real win32 context: T's win32 root is <home>\AppData\Local\Temp, so build exactly that.
  const home = mkTmp("reclaim-home-");
  const tmpdir = mkdir(path.join(home, "AppData", "Local", "Temp"));
  const top = mkdir(path.join(tmpdir, "delegation-junction-XXXX"));
  const sentinel = mkTmp("reclaim-junction-sentinel-");
  fs.writeFileSync(path.join(sentinel, "keep.txt"), "keep me\n");
  const junction = path.join(top, "linked");
  execFileSync("cmd", ["/c", "mklink", "/J", junction, sentinel], { encoding: "utf8" });
  const c = collector();
  const code = reclaimMain([top], {
    cwd: mkTmp("reclaim-cwd-"), home, platform: "win32", uid: 0, tmpdir,
    posixTmpRoot: "/tmp", posixVarTmpRoot: "/var/tmp", sessionId: "sess-1", now: new Date(),
    fsImpl: fs, print: c.print,
  });
  // The sentinel's own contents must survive, whichever way reclaim resolves the junction.
  assert.ok(fs.existsSync(path.join(sentinel, "keep.txt")), "the junction's target must survive");
  if (code === 3) {
    assert.match(c.lines[0], /symlink|reparse|junction|mount/); // refused FOR the junction, not for an unrelated reason
  } else {
    assert.equal(code, 0);
    assert.match(c.lines[0], /^removed T /);
    assert.ok(!fs.existsSync(top));
  }
});
```
Predicted outcome:
- Still skipped on Linux and darwin, with the same skip reason.
- On a win32 host it reaches the walk with a T-classified target, and it goes red if reclaim ever empties the sentinel or refuses for an unrelated reason.
- Unmeasured: there is no win32 host here. The Windows gate reads this result.

## LOW 2. The build report records a commit sha that does not exist
Evidence:
- docs/specs/janitor-acts-59/t1-fix2-build.md line 1 (`DONE 3c555f2ac5ba1b1e01c17a3999f77c93cef2c43d`) and line 17 (`Final commit: 3c555f2ac5ba…`), committed in a1b22f7. /var/tmp/lane-59/t1-fix2-report.md is byte-identical.
- `git cat-file -t` on that sha fails. The real commit is 3c555f26c55051b9ca29bcffb90a9fea547b13c6.
- The short form `3c555f2` in the work record's Log line resolves correctly.
- The mistyped full sha then reached this review's brief as its prescribed verdict line. An evidence rule keyed on full shas would pin a nonexistent object.

Fix (exact), in both files: replace `3c555f2ac5ba1b1e01c17a3999f77c93cef2c43d` with `3c555f26c55051b9ca29bcffb90a9fea547b13c6` (2 occurrences each). The builder should produce a full sha with `git rev-parse HEAD`, never by typing it.

Predicted outcome: `git cat-file -t <sha from the report>` prints `commit`.

---

## Scratch left in place (nothing deleted)
- **/var/tmp/l59r2-scratch-UU2X:**
  - p3.sh (the r3 regression probes);
  - mut-r3.mjs and mut-r3-base.mjs;
  - fullsuite-r3.log;
  - the r2 files.
- **/var/tmp/l59r3-mut-DcfZ:** the mutation copy, restored and identical to scripts.pristine.
- **New fixtures:**
  - /var/tmp/delegation-l59r3L1-*, L2-*, L3-*, L4-*, mA-* through mG-*, big-EHt8;
  - /var/tmp/l59r2-cwd-* and /var/tmp/l59r2-sent-*.
- **Registered worktrees to prune at cleanup:**
  - L2's `<T>/wt` is registered in `<T>/repo`.
  - L3's b.git holds a prunable entry.
  - The r2 fixtures' registrations noted in t1-review-r2.md still stand.
