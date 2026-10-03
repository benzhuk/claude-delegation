VERDICT: PASS

# Seam fix round 3 (lane 74)

Commit: 0fba156fd03e631fbf9aba08821d7e24183deffa (files: scripts/janitor-sweep.mjs, scripts/janitor-sweep.test.mjs, scripts/janitor.mjs)

## Findings applied
1. BLOCKER (clean unmerged orphan worktree never archived): sweepWorktrees now takes the resolved `main`. A clean orphan on an attached, non-protected, unmerged branch is handled by the unmerged-branch-archive class: report mode gives `would-archive-then-remove`; acting mode (same idle >= 24 h, BTO, in-use and repoVerified gates) goes through archiveThenRemoveWorktree. A clean unmerged orphan whose branch is on origin gets a `report-only` row ("a person decides"). Merged, owned and detached-archived shapes are unchanged. Idle < 24 h gives a `keep` row.
2. MAJOR (timer ran no new classes): runSweepIfWanted now sweeps when `--record` is present even with no policy file. `acts()` still needs the policy, so nothing acts without it; the NODE_TEST_CONTEXT guard is unchanged.
3. MINOR (second archive branch): sweepBranches, before archiving, checks `for-each-ref --contains` on refs/remotes/origin/archive/, re-proves the archive with `ls-remote`, and then only deletes the local branch (`already inside origin/archive/...; no second archive`). Action word stays `archived-then-deleted`.

## Tests
- New describe "seam fix round 3" in scripts/janitor-sweep.test.mjs (4 tests): report then act then next run deletes the branch with one origin archive; open record owns, on-origin gets report-only, merged silent; young kept; `--record` with no policy prints report-only rows and acts on nothing.
- `node --test scripts/janitor-sweep.test.mjs`: 38 pass, 0 fail.
- Focused gate (janitor, install-janitor-timer, janitor-timer-refresh, test-home, work-record-closeout, note-send): 472 tests, 459 pass, 12 skipped, 1 fail.
- The 1 failure is `janitor.test.mjs` "J1 round 2 MINOR 4: fetchOrigin..." : its source regex `\n\}\n` cannot match this Windows checkout, where scripts/janitor.mjs is CRLF (core.autocrlf=true; every one of its 2444 lines ends in CR). My edit is at line ~2236, not in fetchOrigin. Environmental, not caused by this round; not touched.
- Build-loop tests: this round touched nothing in the loop territory, so they were not re-run.

## Notes
- All fixtures were sealed test-home scratch repos; the janitor never ran on real repos, worktrees or origin. No deletes by me.
