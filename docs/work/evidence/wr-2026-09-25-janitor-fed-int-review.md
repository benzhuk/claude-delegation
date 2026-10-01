VERDICT: APPROVE dc3ec9df7a8cbe9be773223b8476a7024fbd5c0e

# janitor-fed integration review (read-only)

Reviewed: C:/Users/benzh/Code/janitor-fed/wt-int, branch build/janitor-fed-1. `git rev-parse HEAD` = dc3ec9df7a8cbe9be773223b8476a7024fbd5c0e.
`git status --short` before and after shows only the three untracked `docs/work/wr-2026-09-25-janitor-fed*.record.md` files, which were there before I started. I wrote nothing to the reviewed tree or to the main checkout.

JUDGMENT: the integrated build equals the J1 tree (688a5a1) merged with the J2 tree (2a60f32). The only differences are two safe deltas: the one-line childEnv test fix (b2b4372) and the two dogfood evidence files. The childEnv change keeps the F3 test discriminating, the record matches the spec format, the dogfood run removed nothing, and every SKILL.md command runs as written. Nothing BLOCKER or MAJOR. Four MINORs follow, and one of them (m1) is a heads-up for the merge step.

## (1) Tree = approved territories merged + only safe deltas: VERIFIED
- The two approved tips share merge-base ac9c842. `git merge-tree --write-tree 688a5a1 2a60f32` gives tree 2d7a5c4, with no conflicts.
- `git diff --stat 2d7a5c4 dc3ec9d` lists exactly 3 files:
  - `docs/work/evidence/janitor/2026-09-26-ben-desktop.json` (+22, new)
  - `docs/work/evidence/janitor/drift.md` (+2, new)
  - `scripts/janitor.test.mjs` (+2/-1): the import line plus line 1632. It is byte-for-byte the content of b2b4372, whose parent is 688a5a1 and which touches that one file only.
- History ac9c842..dc3ec9d:
  - c2989f7 and 688a5a1 (J1)
  - 2a60f32 (J2)
  - two merges of J1 and one of J2
  - bcf0a62 and dc3ec9d (dogfood, evidence files only)
  - b2b4372 (the fix)

  Nothing else is in the range. `scripts/janitor.mjs`, `skills/janitor/SKILL.md` and `scripts/mirror-shared-skills.mjs` are identical to the approved trees. The mirror diff is only `'janitor'` appended to `PLUGIN_SKILLS`.
- All 9 commits are authored by the configured identity (`git config user.email`). There are no trailers.

## (2) childEnv change keeps the test meaningful: VERIFIED by mutation
- `childEnv(home, over)` (skills/multi/scripts/test-child-env.mjs) builds the child env from these parts, with `over` spread last:
  - the runner's env
  - `HOME` and `USERPROFILE` set to `home`
  - the messaging socket and token blanked

  So `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` still reach the amend. `os.homedir()` as `home` is the same home the rest of the file's fixtures already run under.
- Mutation check, on a scratch `git archive` of dc3ec9d outside the tree: I made `branchAgeHours` return commit age only (`return days * 24;`, which drops the reflog term). Result: the F3 test FAILS with "must never be SAFE just because the COMMIT it points at is old" (1 test, 0 pass, 1 fail). The backdating still takes effect through childEnv, and the test still separates the bug from the fix.
- Reverse check: I tried to restore the old `{ ...process.env, ...}` line on the scratch copy to watch N2 fail. The local secret-guard hook denied that command, and I did not route around the denial. Round 1's integrator report (pack/reports/integrator.md:31-61) already records N2 failing on exactly that line at janitor.test.mjs:1631. N2 passes now; see the rerun below.

## (3) Dogfood record, drift.md and report-only: VERIFIED
Record fields, checked against the spec (J1 item 4):
- `date` (YYYY-MM-DD, America/New_York per the F7 fix)
- `host`
- `baseSha`
- `drift` with the four numbers: worktreeCount, openBranchCount, untrackedFileCount, diskUsedKB
- `safeCounts` {worktrees, branches}
- `judgmentCounts` {worktrees, branches, untrackedFiles, remoteBranches, overdueWorkarounds}

File name: `<dir>/2026-09-26-ben-desktop.json`, as specified. These are exactly the fields `writeRecord` emits (janitor.mjs:1070-1083).

drift.md has two lines in the `- <date> <host>: worktrees= branches= untracked= diskKB=` format of janitor.mjs:1087. That is one line per dogfood run: the file is appended to, while the JSON is overwritten. Both match what the integrator's report states.

Report-only check. I re-ran the merged janitor with `--json` from the main checkout, with no --apply and no --record. It lists the same SAFE counts as the record (4 worktrees, 4 branches):
- worktrees: `decisions-actions/wt-b1`, `four-read/wt-int`, `four-read/wt-r1`, `four-read/wt-r2`
- branches: `build/decisions-actions-1`, `build/four-read-1`, `-r1`, `-r2`

All four directories exist (`test -d`), and all four refs resolve (`rev-parse --verify refs/heads/...`). The worktree count went up (24 in the record, 25 now), not down. Nothing SAFE was removed, so the run was report-only.

The main checkout's `git status --short` was identical before and after my run.

## (4) SKILL.md commands run as written: VERIFIED
I ran each command on a scratch fixture: a bare origin, a pushed main, and a worktree cut from main. All were run with the merged `wt-int/scripts/janitor.mjs` by absolute path, as the skill says. Results:

| Command | Exit | Result |
|---|---|---|
| `node <plugin>/scripts/janitor.mjs` (bare) | 1 | tables printed |
| `--json` | 1 | parses as JSON |
| `--min-age-hours 0` | 1 | runs |
| `--record` (bare) | 1 | writes `docs/work/evidence/janitor/{date-host.json,drift.md}` |
| `--record rec` | 1 | writes `rec/` |
| `--record --json` | 1 | bare-record default is used; `--json` is not taken as the dir |
| `--outside` | 1 | runs |

- None of the runs wrote anything to stderr.
- The fixture's fresh worktree is reported `unstarted (tip is main), 0.0h old`, not SAFE. That is the spec's headline case.
- Exit 1 comes from `hasFindings`, as the integrator states.
- `--apply` was not run anywhere, per facts.md.

## Rerun of the requested tests
`node --test scripts/janitor.test.mjs scripts/mirror-shared-skills.test.mjs skills/multi/scripts/hooks.test.mjs`
Result: **tests 101, pass 101, fail 0, cancelled 0, skipped 0.** That includes N2. The sealed-suite log (pack/reports/full-suite-2.log) ends 1683/1683, 0 fail, which is consistent with this.

## Findings (all MINOR; none justifies NEEDS_FIXES)

### m1 MINOR: the merge into main from the main checkout will abort until two untracked, identical files are moved
Evidence: `C:/Users/benzh/Code/claude-delegation` has untracked `docs/work/evidence/janitor/2026-09-26-ben-desktop.json` and `drift.md`, left there by the dogfood runs. `cmp` shows both are byte-identical to the committed versions at dc3ec9d. I reproduced the effect in a scratch repo: `git merge` of a branch that adds a path, onto an identical untracked file, aborts with "untracked working tree files would be overwritten by merge" (exit 2).
Fix: whoever merges, after Ben's word, first moves those two files out of the main checkout. Nothing is lost because they are identical to the committed copies. The branch needs no change.

### m2 MINOR: the record's own output files inflate the next run's `untracked` number while they are untracked
Evidence: on the scratch fixture, successive `--record` runs showed `untracked=0`, then 2, then 4. Each count includes the previous run's own record files. In the main checkout, the dogfood's 65 to 68 includes the two uncommitted record files.
Fix: resolves itself once the files are tracked on main. Alternatively, a later J1 round can exclude `<record dir>` from the untracked count. No change is needed for this build.

### m3 MINOR (approved J1 behavior, recorded for the trend's reader): `baseSha` is local `main`'s tip, not the `origin/main` that classification uses
Evidence: the record shows `baseSha 9c9f34b` (main checkout HEAD). At run time, `origin/main` was already b7ddf11 (reflog: fetched 16:57 EDT). This is deliberate per janitor.mjs:1041-1052.
Fix (optional, later): record `origin/<main>` alongside the local tip, e.g. `originSha`, so a drift line can be tied to the base it was judged against.

### m4 MINOR: SKILL.md does not describe the J1 flags beyond the age floor and UNSTARTED
Evidence: skills/janitor/SKILL.md never mentions any of these:
- the `remote branch merged into main` JUDGMENT class and its report-only `git push origin --delete` line
- `--outside`
- `--record`'s output paths and bare default

The cadence line uses `janitor --record` as shorthand. J2's spec item 1 did not require these, so this is not a contract breach.
Fix (later round): add one bullet under JUDGMENT for the remote class, and one sentence each for `--record [dir]` (default `docs/work/evidence/janitor/`) and `--outside`.

Verified absences: the integration delta contains nothing that could remove the wrong thing. It adds no janitor code, and the destructive surface is still exactly `git worktree remove` (no force) and `git branch -d` (janitor.mjs:890, 940).

## Bug-fix fields (childEnv fix b2b4372)
Cause: janitor.test.mjs:1631 (F3 fixture) built its backdated-commit env by spreading the runner env inline. N2 (hooks.test.mjs:429) bans this shape for every test file, because a child spawned that way inherits the session's messaging socket and token.
Discriminating check: before the fix, N2 failed at janitor.test.mjs:1631 (integrator.md round 1, 1682/1683). Now it passes (101/101 here, 1683/1683 sealed). The scratch mutation that drops the reflog term makes F3 fail, which proves the backdate still flows through childEnv.
Fix location: scripts/janitor.test.mjs:12 (the import) and :1632 (`childEnv(os.homedir(), { GIT_AUTHOR_DATE, GIT_COMMITTER_DATE })`).
Simplification: none needed. It is one call to the suite's existing helper, the same import path scripts/four-read.test.mjs already uses, and it adds no new mechanism.

## Reviewer notes
- One command was denied: the secret-guard hook blocked the reverse-mutation sed that contained a runner-env spread. That step is reported, not routed around.
- My scratch copies (`mut/`, `fx/`, `mt/`, `now.json`) are in the session scratchpad, outside every repo. I left them in place because the safety rules forbid `rm -rf`. The `mut/` copy still has the mutated `branchAgeHours`; it is inert and not in any repo.
