VERDICT: NEEDS_FIXES 1ce13f4b2e5d6cfe838669aa52dba18f3dfef403 (14)

# Lane 59 T2 review: janitor acts (250ce5f, 38f1a8c, 8ff959d, 1ce13f4 against dff1e00)

Scope: the T2 files only (janitor.mjs and its test, install-janitor-timer.mjs and its test, mirror-shared-skills.mjs and its test, skills/janitor/SKILL.md, docs/subagent-contract.md). I read reclaim.mjs (T1) only to answer brief item 2. Spec is spec.md plus redteam.md F1-F17 and ruling-r0.md; where they disagree, the findings win.

Method:
- Probes ran in `/var/tmp/l59rev-p1tW` (mktemp). They imported janitor.mjs and mirror-shared-skills.mjs from the worktree and ran against fixture repos and fixture homes only.
- Mutation checks ran on an archive copy at `/var/tmp/l59rev-p1tW/copy`, restored and `cmp`-verified afterwards.
- One stray temp file sits outside that folder: `/var/tmp/l59rev-offsets.txt` (4 byte offsets into the claude binary). Under the brief's "delete nothing" rule I left it for the lead to remove.
- Nothing in the reviewed worktree was modified (`git status --short` is empty).
- No real janitor, reclaim or installer run touched a real host.
- Denials: none.
- Finished 6:26 PM NY, 9/29.

Territory tests, run with fake `systemctl`/`launchctl`/`schtasks`/`crontab`/`loginctl` first on PATH, each of which appends to a marker file:
- `node --test janitor.test.mjs install-janitor-timer.test.mjs mirror-shared-skills.test.mjs`: 193 tests, 191 pass, 0 fail, 2 skipped.
- Marker file: never created. No scheduler binary was called.
- Unchanged before and after the run: the real `~/.claude/settings.json` mtime (1790718765); the real `janitor-record.service` and `janitor-record.timer` mtimes (1790529480); `~/.agents/rollout-backups` entry count (9); `~/.local/bin/reclaim` (absent).

---

## 1. HIGH (F1): idleHours looks for session activity in exactly one place. Four measured live-session shapes read as 48 h idle and would be removed

File: scripts/janitor.mjs:1109-1151 (`idleHours`), reached from :1192-1197 (applySafe) and reclaim.mjs:351.

Evidence (measured, `/var/tmp/l59rev-p1tW/probe-idle.mjs`):
- Setup: each fixture worktree's own dir mtime and its admin `HEAD`/`index`/`logs/HEAD` were backdated 48 h, then a fresh (now) session file was placed where each kind of live session really writes one.
- Results, `idleHours(wt, {home})`:

| live session shape | idleHours | removed under the 24 h floor? |
|---|---|---|
| control: `~/.claude/projects/<naive slug>/s.jsonl` | 0.00 | no (control works) |
| `~/.claude-acct2/projects/<slug>/` (a CLAUDE_CONFIG_DIR account) | 48.00 | **yes** |
| session launched in `<wt>/sub` (slug `<wt-slug>-sub`) | 48.00 | **yes** |
| worktree path whose slug is over 200 chars (Claude Code's hashed slug) | 48.00 | **yes** |
| Codex session (`~/.codex/sessions/.../rollout-*.jsonl`, cwd = wt) | 48.00 | **yes** |
| HEAD mtime 30 days in the future | -720.00 | no (skipped for 30 days, see #9) |

- **CLAUDE_CONFIG_DIR accounts are real on Ben's hosts.**
  - This host has `~/.claude-acct2` through `~/.claude-acct6`, each with a `projects/` dir.
  - The Mac runs an acct2 profile (docs/work/evidence/mac-native-auth-limit.md:9).
  - Claude Code puts transcripts under `<config dir>/projects`. The claude 2.1.285 binary has `function Qu(){return S(we(),"projects")}`, where `we()` is the config dir. idleHours hard-codes `<home>/.claude/projects` (:1140-1142).
- **Slug truncation, read from the installed claude 2.1.285 binary:** `var Ure=200; function k(e){return e.replace(/[^a-zA-Z0-9]/g,"-")} function LR(e){let n=k(e);if(n.length<=Ure)return n;return `${n.slice(0,Ure)}-${Le(e)}`}`, where `Le` is a base36 hash. The naive slug at :1140 never matches a slug over 200 characters. Worktrees inside a Windows scratchpad (`...\Temp\claude\<60-char project>\<uuid>\scratchpad\...\wt-T2`) get close to that length.
- **Codex has no `~/.claude/projects` entry at all.**
  - Orca workspaces run Codex panes; `codex-census-1` is the redteam's own example.
  - A Codex pane reviewing a merged, clean workspace, with no commits for 24 h, is invisible to the check.
- **Orca workspaces with a Claude lead launched in the workspace root are covered**, provided the account is `~/.claude`, the slug is 200 characters or fewer, and the session wrote within 24 h.
- **The brief's failure class, confirmed.** "Found no transcript" contributes nothing and raises no flag. The number that comes back is really "hours since the last git write or top-level dir change", and applySafe treats it as "no session is here".
- This host shows it too: no `~/.claude/projects/-var-tmp-lane-59*` dir exists, although builder sessions have worked in `/var/tmp/lane-59/wt` all day. They were launched elsewhere and used absolute paths, so the git-admin files were the only signal.

Fix (judgment; the design is set out here, the builder implements it). Keep `idleHours`'s signature and widen what it reads:
1. **Claude config dirs:**
   - `<home>/.claude`;
   - every directory matching `<home>/.claude-*` that has a `projects/` child;
   - `process.env.CLAUDE_CONFIG_DIR`, when set.

   For each, read `<dir>/projects`.
2. **Matching inside each `projects/` dir:** readdir once and keep an entry whose name, case-folded on win32 and darwin:
   - equals `slug`; or
   - starts with `slug + "-"` (subdirectory launches; also sibling paths, which only errs toward "active", the safe direction); or
   - when `slug.length > 200`, starts with `slug.slice(0, 200) + "-"`.

   For each kept dir, take the newest direct entry (as today).
3. **Codex:**
   - For each home in `codexHomes({home, env})` (already exported from codex-hook-trust.mjs; the mirror imports it), list `<codexHome>/sessions/YYYY/MM/DD/` for today and yesterday, in both local and UTC dates.
   - For each `rollout-*.jsonl` with mtime inside the floor, read at most the first 64 KB and parse the first line.
   - If its session cwd (`payload.cwd` on current Codex; confirm the key path on one real rollout by printing key names only) is within `wtPath` (`pathWithin`), count that file's mtime.
4. **Report the source:** return (or log from applySafe) where the newest mtime came from, e.g. `skipped: active 0.2h ago (claude transcript)` or `idle 48.0h (newest: git index)`. A human can then see what the floor measured.
5. **Tests:** turn each "yes" row of the table above into a test that expects `idleHours < 24`. The probe file shows the fixture shapes.

Predicted outcome: all four rows read about 0.00, and the control and "no session anywhere" rows are unchanged. The daily act's efficacy moves by at most the sessions that really are live.

## 2. MEDIUM (F1): a worktree with an open shell, or a Claude session idle for more than 24 h, is removed. On Windows its contents go and an empty shell stays

File: scripts/janitor.mjs:1191-1209.

Evidence:
- The idle floor measures file writes, not presence. A pane left open overnight or over a weekend (a lead waiting on Ben, a plain shell in an Orca terminal) has an unchanged transcript mtime and is removed the next morning.
- Redteam F1 measured the results:
  - Linux: the process is left with `fatal: Unable to read current working directory`;
  - Windows: the removal half-succeeds, the contents are deleted, and the in-use dir stays behind (janitor.mjs:1210-1219 already documents this case).
- Nothing is lost, because the tree was clean and merged. The session stalls, which is the lane's own measure.

Fix (judgment, cheap and fail-closed): under `state.act === true`, before `git worktree remove`:
- **linux:** `readlink` each `/proc/[0-9]*/cwd` readable by this uid. If any is within `w.ref` (`pathWithin`), skip with `skipped: a process has its cwd here`.
- **darwin:** `lsof -a -d cwd -Fn -u <uid>`, with a 10 s timeout, checked the same way. An error or timeout skips the removal (fail closed).
- **win32:** rename probe. `renameSync(w.ref, w.ref + ".janitor-busy")` and immediately rename it back. Windows refuses to rename a directory that is any process's cwd or holds an open handle inside it. EBUSY/EPERM/EACCES means skip `in use`. If the rename-back fails, stop the whole apply loop and report it; do not continue.
- Whether an idle-but-open session should survive is a lead call. The probe costs one syscall per candidate and ends the Windows half-removal outright.

## 3. MEDIUM (F2): a failed or partial worktree removal drops its sha and restore hint; a "gone anyway" removal is missing from `removed` and counted in `safeLeft`

File: scripts/janitor.mjs:1220 and :1620-1626.

Evidence:
- `sha` is read at :1205, before the try, but the catch row at :1220 carries only `{action, ref, ok:false, error}`.
- When `goneAnyway` is true, git has deregistered the worktree and its contents are deleted. writeRecord then:
  - leaves it out of `removed` (it filters `ok === true`);
  - counts it in `safeLeft`.

  So the evidence file says nothing was removed, and the one removal that most needs a restore line has none.

Patch, scripts/janitor.mjs:1220:
```js
      log.push({ action: "worktree-remove", ref: w.ref, ok: false, error: `${String(err.message || err)}${note}` });
```
becomes
```js
      log.push({ action: "worktree-remove", ref: w.ref, branch: w.branch, ok: false, partial: goneAnyway, sha, restore: goneAnyway && sha ? restoreHint(root, w.ref, sha) : null, error: `${String(err.message || err)}${note}` });
```
Then scripts/janitor.mjs:1620-1623:
```js
  const removed = applyLog
    .filter((l) => l.ok === true)
    .map((l) => ({ kind: l.action === "worktree-remove" ? "worktree" : "branch", ref: l.ref, sha: l.sha || null }));
  const removedWorktreeRefs = new Set(applyLog.filter((l) => l.action === "worktree-remove" && l.ok === true).map((l) => l.ref));
```
becomes
```js
  const gone = (l) => l.ok === true || l.partial === true;
  const removed = applyLog
    .filter(gone)
    .map((l) => ({ kind: l.action === "worktree-remove" ? "worktree" : "branch", ref: l.ref, sha: l.sha || null, ...(l.partial ? { partial: true } : {}) }));
  const removedWorktreeRefs = new Set(applyLog.filter((l) => l.action === "worktree-remove" && gone(l)).map((l) => l.ref));
```
(`restoreHint` comes from #4.)

Test: call applySafe with a SAFE row whose worktree dir has a read-only child dir on POSIX, so the final rmdir fails; skip the test as root. Then writeRecord, and assert `removed[0].partial === true` and that `sha` is 40-hex.

Predicted outcome: the evidence file lists every worktree whose contents are gone.

## 4. MEDIUM (F2): the worktree restore hint does not work when the branch survived, has no `-C <root>`, and leaves paths and branch names unquoted

File: scripts/janitor.mjs:1207 and :1290.

Evidence:
- The hint is `git branch <b> <sha> && git worktree add <ref> <b>`. When the branch was NOT deleted in the same run, `git branch` fails with "a branch named '<b>' already exists", and `&&` stops before `worktree add`. The branch survives when:
  - branch-delete was skipped (`no successful fetch`, `tip moved`);
  - the branch was never in `safe.branches`.
- Pasted anywhere but the repo, the hint acts on the wrong repo or fails.
- Windows paths with spaces break it.
- git refnames may contain `;`, `&`, `$` and backquotes, so an unquoted pasted hint can run a command a branch name smuggles in.

Patch: add near `IDLE_FLOOR_HOURS`:
```js
const q = (s) => JSON.stringify(String(s));
/** Always works: re-creates the worktree detached at the removed tip whether or not the branch still exists. */
function restoreHint(root, ref, sha) {
  return `git -C ${q(root)} worktree add ${q(ref)} ${sha}`;
}
```
:1207
```js
      const restore = sha && w.branch ? `git branch ${w.branch} ${sha} && git worktree add ${w.ref} ${w.branch}` : null;
```
becomes
```js
      const restore = sha ? restoreHint(root, w.ref, sha) : null;
```
:1290
```js
      log.push({ action: "branch-delete", ref: b.ref, ok: true, sha: b.sha, restore: b.sha ? `git branch ${b.ref} ${b.sha}` : null });
```
becomes
```js
      log.push({ action: "branch-delete", ref: b.ref, ok: true, sha: b.sha, restore: b.sha ? `git -C ${q(root)} branch ${q(b.ref)} ${b.sha}` : null });
```
Also update the F2 applySafe test's expected hint strings.

Predicted outcome: each hint works on its own, whatever happened to the branch. Paste the branch row first to get the branch back too.

## 5. MEDIUM (F2): nothing tests "the record is written even when apply throws"

File: scripts/janitor.mjs:1844. The pinned text is redteam F2: "including when apply throws: the record is written in the catch path".

Evidence (mutation): on the scratch copy I replaced the catch-path `writeRecordIfRequested();` at :1844 with a comment, and all 102 janitor tests still passed. Other mutations did fail tests, so those tests have teeth:
- the idle floor disabled at :1192 (the F1 main() test failed);
- the F16 `ls-files -v` check removed (failed);
- the record moved before apply (the F2 record test failed);
- the kill switch forced off (the F14 test failed).

Fix:
- Add `applyImpl = applySafe` to main's option bag, next to `now`, and call `applyImpl(state, applyLog, { now })` at :1838.
- Test: `main(["--apply","--record",dir], {cwd, applyImpl: (s, log) => { log.push({action:"branch-delete", ref:"x", ok:true, sha:"a".repeat(40)}); throw new Error("boom"); }})`. Assert exit 1, the record JSON's `act === "applied"`, and `removed` holding the `x` row.

Predicted outcome: the test fails with :1844 removed and passes as shipped.

## 6. MEDIUM (F12 twin): an Orca workspace counts as "durable", so the reclaim shim can target a worktree the daily act deletes

Files: scripts/mirror-shared-skills.mjs:556 (the gate) and :948-957 (`isDurablePath`).

Evidence (measured by importing `isDurablePath` with win32-shaped inputs): `C:/Users/benzh/orca/workspaces/claude-delegation/codex-census-1` gives true, and so does `...\gudgeon`. `/home/ben/Code/claude-delegation-lane59` and `/home/ben/orca/workspaces/claude-delegation/x` also give true.
- These are linked git worktrees. Once the branch merges and the pane is idle, the daily act this lane ships removes them.
- If a mirror run from a lead's workspace wrote the shim, `reclaim` on that host then fails with "Cannot find module". Agents fall back to rm prompts, which is the measure this lane exists to move.
- The note-* shims are unaffected, because they target the mirrored copy.

Fix (small, mechanical in shape):
- Export `isLinkedWorktree(dir)`: true when `path.resolve(dir, git rev-parse --git-dir)` differs from `path.resolve(dir, git rev-parse --git-common-dir)`, true on any git error (fail closed).
- Gate at :556: `if (isDurablePath(REPO) && !isLinkedWorktree(REPO))`, with the else branch saying `SKIP reclaim shim: <REPO> is a linked git worktree` (or the not-durable reason).
- Test: a fixture repo plus `git worktree add` gives true for the worktree and false for the main checkout.

## 7. MEDIUM (F11): a failed backup does not stop the write, so `--write-allow` edits settings.json with no backup

File: scripts/mirror-shared-skills.mjs:326-330.

Evidence (measured on a fixture home whose `.agents/rollout-backups` is a regular file): the run printed `WROTE <fixture>/.claude/settings.json +Bash(reclaim *)`, the line landed, and no backup exists. Ruling r0 lists "a backup written outside the config dir" as one of the write's conditions.

Patch, :326-330:
```js
  try {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(file, backupPath);
    try { fs.chmodSync(backupPath, mode); } catch { /* best effort */ }
  } catch { /* a failed backup never blocks the write itself; F11 names no SKIP reason for it */ }
```
becomes
```js
  try {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(file, backupPath, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(backupPath, mode);
  } catch {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    return { ok: false, reason: 'backup failed' };
  }
```
- `chmodSync` is now inside the try: a backup that cannot be narrowed to the original's mode (it may be a 600 settings file with an env block) also refuses.
- Add `backup failed` to the fixed SKIP strings in the doc comment at :307.
- Test: the fixture above expects `SKIP <path>: backup failed` and byte-identical settings.

## 8. LOW: an idle-floor skip does not mark the worktree's branch as blocked

File: scripts/janitor.mjs:1195-1196. The `tree changed since classify` skip at :1200-1201 adds `w.branch` to `failedWorktreeBranches`, and the idle skip does not. Today `stillCheckedOut` (:1238) catches it, because the worktree is still listed. That is one guard, where every other skip has two.

Patch, :1195-1196:
```js
        log.push({ action: "worktree-remove", ref: w.ref, branch: w.branch, ok: false, skipped: "active in last 24h" });
        continue;
```
becomes
```js
        log.push({ action: "worktree-remove", ref: w.ref, branch: w.branch, ok: false, skipped: "active in last 24h" });
        if (w.branch) failedWorktreeBranches.add(w.branch);
        continue;
```

## 9. LOW (F1): an unknown or negative idle value gets a confident label

File: scripts/janitor.mjs:1149 and :1195.

Evidence and brief item 1 answer:
- "Found nothing" returns `Infinity`, which means fully idle and so eligible. It cannot reach a removal today:
  - the daily act re-runs `isTreeClean` right after the idle check, and that fails on a missing dir;
  - reclaim W only gets there after gatherState found the dir.

  It is still an unknown returned as a certainty at a pinned seam that T1 already imports.
- A future mtime (measured: -720 h) or a network filesystem whose server clock runs ahead leaves the worktree labelled `active in last 24h` for weeks.
- The opposite case can remove a live worktree: a filesystem whose server clock runs behind makes a live worktree read old. The transcript sources in #1 are written with the local clock, so fixing #1 largely covers this.

Patch, :1149:
```js
  if (mtimes.length === 0) return Infinity;
```
becomes
```js
  if (mtimes.length === 0) return NaN; // unknown is never "idle": every caller's `!(hrs >= floor)` skips NaN
```
:1195:
```js
        log.push({ action: "worktree-remove", ref: w.ref, branch: w.branch, ok: false, skipped: "active in last 24h" });
```
becomes
```js
        log.push({ action: "worktree-remove", ref: w.ref, branch: w.branch, ok: false, skipped: Number.isNaN(hrs) ? "idle age unknown" : hrs < 0 ? "mtime in the future" : "active in last 24h" });
```
scripts/janitor.test.mjs:2700-2703: rename the test to `returns NaN (unknown, never idle)` and change `assert.equal(idle, Infinity);` to `assert.ok(Number.isNaN(idle));`.

## 10. LOW (F16): `git ls-files -v` runs under execFileSync's default 1 MB maxBuffer

File: scripts/janitor.mjs:344.
- At about 30 bytes a line, a repo with roughly 35k or more tracked files overflows (ENOBUFS). The catch then returns "not clean", so no worktree of that repo is ever SAFE.
- That is the safe direction, but the act goes silently inert on a big repo.

Patch, :344:
```js
    const lines = git(["ls-files", "-v"], worktreePath).split(/\r?\n/);
```
becomes
```js
    const lines = execFileSync("git", ["ls-files", "-v"], { cwd: worktreePath, env: withoutRepoLocatingGitEnv(process.env), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 }).split(/\r?\n/);
```

## 11. LOW (C5): SKILL.md makes three claims the code does not keep

File: skills/janitor/SKILL.md.
- **:158-160** reads "A worktree a live session is still sitting in, however long ago it merged, survives every run until that idle floor passes." #1 and #2 show that is false. Replace it with: "A worktree whose Claude session wrote to `~/.claude/projects/<slug>/` in the last 24 hours, or whose git state changed in that time, is skipped. Sessions under another Claude config dir, Codex sessions, and a shell sitting idle in the worktree are not detected yet." After #1 and #2 land, update it to match.
- **:175** reads "`--apply` typed by hand is unaffected either way." That is false. janitor.mjs:1812 checks `switchedOff("janitor-act")` for every `--apply`, so a hand-typed one is record-only too. Replace it with: "The switch applies to every `--apply`, typed by hand or scheduled."
- **:228** gives usage as `node scripts/reclaim.mjs ...`. F10 and docs/subagent-contract.md pin bare `reclaim` ("never `node .../reclaim.mjs`"), because only the bare form matches the allow line. Change the block to `reclaim [--dry-run] <path>... | reclaim --branch <name> --repo <dir>`.
- **:237** reads "the naming convention every builder's own agent scratch already uses". It is new in this lane. Replace it with "the agent-scratch convention (see `docs/subagent-contract.md`)".

## 12. LOW: the mirror still says "this installer never edits your settings" in a run that edits them

File: scripts/mirror-shared-skills.mjs:219. The crossSessionInbound warning prints in the same `--write-allow` run as `WROTE ~/.claude/settings.json` (seen in my fixture run).

Patch:
```js
    + 'instead of delivered (multi 0.5.0). Set it yourself - this installer never edits your settings.',
```
becomes
```js
    + 'instead of delivered (multi 0.5.0). Set it yourself - this installer never changes that key (only --write-allow adds the reclaim allow line).',
```

## 13. LOW: the P-allow "test" passes because it checks nothing

File: scripts/mirror-shared-skills.test.mjs:516-518. It is `assert.ok(true)`, and it counts as a pass in the suite total.

Patch:
```js
test('F10 probe P-allow: recorded as documented behavior above this test, not re-run here (needs a live claude CLI)', () => {
  assert.ok(true);
});
```
becomes
```js
test.todo('F10 probe P-allow: recorded as documented behavior above this test, not re-run here (needs a live claude CLI)');
```

## 14. LOW (F12): a run from a non-durable checkout drops the reclaim shim from the manifest

File: scripts/mirror-shared-skills.mjs:1183-1191.
- On a gate run from `/var/tmp`, the reclaim shim is left on disk (correct), but it is not re-added to `managed`, so `writeManifest(managed)` forgets it. The run also prints `drop no-longer-shared entry ~/.local/bin/reclaim`, though nothing is dropped.
- Afterwards, `--uninstall` no longer removes it, and a durable run from a different checkout path refuses it as "not ours".

Fix: when collectSources skips the reclaim shim, carry forward `prev.managed` entries whose `dest` basename is `reclaim` or `reclaim.cmd` into `managed` unchanged, and do not print the drop line for them.

---

## Answers to the brief, with verified absences

**1. F1 idle floor.**
- Four of the brief's shapes fail: Codex, subdirectory launch, long (hashed) slug, and CLAUDE_CONFIG_DIR accounts (#1). Orca workspaces are covered only for a Claude lead in `~/.claude` with a short slug. An open shell is not covered (#2).
- Windows drive letters and slashes: correct. `path.resolve` gives `C:\...`, which becomes `C--...`, matching Claude Code's `k()`, and readdir on NTFS folds case.
- A future mtime is the safe direction but mislabelled (#9).
- `Infinity` is unreachable for a removal today; still fix it (#9).

**2. Floor on every removal path.**
- The daily act and `--apply`: yes, main() sets `state.act = true` only when `--apply` survives the kill switch (:1810-1818).
- Reclaim W: yes, twice. reclaim.mjs:351 checks idleHours before removal, and its narrowed state sets `act: true`, so applySafe checks again.
- `closeoutWorktree` (:1451) passes no `act`, so it has no floor. That is an explicit, named closeout of the lane's own worktree that already refuses the caller's cwd, and I accept it.
- The opt-in shape (`state.act === true` is the only gate) means any future caller that forgets the flag gets no floor. A lead may prefer to invert it: the floor on by default, and `closeoutWorktree` passing `{ skipIdleFloor: true }`. Not counted as a finding.

**3. F2 records.**
- A successful removal writes a row with sha and hint, and the record is written after apply. Mutation confirmed the ordering test has teeth.
- Gaps: partial and failed rows (#3), the hint's shape (#4), and the untested catch path (#5).
- A process killed mid-run (a systemd timeout) writes no record, and last-run.log is truncated daily. Accepted residual.
- Reclaim W/B removals are only printed to the calling agent; no evidence file is written. That is T1's territory, so I only note it for the lead.

**4. Allow lines.**
- **Verified, no defect: the default path writes nothing.**
  - `printAllowLines()` only pushes log lines.
  - `writeClaudeAllowLine` and `writeCodexAllowLine` run only under `opts.writeAllow` (:1201-1204).
  - `--dry-run --write-allow` writes nothing (test at mirror test :400).
  - The real settings.json mtime is unchanged across the whole suite.
- Conditions met:
  - regular file, via lstat;
  - line absent, either spelling;
  - deny/ask shadow check;
  - chezmoi `files,symlinks`, compared HOME-relative, with a missing binary plus an existing source dir treated as managed;
  - `wx` temp file, chmod to the original mode (600 preserved, tested);
  - re-read before rename;
  - rename retries;
  - backup under `~/.agents/rollout-backups`;
  - fixed SKIP strings, with no file bytes echoed (tested).
- Gap: the backup is not enforced (#7).
- On this host, settings.json round-trips byte-identically through the 2-space form, so `--write-allow` would actually fire here. I checked this with a boolean-only read that printed no content.
- Efficacy note: `CLAUDE_SETTINGS` ignores CLAUDE_CONFIG_DIR, so the acct2-6 profiles never get the allow line.
- **Redirect gap in `Bash(reclaim *)`: severity LOW, no new capability.**
  - This host's `permissions.allow` already holds `Bash(git *)`, `Bash(cat *)` and `Bash(ls *)`. I checked by membership test only, with no values printed.
  - So `cat /dev/null > f` is already exactly as prompt-free as `reclaim x > f`, and reclaim adds nothing new.
  - The builder probed only an in-cwd target. For the record, one more probe is worth adding: `reclaim /x > <scratch outside cwd>/p5`. If Claude Code allows out-of-cwd redirects under any single-word allow, that is a settings-wide issue for Ben's page, not this lane's.

**5. F14 and the installer.**
- Kill switches:
  - `ws-off` stops janitor (main :1770) and reclaim (switchedOff checks `ws-off` for every name).
  - `ws-off-janitor-act` makes every `--apply` record-only, fails safe on a stat error other than ENOENT/ENOTDIR (project-config.mjs:59-60), and prints the first-line notice (mutation-tested).
  - It does not stop reclaim, which has its own `ws-off-reclaim`. That is documented.
- **Verified, no defect: the installer tests never touch real systemd, launchd or schtasks.** Fake binaries on PATH recorded zero calls, and the real unit files' mtimes are unchanged. Every `--enable` path injects `exec`.
- Rollout note: this host's installed `janitor-record.service` has 0 occurrences of `--apply`. Nothing starts acting until the installer is re-run on each of the four hosts, so the integrator's rollout step has to include that.

**6. The racy-index refresh in production (measured, `/var/tmp/l59rev-p1tW/probe-racy.mjs`, real clock, no backdating).**
- In an ordinary worktree, janitor's own first `isTreeClean` after checkout rewrites the admin `index` once:
  - `plain`, `core.untrackedCache=true` and a same-content touch of a tracked file all show `indexRewritten: true` on run 0;
  - runs 1-3 show `false`.
- The index is therefore partly a self-inflicted signal. Janitor's first look, or any stat-only change to a tracked file, resets the idle clock, and since gatherState runs before applySafe, this happens within the same run.
- The effect only ever makes a worktree look more recent: reclaim is delayed by at most one daily cycle. It never makes an active worktree look idle, so it is not a safety defect.
- The builder's `now`-override test design is the right response.
