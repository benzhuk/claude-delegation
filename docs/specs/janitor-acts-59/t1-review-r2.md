VERDICT: NEEDS_FIXES cb5cda0caa87774186715984fd18e187bf28b198 (5)

# Lane 59 T1 delta re-review r2: reclaim and path-safety (807b45d + cb5cda0 on c12e190)

Scope: scripts/path-safety.mjs + test, scripts/reclaim.mjs + test, scripts/work-record.mjs, work-record.test.mjs (no diff), work-record-closeout.test.mjs (one new LOW14 test). 807b45d and cb5cda0 touch only these files. Worktree /var/tmp/lane-59/wt stayed clean at 5ed0472 throughout; nothing in it was written.

Cause: HIGH 1's upward walk followed the round-1 reviewer's sketch (refuse a `.git` dir only when `worktrees/` is non-empty) instead of ruling r2 (refuse on ANY `.git` file or directory above the target), and both the upward and downward walks recognise a git directory only by the basename `.git`, so a plain checkout and a bare repo backing live worktrees both fall through to a bare fs delete.
Discriminating check: from an unrelated cwd, `node scripts/reclaim.mjs --dry-run <T>/r/src` on a plain repo with ` M src/a.txt` and `?? src/new.txt` prints `would-remove T .../r/src 3`, exit 0 (also `.../r/.git/objects 11`). With the patch in finding 1 applied to a scratch copy, it prints `refused ...: lies inside a git checkout at .../r`, exit 3, and all 52 reclaim tests stay green.
Fix location: scripts/reclaim.mjs checkAncestorsForGit (lines 213-264), walkForMountAndLinkedWorktrees (lines 95-109), checkMountsUnderClassRoot's withinOrEqual (line 179) and the F8 cwd check (line 607); scripts/reclaim.test.mjs.
Simplification: under ruling r2 the whole `worktrees/` + `git worktree list` branch of checkAncestorsForGit (lines 229-257) is deleted. It is dead weight today anyway: any repo whose list names a non-root worktree already has a non-empty `worktrees/`, and its `listWorktrees() === null` path fails open.

## Gate results
- **Territory:** `TMPDIR=/var/tmp node --test scripts/path-safety.test.mjs scripts/reclaim.test.mjs scripts/work-record.test.mjs scripts/work-record-closeout.test.mjs` gave 388 pass, 0 fail, 0 skipped. The unshare test ran and was not skipped.
- **Full suite:** `TMPDIR=/var/tmp node scripts/run-tests.mjs` gave 3178 tests, 3172 pass, 0 fail, 5 skipped, 1 todo. Leak check: 0 new temp entries. Exit 0. The log is at /var/tmp/l59r2-scratch-UU2X/fullsuite.log.

## Denials during this review (reported)
1. **git-identity-guard** blocked `git config user.name` (a read, without `--get`), which I ran only to check that an identity exists.
   - That step was dropped; it is not needed.
   - Fixture commits used plain `git commit` and succeeded.
2. **secret-guard** blocked a command that sourced my own fixture-path list, /var/tmp/l59r2-scratch-UU2X/p2.env, because of its `.env` name.
   - The whole command was blocked, so nothing ran and no fixtures were created.
   - The mount probe was rerun as a different command that passes the paths as positional arguments and sources no file at all.
   - The orchestrator should judge whether that counts as routing around the guard.
3. **secret-guard** blocked a mutation harness containing `{ ...process.env, TMPDIR }`, treating it as an environment dump. It printed nothing, and nothing was written.
   - The harness was rewritten to reference no environment at all: children inherit TMPDIR from the harness's own invocation.
   - Same caveat as denial 2.

## Probes (dry-run only, fixtures only, nothing deleted)
- Every reclaim call was `--dry-run`, run from an unrelated cwd (/var/tmp/l59r2-cwd-*), on /var/tmp/delegation-l59r2* fixtures.
- Mount probes ran inside `unshare -rm`, so the mounts died with the namespace. The sentinel /var/tmp/l59r2-sent-IuC9 still holds keep.txt and sub/.
- Mutations ran only on the scratch copy /var/tmp/l59r2-mut-UkKu, extracted from `git archive cb5cda0`. Each mutation was restored afterwards, and `diff -r scripts scripts.pristine` confirmed the copy identical.

| Probe | Result at cb5cda0 |
|---|---|
| P1: linked worktree `<T>/wt` of a repo outside T; `wt/src`, `wt/src/a.txt` | refused, `lies inside a linked worktree` (exit 3) |
| P1b: main checkout inside T with a linked worktree elsewhere; `r/src` | refused, `lies inside a repo with linked worktrees` |
| **P2: plain repo main checkout inside T, no linked worktrees, ` M src/a.txt`, `?? src/new.txt`** | **`would-remove T .../r/src 3`, `.../src/a.txt 1`, `.../src/new.txt 1`, `.../r/.git/objects 11`, all exit 0** |
| **P2b: the T dir itself is the plain repo; `<T>/src`** | **`would-remove T 2`, exit 0** |
| **P2c: plain repo whose `.git/worktrees/` is empty (worktree removed)** | **`would-remove T 2`, exit 0** |
| **P3: bare `b.git` inside T, with a linked worktree elsewhere holding an unpushed commit** | **`would-remove T <T> 62` and `.../b.git/objects 19`, exit 0**; `b.git` itself is refused (`is the main worktree`) |
| P4: `.git` file (submodule shape) above target | refused |
| symlinked ancestor (`<T>/link -> repo`, and a symlinked `delegation-*` top) | refused, `a symlinked ancestor changes the real path` |
| M1: tmpfs AT target (mode 700) | refused, `crosses a mount point` (target and file inside) |
| M2: same-fs bind AT target (st_dev 65028 = /var/tmp's, measured) | refused, `crosses a mount point` / `lies under a bind mount` |
| M3: same-fs bind BELOW target | refused |
| M4: target lies under a same-fs bind at the T top | refused, `lies under a bind mount` |
| **M5: same-fs bind BELOW target at a dir named `..m` (st_dev identical)** | **`would-remove T ... 4`, exit 0; the walk counted the sentinel's entries** |
| M6: bind below target at `a b` (`\040` decode) | refused |
| M7: control, no mount | `would-remove T 1`, exit 0 |
| M8: mount table unreadable (tmpfs over /proc inside the namespace) | refused, `could not read the mount table`: **fails closed, measured** |
| F8 twin: cwd = `<T>/..work`, target `<T>` | **`would-remove T 4`, exit 0**; the control cwd `<T>/work` is refused |

---

## HIGH 1. A plain repo's main checkout (no linked worktrees) is deletable by T. This deviates from ruling r2.
Evidence:
- P2, P2b and P2c above were measured at cb5cda0. The deletable targets include a modified tracked file, an untracked file, the whole `src/` holding both, and the repo's `.git/objects`.
- Ruling r2, HIGH 1 reads: "Reclaim refuses the target when any ancestor holds a `.git` file or directory, whether that marks a linked worktree or a repo."
- The code does something narrower:
  - reclaim.mjs:225-239 refuses a `.git` DIR only when `worktrees/` is non-empty (lines 237-238).
  - Otherwise it falls to a `git worktree list` scan (244-257). For a plain repo that scan lists only the root, which line 252 skips.
- The builder's table row states the narrower rule. Its code comment (240) cites "F3's ruling: stays removable", but F3's standalone-repo allowance governs a target that CONTAINS a repo (the downward walk), not one lying INSIDE it.
- Mutation evidence: H1c (disable the `worktrees/` branch) survives, 52/52 green, so even the narrower rule is unpinned (see finding 4).

Fix (exact). Replace reclaim.mjs:225-258, from `    if (st) {` through the closing `}` of that block just before `    const parent = path.dirname(dir);`, with:
```js
    if (st) {
      return {
        ok: false,
        reason: st.isDirectory() ? `lies inside a git checkout at ${dir}` : `lies inside a linked worktree at ${dir}`,
      };
    }
```
Then do the following:
- Update the doc comment at reclaim.mjs:205-212 to say "any `.git` entry".
- Drop `listWorktrees` from the checkAncestorsForGit path. It is still used elsewhere, so keep the import.
- Add a test: a plain `initRepo()`-style repo created INSIDE a T dir, with a modified tracked file and an untracked file, and cwd unrelated.
  - `r/src`, `r/src/new.txt` and `r/.git/objects` must each exit 3 with `/lies inside a git checkout/`, and the files must survive.
  - Also add P2b, the T top being the repo, with target `<T>/src`.

Predicted outcome, simulated on the scratch copy:
- P2, P2b and P2c are refused with `lies inside a git checkout at .../r`.
- P1 is still refused with `lies inside a linked worktree`, so the existing HIGH1 test's `/linked worktree/` still matches.
- Control M7 stays `would-remove`, and a repo that is itself the target (`<T>` = repo) stays removable by F3, or refused as main worktree by W.
- reclaim.test.mjs: 52 pass, 0 fail.
- Note that the ruling walks to the filesystem root. On a Windows host whose home is itself a git repo, `%LOCALAPPDATA%\Temp` lies inside that repo, so every S and T target would be refused there. That is the fail-closed direction the ruling accepts, but put it on the Windows gate checklist.

## HIGH 2. A bare repo that backs live linked worktrees is deletable, and so is anything inside it (new; a pre-existing gap of F3's walk)
Evidence (P3):
- Setup: `git clone --bare` into `<T>/b.git`, then `git -C b.git worktree add <elsewhere> main`, then an unpushed commit made in that worktree.
- `reclaim --dry-run <T>` gave `would-remove T <T> 62`, exit 0. `reclaim --dry-run <T>/b.git/objects` gave `would-remove T 19`, exit 0.
- A live run would destroy the only copy of the worktree's unpushed commit and orphan the live worktree.

Cause:
- The downward walk (reclaim.mjs:95) inspects `worktrees/` only for an entry whose basename is `.git`.
- The upward walk (216) looks only for `<ancestor>/.git`.
- A bare repo, or any git dir not named `.git`, is invisible to both. It is the same hazard F3 refuses for `.git/worktrees/*`, only under another name.

Fix (judgment; this is the design I simulated). Add a git-dir shape test matching git's own `is_git_directory`: `HEAD` is a file, and `objects/` and `refs/` are directories, all lstat'd, with ENOENT/ENOTDIR meaning "no" and any other error refusing.
- **Downward walk:** apply the existing `.git` rule to any directory with that shape (`worktrees/` non-empty refuses).
- **Upward walk:** refuse `lies inside a git directory at <dir>` when any ancestor `dir` itself has that shape.
- **Tests:** add P3 both ways.

Predicted outcome, simulated on the scratch copy on top of finding 1's patch:
- `<T>` is refused with `contains a repo with linked worktrees elsewhere at .../b.git`.
- `.../b.git/objects` is refused with `lies inside a git directory at .../b.git`.
- A plain `delegation-*` dir stays removable. reclaim.test.mjs: 52 pass, 0 fail.

## MEDIUM 3. The `..`-prefix twin of LOW 12 is still in reclaim's own mount check and F8 cwd check; both fail toward ALLOW (measured)
Evidence:
- **M5:** a same-filesystem bind mount at `<T>/..m` gives `would-remove T <T> 4`, exit 0. The walk descended into the sentinel's contents.
  - checkMountsUnderClassRoot's `withinOrEqual` (reclaim.mjs:179) uses `!rel.startsWith("..")`, and `path.relative(<T>, <T>/..m)` is `..m`.
  - Probes M1 to M4 and M6 are all refused, so this one name shape defeats HIGH 2's part 2.
- **F8:** with cwd `<T>/..work`, `reclaim --dry-run <T>` gives `would-remove T 4`, exit 0. The same probe with cwd `<T>/work` is refused.
  - Line 607 uses janitor.mjs's `pathWithin`, which still has the defect (janitor.mjs:1695). The round-1 seam note sent this to T2, and T2 closed without fixing it.

Fix, part 1 (exact). In reclaim.mjs:179, replace
```js
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
```
with
```js
    return rel === "" || !(rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel));
```
Fix, part 2 (T1 can close its own F8 surface without editing janitor.mjs):
- Add to reclaim.mjs a local `within(child, parent)` helper. It realpaths each side when it can (the same as pathWithin), folds case on win32, and uses the corrected `escapes` test.
- Use it at line 607 in place of `pathWithin(ctx.cwd, resolved)`.
- Keep the T2 seam note open for janitor.mjs's own callers.

Tests:
- An injected-mountinfo test with a mount at `<top>/..m` (the pattern of the existing injected test).
- A cwd test with `cwd: <top>/..work`.

Predicted outcome:
- Part 1 was simulated under `unshare -rm`: M5 is refused with `crosses a mount point at .../..m`, exit 3, and 52/52 green.
- Part 2: the F8 probe is refused with `equals process.cwd() or contains it`.

## MEDIUM 4. Several of this round's fixes are still unpinned: mutations survive with the suite green
Measured on the scratch copy; each mutation was restored afterwards, and the copy was confirmed identical with diff -r.

Red, and so pinned: M1, M2, M4, M5 (walk st_dev off), M7, H1 (ancestor walk off), H1b (`.git`-file branch off), H2 (mount table off), H2b (unreadable table passes), H2d (contains-below off), M3 (rmSync uncaught), M4b (B holder check off), M6 (darwin rewrite off), L11b (lstat fails open), L13 (recheck off), L12 (path-safety `escapes` loosened), and L14 (preCheck removed).

**Surviving mutants (the suite stays green):**
- **M5b: the HIGH 2 part-1 fix itself reverted** (`baseDev = fsImpl.lstatSync(target).dev`).
  - Cause: the "class-root st_dev baseline" test fakes a different dev on `top` only, so `inner` differs from the target and the old baseline refuses anyway.
  - The mountinfo check would also mask it.
  - Fix: in that test, return `dev: 999999` for `top` and every path under it, and inject `readFileSync` returning an empty `/proc/self/mountinfo` so part 2 cannot mask the result. M5b then turns red.
- **H1c:** the upward `worktrees/` branch disabled. There is no test for P1b. It becomes moot if finding 1 lands, but finding 1's own test must then exist.
- **H1d:** the upward lstat error made to fail open. Add a test with an fsImpl whose `lstatSync` throws EACCES for `<ancestor>/.git`; expect exit 3 and `/could not stat/`.
- **H2c:** the `lies under a bind mount` branch disabled. Add an injected-mountinfo test with a mount at `<top>` and target `<top>/inner`; expect `/lies under a bind mount/`.
- **L11:** the walk's readdir error made to fail open. The LOW11 test covers lstat only. Add one whose `readdirSync` throws EACCES for `sub`; expect exit 3 and `/could not read/`.
- **M5c:** the `partial W` line disabled. Add a test that stubs a partial row: run through `main` with a forged state, or refactor the print into a small exported formatter and test that directly. Expect `/^partial W .* restore: /`.

Ruling r2 item 7 requires "each existing test made to discriminate, and a mutation shown red." That holds for 7, 8 and 9 as the ruling names them. The same standard applied to HIGH 2's own fix is not met.

## LOW 5. MEDIUM 7's Windows junction gate test is neither added nor recorded as deferred
- The round-1 MEDIUM 7 text requires "the Windows junction gate test (`mklink /J` from a T dir to a sentinel; the sentinel's contents must survive, or the walk must refuse reparse points on win32)."
- The build report's MEDIUM 7 row lists six tests, none of them a junction test, and its "Deviations" section does not mention one.
- Fix, either of:
  - add a `process.platform === "win32"`-only test (skipped elsewhere with a stated reason) that runs `mklink /J` from inside a T dir to a sentinel, calls reclaim live, and asserts the sentinel's contents survive;
  - or record it explicitly in the build report and the lane record as a Windows gate item.

---

## Per-finding status against t1-review.md (14)
| # | Status | Evidence |
|---|---|---|
| HIGH 1 | **Partly closed.** Linked-worktree and repo-with-worktrees ancestors are refused from an unrelated cwd (P1, P1b, P4), and the walk reaches the filesystem root. **Ruling r2's "any `.git`" rule is not met** (finding 1). | P1, P2 |
| HIGH 2 | **Closed for all four original cases.** A tmpfs at the target, a bind at the target, a bind below and a bind above are all refused under `unshare -rm`. An unreadable table fails closed (measured, M8), and st_dev is kept as the second check. Open: the `..` twin (finding 3) and the part-1 test gap (finding 4). | M1-M8 |
| MEDIUM 3 | Closed: try/catch, `absent` on ENOENT, `failed ... (may be partially removed)`, and the loop continues. The M3 mutation is red. | reclaim.mjs:762-772 |
| MEDIUM 4 | Closed. The holder check is at validation, so dry-run says `checked out in worktree`. M4b is red. | :571-574 |
| MEDIUM 5 | Closed: B, W and partial-W lines carry sha and `restore:`. The partial path is untested (finding 4). | :724, :787, :794 |
| MEDIUM 6 | Closed: a prefix-only rewrite that never touches anything below the root. A below-root symlink is still refused (tested). M6 is red. Not measured on a real Mac. | :590-603 |
| MEDIUM 7 | Closed except the junction test (finding 5). M4, M5 and M7 are all red. | mutations |
| MEDIUM 8 | Closed. M1 is red. | |
| LOW 9 | Closed. M2 is red. | |
| LOW 10 | Closed: NaN gives `idle age unknown`, a negative gives `mtime in the future`, and both are tested. | :539 |
| LOW 11 | Closed in code, both lstat and readdir. The readdir half is untested (finding 4). | :86-117 |
| LOW 12 | Closed in path-safety.mjs (L12 is red). **Twins remain in reclaim.mjs** (finding 3). | |
| LOW 13 | Closed: finishST re-runs immediately before rmSync, using the cached repoRoots. L13 is red. | :754-759 |
| LOW 14 | Closed: a preCheck with `repoRoots: []`, then the repo-root equality check, then the list, then the full check. That is the old order. The absent-with-failing-list test is red under mutation. | work-record.mjs:2021-2061 |

## Regression hunt (task 3)
- **The ancestor walk's cost:**
  - One lstat per ancestor, plus one `git worktree list` spawn only when an ancestor holds a `.git` dir with an empty `worktrees/`. Finding 1's patch removes that spawn entirely.
  - A whole dry-run takes 0.069 s wall time (measured), and the full suite's time is unchanged (30.1 s).
  - LOW 13's recheck doubles this per S/T target, which is negligible.
- **Symlinked ancestors:**
  - checkRemovablePath's realpath-equality check runs before the ancestor walk, so `<T>/link/src` and a symlinked `delegation-*` top are both refused (measured).
  - A `.git` that is a symlink is refused (`!isDirectory()`).
  - MEDIUM 6's rewrite alters only the root prefix.
- **Windows drive roots:**
  - The loop stops at `path.dirname(d) === d`. With path.win32, `C:\a\b` reaches `C:\` and `\\srv\share\a\b` reaches `\\srv\share\`, each in 2 steps, and `C:\` stops at once (measured).
  - checkAncestorsForGit uses `path`, not `pImpl(ctx)`. It is correct on a real win32 host. A win32 fixture on Linux degrades to `.` and stops, which is harmless.
- **The mount check when the table is unreadable:**
  - Fails closed on Linux, as measured by M8 (tmpfs over /proc in the namespace) and by the injected test.
  - On darwin, a failing `mount` also returns null, which refuses.
  - win32 skips the table by design; junctions are finding 5.
- **Note (not counted):** readMountPoints realpaths every mount point on the host (28 here). On Linux, mountinfo paths are already canonical, so that realpath adds nothing. It does touch unrelated mounts, and a stale hard NFS mount can block. Consider a textual prefilter against the class root before any realpath.

## Scratch left in place (nothing deleted)
- /var/tmp/l59r2-scratch-UU2X holds the probe scripts p1.sh, p2.sh and mut.mjs, and fullsuite.log.
- /var/tmp/l59r2-mut-UkKu is the mutation copy, restored and identical to scripts.pristine.
- Fixtures:
  - /var/tmp/l59r2-cwd-*, /var/tmp/l59r2-repo-T5er, /var/tmp/l59r2-sent-IuC9 and /var/tmp/l59r2-mnt-xYyP (unused);
  - /var/tmp/delegation-l59r2p1*, p2*, p3*, p4*, p5*, m[A-G]*, sl*, f8*;
  - the symlink /var/tmp/delegation-l59r2sl2-2605111.
- Some fixtures own registered worktrees. `<T1b>/r` owns /var/tmp/l59r2-repo-T5er/elsewhere, and `<T3>/b.git` owns /var/tmp/l59r2-repo-T5er/bwt. `<T2c>/r`'s tmpwt was already removed. Prune these when the fixtures are cleaned up.
