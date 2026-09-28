VERDICT: NEEDS_FIXES f10c7929711134ce0260741b2ade293ac8e4deb0

# C1 review, round 2 (lane 36, lane-closeout): delta ad2aac9..f10c792

Reviewer: Opus, high tier. This is a delta review: it checks the 18 round-1 findings and lead rulings L1-L10 against the new code, looks for regressions, and judges the untested gaps the builder disclosed.

Artifact: wt/lane-closeout-1-C1 at f10c7929711134ce0260741b2ade293ac8e4deb0, in the worktree /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1. I left it untouched: `git status --short` is empty and HEAD is still f10c792, checked after every run.

GOAL served: "work lost or stalled". Nearest NOT: "a symptom fix". Every open item below is a delete guard that is either missing or not held by any test.

## Method

- Fixtures: all under `.../scratchpad/lane-closeout/C1-review-r2/fx/`, each with a fresh name and a local bare origin. The real origin was never touched.
- Round-1 repros: copied verbatim to `C1-review-r2/`. Only `lib.mjs`'s `BASE` was changed, so they build new fixtures in `fx/`.
- New probes, in the same directory:
  - `p1-lease.mjs`
  - `p2-names.mjs`
  - `p5-scratch.mjs`
  - `p10-close-argv.mjs`
  - `p11-moved-label.mjs`
- Shell deletes: no script contains one. The only deletes were made by the code under review, inside fixtures.
- Base comparison: base scripts were extracted with `git archive 7b00418 scripts` into `C1-review-r2/base7b/`.
- Mutation checks: run on a scratch copy of the tree made with `git archive f10c792` into `C1-review-r2/mut-a/`. After the checks, that copy's `scripts/work-record.mjs` was restored and confirmed byte-equal to the original with `cmp`.
- Commands denied: none.

## Territory tests

Command: `node --test scripts/work-record.test.mjs scripts/work-record-closeout.test.mjs scripts/janitor.test.mjs scripts/record-closed-and-skip.contract.test.mjs`

Result: **381 tests, 378 pass, 1 fail, 2 skipped.** The one failure is `docs/GOALS.md and docs/goals/card.md carry no phrase this build's evidence contradicts (STALE regexes, doesNotMatch)`, which is known and fails at base too. These numbers match the builder's report.

## Re-run of the round-1 repros on fresh fixtures

| Repro | Round 1 (ad2aac9) | Now (f10c792) |
|---|---|---|
| e1, ignored `.env` (F1) | LIVE `worktree: removed`, `.env survives: false` | DRY `would dirty`; LIVE `worktree: dirty … (untracked, modified or ignored files present …)`, `branch: refused`; **`.env survives: true`, worktree dir exists: true** |
| e2, stale-ref sweep (F2) | `deleted build/e2-1 <stale tip>`; origin lost the branch | `keep build/e2-1 1e496dc… tip is not an ancestor of origin/main` (evaluated at the re-fetched tip); **`origin still has branch: true`** |
| e4, Log owner (F6) | adds `stale-result-candidate` | finding codes AFTER = BEFORE = `[bad-work-id, accepted-without-check, accepted-without-evidence]` (fixture artifacts only); Log line `closeout lead by sess-e4-000001 worktree=removed …` |
| e5a, scratch contains a registered worktree (F3) | removed; uncommitted work lost | `refused … (contains a path in git worktree list)`; uncommitted file survives |
| e5b, scratch contains the repo root (F3) | `would removed` | `would refused … (contains the repo root)` |
| e9 E9, dry run (M1) | refs changed when origin moved | `advance=false`: changed nothing; `advance=true`: changed refs only (fetch) |
| e9 E10, four name forms (F4) | `delete` for all four | `keep … named by wr-e10-other (Status: owned)` for all four |
| e9 E11/E12 (fresh branch, exclude) | as in round 1 / last `--exclude` wins | E11 kept; `--exclude a --exclude b` parses to `"a,b"`; `origin/build/e12-b` excluded |
| e13, worktree is `--repo` (F7) | `worktree: removed` | `refused … (refuses the worktree that is (or contains) --repo)` in dry and live runs; dir intact |

(E14 and E15 in e13 are standalone expressions that copy the round-1 code, so they no longer test anything. I checked win32 by reading the code instead; see R2-3(j).)

### L1, the lease: a branch moved after the check (`p1-lease.mjs`)

The probe wraps `execImpl`. When the delete push fires, a second clone first pushes a new unmerged commit to the same branch, then the real push runs.

```
push argv: ["push","--force-with-lease=refs/heads/build/p1c-advance-1:602e96a…","origin",":refs/heads/build/p1c-advance-1"]
P1 closeout advance: exit=2 origin-branch: refused build/p1c-advance-1 (moved)
  evaluated tip 602e96a…; origin tip after: 9c334a2…            (the raced commit survives)
P1 sweep advance: exit=2 delete build/p1s-advance-1 3e093cd… | delete-failed build/p1s-advance-1 moved
  evaluated tip 3e093cd…; origin tip after: a2ef497…
P1 sweep control: exit=0 … deleted build/p1s-control-1 eec5371… restore: git push origin eec5371…:refs/heads/build/p1s-control-1
  after running the printed restore line, origin tip: eec5371… == evaluated: true
```

The lease holds on both delete paths. The restore line uses the checked sha, and running it restores exactly that sha.

## Findings table: round-1 findings and lead rulings

| Item | Status | Evidence |
|---|---|---|
| F1 (CRIT) ignored files deleted live | **CLOSED** | janitor.mjs:1257-1261 refuses on the same `clean` the dry run uses. e1 re-run above. Tested in janitor.test and closeout.test. |
| F2 (CRIT) sweep on stale refs | **CLOSED (code)**; test gap | work-record.mjs:2259-2262 fetches with `--prune` first and exits 2 if the fetch fails. e2 re-run above. **The fetch-failure branch has no test. Mutant M-d, which removes it, survives.** See R2-3(a). |
| F3 (MAJ) scratch nested worktree or repo | **CLOSED (code)**; **tests OPEN**; twin found | :2036-2059 has containment, fail-closed `listWorktrees`, and the bounded walk. e5a and e5b re-run above. **Mutants M-a (no walk recursion), M-b (no containment) and M-c (fail-open list) all survive the suite.** See R2-3. The reverse direction (the target lies inside a worktree) still deletes; see R2-4. |
| F4 (MAJ) name forms | **CLOSED** for the four E10 forms; **L8 part OPEN** | E10 re-run above. The L8 basename fallback is missing (R2-1), and a failed `git worktree list` makes the check fail open (R2-2). |
| F5 (MAJ) `close --dry-run` writes | **CLOSED** | `p10-close-argv.mjs`: base and head both exit 1 for `close … --dry-run` and `close … --by x`, and nothing is written. Only the message text differs: base `[acceptance-failed] unknown or incomplete option: --dry-run`, head `[closeout-flag-without-closeout] …`. That is behaviorally equal. Tested. |
| F6 (MAJ) Log owner | **CLOSED** | work-record.mjs:2214. e4 re-run above. Tested. `docs/work-record.md:315` updated. |
| F7 (MAJ) `--repo` worktree / win32 cwd | **CLOSED on POSIX** (e13); win32 untested | janitor.mjs:1218-1236. The win32 fold is correct on reading: `path.win32.relative("c:/users/x/wt","C:\\Users\\X\\wt\\scripts")` returns `scripts`. It guards a delete but has no test (R2-3(j)). The entry lookup above it is not normalized (R2-8). |
| F8 (MED) real scratch layout | **CLOSED** | :1992-1993 matches the session id at any depth. Two tests cover the deep layout and the session dir itself. |
| F9 (MED) Windows `Scratch:` on Linux | **CLOSED** | :125 and :1960 plus two tests. A small residue on win32 hosts is R2-10. |
| F10 (MED) `--exclude` | **CLOSED** | E12 re-run; parse at :2393, normalization at :2249, warn line. Tested. |
| F11 (MED) `--by` gates all | **CLOSED** (= L3) | :2095-2121 plus two tests. |
| M1 dry run fetches | **CLOSED** | E9 re-run; docs updated. |
| M2 short ref names, `--prune` | **CLOSED** | Lease push uses `refs/heads/<name>` (:1810); `--prune` is used in both fetches (:2142, :2259). |
| M3 file target / EACCES | **CLOSED (code)**; **tests OPEN** | `p5-scratch.mjs`: a file target gives `refused (target is not a directory)` and survives a live run; a mode-000 parent gives `refused (could not stat: EACCES …)`. **Mutant M-e (removing the not-a-directory guard) survives.** See R2-3(g). |
| M4 sweep exit code | **CLOSED** | Exit 2 on a failed delete (P1, P11) and on a failed `for-each-ref` (:2272-2274). Push output is now piped. |
| M5 CRLF / confined write | CRLF **CLOSED** (read); confinement **not as claimed** | :2223 realpaths again but never checks the result against `repoReal`. See R2-9 (minor). |
| M6 missing tests | **PARTIAL** | `docs/*` and `feat/*` cases and the symlinked-ancestor case were added. The win32 fold is still untested, which blocks because it guards a delete (R2-3(j)). A duplicate `Scratch:` singleton through `accept` is untested, but that does not block: the generic `duplicate singleton field` check at :919-931 covers every singleton, and nothing is deleted. |
| M7 perf | **DEFERRED, accepted** | No correctness effect. Lead's call. |
| M8 out-of-territory test fixture | No action | Lead's call. It was not touched this round. |
| L1 lease | **CLOSED** | P1 above; tested for sweep. The `moved` label is too broad (R2-6). |
| L2 fetch first everywhere | **CLOSED (code)** | Test gap: R2-3(a). |
| L3 `--by` gates everything | **CLOSED** | Tested; runs before step 1, dry runs included. |
| L4 ignored files count as dirty | **CLOSED** | `isTreeClean` runs `status --porcelain --untracked-files=all --ignored=matching`. One check, shared by dry and live runs. |
| L5 scratch containment | **CLOSED (code)**, **tests OPEN** (R2-3) | The detail text says `could not read git worktree list`, not the ruling's literal `refused unverifiable`. That is cosmetic. |
| L6 real layout | **CLOSED** | Tested. |
| L7 Windows paths | **PARTIAL** | The absolute-path rule, the other-platform refusal and the `--repo` refusal are done. Still open: win32 accepts POSIX `/tmp/...` as host-absolute (R2-10); the worktree entry lookup is not normalized (R2-8); the win32 fold is untested (R2-3(j)). |
| L8 open-record matching | **OPEN** | Normalization and path-to-branch lookup through `git worktree list` are done. **The basename fallback is not implemented** (R2-1). |
| L9 plain `close` | **CLOSED** | Base behavior is pinned by a test; P10 confirms it. |
| L10 | n/a | No fix needed. |

## New and open findings

### R2-1. MAJOR: L8's basename fallback is missing, so an open record whose `Worktree:` path does not resolve does not protect its branch
- **Where:** `scripts/work-record.mjs:1783-1800` (`recordBranchNames`). When `Worktree:` is a path that `worktreesByPath` does not contain, nothing is added. `grep -n basename scripts/work-record.mjs` finds no L8 code.
- **Why it matters:** this repo's real records carry `Worktree: C:/Users/benzh/orca/workspaces/claude-delegation/codex-fresh-1` and `…/record-closed-and-skip-1`. On Linux those paths never resolve. An open record usually has `Artifact: none`, so nothing protects its branch.
- **Repro (`p2-names.mjs`):** another record has `Status: owned`, `Artifact: none`, and `origin/build/p2a-1` is merged:
  ```
  P2 open record Worktree: C:/Users/benzh/orca/workspaces/claude-delegation/p2a-1 -> delete build/p2a-1 ab7fdb3…
  P2 open record Worktree: /home/elsewhere/not-here/p2a-1 -> delete build/p2a-1 ab7fdb3…
  P6 open record Worktree: <git's listed (real) path> -> keep … named by wr-p6-open
  P6 open record Worktree: <the symlinked path it was created with> -> delete build/p6-1 1c42d1d…
  ```
  The P6 cause: map keys are realpath'd (:1742-1746), but the lookup at :1791-1792 and in `deriveRecordBranch` uses a plain `path.resolve`.
- **Fix (judgment, small).** I did not run it.
  1. Hoist `buildWorktreesByPath`'s `key` into a module-level `worktreePathKey(p)` (the same body). Use it for the map *and* for both lookups: `worktreesByPath.get(worktreePathKey(wt))`. That fixes P6.
  2. In `recordBranchNames`, when `isPath` and the lookup misses, add a basename claim: `const base = wt.replace(/[\\/]+$/, "").split(/[\\/]/).pop(); if (base) names.add("basename:" + base);`.
  3. In `evaluateOriginBranch`, match a record when `names.has(normName) || names.has("basename:" + normName.split("/").pop())`.
  4. When only the basename matched, say so in the reason, for example `named by <work> (Status: …; Worktree: path not in git worktree list, matched by basename)`.
- **Predicted:** all four P2/P6 lines become `keep … named by wr-…`. E10 is unchanged.
- **Tests:** add one per case: a Windows path, an absent POSIX path, and a symlinked path.

### R2-2. MAJOR: a failed `git worktree list` makes the named-by-an-open-record check fail open, in both sweep-origin and closeout step 4
- **Where:** `work-record.mjs:2265` (sweepOrigin) and `:2175` (closeoutRecord). `buildWorktreesByPath` returns `null`, and its own comment at :1736 says "caller must treat that as fail-closed". Neither caller checks for it, and `recordBranchNames(r, null)` then claims nothing for path-form `Worktree:` records.
- **Repro (`p2-names.mjs` P3):** a PATH wrapper makes only `git worktree list` fail. fetch and for-each-ref still go through `spawnImpl`.
  ```
  P3 control (worktree list works): keep build/p3-1 … named by wr-p3-open (Status: owned), not closed/withdrawn
  P3 worktree list FAILS: exit=0 delete build/p3-1 9ecf333…
  ```
- **Fix (mechanical).** In `sweepOrigin`:
  ```js
  // old
    const worktreesByPath = buildWorktreesByPath(repoRoot);
  // new
    const worktreesByPath = buildWorktreesByPath(repoRoot);
    if (worktreesByPath === null) {
      return { rows: [], lines: ["refused UNVERIFIABLE: could not read git worktree list"], apply, applied: [], exitCode: 2 };
    }
  ```
  In `closeoutRecord`, apply it together with R2-7, so the map is built once, before step 3:
  ```js
  // old (:2166)
      // 3. Worktree and local branch.
  // new
      const worktreesByPath = buildWorktreesByPath(repoRoot);
      const ownBranchName = worktreesByPath === null ? null : deriveRecordBranch(record, worktreesByPath);
      // 3. Worktree and local branch.
  ```
  Then in step 4, delete the two `const worktreesByPath = …` / `const branchName = …` lines (:2175-2176), and replace `if (!branchName) {` with:
  ```js
      const branchName = ownBranchName;
      if (worktreesByPath === null) {
        results.push({ step: "origin-branch", result: "refused", detail: "UNVERIFIABLE: could not read git worktree list" });
      } else if (!branchName) {
  ```
- **Predicted:** P3 gives exit 2 and `refused UNVERIFIABLE: could not read git worktree list`, and nothing is deleted.
- **Test:** see R2-3(f) and (h).

### R2-3. MAJOR (blocker): the new delete guards are held by no test; five mutants survive the whole suite
The builder disclosed that F3, M3 and the M6 win32 case are fixed "by code read" only. I checked what that leaves exposed. On a scratch copy of f10c792, I disabled one guard at a time and ran `work-record-closeout.test.mjs` and `work-record.test.mjs`:

| Mutant | Line | Result |
|---|---|---|
| M-a: `.git` walk never recurses (`if (false && isDir)`) | :1927 | 288 pass, 1 fail (STALE only), **survives** |
| M-b: both containment checks off | :2049, :2052 | **survives** |
| M-c: `listWorktrees === null` guard off (fail open) | :2042 | **survives** |
| M-d: sweep-origin fetch-failure early return off | :2260 | **survives** |
| M-e: not-a-directory guard off | :2014 | **survives** |

Each guard stands between `fs.rmSync` (or `git push … :refs/heads/…`) and the wrong target, and none of them is held by a test. M-a is the realistic one: review scratch directories hold fixture repos, as mine does, and the only walk test puts `.git` as a direct child (closeout.test:743-754).

**Required tests.** Each asserts the specific `detail`, not only `refused`. The probes in `p2-names.mjs` and `p5-scratch.mjs` can be lifted almost verbatim.
- (a) `sweepOrigin` with a `spawnImpl` that fails `fetch`. Assert:
  - `exitCode === 2`;
  - `lines` equals `["refused UNVERIFIABLE: fetch failed"]`;
  - an `execImpl` spy records no `push`;
  - `ls-remote` still lists the branch.
  This kills M-d.
- (b) e5a: the scratch directory contains a registered linked worktree with an uncommitted file. Assert the detail matches `/contains a path in git worktree list/` and the file survives. Containment runs before the walk, so M-b turns this detail into `.git entry` and the test catches it.
- (c) e5b, dry run: the repo root lies inside the scratch directory. Assert `/contains the repo root/`.
- (d) An *unregistered* `git init` repo three levels below the target. Assert `/\.git entry at .*unregistered-repo/`. This kills M-a.
- (e) Nine nested directories under the target. Assert `/walk depth bound reached/`.
- (f) `git worktree list` fails. Assert `/could not read git worktree list/`, and the directory survives a live run. This kills M-c. To make the failure happen, either:
  - add an optional `listWorktreesImpl` to `closeoutRecord`'s opts and thread it to `removeScratchDirectory` and `buildWorktreesByPath` (preferred, since it works on every host); or
  - use the PATH-wrapper approach from `p2-names.mjs`, skipped on win32.
- (g) A regular-file target. Assert `/target is not a directory/` and that the file survives a live run; this kills M-e. Also a mode-000 parent, asserting `/could not stat/`. Skip that case when `process.getuid?.() === 0` or on win32.
- (h) R2-2: sweep and closeout with a failed worktree list give exit 2 or `refused UNVERIFIABLE: could not read git worktree list`, and nothing is deleted.
- (i) R2-1: three tests, as listed there.
- (j) The win32 fold in `closeoutWorktree`. Lift `normPath` and `within` (janitor.mjs:1218-1230) into a pure helper, `pathWithin(child, parent, { platform, pathImpl, realpath })`, and unit-test it with `path.win32`:
  - `("C:\\Users\\X\\wt\\scripts", "C:/Users/X/wt")` → true;
  - `("c:\\users\\x\\wt", "C:/Users/X/wt")` → true;
  - `("C:\\Users\\X\\wt2", "C:/Users/X/wt")` → false.

  This is the check round-1 F7 found broken on the host where it matters, and it is still unverified there.
- Recommended, not blocking: a closeout-path lease test. The sweep test covers the shared helper, but not closeout's `detail: "moved"` mapping or its exit 2.

### R2-4. MEDIUM: a scratch target that lies *inside* a registered worktree (or inside the repo) is deleted with the worktree's uncommitted work
- **Where:** `work-record.mjs:2049-2054`. L5 checks only whether a worktree or the repo lies inside the target. The reverse is not checked. The walk looks only *below* the target, so it cannot see the enclosing worktree's `.git` file.
- **Repro (`p5-scratch.mjs` P5).** The layout is `DELEGATION_SCRATCH_ROOTS=<R>`, a linked worktree at `<R>/<sid>/inner-wt`, an uncommitted file at `inner-wt/src/uncommitted.txt`, and `Scratch: <R>/<sid>/inner-wt/src`.
  ```
  P5 target inside a registered worktree, dry: scratch: would removed …/roots/sess-p5-000001/inner-wt/src
  P5 live: scratch: removed …/roots/sess-p5-000001/inner-wt/src
  P5 uncommitted work inside the worktree survives: false
  ```
- **Assessment:** the preconditions are unusual, since the lead's own `Scratch:` has to point into a worktree. But this is the exact twin of round-1 F3, and the fix is two lines.
- **Fix (mechanical).** Insert after the `if (worktrees.some((w) => inside(w.path))) { … }` block (:2052-2054), still inside `if (root) {`:
  ```js
    const liesInside = (p) => {
      const rel = path.relative(forCompare(path.resolve(p)), forCompare(resolved));
      return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
    };
    if (liesInside(repoResolved)) {
      return { step: "scratch", result: "refused", ref: scratchPath, detail: "lies inside the repo root" };
    }
    if (worktrees.some((w) => liesInside(w.path))) {
      return { step: "scratch", result: "refused", ref: scratchPath, detail: "lies inside a path in git worktree list" };
    }
  ```
- **Predicted:** P5 gives `refused … (lies inside a path in git worktree list)` and the file survives. Every existing test keeps passing, because no fixture places `Scratch:` inside a repo or worktree. Add P5 as a test.

### R2-5. Observation (no fix requested): the L5 walk will refuse almost every real lane scratch
- **What happens:** reviewers and builders create fixture repos in the lane scratch directory, as this review did in `fx/*/repo/.git`, and some lanes run `npm install` there, which makes trees deeper than 8. For any such lane, the ruling as written makes `scratch: refused` and exit 2 the normal outcome.
- **Cost:** this is a wrong refusal, so it costs a manual step each time and loses nothing.
- **For the lead:** decide whether the pinned scratch sentence should also say "fixture repos go in a subdirectory the closeout does not own", or whether this refusal is intended.

### R2-6. MINOR: `refused moved` is reported for push failures that are not a lost lease
- **Where:** `work-record.mjs:1814`: `/stale info|rejected|fetch first|failed to push some refs/i`. Git prints `failed to push some refs` on *every* rejected push.
- **Repro (`p11-moved-label.mjs`, origin with `receive.denyDeletes=true`):**
  ```
  P11: exit=2 delete build/p11-1 0bd5095… | delete-failed build/p11-1 moved
  P11 origin tip unchanged (nothing moved): true
  ```
  This was still refused, so nothing is lost, but the lead is told a race happened when origin in fact forbids deletes.
- **Fix:** `const moved = /\(stale info\)/.test(msg);`. Git's lease failure is ` ! [rejected] <ref> (stale info)`, which is what P1 hit.
- **Predicted:** P1 still reports `moved`, and P11 reports `delete-failed build/p11-1 To … ! [remote rejected] … (deletion prohibited) …`.

### R2-7. MINOR: dry run and live run disagree at step 4 when the record's own `Worktree:` is a path
- **Where:** `work-record.mjs:2175-2176`. The own branch is derived *after* step 3 has removed the worktree, so on a live run the path no longer resolves.
- **Repro (`p5-scratch.mjs` P4):** `Worktree: <abs path>`, `Artifact: <bare sha>`.
  ```
  P4 … dry: origin-branch: would removed build/p4-1 5e87b9a… restore: …
  P4 live: worktree: removed … | origin-branch: refused (no branch name could be derived from Worktree:/Artifact:)
  ```
  This is a wrong refusal: it fails safe, but it breaks "dry run prints the same lines".
- **Fix:** the hoist given in R2-2 (derive `ownBranchName` from a map built before step 3).
- **Predicted:** live then matches dry.

### R2-8. MINOR: `closeoutWorktree` reports `absent` (exit 0) for a `Worktree:` it failed to match, and the worktree stays
- **Where:** `janitor.mjs:1207-1209`. The path match is an exact string comparison (`samePath`), and the branch match compares the raw field. L8 normalization and L7 separator/case folding are applied in work-record.mjs, but not here.
- **Repro (`p5-scratch.mjs` P9):** `Worktree: origin/build/p9-1`:
  ```
  P9 … dry: exit=0 worktree: would absent | branch: would absent | origin-branch: would removed build/p9-1 …
  ```
  The origin branch goes, the local worktree and branch stay, and the run exits 0. A Windows `Worktree: C:\Users\…` against git's `C:/Users/…` does the same.
- **Fix (mechanical):**
  ```js
  // old
    let entry = worktrees.find((w) => samePath(w.path, target));
    if (!entry) entry = worktrees.find((w) => w.branch === worktreeField);
  // new
    const keyOf = (p) => { let r = path.resolve(p); try { r = realpathSync.native(r); } catch { /* compare resolved */ } return process.platform === "win32" ? r.toLowerCase() : r; };
    const branchField = String(worktreeField).trim().replace(/\/+$/, "").replace(/^refs\/heads\//, "").replace(/^refs\/remotes\/origin\//, "").replace(/^origin\//, "");
    let entry = worktrees.find((w) => keyOf(w.path) === keyOf(target));
    if (!entry) entry = worktrees.find((w) => w.branch === branchField);
  ```
- **Predicted:** P9 gives `worktree: would removed …`, `branch: would removed build/p9-1`. The existing tests are unchanged.

### R2-9. MINOR: the M5 "confined write" is a second realpath with no confinement check
- **Where:** `work-record.mjs:2223`. The claim in the builder's report ("the same realpath-confined path the read above resolved") is not what the code does. This is only a concurrent-swap window.
- **Fix:**
  ```js
  // old
      const realAbsPath = fsImpl.realpathSync(path.resolve(repoRoot, opts.recordPath));
  // new
      const realAbsPath = fsImpl.realpathSync(path.resolve(repoRoot, opts.recordPath));
      const relReal = path.relative(repoReal, realAbsPath);
      if (relReal.startsWith("..") || path.isAbsolute(relReal)) throw acceptanceError(`path resolves outside repository: ${opts.recordPath}`);
  ```

### R2-10. MINOR: on a win32 host, a POSIX `Scratch: /tmp/...` passes the host-absolute check
- **Where:** `work-record.mjs:1960`. `path.win32.isAbsolute("/tmp/x")` is `true`, and it resolves to `\tmp\x`, so L7's `other-platform path` refusal does not fire. The value is then refused only because it is not under a root, unless an env root covers `C:\tmp`. That fails safe, but it is not the ruling.
- **Fix:**
  ```js
  // old
    const hostAbsolute = winCase ? path.win32.isAbsolute(scratchPath) : path.posix.isAbsolute(scratchPath);
  // new
    const hostAbsolute = winCase ? /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/])/.test(scratchPath) : path.posix.isAbsolute(scratchPath);
  ```
- **Test:** `platform: "win32"` with `Scratch: /tmp/<sid>/lane` gives `/other OS/`.

## Verified absent: attacked this round, and they hold
- **Lease (L1):** a moved branch is refused as `moved` on both paths, with exit 2. The raced commit survives. The restore line restores the exact checked sha (P1).
- **Fetch-first (L2):** a sweep dry run fetches, and the stale e2 case is kept. (The fetch-failure branch is correct on reading; only its test is missing.)
- **Ignored and dirty files (L4):** nothing is forced. `-d` only, never `-D` (janitor.mjs:1281, and `applySafe` receives `branches: []`).
- **`--by` gate (L3):** runs before step 1, in dry runs too, and nothing is written on refusal.
- **Scratch step:** a file target, EACCES, the depth bound, and an unregistered nested repo at depth 3 are all refused (P7/P8). Symlinked ancestors and a `.git` direct child are tested.
- **Log line:** owned by `Owner:`. No new validator findings (e4).
- **Plain `close`:** exit code and no-write behavior are identical to base (P10).
- **New tests:** every `push` and `clone` targets a `git init --bare` fixture or a clone of one. None touches a real remote.
- **Lead-session values in real records** are UUIDs, so the any-depth whole-segment match (L6) cannot be satisfied by a generic word.

## Verdict
NEEDS_FIXES. The blockers are:
- R2-1 (a binding ruling is missing);
- R2-2 (fail-open);
- R2-3 (five delete guards held by no test);
- R2-4 (a wrong delete, fixable in two lines).

R2-6 to R2-10 are minor and mechanical, and can ride along. Both criticals, and L1, are closed and verified live.
