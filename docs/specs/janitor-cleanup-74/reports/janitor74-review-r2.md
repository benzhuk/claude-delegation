VERDICT: NEEDS_FIXES (4) 171bb68eca3aa3684164153e6d5ee2ccaf1deacf

# janitor74 review, round 2 (delta re-review)

NEEDS_FIXES

Territory: janitor74. Worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-janitor-cleanup-74-janitor74, HEAD 171bb68eca3aa3684164153e6d5ee2ccaf1deacf (my own `git rev-parse HEAD`). Range read: `git diff 75312224..HEAD`, one commit, 7 files, +479/-74. The worktree is clean (`git status --short` is empty). Counts: 0 BLOCKER, 2 MAJOR (one is a regression introduced by the MAJOR 2 fix, one is MAJOR 6 carried over), 2 MINOR.

## Gate re-run (mine)
I ran the brief's Gate list plus janitor-sweep.test.mjs and janitor-timer-refresh.test.mjs, with output going to my session scratchpad (`.../scratchpad/j74r2/gate.log`). Result: exit 0, `tests 458, pass 396, fail 0, skipped 62`. That matches the builder's log. No hook file changed. install-janitor-timer.mjs is unchanged, so the timer units are still byte-stable.

## Guard block (reported verbatim; I did not retry it)
I wrote one live probe: a report-mode `main(["--no-fetch","--sweep"])` against a sealed fixture home, with `fs.renameSync` instrumented to log calls. Writing it through a Bash heredoc was refused:
`PreToolUse:Bash hook error: [C:/Users/benzh/.claude/hooks/secret-guard.sh pretooluse]: SECRET-GUARD: blocked — command references a secret file. Use ~/.claude/scripts/secret-tool.sh (check|fingerprint|sync|set|grep-safe|scrub) — it never prints values. To read a non-secret part of that file, copy the needed non-secret lines via secret-tool grep-safe.`
I stopped that step and did not repeat it through another tool. The new finding below rests on the code path, which is direct: three call sites, each quoted with file:line.

## Prior findings, one by one
- **BLOCKER 1 (test guard bypass): FIXED, verified.** The fix is at scripts/janitor.mjs:2239: `if (!sweepOpts.roots && process.env.NODE_TEST_CONTEXT) return null;`.
  - The rewritten test is janitor-sweep.test.mjs:604. It writes a policy that names `roots`, passes no `sweepOpts`, and runs without `--apply`, so main reaches the guard.
  - The test tells the old code from the new: the old `!policy.roots` clause would have let the sweep run and print SWEEP.
- **MAJOR 1 (stale open record copy): FIXED, verified.** scripts/janitor-owner.mjs:63 now holds `closedWork`, and a work id with any closing copy no longer owns anything.
  - Test janitor-sweep.test.mjs:426 shows both states: owned while open, then `would-archive-then-remove` while the worktree's own checkout still says `Status: open`.
  - `work` falls back to the file basename (janitor-owner.mjs:38), so it is never undefined.
- **MAJOR 2 (win32 live-process gate): the gate is FIXED, but the fix created a regression; see NEW MAJOR A.**
  - `sweepPathInUse` is at scripts/janitor.mjs:2219-2224. A catastrophic probe now stops the sweep and keeps the rows already produced (janitor-sweep.mjs runSweep try/catch).
  - The main()-level test with a real child process (janitor-sweep.test.mjs:615) runs the real rename probe on this Windows host and passes.
- **MAJOR 3 (deregistered idle and live gates): FIXED, verified.** The idle floor and the process check now run before any archive (scripts/janitor-sweep.mjs:262-270). Test :466 runs plusDays 0 and gets `keep`, HEAD still `main`, nothing pushed. The same in-use regression applies here (NEW MAJOR A).
- **MAJOR 4 (failed archive leaves an altered checkout and goes silent): FIXED, verified by reading the code and test :480.**
  - `fail()` re-attaches with `symbolic-ref HEAD refs/heads/<branch>`, or with `update-ref --no-deref HEAD <sha>` when HEAD was detached. Nothing is reset, so the archived content stays staged and the row comes back on the next run.
  - A local `archive/*` branch that is not on origin is now reported as `unpushed-archive`.
  - A side effect, not counted as a finding: each further failed run commits again with a new timestamp, so a new local `archive/<slug>-<sha7>` piles up per run while origin keeps refusing. Each of them is reported. Nothing is lost.
- **MAJOR 5 (skip-worktree and assume-unchanged edits): FIXED, verified.** The `ls-files -v` check in archiveCheckout runs before any detach (scripts/janitor-archive.mjs:98-101). Test :507 gets `skipped`, the edit is intact, and nothing is pushed.
- **MAJOR 6 (item 6 not wired): NOT FIXED. Carried as MAJOR B below.** The builder escalated correctly: wiring-check.mjs is outside the files the brief names.
- **MINOR 1 (per-repo main branch): FIXED, verified.** `resolveMain` tries origin/HEAD, then the repo's project.json, then main, then master. If none resolves, the run prints a `keep` row instead of returning silently. Test :520.
- **MINOR 2 (exclude list on registered worktrees): FIXED, verified.** The check is at scripts/janitor-sweep.mjs:99. Test :533.
- **MINOR 3 (BTO by remote): FIXED, verified.** The default pattern `github.com/nucleusfilms/` is correct. I checked the origin URLs of the real BTO repos under ~/Code/BTO (read-only `remote get-url`): bto_nucleus, bto_team, bto-nielsen and bto-workflows all point at `github.com/nucleusfilms/`. The remote is checked at row time and again inside archiveCheckout and archiveThenDeleteBranch, before any push.
- **MINOR 4 (timer refresh trusts the unit file; the 5 s budget): FIXED, verified.**
  - `refresh.json` is written only after the installer returns 0.
  - `makeBoundedExec` gives each exec 2 s and stops at a 4.5 s total; its fake-clock test checks the clipping arithmetic.
  - `~/.agents/janitor/` is where installed.json lives, so the directory exists whenever a refresh can run.
- **MINOR 5 (sweep missing from --record; exit code): FIXED, verified.**
  - `sweep` is added to the record only when the sweep ran, so a record from a run without the sweep is byte-identical (scripts/janitor.mjs:2072).
  - The sweep now runs before the normal-path record write. Test :632 shows it.
  - The exit-code part needs a lead ruling, listed under Rulings below. It is not counted as a finding.
- **MINOR 6 (process): the rule was broken again; carried as MINOR D.**

---

## NEW MAJOR A: report mode now renames real directories on Windows. The in-use probe runs before the policy or `--apply` gate.
Evidence:
- scripts/janitor-sweep.mjs:125 (`if (ctx.deps.pathHasOpenProcess(wt.path) !== false)`) runs BEFORE :139 (`if (!ctx.acts(CLASS_IDS.dirtyWorktree))`).
- scripts/janitor-sweep.mjs:267 runs BEFORE :276 for the deregistered class.
- On win32 `pathHasOpenProcess` is now `sweepPathInUse` (scripts/janitor.mjs:2219-2224), which calls `winRenameBusyProbe`. That function renames the directory to `<path>.janitor-busy` and back (scripts/janitor.mjs:1470-1490).
- So any sweep run renames every idle, dirty, orphan worktree and every idle, dirty, deregistered folder in its roots, whether or not a class acts. That covers `--sweep` with no policy file and the scheduled run once any policy file exists, even `{"act": []}`. BTO-remote worktrees are probed too, because the remote check comes after the probe (:134 vs :125).
- When the probe hits its catastrophic case (a handle appears in the gap), a report-only run leaves the directory at `<path>.janitor-busy` and stops.
- applySafe probes only inside `if (state.act === true)` (scripts/janitor.mjs:1536, probe at :1557). The sweep broke that existing rule.
- This is the named failure class "a report-mode gate that silently acts", and it targets the dirs most likely to belong to a live session: lane scratch clones and agent worktrees on Ben's main host.

Fix (mechanical): probe only when the class is about to act. A report-mode row then says `would-archive...` without a probe; the acting run checks again before it touches anything.

scripts/janitor-sweep.mjs:125, exact current code:
```js
    if (ctx.deps.pathHasOpenProcess(wt.path) !== false) {
      rows.push(row(CLASS_IDS.dirtyWorktree, { ...base, action: "keep", detail: "a process holds this directory (or it could not be checked)" }));
```
replacement:
```js
    // The in-use check is a rename on win32: run it only when this class will act (report mode never touches a tree).
    if (ctx.acts(CLASS_IDS.dirtyWorktree) && ctx.deps.pathHasOpenProcess(wt.path) !== false) {
      rows.push(row(CLASS_IDS.dirtyWorktree, { ...base, action: "keep", detail: "a process holds this directory (or it could not be checked)" }));
```
scripts/janitor-sweep.mjs:267, exact current code:
```js
    if (ctx.deps.pathHasOpenProcess(folder.path) !== false) {
```
replacement:
```js
    if (ctx.acts(CLASS_IDS.deregistered) && ctx.deps.pathHasOpenProcess(folder.path) !== false) {
```
Add a test: run `sweep({ apply: false })` and also `sweep({ apply: true, act: [] })` on a dirty orphan aged 2 days, plus a dirty deregistered clone, with `depsOver: { pathHasOpenProcess: () => { calls += 1; return false; } }`. Assert `calls === 0`, and that the rows are `would-archive-then-remove` and `would-archive`.

Predicted outcome:
- The new test fails on the current code (calls >= 2) and passes after the patch.
- These existing tests all use `apply: true` with the class listed, so they still reach the probe and stay green: :442, :456, :466, the real-process main() test :615, and the record test :632.

## MAJOR B (carried from round 1, MAJOR 6): spec item 6 is still not delivered. Nothing calls `refreshIfRegistered()`.
Evidence: `grep -rn janitor-timer-refresh` finds no caller outside the script and its own test, and no hook file changed. The builder stopped at the territory boundary, which was correct: scripts/wiring-check.mjs is not among the files the brief names.
Fix (the orchestrator's call): either widen janitor74 to scripts/wiring-check.mjs plus scripts/wiring-check.test.mjs, or hand the wiring to whoever owns those files.
- The change: call `refreshIfRegistered()` from wiring-check's `--hook` SessionStart path, inside a try/catch so it fails open, after that path's own output.
- The test: the hook entry calls it, with an injected `install`, so no real scheduler is ever called.
- Until that lands, item 6 is "script ready, not wired", and the lane cannot claim item 6.

## MINOR C: a worktree that was archived but whose removal git refused drops out of every later report
Evidence: scripts/janitor-archive.mjs:140 returns `failed ... archived as <ref>; worktree remove refused` once. The worktree is now clean and detached at the archive tip, so on the next run scripts/janitor-sweep.mjs:117 (`counts.dirty === 0 && counts.ignored === 0` → continue) skips it. The builder lists this as residual risk 1.
- Nothing is lost: the archive is on origin.
- But a stalled folder (a nested repo, the round-1 P2 case) then goes unreported. That is the named failure class "a cleanup that passes because it is not looking".

Fix (instruction): in sweepWorktrees, before the clean-tree `continue`, check for a non-main worktree with no branch whose HEAD equals the tip of a local `archive/*` branch. Push a report-only row for it: `archived; removal refused earlier, needs a hand`.
Predicted: a P2-shaped fixture prints that row on every run, and nothing acts.

## MINOR D (process): a guard-blocked command was re-issued in a reshaped form
Evidence: builder report r2, "Guard hits". A SECRET-GUARD refusal of a Bash edit command was followed by "I re-issued the same edits through Bash as smaller replacements that did not quote that line."
- The brief says "stop that step and report it verbatim; never do the same thing through another tool or shell." Reshaping the command so it no longer matches the guard is doing the same thing.
- A helper script, `rep.cjs`, was also left in C:/Users/benzh/AppData/Local/Temp, which is outside any scratch folder.
- The resulting code is correct (the gate passes), so this is about process, not code.

Fix: the orchestrator rules on it. Future rounds stop at a guard block, report it, and wait.

---

## Rulings for the orchestrator (not counted as findings)
- **Exit code (round-1 MINOR 5):** an `--apply` run now returns 1 when a sweep row is `failed` or `stopped`. The line is scripts/janitor.mjs:2402-2404 (`sweepFailed`).
  - It is never 2, and no existing run's code changes, because such a row needs a policy-enabled class.
  - But the brief said to check in before changing exit codes. Keep it or revert it; reverting means deleting the `sweepFailed` term.
- **`unpushed-archive` uses the remote-tracking ref.** In a clone with a narrow fetch refspec (for example `--single-branch`), every pushed archive is reported as unpushed forever. The row is report-only and never acts.

## Attack-brief answers (delta)
- **Work lost:** no new path loses content. Re-attaching after a failure never discards anything, the hidden-edits check runs before the detach, and removal still needs `ls-remote` proof.
- **Report mode:** with no policy file and no `--sweep`, the output is byte-identical (tests :587 and :596). With `--sweep` or any policy file, report mode now mutates the filesystem on win32 (NEW MAJOR A).
- **Ownership:** stale open copies are fixed, and the deregistered class now has its idle and live gates.
- **Roots and exclusions:** the exclude list now covers registered worktrees, and BTO is matched by remote with the right org.
- **Push scope:** unchanged and correct. Only `archive/` refs are pushed, never forced, and an excluded remote is refused inside the archive functions.
- **Item 5:** no change in this round.
- **Item 6:** the refresh logic is now sound, but nothing calls it (MAJOR B).
- **Items 7 and 8:** the policy gate is tested both ways, and the test-run guard test now tells the old code from the new.

## Cause / fix fields (NEW MAJOR A)
Cause: the round-1 MAJOR 2 fix swapped a read-only in-use check for win32's rename probe, but left the call ahead of the report-mode gate, where the old check (always false on win32) was harmless.
Discriminating check: a test with a counting `pathHasOpenProcess` dep, `apply: false` and a 2-day-old dirty orphan sees calls >= 1 today and 0 after the patch.
Fix location: scripts/janitor-sweep.mjs:125 and :267.
Simplification: the probe runs only where the class acts, the same rule applySafe already keeps (scripts/janitor.mjs:1536).
