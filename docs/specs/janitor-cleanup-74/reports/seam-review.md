VERDICT: NEEDS_FIXES (1) 0fba156fd03e631fbf9aba08821d7e24183deffa

# Lane 74 seam review, round 3 (delta)

NEEDS_FIXES

- Head: 0fba156fd03e631fbf9aba08821d7e24183deffa. I got it from my own `git rev-parse HEAD` in the integration worktree, at the start (01:37 ET) and again at the end (01:48 ET).
- Range read: `8394579836efd421dbdd46285e622cbf4638e563..HEAD`. That is one commit, 0fba156f "fix(janitor): clean unmerged orphan worktrees archived, scheduled run reports, no second archive branch". It touches scripts/janitor-sweep.mjs, scripts/janitor-sweep.test.mjs and scripts/janitor.mjs.
- `git status --short` at the end shows only the three untracked paths that were there before (briefs/, reports/, the loop-state json). The only file I wrote in the tree is this report.
- Counts: 0 BLOCKER, 0 MAJOR, 1 MINOR. All three prior findings are FIXED. I verified each one live in fixtures and by a mutation check.
- Fixtures: I copied round 2's scripts to `.../scratchpad/lane-74/seam-r3/` and re-ran them against the new head. Each run used a fresh fixture HOME, a fixture bare origin, and `GIT_CONFIG_GLOBAL` pointed at the fixture's .gitconfig. `--apply` ran only against fixtures. No command was denied.

## Prior findings

### Prior Finding 1 (BLOCKER: a clean, unmerged territory left by the phase commit is never cleaned or reported): FIXED

The new code is at scripts/janitor-sweep.mjs:130-150. A clean orphan on an unmerged branch that is not on origin now goes through the same idle, BTO, in-use and repoVerified gates as a dirty one, and then through `archiveThenRemoveWorktree`. The row carries `CLASS_IDS.unmergedBranch`. If the branch is on origin, the worktree gets a `report-only` row instead.

Fixture C1 (`node cde.mjs C1`, out-C1.txt) is the same shape that failed in round 2: a landed lane, then a late phase commit on t1, then the closeout refuses t1.

```
territory-branch: refused build/demo-1-t1 (not merged: 2063fc033067accad6a091ed192e5fc82f1e4195 is not an ancestor of origin/main)
$ janitor J1: main(["--apply","--min-age-hours","0"], now=+25h, home=fixture)
- [unmerged-branch-archive] archived-then-removed: <FX>/home/Code/repo/.claude/worktrees/wt-demo-1-t1 (build/demo-1-t1) - archive/wt-demo-1-t1-2063fc0 2063fc033067accad6a091ed192e5fc82f1e4195
$ janitor J2: main(["--apply","--min-age-hours","0"], now=+720h, home=fixture)
- [unmerged-branch-archive] archived-then-deleted: build/demo-1-t1 - already inside origin/archive/wt-demo-1-t1-2063fc0; no second archive
after closeout, J1 (+25h), J2 (+30d):
  local: archive/wt-demo-1-t1-2063fc0@2063fc0, main@9546c6c
  origin: archive/wt-demo-1-t1-2063fc0@2063fc0, main@9546c6c
```

Round 2 predicted this outcome, and it happened: main plus one archive ref.

A-br (out-A-br.txt), after the record is closed: J2 now archives the clean `lane-1` and the phase-committed clean `wt-demo-1-t3` too. J3 deletes their three branches with no second archive, and J4 prints `(nothing to report)`.

```
- [unmerged-branch-archive] archived-then-removed: <FX>/home/Code/repo/.claude/worktrees/lane-1 (build/demo-1) - archive/lane-1-54d7b05 ...
- [unmerged-branch-archive] archived-then-removed: <FX>/home/Code/repo/.claude/worktrees/wt-demo-1-t3 (build/demo-1-t3) - archive/wt-demo-1-t3-67ee320 ...
origin archive refs (4): archive/lane-1-54d7b05, archive/wt-demo-1-t1-3f534f0, archive/wt-demo-1-t2-bdaddfb, archive/wt-demo-1-t3-67ee320
```

The open-record twin did not regress. A-br J1 and A-abs J1, with the record open, both print `worktrees owned by an open record: 4` and `(nothing to report)`. The S0 and S1 snapshots are identical.

Mutation check: on a `git archive HEAD` copy under scratch, I replaced the new clean block with the old `continue;`. All three "FINDING 1" tests failed (`ℹ pass 1 / ℹ fail 3`). I then restored the copy.

### Prior Finding 2 (MAJOR: before the tick, the scheduled run printed no would-do rows): FIXED

scripts/janitor.mjs:2237 now reads `if (!argv.includes("--sweep") && !argv.includes("--record") && !policy.present) return null;`.

Fixture E1 (out-E1.txt) uses the timer's argv shape with no policy file:

```
$ janitor E1 no policy, timer argv shape: main(["--record","--repo","<FX>\home\Code\repo","--host","fxhost","--apply","--min-age-hours","0"], now=+25h, home=fixture)
SWEEP (multi-root, lane 74):
mode: report only; repos scanned: 1; worktrees owned by an open record: 0
- [dirty-worktree-archive] would-archive-then-remove: <FX>/home/Code/repo/.claude/worktrees/wt-orphan (feature/orphan) - 1 changed path(s), idle 25h; report mode
- [unmerged-branch-archive] would-archive-then-delete: stray - unmerged, local-only, no open record; report mode
- [merged-origin-branch-delete] report-only: old-merged - merged into origin main; deleting a non-archive ref is not done by this janitor
- [deregistered-folder-archive] would-archive: <FX>\home\orca\workspaces\repo\clone1 - 1 changed path(s), 0 ignored; report mode, then removal only via reclaim
APPLIED:
  worktree-remove  |  <FX>/home/Code/repo/.claude/worktrees/wt-done  |  true  | ...
  branch-delete  |  done  |  true  | ...
...
E1->E2 state identical: true
  files: ...wt-orphan\dirty.txt=true ...clone1\lost.txt=true
```

- The SAFE class still acts.
- Nothing new acts without the policy file.
- The `NODE_TEST_CONTEXT` guard on the next line still keeps test runs off the real roots. janitor.test.mjs calls `main(["--record", ...])` in-process with no roots at :1892, :1945, :2064, :3317, :3590 and :3728, and every one of those tests passed.

Mutation check: when I reverted the `--record` clause on the scratch copy, the "FINDING 2" test failed (`ℹ pass 3 / ℹ fail 1`). I then restored the copy.

### Prior Finding 3 (MINOR: second archive branch): FIXED

The fix is at scripts/janitor-sweep.mjs:252-259. A-br J3 gives `archived-then-deleted: build/demo-1 - already inside origin/archive/lane-1-54d7b05; no second archive`, and the same for t1 and t3. Origin keeps 4 archive refs, one per piece of work. In round 2 A-br J3 pushed `archive/build-demo-1-t1-cd07bdb` as a second archive; that no longer happens.

Mutation check: when I removed the block on the scratch copy, the first round-3 test failed (`ℹ pass 3 / ℹ fail 1`). I then restored the copy.

## Finding (new, from the delta)

### Finding 1: MINOR. The policy page does not tell Ben that ticking the branch line also removes the clean worktree that holds the branch

Spec item 7 says: "a page item lists each class with its action (archive then remove, delete, report)". The fix routes clean unmerged orphan worktrees through `unmerged-branch-archive`, and in acting mode that class now removes worktrees (`archived-then-removed`, out-C1.txt and out-A-br.txt above).

The page line Ben ticks for that class still describes a branch-only action. It also fires by default after 2026-10-03 12:00:

```
$ grep -n "Unmerged local-only branch" docs/decisions/waiting/janitor-policy.md docs/decisions/last-render.md
docs/decisions/waiting/janitor-policy.md:6:	- [ ] Unmerged local-only branch with no open record: push as archive/<name>, delete locally (recommended)
docs/decisions/last-render.md:81:		- [ ] Unmerged local-only branch with no open record: push as archive/\<name\>, delete locally (recommended)
```

No work is lost: the archive is pushed and proven before the remove, and the in-use check still guards it. But the consent text understates the action. Ben would be agreeing to have a worktree removed without being told.

Cause: the class's scope grew in 0fba156f (clean worktrees on unmerged local-only branches), and the page line written for the class before that did not grow with it.

Discriminating check: `grep -n "Unmerged local-only branch" docs/decisions/waiting/janitor-policy.md` prints a line that names the worktree removal and the 24 h idle floor.

Fix location: docs/decisions/waiting/janitor-policy.md:6. The lead's next decisions-page publish re-renders last-render.md. No test pins this text: `grep -rn "Unmerged local-only branch"` over *.mjs finds nothing.

Patch, docs/decisions/waiting/janitor-policy.md. Current:

```
	- [ ] Unmerged local-only branch with no open record: push as archive/<name>, delete locally (recommended)
```

Replacement:

```
	- [ ] Unmerged local-only branch with no open record, idle 24 h: push as archive/<name>, delete locally; a clean worktree that holds it is removed too (recommended)
```

Predicted outcome: the tick covers exactly what the class does. No code or test changes.

Simplification: one page line per class, naming every effect the class has.

## Seams re-run on the new head (all hold)

- **A, ownership, open versus closed:** holds.
  - With the record open (branch-name or absolute `Worktree:`), it shows `owned ... 4`, `(nothing to report)`, and nothing changes.
  - With the record closed, every lane worktree is archived and then removed. Each one is either archived or left alone, never both.
  - Nothing is lost. `archive of t1: ... files: .agents/project.json,.gitignore,README.md,t1-late.txt,t1.txt` and `archive of t2: ... t2-dying.txt`.
- **B, closeout against the janitor, both orders:** holds.
  - B-lc: the closeout, then J1 `archived-then-removed ... wt-demo-1-t3`, then J2 and J3 `(nothing to report)`, `JANITOR_EXIT 0`.
  - B-lj: J1 archives t3, then the closeout gives `worktree: absent`, `territory-worktree: absent`, `[exit 0]`, then J2 and J3 `(nothing to report)`.
  - Both orders end with `origin archive refs (1)` and `t3 late-edit in archive: ...: true`.
- **C, phase commit:**
  - clean and merged: SAFE;
  - dirty: a JUDGMENT row plus `dirty-worktree-archive`;
  - clean and unmerged: now `unmerged-branch-archive` (Finding 1 fixed).
  - The archive names are `archive/<folder>-<sha7>`, which do not collide with `chore: phase-end commit`.
- **D, packets and the untracked report:** holds.
  - `git status --porcelain --untracked-files=all after send: []`.
  - `- [untracked-report] report-only: <FX>\home\Code\repo\stray-note.md - 9 days old` is listed in report mode and in all-on mode.
  - `stray-note.md exists true, sha 37bc3347e7b0 -> 37bc3347e7b0`.
  - The old `--details docs/notes/...` together with `--packet-file` is still refused before any write.
- **E, activation:** holds. See E1 above. Timer refresh (out-T1.txt): `policy sha 0856615fe0135878 -> 0856615fe0135878, mtime unchanged true`, then `second refresh: current: timer already runs this release`. Install `--dry-run` (out-dry.txt) prints:

  ```
  linux exit 0: ExecStart=\"...\\lane-74\\scripts\\janitor.mjs\" --record --repo \"<REPO>\" --host fxhost --apply
  win32 exit 0: janitor.mjs&quot; &quot;--record&quot; &quot;--repo&quot; &quot;<REPO>&quot; &quot;--host&quot; &quot;fxhost&quot; &quot;--apply
  exec calls: 0 | fixture home exists: false
  ```

- **F, readers of moved paths:** the delta adds none. `git diff 83945798..HEAD` touches only the three janitor files, and none of its added lines name `docs/notes/`, `*.pointer.json`, `docs/ledger/` or `docs/work/evidence/janitor/`.

## Tests

`node --test scripts/janitor-sweep.test.mjs scripts/janitor.test.mjs scripts/janitor-timer-refresh.test.mjs scripts/record-closed-and-skip.contract.test.mjs` gave `ℹ tests 182 / ℹ pass 177 / ℹ fail 1 / ℹ skipped 4`. All four "seam fix round 3" tests pass.

The one failure is not from this delta. It is "J1 round 2 MINOR 4: fetchOrigin's own git call is bounded by a timeout ...", which fails with `fetchOrigin must be found in the source`:
- The test's regex `\n\}\n` cannot match a CRLF working copy. `git ls-files --eol scripts/janitor.mjs` prints `i/lf w/crlf attr/text=auto eol=lf`.
- Run against the blob, the same regex matches at 14677ad8, at 83945798 and at HEAD (`jan-HEAD.mjs true true`).
- So the failure is caused by this Windows checkout, and it happens on Linux suites only if those checkouts are CRLF, which they are not.

## Observations, not counted

- **Stale doc comment.** scripts/janitor.mjs:2228-2229 still says the sweep "Runs when --sweep is given or when `<home>/.agents/janitor-policy.json` exists; otherwise a run is byte-for-byte what it was." After this commit, a `--record` run also sweeps. Suggested replacement for those two lines: `Runs when --sweep or --record is given, or when <home>/.agents/janitor-policy.json exists; with no policy file every new class is report-only. Otherwise a run is byte-for-byte what it was. Never throws (fail open).`
- **Proving the archive on origin.** The "already inside" proof checks only that the archive ref still exists on origin (`ls-remote ... .out?.trim()`), not that it still points at the same sha. An `archive/*` ref that was force-moved would license a local delete of commits it no longer holds. Archive names embed the sha7 and nothing in the plugin moves them, so the risk is theoretical. Comparing the sha `ls-remote` prints with `git rev-parse refs/remotes/<inside>` would close it.
- **Report-mode wording.** In report mode, a branch that is already inside an archive still reads `would-archive-then-delete ... unmerged, local-only`, although in acting mode it would only be deleted. This is cosmetic.
- **Two runs to finish.** Each piece of work takes two runs: the worktree is removed in run N, and its branch is deleted in run N+1, because `checkedOut` comes from the pre-run worktree list. Both fixtures converge. Local `archive/*` branches stay on disk; that behavior predates this delta.
- **Synthetic closeout failure.** In A-br and A-abs, the closeout after J2 fails with `unreadable path ... ENOENT`, because J2 archived the lane worktree that held the record. That fixture shape ("closed" but not merged) cannot happen in the real flow: `closed` requires the merge on main, and `close --closeout` closes and cleans up in one call. Round 2's closeout in that fixture failed too, for another reason.
- **Accepted, not yet landed.** A lane whose record is `accepted` but which has not yet landed counts as "no open record", per spec item 3. Its integration branch is pushed before `accept` (team-build SKILL.md:283), so a clean integration worktree gets the new `report-only` row, not a removal.
- **Merged origin branches (carried over from round 2, out of scope).** The page's "Merged origin branches: delete daily" line still maps to a class that never deletes.

## What I ran (scratch only, `.../scratchpad/lane-74/seam-r3/`)

- seam2.mjs: A-br, A-abs, B-lc and B-lj.
- cde.mjs: C1, D1 and E1. E1's trailing install half crashes on a fixture-script read, exactly as in round 2; the timer half is covered by timer.mjs instead.
- timer.mjs and dry.mjs.
- `mut/`: a `git archive HEAD` copy for the three mutation checks, each restored after its run.
- Outputs are in `out-*.txt` and `tests.log`.
