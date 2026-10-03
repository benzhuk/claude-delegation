VERDICT: NEEDS_FIXES (13) 75312224504694c786a08ed9289f47a2d7d21f47

# janitor74 review, round 1

NEEDS_FIXES

Territory: janitor74. Worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-janitor-cleanup-74-janitor74, branch build/janitor-cleanup-74-janitor74, HEAD 75312224504694c786a08ed9289f47a2d7d21f47 (`git rev-parse HEAD`, run by me). Diff read: `git diff 6b302f93...HEAD` (8 files, +1406/-1). Counts: 1 BLOCKER, 6 MAJOR, 6 MINOR.

## Gate re-run (mine, not the builder's log)
Ran the brief's exact Gate list plus the two new test files, output to my scratch (`.../scratchpad/lane-74/review-janitor74-r1/gate.log`):
```
ℹ tests 443
ℹ pass 381
ℹ fail 0
ℹ skipped 62
exit=0
```
That matches the builder's log. Commits carry Ben Zhuk's identity and no trailers. hooks/hooks.json, hooks/codex-hooks.json and install-janitor-timer.mjs are unchanged, so none of the six hook tests can trip and the timer units stay byte-stable.

## Live fixture probes (sealed home from scripts/test-home.mjs, fixture bare origins, injected roots and clock)
I could not keep the fixtures under the record's Scratch path: it is too long for git on Windows ("Filename too long", "'$GIT_DIR' too big"). So the probes ran the same way the gate's own tests do: `makeTempHome()` in the system temp dir, removed again by its own `th.cleanup()`. The probe scripts are `probe.mjs` and `probe2.mjs` in my scratch dir. Results:
- P1, stale record copy: the lane record is closed on main, but the territory worktree's own checkout still holds the "open" copy. Result `owned: 1`, no row, worktree kept. See MAJOR 1.
- P2, nested repo with a local-only commit inside an orphan dirty worktree: archived as `archive/nest-<sha7>`, then `worktree remove refused: working trees containing submodules cannot be moved or removed`. The nested commit is intact. **No loss.**
- P3, win32, a live child process with its cwd in the worktree: `pathHasOpenProcess: false`. Archived, then `git worktree remove` emptied the directory (`wtEntries: []`) and unregistered it, and only the final rmdir failed. See MAJOR 2.
- P4, origin pre-receive rejects the push: row `failed push failed`, worktree kept but left at `## HEAD (no branch)`, local `archive/rej-<sha7>` created. The **second run prints no row at all**. See MAJOR 4.
- P5, deregistered dirty clone edited "now" (clock not advanced): `archived` at once, clone left detached. See MAJOR 3.
- P6, a policy `exclude` naming a registered worktree: `archived-then-removed`. See MINOR 2.
- P7, an orphan worktree with a `--skip-worktree` file holding a local edit: `archived-then-removed`. The archive's README.md is `root`, so **the local edit is lost**. See MAJOR 5.
- probe2, run with `NODE_TEST_CONTEXT` set and a policy file carrying `roots`: `sweepRanUnderTestContext: true`. See BLOCKER 1.

---

## BLOCKER 1: the test-run guard is bypassed by a policy file that carries `roots`. Existing tests can then sweep and act on the real home.
Evidence: scripts/janitor.mjs:2229
`if (!sweepOpts.roots && !policy.roots && process.env.NODE_TEST_CONTEXT) return null;`
- `policy` is `loadSweepPolicy(home)`. scripts/janitor.test.mjs calls `main(["--apply", "--min-age-hours", "0"], { cwd: root, now: ... })` with **no `home`** at l.227, 266, 473, 514, 649, 674, 720, 755, 818, 874, 1027, 1185, 1229 and more. Those calls therefore read the REAL `~/.agents/janitor-policy.json`.
- Once the lead writes that file after Ben's tick with a `roots` key (the builder's own report recommends setting `roots` there), the guard no longer applies. A `node --test scripts/janitor.test.mjs` run then sweeps the real roots with `apply` true (`act === "applied"`). It would run `fetchOrigin` against real repos, push `archive/...` to real origins and `git worktree remove` real orphan worktrees.
- probe2 shows the guard falling through with NODE_TEST_CONTEXT set (fixture roots there): `"sweepRanUnderTestContext": true`.
- The test meant to pin this guard is vacuous. scripts/janitor-sweep.test.mjs:419-427 runs `runMain(["--no-fetch", "--sweep", "--apply"])`, and main returns 3 at scripts/janitor.mjs:2275 (`--apply needs this run's own fetch; --no-fetch is report-only`) before the sweep is ever reached. It passes with or without the guard.

Cause: the guard trusts any root list that was not injected by the caller, including one read from the real home's policy file.
Discriminating check: probe2 (`NODE_TEST_CONTEXT` set, policy file with `roots`, no `sweepOpts`) prints `SWEEP (multi-root` today. After the fix it prints nothing.
Fix location: scripts/janitor.mjs:2229, plus the test at scripts/janitor-sweep.test.mjs:419-427.
Simplification: under a test runner, only an injected `sweepOpts.roots` may ever sweep. Drop the `policy.roots` exemption.

Patch (scripts/janitor.mjs:2229), exact current code:
```js
    if (!sweepOpts.roots && !policy.roots && process.env.NODE_TEST_CONTEXT) return null;
```
replacement:
```js
    if (!sweepOpts.roots && process.env.NODE_TEST_CONTEXT) return null;
```
Patch (scripts/janitor-sweep.test.mjs:419-427), exact current code:
```js
  test("under node --test the default roots are never swept, even with --sweep and a policy file", () => {
    writePolicy([CLASS_IDS.dirtyWorktree]);
    try {
      const r = runMain(["--no-fetch", "--sweep", "--apply"]);
      assert.doesNotMatch(r.out, /SWEEP/);
```
replacement (no `--apply`, so main reaches the sweep, and a policy that carries `roots`):
```js
  test("under node --test the default roots are never swept, even with --sweep and a policy file that names roots", () => {
    fs.mkdirSync(path.join(HOME, ".agents"), { recursive: true });
    fs.writeFileSync(path.join(HOME, ".agents", "janitor-policy.json"), JSON.stringify({ act: [CLASS_IDS.dirtyWorktree], roots: [{ kind: "code", path: CODE }] }));
    try {
      const r = runMain(["--no-fetch", "--sweep"]);
      assert.doesNotMatch(r.out, /SWEEP/);
```
Predicted outcome: the new test fails on the current code (SWEEP printed, as in probe2) and passes with the patch. The other sweep-running main() tests all inject `sweepOpts.roots`, so they stay green.

## MAJOR 1: a closed or accepted record does not release a worktree that carries its own stale "open" copy of that record
Evidence: scripts/janitor-owner.mjs:24-48 collects records from the repo AND from every registered worktree (scripts/janitor-sweep.mjs:292), each copy kept separately (dedupe is by file path). Then scripts/janitor-owner.mjs:61-62 accepts any copy whose `open` is true. Every territory worktree is cut from the lane base, which holds the record as `Status: open`, so its checkout keeps that "open" copy forever. That copy owns the worktree through the territory-branch rule (l.71) after the lane has been closed on main. Probe P1: record `closed` on main, territory worktree dirty and idle 48 h → `owned: 1`, no row, never archived.
- This defeats spec item 3 for exactly its target, "a dirty worktree whose record is accepted or closed". It also keeps any record alive that is open in any stale worktree's checkout.
Fix (mechanical): a work id counts as open only when no copy of it carries a closing status (closure never reverses). In scripts/janitor-owner.mjs `ownerOf`, exact current code:
```js
export function ownerOf(subject, repoRoot, worktrees, records) {
  for (const rec of records) {
    if (!rec.open || !rec.worktree) continue;
```
replacement:
```js
export function ownerOf(subject, repoRoot, worktrees, records) {
  const closedWork = new Set(records.filter((r) => !r.open).map((r) => r.work));
  for (const rec of records) {
    if (!rec.open || !rec.worktree || closedWork.has(rec.work)) continue;
```
Add a test: record committed `open` on main, territory worktree cut, then the record is changed to `closed` on main and the territory worktree made dirty. Expect `would-archive-then-remove`, not owned. Predicted: P1 becomes an orphan row, and the existing ownership test still passes (its records exist once each).

## MAJOR 2: on Windows the live-process gate is a constant `false`, so a live session's worktree is archived and emptied
Evidence: scripts/janitor-sweep.mjs:123 asks `ctx.deps.pathHasOpenProcess(wt.path) !== false`, and the wiring passes `worktreeHasOpenProcess` (scripts/janitor.mjs, runSweepIfWanted deps). That function documents "win32: this function is never called there" and falls through to `return false` (scripts/janitor.mjs:1448). applySafe uses `winRenameBusyProbe` on win32 instead (scripts/janitor.mjs:1556-1572). Probe P3 (win32, child process with cwd in the worktree): `pathHasOpenProcess: false` → archived → `git worktree remove` deleted every file under the live process (`wtEntries: []`) and unregistered the worktree. The content is on origin, so nothing is lost, but a live session's tree is wiped from under it on Ben's main host. The brief's own rule: "A live session (open process ...) protects it."
Fix: in scripts/janitor.mjs, give the sweep a platform-aware check. Exact current code (inside runSweepIfWanted):
```js
      deps: { listWorktrees, listRecords, idleHours, pathHasOpenProcess: worktreeHasOpenProcess, fetchOrigin },
```
replacement:
```js
      deps: { listWorktrees, listRecords, idleHours, pathHasOpenProcess: sweepPathInUse, fetchOrigin },
```
and add, next to runSweepIfWanted:
```js
// Lane 74 review: win32 has no /proc or lsof; the rename probe is the real check there (same as applySafe).
function sweepPathInUse(p) {
  if (process.platform !== "win32") return worktreeHasOpenProcess(p);
  const probe = winRenameBusyProbe(p);
  if (probe.catastrophic) throw new Error(`in-use probe could not put ${p} back: ${probe.detail}`);
  return probe.busy;
}
```
Follow applySafe's rule that a catastrophic probe stops the run: runSweep should catch that throw, stop, and return the rows so far plus one "stopped: ..." row, so rows already acted on are still printed. Today a throw is turned into a bare "SWEEP: skipped". Predicted: P3 gives `keep: a process holds this directory`, the worktree is intact and nothing is pushed.

## MAJOR 3: the deregistered class acts with no idle floor and no live-process check
Evidence: scripts/janitor-sweep.mjs:196-234 (`sweepDeregistered`) goes straight from `counts.dirty > 0` to `archiveCheckout`. There is no `idleHours`, no `pathHasOpenProcess` and no ownership check. archiveCheckout then detaches HEAD and commits inside the folder (scripts/janitor-archive.mjs:87-93). Probe P5: a clone under `<repo>/.claude/worktrees/` edited "now" (clock not advanced) was archived at once and left at `## HEAD (no branch)`. The `/var/tmp/lane-*` root on the Linux hosts is exactly where live lane checkouts sit. The brief: "A worktree younger than the 24 h idle floor is never archived".
Fix (mechanical): in `sweepDeregistered`, right after the `counts.dirty === 0` branch and before `if (!ctx.acts(CLASS_IDS.deregistered))`, insert:
```js
    const idle = ctx.deps.idleHours(folder.path, { home: ctx.home, now: ctx.nowMs });
    if (!Number.isFinite(idle) || idle < IDLE_FLOOR) {
      rows.push(row(CLASS_IDS.deregistered, { ...base, action: "keep", detail: `dirty (${counts.dirty} changed); idle ${Number.isFinite(idle) ? `${Math.floor(idle)}h < ${IDLE_FLOOR}h` : "unknown"}` }));
      continue;
    }
    if (ctx.deps.pathHasOpenProcess(folder.path) !== false) {
      rows.push(row(CLASS_IDS.deregistered, { ...base, action: "keep", detail: "a process holds this directory (or it could not be checked)" }));
      continue;
    }
```
Predicted: P5 gives `keep ... idle 0h < 24h`, HEAD is not detached and nothing is pushed. The two existing deregistered tests use `plusDays = 2`; their fixtures are fresh, so idleHours should report about 48 h and they stay green. Confirm by running them.

## MAJOR 4: a failed archive leaves the checkout altered and then disappears from every later report
Evidence: scripts/janitor-archive.mjs:87-103 detaches HEAD, runs `add -A` and `commit`, and `branch -f archive/...` BEFORE the push. On push failure (l.101-102) nothing is put back. On the next run the tree is clean (scripts/janitor-sweep.mjs:116 `continue`), and the local `archive/*` branch is skipped by the branch class (l.156 `branch.startsWith("archive/")`). Probe P4: first run `failed push failed`; second run no row at all; worktree at `## HEAD (no branch)`; the uncommitted work now exists only in a local, unreported, unpushed `archive/rej-<sha7>`. The same leftover state follows any failure after the detach (add or commit refused, index.lock), and the gitlink case (P2). This is the named failure class "passes because it is not looking": the work is stalled and nobody is told.
Fix (instruction):
1. In archiveCheckout, record `origHead` (`rev-parse HEAD`) and `origBranch` (`symbolic-ref -q --short HEAD`, may be empty) before the detach.
2. On ANY failure after the detach (add, commit, branch, push, not confirmed), re-attach without discarding anything. If there was a branch: `git symbolic-ref HEAD refs/heads/<origBranch>` (its tip is still `origHead`). If HEAD was detached: `git update-ref --no-deref HEAD <origHead>`. The archived content then shows as staged changes, still in the tree and index, so the row comes back on every run.
3. In sweepBranches, report a local `archive/*` branch that is absent on origin as `unpushed-archive` (report-only), instead of skipping every `archive/` name.
Predicted: P4's second run again shows the worktree with a `failed push failed` row. `git status -sb` shows `## feat/rej` plus staged changes, and the local archive branch is listed.

## MAJOR 5: edits hidden from `git status` (skip-worktree, assume-unchanged) are lost by archive-then-remove
Evidence: scripts/janitor-archive.mjs:46-57 (`statusCounts`) and 81-86 trust `git status`, which never shows a modified `--skip-worktree` or `--assume-unchanged` file. `add -A` skips it, and the non-forced `git worktree remove` sees a clean tree and deletes it. Probe P7: `archived-then-removed`, and `git show archive/...:README.md` = `root` while the worktree held `precious local edit`. That is uncommitted content removed without being pushed.
Fix (mechanical): in archiveCheckout, exact current code:
```js
  if (counts.ignored > 0) return { ok: false, skipped: `${counts.ignored} ignored path(s) would be lost; not archived` };
```
replacement:
```js
  if (counts.ignored > 0) return { ok: false, skipped: `${counts.ignored} ignored path(s) would be lost; not archived` };
  const flags = tryRun(["ls-files", "-v"], dir);
  if (!flags.ok) return { ok: false, error: "ls-files -v failed" };
  const hidden = flags.out.split("\n").filter((l) => /^(S|[a-z]) /.test(l)).length;
  if (hidden > 0) return { ok: false, skipped: `${hidden} skip-worktree/assume-unchanged path(s) hide edits from git status; not archived` };
```
Add a P7-shaped test. Predicted: row `skipped`, worktree kept, edit intact. Sparse-checkout worktrees will be reported, not archived, which is the loss-free reading.

## MAJOR 6: spec item 6 is not delivered. Nothing runs janitor-timer-refresh.mjs.
Evidence: the builder's report, "Not done": the SessionStart wiring was reverted because hooks/codex-unsupported.test.mjs requires a Codex route or an unsupported row. `git diff --stat` touches no hook file. The script and its 6 tests are sound as far as they go: they never install a never-installed timer, refuse a non-cache root, read UTF-16 task XML, and call no real scheduler. But spec item 6 ("Install of the plugin re-registers the janitor timer ... on every host") does not happen on any host.
Fix (lead's decision, both cheap): (a) call `refreshIfRegistered()` from the existing wiring-check SessionStart route, which both hosts already run, so no new hook entry is needed; or (b) add the hook plus a codex-unsupported row and run the six extra hook tests the brief names. Either way, add a test that the chosen entry point calls it with a 5 s bound. (a) is simpler.

## MINOR 1: the merged-origin and unmerged-branch classes use the pinned repo's main branch for every repo
Evidence: scripts/janitor.mjs passes `mainBranch: config.main_branch || "main"` from the ONE pinned repo. scripts/janitor-sweep.mjs:147-150 and 183-184 return silently when `origin/<that name>` is absent, so every `master`-default repo under ~/Code gets no branch rows at all.
Fix: resolve per repo with `git symbolic-ref --short refs/remotes/origin/HEAD` (strip `origin/`), then that repo's `.agents/project.json` `main_branch`, then `main`. When no base resolves, push one `keep` row ("no main branch resolved") instead of `return`.

## MINOR 2: the policy `exclude` list (and BTO/dotfiles by path) is applied only to repo discovery, never to a registered worktree or branch
Evidence: `isExcludedPath` is called in scripts/janitor-roots.mjs:98 and 129 only. sweepWorktrees (scripts/janitor-sweep.mjs:96-142) acts on every registered worktree of a scanned repo wherever it lives. Probe P6: a worktree listed in `exclude` → `archived-then-removed`.
Fix (mechanical): import `isExcludedPath` from ./janitor-roots.mjs, set `exclude: allExclude` on ctx in runSweep, and in sweepWorktrees after `if (wt.main || wt.bare) continue;` add:
```js
    if (isExcludedPath(wt.path, { home: ctx.home, exclude: ctx.exclude })) continue;
```
Predicted: P6 is untouched.

## MINOR 3: BTO exclusion is by path only. A BTO clone outside `<home>/Code/BTO` is archived to BTO's origin.
Evidence: scripts/janitor-roots.mjs:42-47 checks paths only. A dirty stray BTO clone under the Temp scratch root, orca/workspaces or `/var/tmp/lane-*` is archived and pushed (`archive/...`) to its BTO origin by `deregistered-folder-archive` (scripts/janitor-sweep.mjs:222). Ben: "leave BTO to BTO".
Fix: before any archive push, read `remote get-url origin` and skip with `excluded (BTO remote)` when it matches a configurable `excludeRemotes` pattern list in the policy file, defaulting to the BTO org's remote pattern.

## MINOR 4: the timer refresh trusts the on-disk unit copy, written before the scheduler accepted it, and can run past the 5 s budget
Evidence: the installer writes the unit or XML (scripts/install-janitor-timer.mjs:1028) before running the scheduler commands (l.1047-1063). If `schtasks /Create` hits the 3 s bound (scripts/janitor-timer-refresh.mjs:21, 96), or `launchctl load -w` fails on an already-loaded job, the installer returns 1. The file on disk already names the new root, so the next session reads `current` (l.87-88) and never retries, while the registered task still runs the old release. On systemd two execs at up to 3 s each (`daemon-reload`, `enable --now`) can exceed the 5 s hook timeout.
Fix: after `install` returns 0, write `~/.agents/janitor/refresh.json` `{ root, ok: true }` (overwrite, no unlink). Treat "baked root equals this root but refresh.json does not record it ok" as not current, so the refresh is retried. Keep the total exec time under 5 s with one deadline, for example 2 s per exec with at most 2 execs.

## MINOR 5: sweep actions are not in the `--record` evidence, and a failed sweep act never shows in the exit code
Evidence: scripts/janitor.mjs calls `writeRecordIfRequested()` before `runSweepIfWanted`, and the record holds only `applyLog`. The scheduled run (`--record --repo X --apply`) therefore keeps no evidence of which worktrees the sweep archived and removed, or which archive failed. Only stdout carries it. The exit code ignores `failed` sweep rows.
Fix: write the sweep rows into the record (run the sweep before `writeRecordIfRequested`, or add a `sweep` field to it). Exit code: the brief says check in before changing exit codes, so the lead decides; if allowed, a `failed` sweep row under `--apply` returns 1, never 2.

## MINOR 6 (process): a guard-blocked command was redone through another tool
Evidence: builder report, "Guard hits": two Bash heredocs writing source files were refused by SECRET-GUARD, and the builder then wrote "the same files with the Write tool". The brief and the spec both say: "stop that step and report it verbatim; never do the same thing through another tool or shell." The block was probably a false positive (the file text contains `process.env`), but the rule allows no exception. The builder also left `/tmp/edit-j.mjs` outside the scratch dir.
Fix: the orchestrator rules on the two Write-tool writes. Future rounds stop and report a guard block instead of switching tools.

---

## Attack-brief answers
- **Work lost:**
  - untracked files: archived (test plus my run).
  - ignored file: kept, with its count.
  - file with spaces: safe by construction (execFile arrays, no shell); not separately probed.
  - symlink: not probed.
  - submodule or nested repo (P2): no loss, removal refused.
  - locked worktree: kept (scripts/janitor-sweep.mjs:107).
  - detached HEAD: handled.
  - branch already on origin: kept.
  - origin rejects the push (P4): no loss, but MAJOR 4.
  - no git identity: skipped and reported.
  - Is the worktree removed before the push is confirmed? Never: `ls-remote` proves the push before `worktree remove` (scripts/janitor-archive.mjs:69-70, 108-111).
  - Is uncommitted, unpushed content removed? Yes in one case: skip-worktree and assume-unchanged edits (MAJOR 5).
- **Report mode:** verified, no defect. With no policy file, nothing acts even with `--apply` (`ctx.acts` needs both apply and a listed class, scripts/janitor-sweep.mjs:278). Without `--sweep` or a policy file, `runSweepIfWanted` returns null, so the text and `--json` output are identical. Exit codes are untouched (0/1/3, never 2).
- **Ownership:**
  - absolute path, repo-relative path (path.resolve against the main tree; code only, not tested), branch name and territory `<owned>-<suffix>`: all correct.
  - "a closed or accepted record does not protect": broken by stale copies (MAJOR 1).
  - 24 h floor: held for registered worktrees, missing for deregistered folders (MAJOR 3).
  - live session: recent session file honoured through idleHours; open-process check vacuous on win32 (MAJOR 2).
- **Roots:**
  - second repo seen; BTO and dotfiles by path (MINOR 3 for clones elsewhere); deregistered folders listed.
  - a folder outside every root is not scanned. Registered worktrees of a scanned repo are acted on wherever they live, by design, but ignore `exclude` (MINOR 2).
  - Tests never use the real home directly, but the guard has the latent hole in BLOCKER 1.
- **Push scope:** verified, no defect. Only `archive/<slug>-<sha7>` is pushed (assertArchiveRef plus an explicit `refs/heads/...` refspec), never forced, never main. A name collision is a non-fast-forward push, which is rejected, and the `ls-remote` sha check catches any mismatch.
- **Item 5 report part:** verified, no defect. Untracked files older than 7 days are reported by path, younger ones are not, and nothing is removed (`ls-files --others --exclude-standard`, cap 50 plus a "... and N more" line).
- **Item 6:**
  - Runs only when installed.json and the unit exist and the root differs.
  - Fails open; no real scheduler is called in tests; installer and units untouched; no hook file changed.
  - But it is not wired (MAJOR 6), and the stale-truth and 5 s issues are in MINOR 4.
- **Items 7 and 8:**
  - The policy gate is tested both ways: absent, corrupt, listed without `--apply`, and listed with `--apply`.
  - The named fixtures all exist: dirty worktree with untracked files, deregistered folder, second repo, dying builder.
  - One wiring test is vacuous (folded into BLOCKER 1).

## Scout and autonomy rulings
All seven are recorded in the builder's report. They are consistent with the brief's Autonomy text, except (5): archiving a deregistered folder needs the same idle and live gates (MAJOR 3). The merged-origin delete was kept report-only because the brief allows pushing only `archive/...` refs. That is a correct escalation, not a defect; the spec's "deleted daily" needs the lead's word.

## Cause / fix fields for the blocking finding
Cause: the NODE_TEST_CONTEXT guard exempts policy-file roots, and the old janitor tests read the real home's policy file.
Discriminating check: probe2 prints `sweepRanUnderTestContext: true` today and false after the one-line patch; the rewritten test at scripts/janitor-sweep.test.mjs:419 fails before the patch and passes after it.
Fix location: scripts/janitor.mjs:2229; scripts/janitor-sweep.test.mjs:419-427.
Simplification: under a test runner only injected roots sweep; no other exemption.
