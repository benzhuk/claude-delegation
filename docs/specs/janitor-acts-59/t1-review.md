VERDICT: NEEDS_FIXES c12e190a9519186f5d5254726138099409b0497c (14)

# Lane 59 T1 review: reclaim and path-safety (b3bb833, b523a5a, c12e190 against dff1e00)

Scope: scripts/path-safety.mjs and its test, scripts/reclaim.mjs and its test, scripts/work-record.mjs, and work-record.test.mjs. The T1 files are byte-identical between c12e190 and HEAD, so every line number below holds at both. work-record.test.mjs has no diff at all against the base, so "imports only" holds trivially.

Read first: spec.md, redteam.md (F1 to F17), ruling-r0.md and ruling-r1.md.

## Gate results (you are the T1 gate)
- **T1 tests.** `TMPDIR=/var/tmp node --test scripts/path-safety.test.mjs scripts/reclaim.test.mjs`: 51 pass, 0 fail.
  - work-record.test.mjs: 245 pass, 0 fail.
  - work-record-closeout.test.mjs, which pins the refactor end to end: 68 pass, 0 fail.
- **Full suite.** `TMPDIR=/var/tmp node scripts/run-tests.mjs`: 3154 tests, 3148 pass, 0 fail, 5 skipped, 1 todo. Leak check: 0 new temp entries. Exit 0.
  - Caveat: the suite ran against the live worktree, which holds T2's uncommitted janitor.mjs, janitor.test.mjs, mirror-shared-skills.mjs and SKILL.md edits. The green result covers T1 as it sits next to T2's in-progress code, not T1 alone next to a frozen T2.

## Denial during this review (reported, not worked around)
- My first probe script ran `git -c user.name=x -c user.email=x@x commit` in a fixture repo under /var/tmp/l59t1-probe-qr63. git-identity-guard refused it: "REFUSED commit — author=<x@x> committer=<x@x> is not an allowed identity."
  - That override was my error. The brief forbids setting a git identity.
  - Nothing was committed. I did not retry with any other identity.
  - The probe was rerun with a plain `git commit` under the configured identity, the same way reclaim.test.mjs's own fixtures commit.

## Probes and mutation checks (all outside the reviewed tree, nothing deleted)
- **Scratch folders:**
  - /var/tmp/l59t1-probe-qr63 holds the probe scripts.
  - /var/tmp/l59t1-p1-*, -p2-*, -p2b-*, -p2c-*, -p3-* and -p4-* hold the fixtures.
  - /var/tmp/l59t1-mut-l1oN is a copy of scripts/ and skills/ for mutation runs. Every mutation was restored, and cmp confirmed the restore.
- **Probes that ran reclaim:** every reclaim call used `--dry-run`, or an fsImpl whose rmSync removes nothing. The mount probes ran inside `unshare -rm` with tmpfs and bind mounts on fixtures only.

---

## HIGH 1. S/T deletes inside a live linked worktree whenever the caller's cwd is not in that worktree's repo
Evidence: probe1, in dry-run with cwd set to a non-repo dir.
- Layout: repo R outside the T root, and a linked worktree `<T>/delegation-lane-XXXX/wt` of R, holding `M src/a.txt` and `?? src/new.txt`.
- Results:
  - `reclaim --dry-run <T>/delegation-lane-XXXX/wt/src` gave `exit=0 would-remove T .../wt/src 3`.
  - `reclaim --dry-run .../wt/src/a.txt` gave `exit=0 would-remove T .../wt/src/a.txt 1`.
  - Only the parent `<T>/delegation-lane-XXXX` was refused, with "contains a linked worktree's .git file".
- Cause:
  - F3's walk (reclaim.mjs:55-105) only looks BELOW the target.
  - C1's "lies inside" direction (path-safety.mjs:112-128) only sees `repoRoots`. reclaim fills those from the repo containing process.cwd() only (reclaim.mjs:261-283).
  - claimW (reclaim.mjs:324-335) claims only a worktree's exact root, so a path inside a worktree falls through to T, and T removes it with fs.rmSync.
  - This bypasses W's SAFE, idle and clean checks entirely. The new convention in docs/subagent-contract.md (`mktemp -d /var/tmp/delegation-...`, then a worktree inside it) makes this layout the normal case.
- Fix: in finishST (reclaim.mjs:285), before the walk, add an upward check from `path.dirname(resolved)` up to, but excluding, `classResult.root`. For each ancestor dir, lstat `<dir>/.git`:
  - ENOENT or ENOTDIR: continue.
  - Any other error: refuse with `could not stat <dir>/.git`.
  - Not a directory (a file or a symlink): refuse with `lies inside a linked worktree at <dir>`.
  - A directory whose `worktrees/` is non-empty: refuse with `lies inside a repo with linked worktrees at <dir>`.

  Compare case-folded on win32 when testing the stop condition. A sketch:
  ```js
  function checkAncestorsForGit(resolved, classRoot, ctx) {
    const fold = (p) => (ctx.platform === "win32" ? p.toLowerCase() : p);
    const stop = fold(path.resolve(classRoot));
    for (let dir = path.dirname(resolved); fold(dir) !== stop && fold(dir).startsWith(stop + path.sep); dir = path.dirname(dir)) {
      const dotGit = path.join(dir, ".git");
      let st = null;
      try { st = ctx.fsImpl.lstatSync(dotGit); } catch (e) { if (!e || (e.code !== "ENOENT" && e.code !== "ENOTDIR")) return { ok: false, reason: `could not stat ${dotGit}` }; }
      if (!st) continue;
      if (!st.isDirectory()) return { ok: false, reason: `lies inside a linked worktree at ${dir}` };
      let names = [];
      try { names = ctx.fsImpl.readdirSync(path.join(dotGit, "worktrees")); } catch (e) { if (e.code !== "ENOENT" && e.code !== "ENOTDIR") return { ok: false, reason: `could not read ${dotGit}/worktrees` }; }
      if (names.length > 0) return { ok: false, reason: `lies inside a repo with linked worktrees at ${dir}` };
    }
    return { ok: true };
  }
  ```
  Add a test: probe1's layout with cwd outside R. Both `wt/src` and `wt/src/a.txt` must be refused, and the edits must survive.
- Predicted outcome:
  - Both probe1 targets are refused.
  - Every existing S/T test stays green, since no fixture has a `.git` above its target.
  - A standalone fixture repo (a `.git` dir with no `worktrees/`) stays removable, consistent with the F3 ruling.

## HIGH 2. The mount check misses a target that IS a mount point, and every same-filesystem bind mount (F3 unmet)
Evidence: probes 2 and 2b, run in dry-run under `unshare -rm`.
- A tmpfs (mode 700) mounted AT `<T>/delegation-mnt-A` (st_dev differs from the root's):
  - `reclaim --dry-run <T>/delegation-mnt-A` gave `exit=0 would-remove T .../delegation-mnt-A 2`.
  - `.../delegation-mnt-A/k` gave `exit=0 would-remove T ... 1`.
- A bind mount of a sentinel dir at `<T>/delegation-mnt-A`, and another at `<T>/delegation-mnt-B/mnt`, on the same filesystem (st_dev identical, measured): both gave `exit=0 would-remove T`.
  - This is exactly the redteam's measured deletion case (F3: `outside/keepdir` was left EMPTY).
- Only a tmpfs mounted BELOW the target was refused: "crosses a mount point at .../delegation-mnt-B/mnt".
- Cause:
  - reclaim.mjs:63 uses the TARGET's own st_dev as the baseline. F3 pinned "different from the class root's st_dev", so a target that is itself the mount root always matches its own children.
  - st_dev cannot see a bind mount within one filesystem at all, although F3 names bind mounts explicitly as the thing to catch.
- Fix, part 1: baseline on the class root. The patch below is exact.
  - Old (reclaim.mjs:55-63):
    ```js
    function walkForMountAndLinkedWorktrees(target, fsImpl) {
      let rootStat;
      try {
        rootStat = fsImpl.lstatSync(target);
      } catch (error) {
        if (error && error.code === "ENOENT") return { ok: true, entryCount: 0, absent: true };
        return { ok: false, reason: `could not stat: ${error.message || error}` };
      }
      const baseDev = rootStat.dev;
    ```
  - New:
    ```js
    function walkForMountAndLinkedWorktrees(target, fsImpl, classRoot) {
      try {
        fsImpl.lstatSync(target);
      } catch (error) {
        if (error && error.code === "ENOENT") return { ok: true, entryCount: 0, absent: true };
        return { ok: false, reason: `could not stat: ${error.message || error}` };
      }
      let baseDev;
      try {
        baseDev = fsImpl.lstatSync(classRoot).dev; // F3: the CLASS ROOT's st_dev, so a target that is itself a mount root is caught
      } catch (error) {
        return { ok: false, reason: `could not stat class root: ${error.code || error}` };
      }
    ```
  - Also change the call site at reclaim.mjs:302: `walkForMountAndLinkedWorktrees(resolved, ctx.fsImpl)` becomes `walkForMountAndLinkedWorktrees(resolved, ctx.fsImpl, classResult.root)`.
- Fix, part 2 (Linux only): catch same-filesystem binds.
  - In finishST, read `/proc/self/mountinfo` once. Field 5 is the mount point; decode its `\NNN` octal escapes.
  - Refuse `crosses a mount point at <mp>` if any mount point equals `check.real` or starts with `check.real + "/"`.
  - Refuse `could not read /proc/self/mountinfo` if the file is unreadable. This fails closed, matching ruling r1.
  - On darwin, part 1's st_dev check is enough, since there is no bind mount there.
- Tests:
  - An `unshare -rm` test, skipped when unshare is unavailable, with a mode-700 tmpfs at the target and a bind mount below the target. Both must be refused, and the sentinel must survive.
  - An injected-fsImpl mountinfo test, so the logic is also covered on hosts without unshare.
- Predicted outcome: all four probe cases are refused. The existing tests stay green (fixtures have no mounts, and the class root and target share a device).

## MEDIUM 3. An rmSync failure is uncaught: a crash mid-loop, with no line for what was already removed
Evidence:
- reclaim.mjs:530 calls `ctx.fsImpl.rmSync(...)` with no try/catch.
- Probe3 used overlapping arguments `<T>/delegation-ov-1 <T>/delegation-ov-1/sub`, with an fsImpl that deletes nothing but throws ENOENT the way `force:false` does.
  - Result: `main THREW: ENOENT`, after printing `removed T .../delegation-ov-1 2`.
- The same crash follows an EBUSY on a mount root, or an EACCES partway through a tree.
- In each case the process dies with a stack trace (exit 1 via an uncaught exception), later arguments never run, and a partial removal prints nothing.
- Exact patch. Old (reclaim.mjs:529-533):
  ```js
      if (result.class === "S" || result.class === "T") {
        ctx.fsImpl.rmSync(result.resolved, { recursive: true, force: false });
        ctx.print(`removed ${result.class} ${rawArg} ${result.entryCount}`);
        continue;
      }
  ```
  New:
  ```js
      if (result.class === "S" || result.class === "T") {
        try {
          ctx.fsImpl.rmSync(result.resolved, { recursive: true, force: false });
          ctx.print(`removed ${result.class} ${rawArg} ${result.entryCount}`);
        } catch (error) {
          if (error && error.code === "ENOENT") {
            ctx.print(`absent ${rawArg}`); // e.g. already removed with an earlier, enclosing argument
          } else {
            runtimeFailure = true;
            ctx.print(`failed ${result.class} ${rawArg}: ${(error && error.code) || "error"} (may be partially removed)`);
          }
        }
        continue;
      }
  ```
- Predicted outcome:
  - Probe3 prints `removed T ...ov-1 2` then `absent ...ov-1/sub`, and exits 0.
  - An EBUSY prints a `failed` line, and the run exits 1 after processing every argument.
- Add a test with an fsImpl whose rmSync throws EACCES: expect exit 1 and a `failed` line.

## MEDIUM 4. B does not refuse a branch checked out in a worktree, and its dry-run claims it would remove it
Evidence: probe3/P4.
- Setup: a merged branch `feat` still checked out in a SAFE linked worktree, with now set 25 h ahead.
- `reclaim --dry-run --branch feat --repo <repo>` gave `exit 0 would-remove B feat dc644af...`.
- validateB (reclaim.mjs:367-379) trusts `state.safe.branches`. classify deliberately marks such a branch SAFE when its worktree is also SAFE, because it expects the worktree to be removed first (janitor.mjs, the `removedHere` set).
- reclaim narrows the state to the branch alone, so a live run reaches applySafe's `stillCheckedOut` guard and fails with exit 1 and "still checked out in a worktree".
- Nothing is deleted, since applySafe and `git branch -D` both guard. But the brief's contract, "B refuses a branch checked out anywhere", is not met at validation, and dry-run output lies.
- Exact patch. Old (reclaim.mjs:373-378):
  ```js
    const safeMatch = state.safe.branches.find((b) => b.ref === name);
    if (!safeMatch) {
      const judgMatch = state.judgment.branches.find((b) => b.ref === name);
      return { ok: false, reason: judgMatch ? judgMatch.reason : "not SAFE" };
    }
    return { ok: true, root, mainBranch: config.main_branch || "main", safeMatch, fetch: state.fetch };
  ```
  New:
  ```js
    const safeMatch = state.safe.branches.find((b) => b.ref === name);
    if (!safeMatch) {
      const judgMatch = state.judgment.branches.find((b) => b.ref === name);
      return { ok: false, reason: judgMatch ? judgMatch.reason : "not SAFE" };
    }
    const wts = listWorktrees(root);
    if (wts === null) return { ok: false, reason: "could not read git worktree list" };
    const holder = wts.find((w) => w.branch === name);
    if (holder) return { ok: false, reason: `checked out in worktree ${holder.path}` };
    return { ok: true, root, mainBranch: config.main_branch || "main", safeMatch, fetch: state.fetch };
  ```
- Predicted outcome:
  - P4 gives exit 3 with `refused feat: checked out in worktree <path>`.
  - The B happy-path test stays green, since it removes the worktree first.
- Add P4 as a test.
- Verified sound, confirmed by probe P5 and the existing test:
  - an unmerged branch is refused (exit 3);
  - `main` asked for through a linked-worktree `--repo` is refused as "not SAFE".

## MEDIUM 5. W and B removals drop the restore hint that applySafe computed; a partial W removal prints no sha at all (F2 and ruling r1, findings 3 to 5)
Evidence:
- applySafe's rows carry `sha` and `restore` (janitor.mjs, the worktree-remove and branch-delete rows), including `partial: true` rows.
- reclaim prints only `removed W <arg> <sha>` (reclaim.mjs:545) and `removed B <name> <sha>` (:503).
- A partial W removal, where git has deregistered the worktree and emptied its contents, goes to stderr as a bare error at reclaim.mjs:548, with no sha and no restore hint. Ruling r1 finding 3 names this as the case that "most needs a restore line".
- reclaim writes no durable record. Its stdout is the only record, so the restore hint must appear there.
- Fix, exact:
  - reclaim.mjs:503: `ctx.print(\`removed B ${parsed.branch} ${row.sha || ""}\`.trimEnd());` becomes `ctx.print(\`removed B ${parsed.branch} ${row.sha || ""}${row.restore ? \` restore: ${row.restore}\` : ""}\`.trimEnd());`
  - reclaim.mjs:545: `ctx.print(\`removed W ${rawArg} ${row.sha || ""}\`.trimEnd());` becomes `ctx.print(\`removed W ${rawArg} ${row.sha || ""}${row.restore ? \` restore: ${row.restore}\` : ""}\`.trimEnd());`
  - reclaim.mjs:546-548, the else branch: before the stderr write, add `if (row && row.partial) ctx.print(\`partial W ${rawArg} ${row.sha || ""}${row.restore ? \` restore: ${row.restore}\` : ""}\`.trimEnd());`
- Predicted outcome: the W happy-path test's stdout gains ` restore: git -C '<root>' worktree add '<wt>' <sha>`. Existing regexes (`/^removed W /`) stay green. Add an assertion on `restore:`.
- S and T keep the entry count and no restore, which is inherent to an fs delete and is what C2 pins.

## MEDIUM 6. T (and F4's root rewrite) is dead on darwin for the convention's own paths
Evidence:
- tRoots realpaths each root (reclaim.mjs:211-217), so on macOS the roots become `/private/tmp` and `/private/var/tmp`.
- The argument is never rewritten. F4 requires: "If the argument starts with R, that prefix is rewritten to the root's realpath before any check."
- On macOS, `mktemp -d /var/tmp/delegation-x-XXXX` prints `/var/tmp/...`. `path.relative("/private/var/tmp", "/var/tmp/delegation-x-ab12")` starts with `..`, so the path falls through to "not S, T, or a live worktree - unrecognized".
- This is safe (a refusal), but on the Mac every agent falls back to rm, so the lane's own measure cannot move there.
- Fix: in validateArg, after `const resolved = path.resolve(rawArg)` (reclaim.mjs:386), rewrite a root prefix on POSIX. It never touches anything below the root, so the realpath-equality check still refuses every symlink under it.
  ```js
  let resolved = path.resolve(rawArg);
  if (ctx.platform !== "win32") {
    for (const base of [ctx.posixTmpRoot, ctx.posixVarTmpRoot]) {
      let real;
      try { real = ctx.fsImpl.realpathSync(base); } catch { continue; }
      if (real !== base && resolved.startsWith(base + path.sep)) { resolved = real + resolved.slice(base.length); break; }
    }
  }
  ```
  The `const` becomes `let`.
- Test: set `posixVarTmpRoot` to a symlink pointing at a real fixture dir. A `delegation-*` argument given through the symlink must be accepted, and rmSync must receive the real path. A symlink one level BELOW the root must still be refused.
- Predicted outcome: a no-op on Linux, and on darwin `/var/tmp/delegation-*` works.

## MEDIUM 7. Tests the red-team findings require are missing, and mutations to the code they cover survive (a check that passes because it isn't looking)
Mutation evidence, from the scratch copy /var/tmp/l59t1-mut-l1oN: reclaim.test.mjs stays 31/31 green under each of these.
- M4: the win32 S rule changed to accept any `claude*` first segment (reclaim.mjs:171). This is F4's `claude-verify.lock` hazard, and no test fails.
- M5: the walk's st_dev comparison disabled (reclaim.mjs:73). No test fails.
- M7: the group- or world-writable check disabled (reclaim.mjs:126). No test fails. Only the owner test catches M3, which disables both halves.

Missing tests, each required by an adopted finding:
- **F3:** a bind-mount refusal test (skip when `unshare -rm` is unavailable), and the Windows junction gate test. The junction test needs a `mklink /J` from a T dir to a sentinel; the sentinel's contents must survive, or the walk must refuse reparse points on win32.
- **F4:** platform-injection tests for:
  - the Windows `claude` segment accepted;
  - a `claude-verify.lock` sibling refused;
  - darwin S refused with `S class unmeasured on darwin`.
- **F6:** a mode 0o775 `delegation-*` dir refused with "group- or world-writable", and the same for a `claude-<uid>` dir.

Fix: add the tests above. Each must fail under the matching mutation. Re-run the M4, M5 and M7 mutations to confirm that they now turn the suite red.

## MEDIUM 8. The repoRoots test in reclaim.test.mjs passes with reclaim's repoRoots wiring deleted
Evidence:
- Mutation M1 replaced `repoRoots: repoRoots.repoRoots,` with `repoRoots: [],` (reclaim.mjs:290). The suite still passed 31/31.
- The test at reclaim.test.mjs:306-329 asserts only `/contains/`. Its fixture repo has a linked worktree, so without repoRoots the F3 walk refuses with "contains a repo with linked worktrees elsewhere", which also matches `/contains/`.
- Exact patch. At reclaim.test.mjs:327, `assert.match(c.lines[0], /contains/);` becomes `assert.match(c.lines[0], /contains a path in git worktree list/);`
- Predicted outcome: green as written, because the repoRoots order is [toplevel of cwdWt, repo, cwdWt] and the target contains `repo`, which is a worktree-list entry. It turns red under M1.

## LOW 9. The kill-switch test ignores the switch name
- Mutation M2 changed `switchedOffImpl("reclaim")` to `switchedOffImpl("janitor-act")` (reclaim.mjs:477). The suite stayed green, because the test injects `() => true`.
- Exact patch. At reclaim.test.mjs:136, `const ctx = baseCtx({ switchedOffImpl: () => true });` becomes `const ctx = baseCtx({ switchedOffImpl: (name) => name === "reclaim" });`
- The code itself is verified correct:
  - switchedOff("reclaim") checks `ws-off` and `ws-off-reclaim` under AGENTS_HOME, and treats a non-ENOENT stat error as present (project-config.mjs:57-62);
  - reclaim checks it before any validation, and returns exit 3 with one `refused <arg>: reclaim switched off` line per argument.

## LOW 10. W labels an unknown or future idle age "active in last 24h" (ruling r1: never a confident label)
- At reclaim.mjs:352-353, NaN (an unreadable source) and negative values are refused correctly, but under a confident reason.
- Exact patch. Old:
  ```js
    if (!(hrs >= IDLE_FLOOR_HOURS)) {
      return { ok: false, reason: "active in last 24h" };
    }
  ```
  New:
  ```js
    if (!(hrs >= IDLE_FLOOR_HOURS)) {
      const reason = Number.isNaN(hrs) ? "idle age unknown" : hrs < 0 ? "mtime in the future" : "active in last 24h";
      return { ok: false, reason };
    }
  ```
- Predicted outcome: the F1 test (/active in last 24h/) stays green. This matches applySafe's own labels.

## LOW 11. The F3 walk fails open on unreadable entries
- reclaim.mjs:66-71 treats any lstat error as "vanished". reclaim.mjs:89-94 treats any readdir error as an empty dir.
- An unreadable subdirectory therefore hides a `.git` file or a mount below it from the walk. rmSync then deletes the readable siblings and throws, which is MEDIUM 3's crash.
- Fix:
  - In visit's lstat catch, `return` only on ENOENT, otherwise `throw new WalkRefusal(\`could not stat ${p}\`)`.
  - In the readdir catch, `throw new WalkRefusal(\`could not read ${p}\`)` unless the code is ENOENT.
- Predicted outcome: a mode-000 subdir refuses the whole invocation before anything is removed.

## LOW 12. `..`-prefixed segment names read as "outside" in path-safety's containment tests (and in janitor's pathWithin)
Evidence: probe4.
- A repoRoots entry at `<scratch>/..repo` with target `<scratch>` returned `{"ok":true}`, so "contains the repo root" was missed.
- `pathWithin(<scratch>/..repo, <scratch>)` returned `false`, so reclaim's cwd check (reclaim.mjs:390) would allow removing a dir that contains a cwd named `..work`.
- Old code had the same pattern, so the refactor preserved it. The failure direction is allow.
- Exact patch in path-safety.mjs:
  - add `const escapes = (rel) => rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);`
  - :68 `if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) continue;` becomes `if (rel === "" || escapes(rel)) continue;`
  - :110 `return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));` becomes `return rel === "" || !escapes(rel);`
  - :114 `return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);` becomes `return rel !== "" && !escapes(rel);`
- The same one-line change is needed in janitor.mjs's `pathWithin`. That is T2's file, so it goes to T2 as a seam note.
- Predicted outcome: probe4 refuses with "contains the repo root". Every current test stays green.

## LOW 13. The check-to-delete window spans every other argument's validation, including W's git fetch
- All arguments are validated first (reclaim.mjs:511), then removed (:519-550). The window between a T target's checks and its rmSync can include network fetches for later W arguments.
- The redteam accepted the same-uid TOCTOU, since the sticky or 0700 ancestors mean only this uid can swap a dir for a symlink. The spec should state that acceptance.
- Cheap fix: immediately before each S or T rmSync, re-run `finishST(result.class, result.resolved, {root: <class root>}, ctx)`. On a refusal, print `failed ... changed since validation`.
  - To support this, keep the class root on the validation result.
- Predicted outcome: the window shrinks from seconds to microseconds.

## LOW 14. The work-record refactor is not byte-identical when `git worktree list` fails; the change only adds refusals
- New: work-record.mjs:2015 calls `listWorktreesImpl(root)` BEFORE checkRemovablePath runs its host-absolute, root, lstat, symlink, realpath and home checks.
- Old (dff1e00 work-record.mjs, removeScratchDirectory): the list ran only after all of those, and after the `is the repo root` equality check.
- Effects:
  - With a failing list, an ABSENT target now returns `refused: could not read git worktree list` instead of `absent`, which can stop a closeout that used to proceed.
  - A non-absolute or out-of-root target reports the list failure instead of its own reason.
  - `git worktree list` is also spawned for targets that the old code refused without it.
- Fix: keep path-safety's signature, and call it twice.
  1. Call `checkRemovablePath(scratchPath, { ...opts, repoRoots: [] })`. Return absent or refused as now.
  2. If it passed, `if (root && cmp(path.resolve(root), resolved)) return refused "is the repo root"`.
  3. Only then call `listWorktreesImpl(root)`. If it returns null, refuse.
  4. Call `checkRemovablePath` again with the full repoRoots.
- Predicted outcome: the old order is restored exactly, and the 245 plus 68 work-record tests stay green.

---

## Verified absences and answers to the brief

**1. Can reclaim delete outside S, T, W and B?** Yes, through HIGH 1 (inside a live worktree) and HIGH 2 (mount roots and bind mounts). Every other vector was checked and holds:
- **A symlink as the target:** refused (lstat, path-safety.mjs:85); tested.
- **A symlinked ancestor:** refused (realpath equality, :98); tested (mutation M9 turned 2 tests red).
- **The owner and mode checks** use statSync, which follows links. A symlinked top dir then fails lstat or realpath in C1 anyway, so this is safe.
- **`..`:** refused lexically on the raw argument, split on both separators (reclaim.mjs:31-36), before any resolve. Every fs call receives `path.resolve()`d strings.
- **Trailing separators and `.` segments:** `path.resolve` strips them before lstat, so `link/` cannot make lstat follow the link.
- **Case-folding:**
  - win32 compares case-insensitively throughout (the T prefix `/i`, the S `claude` segment, the session id, the tmpdir equality).
  - On darwin, a case mismatch lands outside the root prefix and is refused.
  - I found no false-accept path.
- **The repo root:** the main worktree is refused by claimW (`is the main worktree`, tested). The cwd repo root and its worktree-list paths are refused by repoRoots (tested, though weakly; see MEDIUM 8).
- **HOME:** refused (tested). **`/`:** always refused, because it contains process.cwd() (reclaim.mjs:390).
- **path-safety's drive/filesystem-root check (path-safety.mjs:101) is unreachable.** A target strictly under a root can never be a root, and mutation M8 leaves every test green. This is harmless defense in depth; I am not counting it as a finding.
- **isDurablePath:** a durable path is never under the fixed /tmp or /var/tmp roots, so S and T cannot reach it.
  - W refuses a main worktree.
  - The shim's REPO is required to be non-linked (mirror's isLinkedWorktree, T2), so W cannot remove the shim's own target.
- **Another session's scratch (F5):** refused. The session segment must equal CLAUDE_CODE_SESSION_ID, and an unset id refuses. Both are tested.
- **Another uid's `claude-<uid>`** falls to T and is refused by the `delegation-` prefix rule.
- **S on Windows follows F4:** the literal `claude` segment, with tmpdir required to equal `<home>\AppData\Local\Temp`, but it is untested (MEDIUM 7). S on darwin is refused, as F4 requires until measured.
  - Windows gate item, not counted: if os.tmpdir() returns an 8.3 short path, S and T are refused on that host. The Windows gate should record os.tmpdir() next to `<home>\AppData\Local\Temp`.
- **Roots never come from the environment:** fixed `/tmp` and `/var/tmp`, and reclaim never reads DELEGATION_SCRATCH_ROOTS or TMPDIR (F6).

**2. W's idle floor.**
- Every W path applies it: validateW (reclaim.mjs:351-354) for both dry-run and live, and applySafe again under `act: true`.
- idleHours returns NaN for any unreadable source (janitor.mjs, idleHours). `!(hrs >= 24)` treats NaN and negative values as active. Only the label is wrong (LOW 10).
- Mutation M6 (the validateW check removed) turns the F1 test red.
- **Uncommitted and ignored files:** only a SAFE row passes, and SAFE requires isTreeClean.
  - isTreeClean runs `status --untracked-files=all --ignored=matching` plus the `ls-files -v` skip-worktree and assume-unchanged scan.
  - applySafe re-runs isTreeClean immediately before an unforced `git worktree remove`.
  - A test covers only an untracked file. Adding an ignored-file case (for example `node_modules/`) and a modified tracked file is recommended; this is folded into MEDIUM 7's test work.
- **Fetch failure:** makes the worktree UNVERIFIABLE (JUDGMENT) and refused.
- **W removal:** only ever through applySafe, never through fs.

**3. B.**
- An unmerged branch is refused at validation (tested).
- A checked-out branch is never deleted: applySafe's `stillCheckedOut` guard and git both stop it. It is not refused at validation, and dry-run mis-reports it (MEDIUM 4).
- The tip is re-checked against origin before `-D`, by applySafe.

**4. The work-record refactor, function by function against dff1e00.**
- **Host-absolute:** the regex and reason string are identical.
- **Root membership:** the same resolve, relative and skip logic. The `--by` whole-segment predicate is identical, including win32 case-folding. The reason string is passed in unchanged.
- **lstat:** ENOENT gives absent, any other error gives `could not stat: <msg>`, a symlink is refused, and a non-directory is refused. `allowFile` is not passed, so a file is still refused.
- **realpath:** a failure gives absent, and a mismatch gives "a symlinked ancestor". Both are identical.
- **fs root and home:** identical, and `home` is passed as `os.homedir()`.
- **Repo checks:** equality, then contains, then lies-inside. Within each pass, repo root before worktrees, with the same four reason strings.
- **Remove:** `rmSync(path.resolve(scratchPath), {recursive: true})`, the same as the old `resolved`.
- **The only difference is ordering when the list fails** (LOW 14), and it only adds refusals. No refusal became an allow. Mutations M9 and M10 turn the path-safety and closeout tests red, so the refactor's checks are genuinely pinned.

**5. The kill switch and exit codes.**
- F14 is honored (LOW 9 covers the test gap).
- Exit codes:
  - 2 for usage errors, including an unknown flag, `--branch` without `--repo`, and `--branch` combined with paths;
  - 3 for any refusal, in which case nothing is removed (tested: one bad argument among good ones);
  - 0 for success, dry-run, or all arguments absent;
  - 1 when a W or B apply step fails.
  - MEDIUM 3's uncaught throw also produces exit 1, but with a stack trace.
- F2 record: W and B output carries the sha but drops the restore hint, and a partial W removal drops both (MEDIUM 5).
- S and T print the entry count, as C2 pins.

**6. Tests that check nothing** (each confirmed by mutation):
- MEDIUM 8: the repoRoots test.
- LOW 9: the kill-switch name.
- MEDIUM 7: the win32 S segment, the st_dev walk, and the mode check. Each is untested, and the mutation survives.
- Weak but still discriminating: "W: refused when younger than the classify-level age floor" matches `/...|not SAFE/`, which is the generic fallback. It still fails if the worktree were removed.
