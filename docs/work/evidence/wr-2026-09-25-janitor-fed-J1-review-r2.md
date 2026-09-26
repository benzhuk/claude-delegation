VERDICT: APPROVE 688a5a11777456b4d918bde0f441b02f4c22c1de

# J1 review, round 2 (delta): scripts/janitor.mjs, scripts/janitor.test.mjs

Reviewed: worktree C:/Users/benzh/Code/janitor-fed/wt-j1, HEAD 688a5a11777456b4d918bde0f441b02f4c22c1de
(from my own `git rev-parse HEAD`), range c2989f7..HEAD = one commit (janitor.mjs +251/-63,
test +214). `git status --short` was empty before and after. All probes ran on fixtures under my
scratch dir, and they imported the worktree's module read-only. The real-repo check used only
`rev-list`, `rev-parse`, `for-each-ref` and `merge-base`.

JUDGMENT: after this round the tool no longer removes the live work round 1 showed it removing.
- A zero-commit branch or worktree stays `unstarted (tip is main)` after main moves.
- A pushed lane base branch is no longer called merged, and it gets no delete command.
- A branch re-created now at an old commit is held by the age floor.
- An unknown age is no longer rendered as "old enough".

Four residual issues remain, all MINOR. None loses unrecoverable work: every case below is a clean
tree whose commits are all on origin/main. Two of them are cases where a check passes because it
isn't looking:
- m1: a worktree's age overrides a younger ref age.
- m2: a cut point that became a merge's second parent is not seen as unstarted.

One is a test that does not look at the window it claims to pin (m3).

Gate, run by me: `node --test scripts/janitor.test.mjs` in wt-j1 gave 64 tests, 64 pass, 0 fail
(314 s). The log is in my scratch dir; the builder's J1-gate.log was not touched.

## Prior findings: verification

| # | Status | Evidence |
|---|---|---|
| F1 BLOCKER | FIXED | `isTipOnMainline` (janitor.mjs:345) is the first-parent membership test, cached per (root, ref, tip). `isUnstarted` delegates to it. Probe P1 (fresh `lane-b` plus a fresh `lane-w` worktree, then another branch `--no-ff` merged and pushed, at `minAgeHours: 0`): SAFE held only `other`; both lanes were JUDGMENT `unstarted (tip is main), 0.0h old`. The new tests (test:1482, :1519) reproduce the r1 repro, and r1 measured that this shape fails at c2989f7. |
| F2 MAJOR | FIXED | The remote row is checked for `unstarted` before `merged` (janitor.mjs:668-676). The test at test:1727 pins the reason and `command: ""`. Real-repo check, read-only: every merged `origin/build/*` and `origin/fix/*` branch is off the first-parent chain, so each still gets its delete command. `release/*` sit on the chain but are protected, so they are skipped anyway. The remote class keeps its purpose on real data. |
| F3 MAJOR | FIXED, with one regression (m1) | `branchAgeHours` (janitor.mjs:392) takes the smaller of the commit age and the reflog age. P4: `%gd` gives `zz@{1790454143}`, and `git branch zz` gives an age of 0.00007h. Test test:1623 discriminates: an old commit time would make the branch SAFE. |
| F4 MINOR | FIXED | `belowAgeFloor` and `ageFloorReason` are used at both floor sites. Test test:1655. |
| F5 MINOR | PARTLY FIXED | `duKB` is gone, the try/catch is gone, and removal is recommended only for `rollout-backups` entries with a known mtime. Line count is still over 60 (m4). |
| F6 MINOR | FIXED | `shellQuote` is used in the command, and the reason names the tip sha7. |
| F7 MINOR | CODE FIXED, TEST DOES NOT PIN IT | See m3. |
| F8 | FIXED for r1's three claims | The r2 report's "7 new tests, 57 -> 64" matches the diff and my run. It contains one new false claim (m3), and it does not measure F5. |
| F9 INFO | FIXED | A dirty unstarted worktree says both things, and the branch row is deduplicated. Test test:1519. |

## MINOR

### m1. A branch's age is overridden by its worktree's age, even when the ref is younger (partly undoes F3)
- Where: janitor.mjs:602

  ```js
  const bAgeHours = worktreeAgeByBranch.has(b.name) ? worktreeAgeByBranch.get(b.name) : b.ageHours;
  ```

- The worktree age is the directory's birthtime (janitor.mjs:375). If someone runs `git switch -c
  revive <old merged sha>` inside an existing worktree that is days old, the branch ref is seconds
  old but inherits the worktree's age.
- Probe P3, a pure `classify` call: a worktree with `ageHours: 200` on branch `revive`, and the
  branch's own `ageHours: 0.01`, both merged and on origin, floor 6h.
  Result: `safe.branches = [{ref:"revive", reason:"merged into main (and on origin)"}]`, with no
  JUDGMENT row. With r1's patch (no override) the branch would be JUDGMENT "younger than the age
  floor".
- Item 2 says "no ... branch younger than --min-age-hours is SAFE".
- This is MINOR, not MAJOR:
  - The tree is clean.
  - The branch is merged and on origin, so `branch -d` loses nothing that cannot be recovered.
  - The shape needs an old worktree to be reused for a merged branch.
- Patch (exact):
  - old:
    ```js
        const bAgeHours = worktreeAgeByBranch.has(b.name) ? worktreeAgeByBranch.get(b.name) : b.ageHours;
    ```
  - new:
    ```js
        // The younger of the worktree's age and the ref's own age wins; an unknown ref age stays unknown (F4).
        const bAgeHours = worktreeAgeByBranch.has(b.name) && typeof b.ageHours === "number" ? Math.min(worktreeAgeByBranch.get(b.name), b.ageHours) : b.ageHours;
    ```
- Predicted outcome:
  - P3 turns to JUDGMENT "younger than the age floor, 0.0h old, floor 6h".
  - Unstarted rows still show about the worktree's age, because a lane's ref is created together
    with its worktree.
  - No existing test changes, because none of them builds an old worktree on a younger ref.
- Optional, same class: the worktree row itself is still SAFE in P3, because a worktree's age
  ignores a HEAD switch.
  - `worktreeAgeHours` could take the smaller of the directory age and the worktree's HEAD reflog
    time (`git -C <wt> log -g -1 --date=unix --format=%gd HEAD`).
  - That is a judgment call. It is not required by the spec's wording.

### m2. A lane cut at a commit that later becomes a merge's SECOND parent reads merged, then SAFE after the age floor
- Where: janitor.mjs:345 (`isTipOnMainline`). This is the residual hole in the first-parent rule.
- Probe P2 (real git fixture):
  1. Host 2 pushes commit Y to origin/main.
  2. Host 1 fetches and cuts worktree `lane-y` from `origin/main` (tip Y, zero commits of its own).
  3. Host 1's local main has its own `--no-ff` merge X.
  4. Host 1 runs `git pull --no-rebase --no-ff origin main`, making M with first parent X and
     second parent Y, and pushes.
- Result: `isUnstarted(lane-y) = false`. At `minAgeHours: 0`, and at +7h with the default floor,
  both the `lane-y` worktree and the `lane-y` branch are SAFE.
- On a second host this triggers once that host fast-forwards its local main past Y. Before that,
  its local main's own chain still contains Y and saves the lane.
- MINOR because:
  - The 6h age floor still protects every lane cut minutes ago (the brief's probe).
  - Removal loses no commits and no dirty files.
  - It needs a non-fast-forward pull-merge on main. The first-parent history of the real repo shows
    only `merge: build/...` and release commits, and none of those is a pull-merge.
- Fix (instruction, not a patch; judgment call):
  - Add a second, conservative discriminator: the branch's own reflog has never recorded a commit.
    - `git log -g --format=%gs refs/heads/<b>` has no line starting with `commit`.
    - Every entry is `branch: Created from ...`, `reset` or `worktree`-style.
  - Treat the branch as unstarted when `isTipOnMainline || neverCommittedOnReflog`.
  - This only ever adds JUDGMENT rows. A missing reflog falls back to the current behaviour.
  - Pin it with P2's shape.
- If that is judged not worth it, document the pull-merge limitation in the doc comment at
  janitor.mjs:325-340, next to the fast-forward note already there.

### m3. The F7 test's instant is not in the UTC/New York mismatch window, so it would pass on the old UTC code
- Where: janitor.test.mjs:1874

  ```js
  const now = new Date("2026-09-26T23:30:00Z"); // 19:30 EDT - inside the UTC/NY mismatch window F7 fixes
  ```

- The comment at :1882 says "not UTC's 2026-09-27". But the UTC date of 2026-09-26T23:30Z is
  2026-09-26, and so is the New York date. Probe P5 printed `utc 2026-09-26 ny 2026-09-26`.
- The mismatch window is 00:00-04:00 UTC, which is 20:00-24:00 EDT.
- A mutation back to `now.toISOString().slice(0, 10)` still passes this test. The builder report's
  claim "at a now inside the UTC/NY mismatch window" is false.
- Patch (exact):
  - :1874 old:
    ```js
      const now = new Date("2026-09-26T23:30:00Z"); // 19:30 EDT - inside the UTC/NY mismatch window F7 fixes
    ```
    new:
    ```js
      const now = new Date("2026-09-27T01:30:00Z"); // 21:30 EDT on 2026-09-26 - UTC already reads 2026-09-27
    ```
  - :1882 old:
    ```js
    "19:30 EDT on 2026-09-26 must file under the NY date, not UTC's 2026-09-27"
    ```
    new:
    ```js
    "21:30 EDT on 2026-09-26 must file under the NY date, not UTC's 2026-09-27"
    ```
- Predicted outcome:
  - It passes at HEAD, because the Intl formatter gives `2026-09-26`.
  - It fails under the `toISOString` mutation, which gives `2026-09-27-same-host.json`.
  - The byte-identity asserts are unaffected.

### m4. `--outside` still measures 68 physical lines, and item 5 allows it only "under 60"
- Measured at HEAD, on the lines that exist only for the feature:

  | Lines | What |
  |---|---|
  | :53 | 1 |
  | :1010-1015 | 6 |
  | :1093-1148 | 56 |
  | :1158 | 1 |
  | :1240-1243 | 4 |
  | Total | 68 |

- Round 1 measured 72. The builder report says it "did not re-measure". Non-comment code is about
  44 lines, so the count depends on whether comments count.
- The simplest way under 60 counting physical lines: cut the 8-line F5 prose block in the
  `gatherOutside` doc comment (:1127-1134) to one line, e.g. `// Removal is recommended only for
  rollout-backups with a known date; ws/* and unreadable entries: a person decides.`. Also drop the
  2-line comment at :1110-1111. That gives about 59.
- The alternative is to record the count in the RESULT as a finding for later, as item 5 says.

## INFO
- The builder report's line 1 is `VERDICT: PASS` followed by `sha ...` on line 2. The territory
  brief asks for `VERDICT: DONE <sha>` on line 1. That is for the orchestrator's evidence check;
  it is not a code issue.
- The new `mainlineCache` (janitor.mjs:344) is module-level and keyed on the current tip, so a ref
  that moves is never read stale. It grows by one Set per (root, ref, tip) triple. That is bounded
  for a CLI run and harmless in the test process.

## Verified absences (first-class findings)
- **Destructive actions are still exactly two.** The only mutating git calls are
  `worktree remove --` (janitor.mjs:890) and `branch -d --` (:940). The rest are
  `rev-parse`/`show-ref`/`status`/`worktree list`/`for-each-ref`/`merge-base`/`log`/`rev-list`,
  plus one `du`. The new remote-unstarted row carries `command: ""`. No push, fetch or update-ref
  exists.
- **Ref-shadowing shape held.**
  - `isTipOnMainline` proves each main ref with `refSha` (`show-ref --verify`) before it runs
    `rev-list --first-parent <full refname>`.
  - `branchAgeHours` runs `log -g` only after the `show-ref` inside `daysSinceLastCommit` has
    succeeded.
  - The remote `tip` comes from `refSha` on the full `refs/remotes/origin/<name>`.
- **The two past bug classes are absent.**
  - No new containment or path-deletion check was added, so no symlinked-parent surface.
  - No provenance is read from a record or registry line: unstarted and age come from git
    topology, the reflog and stat.
- **Summary counts come from the same arrays.** The F9 dedupe removes a row from
  `judgment.branches` before `summarizeCounts` reads `.length`, so the table and the summary still
  cannot disagree.
- **Clock and mtime.**
  - A future-dated reflog or commit gives a negative age, which is below the floor, so JUDGMENT.
  - A null age gives JUDGMENT "age unknown".
  - The floor boundary is still a strict `<`.
- **F3 reflog on this platform.** A plain `git branch <name>` writes a reflog entry, and `%gd`
  with `--date=unix` parses (P4).

## What I ran
- The gate (64/64), log in my scratch dir.
- probe.mjs (scratch):
  - P1: F1 after main advances.
  - P2: the pull-merge second-parent lane.
  - P3: worktree-age override.
  - P4: reflog format.
  - P5: F7 instant.
- The real-repo remote classification used read-only git in wt-j1.

## Bug-fix fields (this round's fixes, as reviewed)
Cause: round 1's UNSTARTED was SHA equality with origin/main's current tip, and age was commit time; both passed their pins only because the fixtures never moved main or re-created a ref at an old commit.
Discriminating check: P1 (cut a branch and a worktree, merge another branch --no-ff into main and push, gatherState at minAgeHours 0) gives JUDGMENT `unstarted (tip is main)` for both at 688a5a1, where r1 measured SAFE at c2989f7; the test at janitor.test.mjs:1623 fails on commit-time age.
Fix location: scripts/janitor.mjs:345 (isTipOnMainline), :392 (branchAgeHours), :668-676 (remote unstarted row), :602 (branch age; m1 patch still pending).
Simplification: one first-parent helper serves the local and remote classes; one reflog read replaces nothing and adds a min(); m1's patch keeps that min() instead of overriding it.
