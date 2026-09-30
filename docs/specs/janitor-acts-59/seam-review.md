VERDICT: NEEDS_FIXES 4a11867cf151e1f0e4f4ef62588a3d144c912242 (3)

# Lane 59 seam and closing review: janitor acts (T1 + T2 at 4a11867)

Scope: the seams between T1 (path-safety.mjs, reclaim.mjs, work-record.mjs) and T2 (janitor.mjs, install-janitor-timer.mjs, mirror-shared-skills.mjs, SKILL.md, subagent-contract.md), LOW 1 at 4a11867, and a final safety pass on `git diff dff1e00..4a11867`.

Method:
- Read-only against /var/tmp/lane-59/wt. `git status --short` is empty at the end.
- HEAD moved to 8b8177d during the review. That commit is docs only (t1-low1-build.md and the work record). `git diff 4a11867 8b8177d -- scripts skills` is empty, so every code verdict here holds for both.
- Scratch dirs, all made with mktemp under /var/tmp. Nothing was deleted.
  - /var/tmp/l59seam-9b2l holds the probes, the full-suite log and a scratch clone for the restore hints.
  - /var/tmp/l59seam-fx-ZB3B is a no-commit fixture repo.
  - /var/tmp/l59seam-mut-G8xK is a `git archive 4a11867` copy used for the trial fixes.
  - /var/tmp/delegation-l59seam-fE1P is a T fixture.
- No janitor, reclaim or installer ran against a real path. reclaim ran only in `--dry-run`, and only on the T fixture, with a scratch AGENTS_HOME. writeRecord ran only into scratch dirs.
- Finished 8:46 PM NY, 9/29.

## Denials (reported, not routed around)
1. **Identity guard.** My fixture command carried `git -c user.name=... -c user.email=...` for a commit. The git-identity-guard hook blocked it before it ran, and nothing was created. That was my error: it broke the "never set a git identity" rule. I stopped that step. I made no commit in any fixture, under any identity. The later fixtures need no commit: an `init`-only repo, and a `git clone` of the reviewed worktree.
2. **rm hook.** A probe had `rm -f <scratch>/agents/ws-off-reclaim` chained at its end, and the rm hook blocked it. I re-ran the productive part without the rm, as the hook instructs. The switch file stays in scratch at /var/tmp/l59seam-9b2l/agents-off/ws-off-reclaim.

## Gate
`TMPDIR=/var/tmp node scripts/run-tests.mjs`, run once:
- 3190 tests: 3183 pass, 0 fail, 6 skipped, 1 todo;
- leak check: 0 new temp entries; exit 0;
- log at /var/tmp/l59seam-9b2l/fullsuite.log.

## 1. LOW 1 confirmed: verbatim, nothing else changed
- I extracted t1-review-r3.md's "Current" and "Replacement" blocks programmatically:
  - the Current block occurs exactly once in `git show 3c555f2:scripts/reclaim.test.mjs`;
  - applying the Replacement to that file gives a string byte-identical to `git show 4a11867:scripts/reclaim.test.mjs`.
- `git show --stat 4a11867` touches only scripts/reclaim.test.mjs (+19/-8).
- LOW 2 is also closed, in a1ea112. Both t1-fix2-build.md and /var/tmp/lane-59/t1-fix2-report.md now carry 3c555f26c55051b9ca29bcffb90a9fea547b13c6, and `git cat-file -t` on it prints `commit`.
- Not a finding: the new win32 context omits `switchedOffImpl`, so it reads the real kill switches. So does every baseCtx test. run-tests.mjs seals HOME and AGENTS_HOME, so the gate stays hermetic, including on Windows.

## 2. Seams: verified sound (first-class findings)

**idleHours and "unknown idle" agree on both sides.**
- janitor's idleHours (janitor.mjs:1149-1322) returns NaN for any unreadable source and for "no mtimes at all".
- reclaim's W check (reclaim.mjs:601-607) and applySafe (janitor.mjs:1465-1478) both use `!(hrs >= IDLE_FLOOR_HOURS)`. Both refuse NaN, negative values and anything under 24. Both use the same three labels: `idle age unknown`, `mtime in the future`, `active in last 24h`.
- This matches ruling r1. The T2 r2/r3 seam note (a NaN refusal labelled "active") is closed by T1's LOW 10 fix.
- reclaim passes `now` as a Date. idleHours normalises it with `new Date(now).getTime()`, so the pinned seam's number/Date difference is harmless.
- W is checked twice: once in reclaim, and again inside applySafe, because reclaim's narrowed state sets `act: true`. The in-use probe and the F16 isTreeClean re-check come with the second check.

**applySafe row shapes match what reclaim reads.**
- reclaim reads `row.ok`, `row.partial`, `row.sha`, `row.restore`, and `row.error || row.skipped` (reclaim.mjs:789-797, :853-866).
- janitor emits exactly those keys on each row kind:
  - worktree success: `ok, sha, restore`;
  - partial: `ok:false, partial, sha, restore, error`;
  - skip: `skipped`;
  - branch success: `ok, sha, restore`;
  - branch failure: `error`.
- There is no key drift.

**The mirror shim matches reclaim's CLI.**
- The sh shim is `exec "$node_bin" "$note_script" "$@"`, and the cmd shim is `node "%NOTE_SCRIPT%" %*` followed by its own `exit /b %ERRORLEVEL%` line (mirror-shared-skills.mjs:594-633). The target is `REPO/scripts/reclaim.mjs`. The shim is published only when `isDurablePath(REPO)` holds and REPO is not a linked worktree.
- I measured it through an identical sh shim on PATH, against the T fixture:

  | invocation | output | exit |
  |---|---|---|
  | `--dry-run <T>` | `would-remove T ... 2` | 0 |
  | `--dry-run <T>/f.txt` | `would-remove T ... 1` | 0 |
  | no path | usage error | 2 |
  | `--json` | `unknown flag` | 2 |
  | `--branch` without `--repo` | usage error | 2 |
  | `<T>/../x` | `refused ...: contains ..` | 3 |
  | `ws-off-reclaim` present | `refused ...: reclaim switched off` | 3 |
  | global `ws-off` present | same refusal | 3 |

- The kill-switch name (`switchedOff("reclaim")`, so `~/.agents/ws-off-reclaim`) matches SKILL.md.
- The allow lines `Bash(reclaim *)` and the Codex `prefix_rule(["reclaim"])` both match the bare shim name.

**The installer's argv matches janitor's flags.**
- `scheduledCommandArgv` gives `[node, <plugin>/scripts/janitor.mjs, --record, --repo, <r>, (--host, <h>), --apply]`, measured with and without a host. The collect job still has no `--apply`.
- janitor's parseFlags treats the argv this way:
  - `--apply` is found with `argv.includes`;
  - `--record` is followed by `--repo`, so the record goes to the default dir;
  - `--host` takes its value;
  - `--repo` is inert, as before;
  - no `--no-fetch` is present, so the `--apply` refusal at janitor.mjs:2159 does not fire.
- `switchedOff("janitor-act")` is checked only when `applyFlag` is set, and the record is written after apply (in the catch path too).

**Every restore hint works** (measured in a scratch `git clone` of the worktree, no identity needed):
- worktree hint `git -C '<root>' worktree add '<path>' <sha>`:
  - into an absent path (the state after a remove): exit 0, HEAD = sha;
  - into a leftover empty directory (the partial / Windows-shell case): works;
  - while the branch is still checked out in another worktree: works, because the add is detached.
- branch hint `git -C '<root>' branch '<name>' <sha>`: exit 0, ref = sha.
- The Windows double-quote form is not measured here; the Windows gate covers it.

**The daily act removes nothing outside its SAFE class.**
- janitor.mjs's only destructive calls are `git worktree remove` (:1540), `git branch -D` (:1635) and the win32 rename-and-back probe (:1497, :1504).
- It has no rmSync or unlink, and it never calls reclaim or touches S/T.
- A branch delete needs a live fetch from this run, the tip re-verified, and the branch not checked out.

**reclaim removes only S, T, W and B.**
- Its one fs deleter, rmSync at reclaim.mjs:832, runs only after `finishST` passes, and `finishST` runs again immediately before the delete.
- `finishST` covers path-safety, the ancestor `.git` and bare-repo walk, the downward mount and linked-worktree walk, and the mount table.
- W and B go only through applySafe.
- checkS and checkT still use `rel.startsWith("..")` (:403, :472). That only fails to *classify* a `..x` path, which then ends as `unrecognized`, so it fails closed. It is not a finding.

**Recorded, not counted.**
- By contract (redteam F3, "standalone fixture repos stay removable"), T removes a plain repo inside a delegation dir, even one with unpushed commits. It does so only when that path is named explicitly, and never from the daily act.
- A reclaim W/B removal is recorded only on stdout (`removed W <arg> <sha> restore: ...`), per ruling r2. No evidence file is written.

---

## MEDIUM 1. janitor's `pathWithin` still has the `..`-prefix twin, and the daily act's open-shell guard fails open through it
Evidence:
- janitor.mjs:1695: `return rel === "" || (!rel.startsWith("..") && !pathImpl.isAbsolute(rel));`. This is the exact defect T1 LOW 12 fixed in path-safety.mjs:70 and MEDIUM 3 fixed in reclaim.mjs:53. The T1 r2 seam note sent it to T2, and it was never fixed.
- In the daily act, it is the containment test for all three liveness checks:
  - the linux `/proc/*/cwd` probe (:1401);
  - the darwin lsof probe (:1416);
  - the Codex rollout-cwd match inside idleHours (:1314).
- Measured with a fixture repo /var/tmp/l59seam-fx-ZB3B/repo and a live `sleep` whose cwd is `<repo>/..live`:
  - `readlink /proc/<pid>/cwd` gives `<repo>/..live`;
  - `pathWithin(that, <repo>)` gives **false**;
  - `pathWithin(<repo>/live, <repo>)` gives true;
  - `isTreeClean(<repo>)` with the empty `..live` dir present gives **true**, because git never lists empty dirs.
- The chain in the act:
  1. A SAFE worktree has been idle 24 h or more (an idle shell touches no mtime).
  2. A shell sits in `<wt>/..<name>`.
  3. worktreeHasOpenProcess returns false, and isTreeClean passes.
  4. `git worktree remove` runs. Redteam F1 measured that it succeeds under a live cwd.

  The shell loses its cwd. That is the "stalled" half of this lane's measure, and it contradicts ruling r1's "doubt resolves to do not remove".
- A Codex session whose cwd is under a `..`-named dir is also not counted as activity. Claude transcripts are still caught by the `slug-` prefix match.
- The same twin weakens closeoutWorktree's cwd refusal (:1718). That is pre-existing, and the same patch fixes it.

Fix (exact), in scripts/janitor.mjs:1695. Current:
```js
  return rel === "" || (!rel.startsWith("..") && !pathImpl.isAbsolute(rel));
```
Replacement:
```js
  // Seam review: only an exact ".." segment (or one followed by a separator) escapes - a real
  // directory named "..live" is inside. The looser test failed toward "not inside", i.e. toward
  // removing a worktree with a live shell parked in such a dir (path-safety LOW 12's twin).
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${pathImpl.sep}`) && !pathImpl.isAbsolute(rel));
```
Add a test to janitor.test.mjs:
- `pathWithin(path.join(d, "..live"), d)` is true;
- `pathWithin(path.join(d, ".."), d)` is false;
- the win32 form `pathWithin("C:\\a\\..x", "C:\\a", { platform: "win32", pathImpl: path.win32, realpath: (p) => p })` is true.

Predicted outcome, trial-applied on the scratch copy /var/tmp/l59seam-mut-G8xK:

| call | result |
|---|---|
| `<wt>/..live` | true |
| `<wt>/live` | true |
| `<wt>/..` | false |
| `<wt>-sib` | false |
| `/` | false |
| win32 `C:\a\..x` inside `C:\a` | true |
| win32 `C:\b` inside `C:\a` | false |

- `node --test` of janitor, reclaim and work-record-closeout on the patched copy gives 252 tests, 249 pass, 0 fail, 3 skipped.
- reclaim's `samePathResolved` only needs equality, which is unaffected.

## MEDIUM 2. A second run on the same day overwrites the act's `removed` list, the only durable record of what was deleted and at which sha (F2)
Evidence:
- writeRecord writes `path.join(targetDir, `${dateStr}-${host}.json`)` with plain `writeFileSync` (janitor.mjs, the `jsonPath` line in writeRecord), so a later run the same NY date replaces the file.
- SKILL.md:148 has the integrator run `janitor --record` and then `janitor --apply` after every accepted build. So on any day a lane lands after the 06:00 timer, the timer's `removed` rows are overwritten, by `act: "not-requested", removed: []` or by the second run's own list.
- After that, the names and shas survive only in `~/.agents/janitor/last-run.log`, which the next timer run truncates, and the drift line keeps only a count.
- Measured in scratch: the first call (`act: applied`, 2 removals) wrote `2026-09-29-h.json` with 2 `removed` rows. A second call the same day, at 20:00Z (16:00 NY), rewrote the same path with `act= not-requested removed= []`. drift.md kept both lines (`removed=2`, `removed=0`).
- This collision already happens on the real hosts. The repo holds `docs/work/evidence/janitor/2026-09-29-ben-desktop-0601.json` next to `2026-09-29-ben-desktop.json`: the 06:01 timer record was renamed by hand in 4a56cb6 to survive a later same-day run.
- Nothing in scripts/ or skills/ reads these JSON files by name, so a suffix breaks no consumer.

Fix (exact), in scripts/janitor.mjs writeRecord. Current:
```js
  const jsonPath = path.join(targetDir, `${dateStr}-${host}.json`);
```
Replacement:
```js
  // Seam review: a later same-day run (the integrator's `janitor --record`, a hand `--apply`) must
  // never overwrite an earlier run's `removed` list - it is the only durable name+sha of what an act
  // deleted. On a collision the new record gets the NY wall-clock time as a suffix instead.
  let jsonPath = path.join(targetDir, `${dateStr}-${host}.json`);
  if (existsSync(jsonPath)) {
    const hms = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now).replace(/:/g, "");
    jsonPath = path.join(targetDir, `${dateStr}-${host}-${hms}.json`);
  }
```
`existsSync` is already imported. Add a janitor.test.mjs test: two writeRecord calls into one dir on the same NY date, the first with `act: "applied"` and one removal. Assert that the first file still has 1 `removed` row, and that the second lands at `<date>-<host>-HHMMSS.json`.

Predicted outcome, trial-applied on the scratch copy:
- the first call gives `2026-09-29-h.json` with removed 1;
- the second gives `2026-09-29-h-160000.json` with act `not-requested`;
- janitor.test.mjs gives 119 tests, 117 pass, 0 fail. The F7 byte-identity test writes into two separate dirs, so it is unaffected.

## MEDIUM 3. reclaim S/T removes a directory that another live process has as its cwd (an open shell)
Evidence:
- The only cwd check for S and T is F8's `within(ctx.cwd, resolved)` (reclaim.mjs:675), which covers reclaim's *own* cwd. finishST (:525-554) has no equivalent of janitor's worktreeHasOpenProcess, which W gets through applySafe.
- Measured: I started a `sleep` whose cwd is `/var/tmp/delegation-l59seam-fE1P/sub` (`/proc/<pid>/cwd` confirmed). `reclaim --dry-run /var/tmp/delegation-l59seam-fE1P` printed `would-remove T /var/tmp/delegation-l59seam-fE1P 3`, exit 0.
- A live run takes the same path: the finishST re-check, then rmSync.
- T is uid-wide, not per-agent. Any agent of the same uid can remove another agent's live `delegation-*` scratch with no prompt, once `Bash(reclaim *)` is allowed. A shell glob such as `reclaim /var/tmp/delegation-*` names all of them in one call.
- The brief counts an open shell as live, and so does the lane's measure (work lost or stalled). This is the S/T side of the asymmetry that T2's finding 2 closed for W.

Fix (judgment; seam across T1 and T2, apply after MEDIUM 1 so the containment test is the corrected one):
- In janitor.mjs, export the existing probe under a neutral name, e.g. `export { worktreeHasOpenProcess as pathHasOpenProcess }`. It already returns true, false or `"unknown"`, and fails closed.
- In reclaim.mjs finishST, after the mount check, add:
  - on linux and darwin, `const busy = ctx.openProcessImpl(resolved)`, defaulting to the janitor export;
  - `if (busy) return { ok: false, reason: busy === "unknown" ? "in-use check failed" : "a process has its cwd here" }`.
- On win32, rmSync would delete the files around a cwd directory before failing on the directory itself. Either reuse applySafe's rename-away-and-back probe on the top target, or refuse on win32 until the Windows gate measures it.
- Tests:
  - a spawned `sleep` with its cwd inside a T fixture is refused (skip on win32);
  - an injected `openProcessImpl` returning `"unknown"` is refused with `in-use check failed`.

Predicted outcome:
- the dry-run above prints `refused ...: a process has its cwd here` and exits 3;
- every existing reclaim test stays green, since none of them holds a process inside a target;
- cost is one /proc scan per S/T argument, about 1-3 ms here, times two because of the pre-rm re-check.

---

## C4 fields (MEDIUM 1, the headline seam defect)
Cause: janitor.mjs:1695's `pathWithin` treats any relative path that starts with the characters `..` as an escape, so a real child dir named `..live` reads as "outside". The act's `/proc`-cwd, lsof and Codex-cwd liveness checks all go through it.
Discriminating check: a `sleep` with its cwd in `<repo>/..live`. Here `pathWithin(readlink(/proc/<pid>/cwd), <repo>)` returns false at 4a11867 and true with the patch, while `<repo>/live` is true in both and `<repo>/..` is false in both.
Fix location: scripts/janitor.mjs:1695 (pathWithin's return line), plus one janitor.test.mjs test.
Simplification: one escape predicate, `rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)`. It is already written three times (path-safety.mjs:70, reclaim.mjs:53, and now janitor). pathWithin can become the single exported copy that path-safety and reclaim import, removing reclaim's local `within()` twin.

## Scratch left in place (nothing deleted)
- /var/tmp/l59seam-9b2l holds:
  - fullsuite.log, patch-rec.cjs and the rec/ and rec2/ record probes;
  - bin/reclaim, the probe shim;
  - agents/, agents-off/ and agents-off2/, the switch fixtures;
  - cl/, a clone of the worktree, with worktrees wt-restored, wt-empty, wt-feat and wt-det registered in it. Prune them at cleanup.
- /var/tmp/l59seam-fx-ZB3B: an init-only repo with empty dirs `..live` and `live`.
- /var/tmp/l59seam-mut-G8xK: the scratch copy with both trial patches applied. It is not the reviewed tree.
- /var/tmp/delegation-l59seam-fE1P: the T fixture (f.txt, sub/).
