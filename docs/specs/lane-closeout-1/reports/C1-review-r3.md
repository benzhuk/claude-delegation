VERDICT: NEEDS_FIXES 0fcd68699e13dfe83ffca2b096cbae5664c54972

# C1 review, round 3 (lane 36, lane-closeout): delta f10c792..0fcd686

Reviewer: Opus, high tier, delta review. It checks R2-1 to R2-4 and R2-6 to R2-10 against the new code, spot-checks the builder's mutation table on a scratch copy, re-confirms the two round-1 criticals and the L1 lease, and hunts regressions from the round-3 changes.

Artifact: wt/lane-closeout-1-C1 at 0fcd68699e13dfe83ffca2b096cbae5664c54972, in /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1. I left it untouched: `git status --short` was empty and HEAD was 0fcd686 when I finished.

GOAL served: "work lost or stalled". Nearest NOT: "a rule no script checks". The one blocker is a delete guard that is correct in the code but held by no test. Round 2 named it by line, and the builder's table credits a different check with killing it.

## Summary

- The code is right on every delete path I attacked, including three new symlink attacks (A, B, C below).
- R2-1, R2-4 and R2-6 to R2-10 are closed.
- R2-2 is closed in the code, but only partly tested.
- R2-3 is **not** fully closed. Round 2's mutant M-c still survives the whole suite. That mutant is `f10c792:2042`, the scratch step's `listWorktrees === null` refusal, now at `0fcd686:2064-2066`.
  - The builder's table maps "M-c" to the sweep-origin guard, and the test comment at closeout.test:1169-1171 does the same. But round 2's M-c was the scratch-step guard, and the R2-3(f) test that round 2 asked for (the directory survives when the worktree list fails) was never written.
  - The fix is five assertion lines in an existing test. I checked it on a scratch copy: it passes on the artifact and fails with M-c applied.
- Everything else below is minor or an observation.

## Method

- **Scratch location:** everything is under `.../scratchpad/lane-closeout/C1-review-r3/`.
- **Repros:** I copied the round-2 repros verbatim, changing only `lib.mjs` `BASE` (to `C1-review-r3/fx`) and the `S` path in `p10-close-argv.mjs`. Every fixture is fresh and has a local bare origin. The real origin was never touched.
- **New probe:** `p20-r3.mjs`. It contains no shell or git deletion command; the one worktree-removal line I first wrote was replaced with `commit-tree`/`update-ref` plumbing before the probe ran.
- **Base scripts:** from `git archive 7b00418 scripts` into `C1-review-r3/base7b/`.
- **Mutation copy:** `git archive 0fcd686` into `C1-review-r3/mut/`.
  - `mutate.mjs` applies one mutant at a time. Each edit must match exactly once. It runs `work-record-closeout.test.mjs`, `work-record.test.mjs` and `janitor.test.mjs`, then writes the original bytes back.
  - Afterwards I confirmed with `cmp` that `mut/scripts/{work-record,janitor,work-record-closeout.test}.mjs` are byte-equal to the artifact.
  - Results are in `mutation.log` and `mutation-results.json`.
- **Commands denied:** none.
- **Process note:** the builder's report says its mutants were applied "on the live worktree code (not a separate scratch copy)". The addendum said a scratch copy. The committed artifact is clean, and my scratch copy is byte-equal to it, so this does not affect the artifact. The lead should know it happened.

## Territory tests and counts

Command, run in the worktree: `node --test scripts/work-record.test.mjs scripts/work-record-closeout.test.mjs scripts/janitor.test.mjs scripts/record-closed-and-skip.contract.test.mjs`

Result: **399 tests, 396 pass, 1 fail, 2 skipped.**
- The one failure is `docs/GOALS.md and docs/goals/card.md carry no phrase this build's evidence contradicts (STALE regexes, doesNotMatch)`, which fails at base too.
- The two skips are the pre-existing platform skips in janitor.test.mjs:801 and :1060.

On the scratch copy, the three-file set gives **393 tests, 390 pass, 1 fail (STALE)**. That matches the builder's "393 / 390 / 1 / 2".

Log: `C1-review-r3/territory.log`. I did not re-run the full suite; the builder's `reports/C1-r3-gate.log` gives 2677 tests, 2671 pass, 1 fail (STALE), 5 skipped.

## Round-2 repros on fresh fixtures (0fcd686)

| Repro | Round 2 (f10c792) | Now (0fcd686) | Status |
|---|---|---|---|
| p2 P2, Windows `Worktree:` | `delete build/p2a-1` | `keep build/p2a-1 … open-record-unresolved wr-p2-open` | R2-1 CLOSED |
| p2 P2, absent POSIX `Worktree:` | `delete` | `keep … open-record-unresolved wr-p2-open` | R2-1 CLOSED |
| p2 P6, symlinked `Worktree:` | `delete build/p6-1` | `keep … named by wr-p6-open (Status: owned)`, a direct match | R2-1 CLOSED |
| p2 P3, worktree list fails (sweep) | exit 0, `delete` | exit 2, nothing deleted | R2-2 CLOSED (sweep) |
| p5 P5, target inside a registered worktree | removed; the uncommitted file was lost | dry and live both `refused (lies inside a path in git worktree list)`; the file survives | R2-4 CLOSED |
| p11, `receive.denyDeletes` | `delete-failed … moved` | `delete-failed … remote: error: denying ref deletion … (deletion prohibited)`; origin tip unchanged | R2-6 CLOSED |
| p5 P4, path `Worktree:` + bare-sha `Artifact:` | dry `would removed`, live `refused (no branch name …)` | dry and live both `removed build/p4-1 <sha>` | R2-7 CLOSED |
| p5 P9, `Worktree: origin/build/p9-1` | `would absent`, exit 0 | `worktree: would removed …`, `branch: would removed build/p9-1` | R2-8 CLOSED |
| p5 P7/P8 | file refused; EACCES refused; deep tree and nested `.git` refused | file refused; EACCES refused; deep tree and nested unregistered `.git` **removed**, as L5-replaced intends | as ruled |
| p10, plain `close` argv | base = head (exit 1, no write) | unchanged | L9 holds |

## Round-1 criticals and L1

| Item | Evidence now | Mutant check (scratch copy) |
|---|---|---|
| F1, ignored files deleted live | e1: DRY `would dirty`. LIVE `worktree: dirty … (untracked, modified or ignored files present …)` and `branch: refused`. **`.env survives: true`**, and the worktree dir exists. | M13 (live `if (!clean)` off) is **killed** by 2 tests: `closeoutWorktree: an ignored-only file …` and `closeoutRecord: F1 - …` |
| F2, sweep on stale refs | e2: `keep build/e2-1 7d477c5… tip is not an ancestor of origin/main`, evaluated at the re-fetched tip. **`origin still has branch: true`** | M14 (sweep fetch-failure early return off) is **killed** by `sweepOrigin: R2-3(a) …`. M21 (closeout merge-proof fetch failure off) is **killed**. |
| L1, lease | p1: closeout `refused build/p1c-advance-1 (moved)`; sweep `delete-failed … moved`, exit 2. The raced commit survives on both paths. The control run's printed restore line restores the exact evaluated sha (`== evaluated … true`). | M9 (lease replaced by `--force`) is **killed** by `sweepOrigin: L1 - …` |

The other round-1 repros were also re-run on fresh fixtures and all hold:
- e4: Log owner is `lead`, and the finding codes are unchanged.
- e5a/e5b: `contains a path in git worktree list` and `contains the repo root`.
- e9: E9 dry run changed nothing; E10 keeps all four name forms; E11 keeps; E12 excludes.
- e13: `refuses the worktree that is (or contains) --repo`, and the dir is intact.

## Mutation spot-check (task 2)

I removed 25 checks, one at a time, on the scratch copy. That covers each check the brief named: the worktree-list refusal, containment in both directions, the lease and the `--by` gate.

| # | Check removed | Result | Test that caught it |
|---|---|---|---|
| M1 | sweep `worktreesByPath === null` (made fail-open with `?? new Map()`) | KILLED | `sweepOrigin: R2-2 …` |
| M2 | closeout origin-step `worktreesByPath === null` (fail-open) | KILLED | `closeoutRecord: R2-2 …` |
| **M3** | **scratch step `listWorktrees === null` refusal (fail-open with `?? []`), work-record.mjs:2064** | **SURVIVED** | none; see **R3-1** |
| M4 | scratch contains the repo root | KILLED | `R2-3(c)` |
| M5 | scratch contains a worktree | KILLED | `R2-3(b)` |
| M6 | scratch lies inside the repo root | KILLED | `R2-4 … repo root itself` |
| M7 | scratch lies inside a worktree | KILLED | `R2-4 … linked worktree` |
| M8 | all four containment checks off | KILLED | 4 tests |
| M9 | lease replaced by `--force` | KILLED | `sweepOrigin: L1 …` |
| M10 | top-level `--by` gate | KILLED | `closeoutRecord: L3 …` |
| M11 | scratch-step `--by` gate alone | SURVIVED (equivalent) | Unreachable through `closeoutRecord`: the L3 gate at :2150 returns first, and `removeScratchDirectory` is not exported. It is defense in depth. |
| M12 | both `--by` gates | KILLED | 2 tests |
| M13 | F1 live dirty check (janitor.mjs:1286) | KILLED | 2 tests |
| M14 | sweep fetch failure | KILLED | `R2-3(a)` |
| M15 | basename fallback's closed/withdrawn filter | SURVIVED (safe direction) | The mutant only over-protects. The test title promises this case but the test body does not exercise it; see R3-4. |
| M16 | scratch `exactWt` equality | SURVIVED (equivalent) | `inside()` counts `rel === ""`, so the same target is refused as `contains a path in git worktree list`. |
| M17 | symlink target | KILLED | |
| M18 | symlinked ancestor | KILLED | |
| M19 | not under a scratch root | KILLED | 3 tests |
| M20 | session id strictly between the root and the target | KILLED | 2 tests |
| M21 | closeout merge-proof fetch failure | KILLED | |
| M22 | `worktree-unresolved` reverted to `absent` | KILLED | 2 tests |
| M23 | `closeoutWorktree` within `--repo` | KILLED | `F7 …` |
| M24 | `closeoutWorktree` within cwd | KILLED | 2 tests |
| M25 | `pathWithin` win32 lowercase fold | SURVIVED (equivalent) | `path.win32.relative` already compares case-insensitively, so the fold is redundant under `path.win32`. The behavior the win32 test pins is correct either way. |

The builder's rows 1-9 and 14-15 agree with my runs where they overlap. Their row set leaves out M3, which is the one gap that matters.

## Regression hunt (task 4)

**The `realpathSync` import fix.** I confirmed the latent bug with a no-emit typecheck scan (`tsc --noEmit --allowJs --checkJs`):
- On f10c792 it reports `work-record.mjs(1744,15): error TS2304: Cannot find name 'realpathSync'`.
- On 0fcd686, the only unresolved names in `work-record.mjs` and `janitor.mjs` are `process` (41 hits, from missing node typings).
- So there is no other undefined identifier hidden behind a `try`/`catch`.

With the import in place, `worktreePathKey` really realpaths both the map keys and the lookups (P6 above). Every caller goes through the same key function, so no existing match was lost.

**New symlink attacks on the scratch containment** (`p20-r3.mjs`, dry runs). Containment compares the realpath-checked target against `path.resolve(w.path)` and `path.resolve(root)`, without a realpath on the second side. So I tried to get a symlinked `--repo`, or a worktree registered through a symlink, past it:

```
A  --repo via symlink, repo root inside the scratch:  scratch: would refused …/lane (contains a path in git worktree list)
B  worktree added through a symlink into the scratch:  scratch: would refused …/lane (contains a path in git worktree list)
C  scratch inside the repo, --repo via symlink:        scratch: would refused …/lane (lies inside a path in git worktree list)
```

All three hold, because git 2.43 records and lists worktree paths by their real path. The list catches what the non-realpath'd `repoResolved` misses. This is verified absent.

**R2-2 end to end** (`p20` D). With a PATH shim that fails only `git worktree list`, a live closeout gives exit 2:
- `worktree: refused (could not read git worktree state)`;
- `origin-branch: refused (UNVERIFIABLE: could not read git worktree list)`;
- `scratch: refused … (could not read git worktree list)`.

The worktree, the scratch and the origin branch all survive. The code is right; only the scratch-step half is untested (R3-1).

**Dry run and live run.** P4 dry and live now agree.

**R2-9.** The check is present. Its failure mode is covered in R3-5.

**R2-10.** The regex rejects `/tmp/...` and accepts `C:\`, `C:/`, `\\server\share` and `\\?\C:\...`. That is correct.

## Findings

### R3-1. MAJOR (blocker, R2-3 ruling): the scratch step's fail-closed `git worktree list` refusal is held by no test (round-2 mutant M-c survives)
- **Where:** `scripts/work-record.mjs:2064-2066`. This check stands between `fs.rmSync` and a scratch dir that holds a registered worktree with uncommitted work. The test that was meant to hold it, `scripts/work-record-closeout.test.mjs:1189-1202` (`closeoutRecord: R2-2 …`), asserts only the origin-branch step and the exit code.
- **Mislabel:** the comment at closeout.test:1169-1171 says the sweep test "kills mutant M-c". Round 2's M-c was `f10c792:2042`, and I confirmed that line is this scratch guard.
- **Repro (scratch copy):** apply `const worktrees = listWorktrees(root) ?? [];`. The whole suite passes except the STALE test (M3 above). With the mutant, a scratch containing a linked worktree is removed whenever `git worktree list` fails.
- **Fix (mechanical).** In `scripts/work-record-closeout.test.mjs`, test `closeoutRecord: R2-2 - a failed git worktree list refuses the origin-branch step …`:
  ```js
  // old (line 1199)
    assert.match(steps["origin-branch"].detail, /could not read git worktree list/);
  // new
    assert.match(steps["origin-branch"].detail, /could not read git worktree list/);
    assert.equal(steps.worktree.result, "refused");
    assert.match(steps.worktree.detail, /could not read git worktree state/);
    assert.equal(steps.scratch.result, "refused");
    assert.match(steps.scratch.detail, /could not read git worktree list/);
    assert.equal(fs.existsSync(scratchPath), true, "the scratch directory must survive when git worktree list cannot be read");
  ```
  Also correct the "kills mutant M-c" comment at :1169-1171, and add an M3 row to the builder's mutation table.
- **Verified:** on the scratch copy (`verify-m3-fix.mjs`) the patched test gives 1 pass on unmutated code and 1 fail with M3 applied. Both files were restored byte-equal afterwards.
- **Predicted:** the territory counts stay at 399/396/1/2, and M3 becomes KILLED.

### R3-2. MINOR: `branch: absent` is reported when `Worktree:` is unresolved, even if the local branch exists
- **Where:** `scripts/janitor.mjs:1249`. The unresolved return hard-codes `{ step: "branch", result: "absent" }` without checking anything.
- **Repro (`p20` F):** `Worktree: C:/Users/benzh/orca/workspaces/x/p20f-1`. The local branch `build/p20f-1` exists with no worktree.
  ```
  F exit 2 | worktree: would refused (worktree-unresolved) | branch: would absent | origin-branch: would removed build/p20f-1 …
  F local branch exists: true
  ```
  Nothing is deleted, since the exit is 2, but the line tells the lead the local branch is gone when it is not.
- **Fix (mechanical):**
  ```js
  // old
      return { steps: [{ step: "worktree", result: "refused", detail: "worktree-unresolved" }, { step: "branch", result: "absent" }] };
  // new
      return { steps: [{ step: "worktree", result: "refused", detail: "worktree-unresolved" }, { step: "branch", result: "refused", detail: "worktree-unresolved (not checked)" }] };
  ```
  Then update the expected branch step in `janitor.test.mjs` (the `closeoutWorktree: R2-8 - … never checked out anywhere` test) and in `work-record-closeout.test.mjs:333` (`steps.branch.result` becomes `"refused"`).
- **Predicted:** F gives `branch: would refused (worktree-unresolved (not checked))`. The exit code is unchanged (2).

### R3-3. MINOR: the shim tests, and the R2-10 test, fail on a win32 host; the helper's doc says callers skip there, but none do
- **Where:** `scripts/work-record-closeout.test.mjs:153`. The comment says "Skipped on win32 … by the caller", but the tests at :1172 and :1189 have no `skip`. `withFailingWorktreeList` runs `which git` and writes a `#!/bin/sh` shim, and both fail on Windows.
- **Also:** the R2-10 test at :1367-1380 uses `mkScratchFixture()`. On a Windows host that returns a host-absolute `C:\…` path, so the refusal it asserts never fires.
- **Impact:** these are false failures, not false passes. But the project runs on Windows hosts; janitor.test.mjs already has a win32-only test at :1060.
- **Fix (mechanical):**
  - Add `{ skip: process.platform === "win32" ? "PATH-shim git wrapper needs a POSIX shell" : false }` as the second argument of the two R2-2 `test(...)` calls.
  - In the R2-10 test:
    ```js
    // old
      const { scratchPath } = mkScratchFixture("r210-lane"); // a real POSIX absolute path, e.g. /tmp/.../r210-lane
    // new
      const scratchPath = process.platform === "win32" ? `/tmp/${by}/r210-lane` : mkScratchFixture("r210-lane").scratchPath;
    ```
    Guard the final `existsSync` assertion with `if (process.platform !== "win32")`.

### R3-4. MINOR: a test title claims closed/withdrawn coverage that the test body does not have
- **Where:** `scripts/work-record-closeout.test.mjs:1429`, "… and does not apply to a closed/withdrawn record". The body writes only an `owned` record with a non-matching basename. Mutant M15 (the filter removed) survives.
- **Why it is minor:** that mutant only over-protects, which is the safe direction.
- **Fix:** add a second case to the test, or rename it:
  - write a `Status: closed` record whose `Worktree:` is `C:/Users/benzh/x/r1-nomatch-1` (a matching basename);
  - assert that `build/r1-nomatch-1` is still `delete`.

  Otherwise drop "and does not apply to a closed/withdrawn record" from the title.

### R3-5. MINOR: a failed R2-9 confinement check throws after the deletes, so the restore lines are never printed
- **Where:** `scripts/work-record.mjs:2275`. By this point the worktree, the origin branch and the scratch may already be gone. `throw` discards `lines`, including the `restore: git push origin <sha>:refs/heads/<name>` line, the only record of the sha. It needs a concurrent symlink swap, so it is unlikely, but it is a delete path with no receipt.
- **Fix (mechanical):**
  ```js
  // old
      if (relReal.startsWith("..") || path.isAbsolute(relReal)) {
        throw acceptanceError(`path resolves outside repository: ${opts.recordPath}`);
      }
  // new
      if (relReal.startsWith("..") || path.isAbsolute(relReal)) {
        lines.push(`log: refused (path resolves outside repository: ${opts.recordPath})`);
        return { lines, ok: false, exitCode: 2, steps: results };
      }
  ```
  In the R2-9 test (:1327-1361), replace `assert.throws(...)` with:
  - `const r = closeoutRecord(...)`;
  - `assert.equal(r.exitCode, 2)`;
  - `assert.match(r.lines.at(-1), /log: refused \(path resolves outside repository/)`.

  Keep the `doesNotMatch` assertion on `outsideTarget`.
- **Predicted:** the write is still refused, and the restore lines survive in the output.

### R3-6. MINOR (docs): the round-3 scratch sentence is literally false for two items, and the janitor skill still describes a plain delete
- **Scratch sentence:** `docs/work-record.md:373-374` says the target "must never be, contain, or … LIE INSIDE, a drive/filesystem root, the home directory". Every path lies inside a filesystem root, and the code checks only equality for root and home (`work-record.mjs:2049-2054`). Fix:
  ```
  old: anywhere in the resolved path; and the target must never be, contain, or (round 3 ruling)
  LIE INSIDE, a drive/filesystem root, the home directory, the repo root, or a path in `git
  worktree list` — checked in both directions,
  new: anywhere in the resolved path; the target must never be a drive/filesystem root or the
  home directory; and it must never be, contain, or (round 3 ruling) LIE INSIDE the repo root
  or a path in `git worktree list` — checked in both directions,
  ```
- **Janitor skill:** `skills/janitor/SKILL.md:50` says "deletes the *origin* branch itself (`git push origin --delete`)". The code deletes with a lease. Replace with ``(`git push --force-with-lease=refs/heads/<name>:<tip> origin :refs/heads/<name>`, a lease on the sha it just proved merged)``. This line predates this round's delta, but it is in the territory.

### R3-7. NIT: a rejected push's multi-line stderr is spliced raw into one output line
- **Where:** `scripts/work-record.mjs:2363` (sweep) and :2238 (closeout). p11 shows `delete-failed build/p11-1 remote: error: …` followed by `To …`, ` ! [remote rejected] …` and `error: …` on separate physical lines.
- **Fix:** `del.error.replace(/\s+/g, " ").trim()` at both sites.

## Observations for the lead (no builder action)

- **O1 (R2-8 ruling cost).** Most real records carry `Worktree: build/<name>` (a survey of `docs/work/*.record.md` shows 4 Windows paths, the rest bare names). A closeout of any record whose worktree the janitor sweep or merge-on-acceptance already removed now exits 2 with `worktree-unresolved`.
  - The same happens on every re-run. In `p20` E, run 1 exits 0; run 2 exits 2 with `worktree: refused (worktree-unresolved)` and `origin-branch: refused … (not found on origin)`, and it appends a second closeout Log line.
  - This follows the ruling, and it is a wrong refusal, never a wrong delete.
  - If you want it narrowed: a bare-name `Worktree:` that normalizes, matches no worktree, and has no local branch is genuinely absent. Only a path that fails to resolve is ambiguous.
- **O2.** R2-7 (the hoist) has no dedicated test. Moving the derivation back after step 3 would produce only a wrong refusal, so I do not block on it.
- **O3.** M7 (performance) stays deferred, as the builder's report says.

## Findings table (round-2 items)

| Item | Status | Evidence |
|---|---|---|
| R2-1 | CLOSED | P2 ×2 and P6; four tests; builder mutation rows 9-10; tsc scan confirms the import fix |
| R2-2 | CLOSED (code); the scratch-step test is missing (R3-1) | P3; p20 D; M1 and M2 killed; M3 survives |
| R2-3 | **OPEN**, one survivor (R3-1) | 25-mutant table above |
| R2-4 | CLOSED | P5; M6 and M7 killed |
| R2-6 | CLOSED | p11; P1 still reports `moved` |
| R2-7 | CLOSED | P4 dry equals live (O2) |
| R2-8 | CLOSED; residue in R3-2 | P9; M22 killed |
| R2-9 | CLOSED; failure mode in R3-5 | test at :1327 |
| R2-10 | CLOSED | test at :1367; win32 portability in R3-3 |
| L5 replaced | DONE as ruled | the walk is gone; P7/P8 nested repo removed; docs updated (wording in R3-6) |

## C4 fields

Cause: a delete guard (the scratch step's fail-closed `git worktree list` refusal, work-record.mjs:2064-2066) shipped with no test that fails when it is removed. The builder's mutation table credited round-2 mutant M-c to the sweep-origin guard, so this check was never mutated.
Discriminating check: on a scratch copy, change `const worktrees = listWorktrees(root);` to `const worktrees = listWorktrees(root) ?? [];`. The territory suite still passes (only STALE fails). With the R3-1 assertions added, `closeoutRecord: R2-2 …` fails.
Fix location: scripts/work-record-closeout.test.mjs:1199, the `closeoutRecord: R2-2 - a failed git worktree list refuses the origin-branch step …` test. Add five assertions on the worktree and scratch steps and on scratch survival. No production code changes.
Simplification: no new test or helper. The existing R2-2 closeout test already builds the failing-list fixture and a scratch dir; it just never asserted on them.
