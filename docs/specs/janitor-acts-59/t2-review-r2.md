VERDICT: NEEDS_FIXES 556f386898ae611464b6a66938f3567d5f7137ba (6)

# Lane 59 T2 delta re-review, round 2: fix commit 556f386 on top of 1ce13f4

Scope: T2's files only. Those are scripts/janitor.mjs and its test, scripts/mirror-shared-skills.mjs and its test, and skills/janitor/SKILL.md. The checklist is t2-review.md (14 findings). The spec is ruling-r1.md: doubt resolves to "do not remove", and an unreadable or unknown idle source counts as active.

Method:
- Probes, fixtures and a scratch archive copy (`git archive 556f386`) are in `/var/tmp/l59r2-e0CK` (mktemp).
- Mutation and trial patches ran only on the copy. After each one, the copy was restored and `cmp`-verified.
- Nothing in `/var/tmp/lane-59/wt` was written. `git status --short` is empty, and HEAD is `a9cbee9`, a docs-only commit after 556f386.
- No janitor, reclaim or installer run touched a real host.
- Real state was checked by stat only, before and after both test runs, and nothing changed:
  - `~/.claude/settings.json` mtime: 1790718765;
  - `janitor-record.service` and `janitor-record.timer` mtimes: 1790529480;
  - `~/.agents/rollout-backups`: 9 entries;
  - `~/.local/bin/reclaim`: absent.
- Denials: one. A hook blocked a probe whose argument list contained the literal cmd token `%PATH%` ("cmd.exe syntax detected"). I stopped that step and did not re-run it in another form. The `%VAR%` part of R2-3 therefore rests on git's documented refname rules and cmd's quoting rules, not on a probe. The `$(...)` and backquote parts were probed separately.
- Finished 7:16 PM NY, 9/29.

## Test runs

**Territory**, `TMPDIR=/var/tmp node scripts/run-tests.mjs scripts/janitor.test.mjs scripts/mirror-shared-skills.test.mjs` (sealed):
- 155 tests: 152 pass, 0 fail, 2 skipped, 1 todo.
- Leak check: 0.

**Full suite**, `TMPDIR=/var/tmp node scripts/run-tests.mjs`, run once:
- Exit 0. 3148 tests: 3142 pass, 0 fail, 5 skipped, 1 todo.
- Leak check: 0.
- The one `✖ probe` line in the log belongs to run-tests' own self-test of a deliberately failing probe. It is not a failure.

**T1 churn:** none seen. Between 556f386 and HEAD the only commit is `a9cbee9`, which touches docs only (`t2-fix1-build.md` and the work record). `git diff 556f386 HEAD` on T2's files is empty.

## Mutation checks on the scratch copy

Each fix was reverted on its own and the territory file re-run. Every mutation except F6's was caught by a failing test:

| mutation | failing tests |
|---|---|
| F5: catch-path `writeRecordIfRequested()` removed | 1 |
| F8: idle-skip `failedWorktreeBranches.add` removed | 1 |
| F1: Codex cwd match ignored | 1 |
| F1: `.claude-*` config dirs ignored | 1 |
| F2: `/proc` match ignored | 1 |
| F3: `partial` forced false | 1 |
| F9: future-mtime label collapsed | 1 |
| F10: maxBuffer reverted | 1 |
| F4: hint reverted | 2 |
| F7: backup failure swallowed | 1 |
| F14: carry-forward removed | 1 |
| **F6: gate reverted to `isDurablePath(REPO)` alone** | **0** |

On F6: the finding only asked for a test of `isLinkedWorktree()` itself, which exists. The gate line has no test, because `REPO` is fixed at module load (the builder's report says so). This is noted, not counted.

---

## Status of the 14 round-1 findings

| # | status | evidence |
|---|---|---|
| 1 | **Closed for the four named shapes.** Two gaps are re-opened below as R2-1 and R2-2 | Probe `probe-idle.mjs` on fixtures, other signals backdated 48 h: `.claude-acct2` 0.00; subdir launch 0.00; `CLAUDE_CONFIG_DIR` outside home 0.00; slug over 200 chars (hashed) 0.00; Codex today with cwd = wt 0.00; cwd = wt/sub 0.00; Orca `codex-runtime-home` 0.00; control 0.00; no session anywhere 48.00. The real rollouts on this host (134) have first lines of at most 22,751 bytes (median 22,537), so the 64 KB read always gets the whole `session_meta` line; all 134 parse and have a string `payload.cwd` |
| 2 | **Closed** | Probe `probe-open.mjs`, fake state whose tree is kept dirty so nothing can be removed. On linux: no process → reaches `tree changed since classify`; shell cwd = wt → `a process has its cwd here`; cwd = wt/sub → same; ref given through a symlink → same (pathWithin realpaths both sides); after the holder exits → back to `tree changed`. Win32, simulated with `process.platform` = win32 and `renameSync` swapped through `syncBuiltinESMExports`: rename ok → round-trips, the dir is back, no `.janitor-busy` left; first rename EBUSY → `in use` and the dir untouched; rename-back EPERM → one error row naming the `.janitor-busy` path, the loop stops, and the second candidate is untouched. The stranded path is also re-surfaced by the next run as the JUDGMENT row "worktree directory is missing". The ruling's "never a half state without a record" holds |
| 3 | **Closed** | The catch row carries `partial`, `sha` and `restore`. `writeRecord`'s `gone()` puts it in `removed[]` with `partial: true` and out of `safeLeft`. Test and mutation both confirm |
| 4 | **Closed on shape** (`-C <root>`, detached at the sha, works whether or not the branch survived). **The quoting is not effective**, see R2-3 | the F2 test asserts the new strings; mutation caught |
| 5 | **Closed** | `applyImpl` seam; the test asserts exit 1, `act: "applied"` and the pre-throw row in `removed`; mutation caught |
| 6 | **Closed** | On this host, `isLinkedWorktree`: `~/Code/claude-delegation` → false; `/var/tmp/lane-59/wt` → true; its `scripts/` subdir → true. Gate test gap noted above |
| 7 | **Closed** | `COPYFILE_EXCL` plus `chmodSync` inside the try; a failure returns `backup failed` and removes the temp file. Backup names carry a millisecond stamp and differ per file (`claude-settings.json.*`, `codex-default.rules.*`), so EXCL cannot collide within one run. Mutation caught |
| 8 | **Closed** | Test asserts the `failedWorktreeBranches` message, which the loop checks before `stillCheckedOut`; mutation caught |
| 9 | **Closed** | NaN → `idle age unknown`; negative → `mtime in the future`. reclaim.mjs:352's `!(hrs >= IDLE_FLOOR_HOURS)` refuses NaN (safe). Seam note for T1: reclaim labels that refusal "active in last 24h", not "idle age unknown" |
| 10 | **Closed** | 256 MB maxBuffer; the 6500-file test goes red when reverted |
| 11 | **Closed** | All four SKILL.md claims corrected. The new text describes exactly what the code reads, including "today or yesterday" for Codex, which is the gap in R2-2 |
| 12 | **Closed** | Warning text corrected |
| 13 | **Closed, legitimately** | P-allow, "does `Bash(reclaim *)` let a bare `reclaim` run prompt-free", needs a live Claude CLI and cannot be tested hermetically. `test.todo` reports it as pending, not as a pass. The parts that can be tested are tested: mirror test :315 (the ALLOW line text) and :325-334 (`--write-allow` writes exactly `Bash(reclaim *)`). No further test is needed |
| 14 | **Closed for the named case.** Over-broad, see R2-5 | test present; mutation caught |

---

## R2-1. MEDIUM (ruling r1): an unreadable idle source still counts as "idle", not "active"

File: scripts/janitor.mjs:1150, :1199, :1206-1208, :1246-1248, :1255-1257, :1275-1276 and :1286.

**Evidence** (`probe-idle.mjs`, uid 1000, fixture homes; every other signal backdated 48 h, a fresh session placed, then its source made unreadable):

| shape | idleHours on 556f386 |
|---|---|
| matched `projects/<slug>` dir at mode 000 | **48.00** |
| `~/.claude/projects` at mode 000 | **48.00** |
| `~/.codex/sessions` at mode 000 | **48.00** |

- Each of these is a removal under the 24 h floor. The same thing happens for EIO, EMFILE or EPERM on a network or overloaded home.
- The ruling says an unreadable source counts as active. The code's docstring (janitor.mjs:1130-1134) says the opposite ("simply skipped, never treated as an error").

Fix (mechanical). ENOENT and ENOTDIR stay "readable and empty". Any other I/O error makes the whole answer unknown (NaN). Two sources must stay exempt, or every removal on every host is blocked:
- **Per-pid `/proc` reads.** On this host 298 of 934 pids are unreadable, because they belong to other uids. The builder's `continue` there is correct.
- **A Codex first line that does not parse.** One fresh rollout caught mid-write would otherwise block every removal on the host.

Patch (tried on the scratch copy, see the prediction below):
- :1146-1152
  ```js
  const noteMtime = (p) => {
    try {
      mtimes.push(statSync(p).mtimeMs);
    } catch {
      // absent or unreadable: simply not a candidate
    }
  };
  ```
  becomes
  ```js
  // Ruling r1: an unreadable source counts as active. ENOENT/ENOTDIR is "readable and empty"; any
  // other error (EACCES, EPERM, EIO, EMFILE...) makes the whole answer unknown (NaN).
  let unknown = false;
  const unreadable = (err) => {
    if (!err || (err.code !== "ENOENT" && err.code !== "ENOTDIR")) unknown = true;
  };
  const noteMtime = (p) => {
    try {
      mtimes.push(statSync(p).mtimeMs);
    } catch (err) {
      unreadable(err);
    }
  };
  ```
- :1198-1200: `} catch {` / `return; // no such config dir, or unreadable - not a candidate` becomes `} catch (err) {` / `unreadable(err);` / `return;`.
- :1206-1209, after `entries = readdirSync(dir);`: `} catch {` / `continue;` becomes `} catch (err) {` / `unreadable(err);` / `continue;`.
- :1246-1249, after `names = readdirSync(sessDir);`: the same change.
- :1255-1258, after `mtimeMs = statSync(file).mtimeMs;`: the same change.
- :1263-1277: split I/O from parsing.
  - `let cwd;` before the try becomes `let firstLine;`.
  - Inside the try, `const firstLine = buf.toString(...)...` becomes `firstLine = buf.toString("utf8", 0, n).split("\n")[0];`, and the `cwd = JSON.parse(...)` line moves out.
  - The catch becomes `} catch (err) { unreadable(err); continue; }`.
  - Then add:
    ```js
    let cwd;
    try {
      cwd = JSON.parse(firstLine)?.payload?.cwd;
    } catch {
      continue; // unparsable (mid-write) first line: not a candidate; counting it would block every removal on the host
    }
    ```
- :1286: `if (mtimes.length === 0) return NaN;` becomes `if (unknown || mtimes.length === 0) return NaN;`.
- Rewrite the docstring sentence at :1130-1134 to match.
- Test: a fixture whose matched slug dir is at mode 000 (restore 755 in `finally`) gives `Number.isNaN(idleHours(...))`. Skip it as root and on win32.

**Predicted outcome, measured on the scratch copy with exactly this patch:**
- The three EACCES rows read `NaN` (applySafe then skips with `idle age unknown`).
- All ten other probe rows are unchanged.
- The janitor tests stay at 112 pass, 0 fail.

**Does this block every removal on some host shape?** No, as far as I can measure or reason:
- This host: `find` under `~/.claude*/projects`, `~/.codex/sessions` and `~/.config/orca/codex-*`, depth 5, counts 0 unreadable entries.
- Windows: the sources are all under the user's own profile (`%USERPROFILE%\.claude*`, `.codex`, `%APPDATA%\orca`). A per-user NTFS ACL grants the owner list and read access there. Only names starting `.claude-` are stat'd in the home dir, so junctions like "Application Data" are never touched.
- The two exemptions above are what keep it from being host-wide.

## R2-2. MEDIUM (F1 twin): a Codex session that has been running for more than about two days is invisible

File: scripts/janitor.mjs:1235 (`for (const baseMs of [nowMs, nowMs - 86400000])`).

Evidence:
- A rollout stays in the `sessions/YYYY/MM/DD` dir of the day its session *started*, however long the session keeps writing.
- Measured on this host (mtimes only): rollouts in dir `2026/09/10` were last written on 2026-09-14, and rollouts in `2026/09/13` on 09-14.
- Fixture probe: a rollout in the 4-days-ago dir, written now, cwd = wt, gives **48.00**, which is a removal.
- The only backstop is R2's process probe, and only when the Codex process's own cwd is inside the worktree. For an Orca runtime that hosts the session in a process started elsewhere, or a session given its cwd with `-C` without a chdir, nothing sees it. I could not verify either shape here.
- This is the finding's own "today and yesterday" design, carried into SKILL.md. The ruling's "doubt resolves to do not remove" is what this breaks.

Patch, :1235:
```js
    for (const baseMs of [nowMs, nowMs - 86400000]) {
```
becomes
```js
    // A rollout stays in the date dir of the day its session STARTED however long it keeps writing
    // (measured: real rollouts written 4 days after their dir date). 30 days of dirs; the mtime
    // prefilter below still keeps parsing to fresh files only.
    for (let back = 0; back <= 30; back++) {
      const baseMs = nowMs - back * 86400000;
```
The loop body and its closing brace are unchanged. Hoisting the two `Intl.DateTimeFormat` constructors out of the loop is optional.
- Test: the same fixture as the existing Codex test, with the rollout put in the dir of 4 days ago (local date) and a fresh mtime. Expect `< IDLE_FLOOR_HOURS`.
- SKILL.md: change "from today or yesterday" to "from a session started in the last 30 days".

**Predicted and measured on the scratch copy with this patch:**
- The 4-days-ago row reads 0.00, and every other Codex row is unchanged.
- Cost: the empty-home baseline goes from 4.5 to 9.6 ms/call; the 2000-fresh-rollout case goes from 126.7 to 135.7 ms/call.
- The janitor tests stay at 112 pass.
- Residual: a session started more than 30 days ago is left to the process probe. Say so in SKILL.md.

## R2-3. LOW (finding 4 residual): the quoted restore hint still runs `$(...)` and backquotes under sh and PowerShell, and doubles Windows backslashes

File: scripts/janitor.mjs:1294 (`const q = (s) => JSON.stringify(String(s));`), :1305-1307 and :1578.

Evidence:
- `git check-ref-format --branch` accepts both `a$(id)` and `` a`id` ``.
- `q("a$(echo INJECTED)")` gives `"a$(echo INJECTED)"`, and `sh -c 'printf "%s\n" "a$(echo INJECTED)"'` prints `aINJECTED`. Double quotes do not stop command substitution in sh, and PowerShell expands `$(...)` in double quotes too.
- Finding 4 gave "a command a branch name smuggles in" as the reason for quoting. That threat is still open.
- cmd expands `%VAR%` inside double quotes, and `%` is legal in a refname. That part was not probed (see Denials).
- On Windows, `q("C:\\Users\\Ben Z\\wt")` gives `"C:\\Users\\Ben Z\\wt"`, with doubled separators in the pasted command. PowerShell and cmd pass them through literally. Whether git accepts them was not verified here.
- The hint is only printed, never executed, hence LOW. It is still the line a human pastes at the worst moment.

Patch:
- :1294
  ```js
  const q = (s) => JSON.stringify(String(s));
  ```
  becomes
  ```js
  // A restore hint is pasted into sh, cmd or PowerShell on the host that printed it. Double quotes
  // still expand `$(...)`/backquotes (sh, PowerShell) and `%VAR%` (cmd), all legal in a refname or
  // path, so a hint is printed only for arguments made of inert characters. Forward slashes work in
  // git and in every Windows shell. Returns null when no safe quoting exists; the row keeps its sha.
  const INERT_ARG = /^[A-Za-z0-9._\/@+=:,~ -]+$/;
  const q = (s) => {
    const v = process.platform === "win32" ? String(s).replace(/\\/g, "/") : String(s);
    if (!INERT_ARG.test(v)) return null;
    return process.platform === "win32" ? `"${v}"` : `'${v}'`;
  };
  ```
- :1305-1307
  ```js
  function restoreHint(root, ref, sha) {
    return `git -C ${q(root)} worktree add ${q(ref)} ${sha}`;
  }
  ```
  becomes
  ```js
  function restoreHint(root, ref, sha) {
    const r = q(root);
    const p = q(ref);
    return r && p ? `git -C ${r} worktree add ${p} ${sha}` : null;
  }
  ```
- :1578
  ```js
          restore: b.sha ? `git -C ${q(root)} branch ${q(b.ref)} ${b.sha}` : null,
  ```
  becomes
  ```js
          restore: b.sha && q(root) && q(b.ref) ? `git -C ${q(root)} branch ${q(b.ref)} ${b.sha}` : null,
  ```
- Tests: in janitor.test.mjs, the three expected strings that use `JSON.stringify(toplevel)`, `JSON.stringify(wt)` and `JSON.stringify("feature-restorehint")` (F2 test, and the finding 3 test) change to `'${toplevel}'`, `'${wt}'` and `'feature-restorehint'` on POSIX. Add one test: a SAFE merged branch named `feat$x` gets `restore === null` and a 40-hex `sha`.

Predicted outcome:
- Every printed hint is inert in sh, cmd, PowerShell and Git Bash.
- A hostile or odd name gets no hint, only its sha, which is enough to restore by hand.

## R2-4. LOW (ruling r1: "a stated reason, never a confident label"): a failed in-use check is labelled "a process has its cwd here"

File: scripts/janitor.mjs:1334, :1362 and :1462-1463.

Evidence (`probe-open.mjs darwin-no-lsof`): with `process.platform` = darwin and no `lsof` on PATH, the row reads `skipped: "a process has its cwd here"`. Nothing was found; the check failed. The direction (skip) is right. The label sends a human looking for a process that does not exist. An unreadable `/proc` on linux gets the same label.

Patch:
- :1334: `return true; // /proc itself unreadable: fail closed, never "clean"` becomes `return "unknown"; // /proc itself unreadable: fail closed, never "clean"`.
- :1362: `return true; // timeout or any other error: "in use" wins over "clean"` becomes `return "unknown"; // timeout or any other error: "in use" wins over "clean"`.
- :1462-1463
  ```js
        } else if (worktreeHasOpenProcess(w.ref)) {
          log.push({ action: "worktree-remove", ref: w.ref, branch: w.branch, ok: false, skipped: "a process has its cwd here" });
  ```
  becomes
  ```js
        } else if ((inUse = worktreeHasOpenProcess(w.ref))) {
          log.push({ action: "worktree-remove", ref: w.ref, branch: w.branch, ok: false, skipped: inUse === "unknown" ? "in-use check failed" : "a process has its cwd here" });
  ```
  Add `let inUse;` immediately before `if (process.platform === "win32") {` (:1433).

Predicted outcome: the darwin-no-lsof row reads `in-use check failed`. "unknown" is truthy, so it still skips. The linux test is unchanged.

## R2-5. LOW (finding 14 residual): the reclaim manifest carry-forward is unconditional and matches by basename in any directory

File: scripts/mirror-shared-skills.mjs:1232.

Evidence:
- Finding 14 asked for the carry-forward only "when collectSources skips the reclaim shim". The shipped line carries forward any previously managed entry whose basename is `reclaim` or `reclaim.cmd`, on every run and from every directory.
- A future release that retires the shim can never drop it: a durable run has no source for it and still carries it forward.
- A skill or other entry named `reclaim` outside `~/.local/bin` would also become undroppable.

Patch, :1232:
```js
        if (['reclaim', 'reclaim.cmd'].includes(path.basename(old.dest))) { managed.push(old); continue; }
```
becomes
```js
        if (path.resolve(path.dirname(old.dest)) === path.resolve(LOCAL_BIN)
          && ['reclaim', 'reclaim.cmd'].includes(path.basename(old.dest))
          && !(isDurablePath(REPO) && !isLinkedWorktree(REPO))) { managed.push(old); continue; }
```
The added clause is the exact complement of the collectSources gate at :571.

Predicted outcome: the finding 14 test still passes, because the test repo sits under `/var/tmp` and is non-durable. A durable run with no reclaim spec drops the stale entry as before.

## R2-6. LOW (brief: "does any test touch real state"): the finding 9 test reads the real home under a plain `node --test`

File: scripts/janitor.test.mjs:3227.

Evidence:
- `applySafe(state, [], { now: ... })` passes no `home`, so `idleHours` falls back to `os.homedir()`. It then reads the real `~/.claude*/projects` (readdir) and the first 64 KB of real Codex rollouts.
- Every `idleHours` test also inherits `process.env.CODEX_HOME` and `CLAUDE_CONFIG_DIR`, whatever `home` says. `CODEX_HOME` is set in this shell, and the builder's own gate lines were plain `node --test`.
- Under `run-tests.mjs` the sealed home strips both variables (test-home.mjs:171-173) and replaces HOME, so the gate is clean.
- Nothing is written, and the pass/fail outcome cannot flip, because real cwds never match fixture paths. The reads are still real-state reads.

Patch, :3227:
```js
  const log = applySafe(state, [], { now: Date.now() - 48 * 3600000 });
```
becomes
```js
  const log = applySafe(state, [], { home: mkTmp("janitor-idlehome-future-"), now: Date.now() - 48 * 3600000 });
```
Optional: `delete process.env.CODEX_HOME; delete process.env.CLAUDE_CONFIG_DIR;` at the top of janitor.test.mjs. The per-file process env is the test's own. Predicted outcome: no test reads outside its fixture home, even under a plain `node --test`.

---

## Brief regression questions

**1. Speed of the widened idleHours** (`probe-perf.mjs`, fixture of 2000 files, 5-run mean):

| fixture | ms per call |
|---|---|
| empty home | 4.5 |
| 2000 project dirs, plus 2000 transcripts in the matched slug | 17.7 |
| 2000 fresh Codex rollouts today, each with a 22 KB first line, none matching (worst case: every one is opened and parsed) | 126.7 |

- The `/proc` scan on this host (934 pids) costs 26 ms per candidate.
- janitor's dry-run never calls idleHours: it runs only under `state.act === true`. Reclaim's W path calls it once per target.
- Worst case for a daily act with 50 SAFE candidates is about 50 x 0.17 s, roughly 8.5 s. No defect.
- Optional if it ever matters: cache the Codex scan once per applySafe run.

**2. Does "unreadable counts as active" block every removal on some host shape?**
- As shipped: no, because unreadable sources are skipped, which is R2-1.
- The fail-closed paths that do exist are narrow: an unreadable `/proc` as a whole, and an lsof error on macOS.
- lsof on macOS: the launchd plist sets no PATH, so launchd's default `/usr/bin:/bin:/usr/sbin:/sbin` finds `/usr/sbin/lsof`. The shipped check does not block the Mac through PATH.
- With R2-1's patch: no, measured (0 unreadable entries on this host) and reasoned for Windows ACLs (the user's own profile tree). This holds only with the two exemptions R2-1 keeps: per-pid `/proc`, because 298 of 934 pids here belong to other uids, and Codex parse errors.
- The win32 rename probe fails closed (`in use`) on a transient Defender or indexer handle. That skips a single day, not every removal.

**3. Restore hints under cmd and sh quoting:** not correct. See R2-3.

**4. Does any test touch real state?**
- Writes: none. The stat snapshot of the real state is unchanged across both runs, and the leak check is 0 both times.
- Reads: R2-6. The finding 2 test reads real `/proc/*/cwd` links, which the check itself needs, and only compares them.

## Verified absences

- **No defect in the win32 rename probe's failure handling.** A failed rename-back stops the loop, keeps other candidates untouched, and records the location (probe above).
- **No defect in the F7 backup naming.** EXCL cannot self-collide.
- **No T1 files changed in 556f386.** reclaim.mjs, path-safety.mjs and work-record.mjs are untouched.

## Notes for the lead (not counted)

- Seam note for T1: reclaim.mjs:353 reports a NaN idle value as "active in last 24h". The direction is safe; only the label is wrong.
- The F6 gate line (`&& !isLinkedWorktree(REPO)`) survives mutation. No test runs collectSources from a durable-looking linked worktree.
- `isLinkedWorktree` runs git without `withoutRepoLocatingGitEnv`, so a GIT_DIR in the environment makes it return false, which is the unsafe direction for the shim. The mirror runs from a shell, so this is rare.
- The builder report says a scratch `git worktree remove --force` was run against the shared repo during red-before checks. It was additive and then removed, not in the reviewed worktree. I am noting it only because this lane's rules discourage forced removals.
- The previous reviewer's stray file `/var/tmp/l59rev-offsets.txt` is still there. My scratch is `/var/tmp/l59r2-e0CK`. Both are left in place under the "delete nothing" rule.

## C4 fields (headline finding R2-1)

Cause: idleHours' catch blocks treat every error (EACCES, EIO, EMFILE) the same as ENOENT, so an unreadable session source contributes nothing and the git-admin mtimes alone decide "idle".
Discriminating check: set the fixture's matched `~/.claude/projects/<slug>` to mode 000 with a fresh transcript inside and other signals backdated 48 h. It gives 48.00 on 556f386 and NaN with the R2-1 patch (measured on the scratch copy).
Fix location: scripts/janitor.mjs idleHours, the catch blocks at :1150, :1199, :1206-1208, :1246-1248, :1255-1257 and :1275-1276, and the return at :1286. Per-pid `/proc` reads and Codex JSON parse errors are exempt.
Simplification: one `unknown` flag set by one `unreadable(err)` helper, where ENOENT/ENOTDIR is empty and anything else is unknown, replaces per-site judgment. The return keeps its single NaN exit.
