VERDICT: NEEDS_FIXES (5) 61b6aa60b2bb6e489dd0e257e365d135c89612c7

# C1 review, round 2: collect-from-origin collector (delta re-review)

Reviewed: `/home/ben/Code/wt-collect-from-origin-1-C1` at `61b6aa60b2bb6e489dd0e257e365d135c89612c7` (I ran `git rev-parse HEAD` myself). Range `d2a6270..HEAD` is one commit, `61b6aa6`. It touches only `scripts/collect-from-origin.mjs` (+/-161) and `scripts/collect-from-origin.test.mjs` (+/-117), both inside C1's territory. The worktree's `git status --short` was empty before and after my review.

JUDGMENT: collector-never-lies-about-merged-state: HOLDS for the `merged` field and for the table's product behaviour on every fixture I built, with one exception, R2-3. When a branch has no merge base with main, it gets a confident `no-record` row. Two of the round-1 fixes (F1 and the three-dot half of F3) are correct in the code but have no test that can catch their loss. The F1 "regression test" passes with the bug put back. That is the named failure class: a check that passes because it isn't looking.

Counts: 0 blockers, 2 major, 3 minor. F6 is carried as a lead-ruling item and is not counted against the builder.

## Gate: genuinely green
- I ran `node --test scripts/collect-from-origin.test.mjs` in the worktree on bare `/tmp`, which has inodes free again (`df -i /tmp`: 87% used). Result: `tests 19 / pass 19 / fail 0`. No FIXTURE_ROOT workaround was needed this round.
- `grep -vE '^\s*(//.*)?$' scripts/collect-from-origin.mjs | wc -l` gives **111**, which matches the builder's number.

## Attack brief (spec Acceptance, contracts R1): re-run by me, empirically
The fixture lives in the session scratchpad and uses its own throwaway `GIT_CONFIG_GLOBAL`. Its branches:
- `tie`: the tip equals main's original tip, and the record's `Artifact: garbage` cannot be parsed.
- `tie2` / `tie2b`: set `Status: accepted` with no `Artifact:` line, then were fast-forwarded into main.
- Main then moved on and rewrote the same record to `Status: accepted` with `Artifact: build/x@<real main sha>`, which is a later Status.
- `notmerged`: a non-ancestor branch that rewrote the same record with `Artifact: build@nothex`.

Output of `--no-fetch --json`, verbatim, complete:
```
[{"branch":"notmerged","tipSha":"2405faa9...","recordPath":"docs/work/wr-a.record.md","status":"accepted","artifactSha":null,"merged":null,"hoursSinceLog":null,"state":"accepted-unmerged"}]
```
- Every tip-equals-main or ancestor branch (`tie`, `tie2`, `tie2b`) is skipped (`collect-from-origin.mjs:153`), so none of them has a row.
- The one ambiguous row reads `merged: null`. `merged` is never `true`.

**Never writes, verified empirically.** I took a sha256 of every file under `.git` plus `git status --porcelain`, before and after each run:
- `--no-fetch` run: **ZERO-DIFF**.
- Run with the fetch enabled, after one warm-up fetch: **ZERO-DIFF**.

**Real repo** (`/home/ben/Code/claude-delegation`, `--no-fetch --json`, read-only): exactly the 8 rows the builder and I predicted. `build/collect-from-origin-1` and `build/one-launch-1` are `accepted-unmerged` with `merged: false`, one row is `owned`, and five are `no-record`. The piped JSON parses.

## Prior findings: status

| Finding | Status | Evidence |
|---|---|---|
| F1 BLOCKER (stdout truncation) | **Code fixed; test does not guard it (see R2-1)** | Line 171 now reads `process.exitCode = main()`. On a 500-record fixture, `\| wc -c` gives 65536 with `process.exit` and 131952 with the fix, and the piped JSON parses to 500 rows. |
| F2 MAJOR (changed set, no-record) | Fixed | `:76` uses `--diff-filter=AM`. `:156` pushes one `noRecordRow` when a branch has zero changed paths. The pinned fixture asserts both. I reverted the filter on a scratch copy and a test fails whenever the three-dot range is also reverted. |
| F3 MAJOR (fully merged branches) | Fixed. The ancestor skip is tested; the three-dot range is not (R2-2) | Removing `:153` on a scratch copy fails 2 tests. Reverting only `...` to two-dot fails **0 tests**. |
| F4 MAJOR (<= 60 runtime lines) | **Open: 111 vs 60** | See F4 below. |
| F5 MINOR (subdirectory `--repo`) | Code fixed; no test (R2-4) | Reverting `:(top,glob)` on a scratch copy fails 0 tests. |
| F6 MINOR (`[]` when main is unresolved) | Unchanged, correctly deferred | This needs a lead ruling on the output shape. The brief forbids the builder from changing it alone. Not counted. |
| F7 MINOR (`isAncestor` failure read as false) | Fixed | `:32`: `ok()` returns `false` only on exit 1 and `null` otherwise. `:153` uses `=== true`. |
| F8 MINOR (never-writes test not looking) | Fixed, and it discriminates | I injected `tryGit(["config","x.y","1"])` into `main` on a scratch copy, and the never-writes test failed. |
| F9 MINOR (attack title vs case) | **Partially fixed. The test does not build what its comment and the report claim (R2-2)** | See R2-2. |
| N1 NIT | Fixed | The false claim is gone from the pinned-fixture comment. |

## Findings

### R2-1 MAJOR: the F1 regression test passes with the F1 bug put back. It cannot catch the regression it is named for.
Evidence:
- On a scratch copy I changed `collect-from-origin.mjs:171` back to `process.exit(main())` and ran `node --test --test-name-pattern="F1 regression"` three times. All three runs **passed** (`pass 1 fail 0`).
- The test captures output through `execFileSync(process.execPath, [...])` (`collect-from-origin.test.mjs:391-394`). With that capture the child never hits the non-blocking-pipe EAGAIN path, so it never reproduces the truncation.
- A real shell pipe on the same kind of fixture truncates at exactly 65536 bytes with the old code.

This is a check that passes because it isn't looking. The builder report's claim "New regression test ... Passes" is true, but it proves nothing about F1.

Fix (mechanical). I verified it on a scratch copy: the mutated code **fails** with "expected output over 64 KiB, got 65536 bytes", and the fixed code passes.
```
-  const out = execFileSync(process.execPath, [scriptPath, "--repo", root, "--no-fetch", "--json"], {
-    encoding: "utf8",
-    maxBuffer: 10 * 1024 * 1024,
-  });
+  // A real shell pipe (`| cat`), not execFileSync's own capture: only a pipe the child sees as
+  // non-blocking reproduces the 64 KiB truncation that process.exit caused (F1).
+  const out = execFileSync("sh", ["-c", '"$0" "$1" --repo "$2" --no-fetch --json | cat', process.execPath, scriptPath, root], {
+    encoding: "utf8",
+    maxBuffer: 10 * 1024 * 1024,
+  });
```

### F4 MAJOR (carried): runtime lines are 111 against a pinned <= 60
Evidence: `grep -vE '^\s*(//.*)?$' scripts/collect-from-origin.mjs | wc -l` gives `111`. R1 pins "<= 60 runtime lines". I found no waiver in `docs/work/wr-2026-09-26-collect-from-origin.record.md` or in contracts.md.

The builder applied every cut named in round 1 (180 down to 111) and escalated the rest openly, which is the right process. The pinned contract is still unmet, though, and a builder's report cannot waive it.

Fix (judgment). There are two ways to close this:
- **Lead:** record an explicit waiver of the 60-line pin in the work record. That is the realistic route, because R2-3's fix adds 1 line.
- **Builder:** cut further. Candidates:
  - `parseArgs` (`:34-45`, 11 lines) can become a 3-line flag table.
  - `commitInfo` (`:63-68`) and `listOriginBranches` (`:55-61`) can each collapse to 1-2 lines.
  - The fetch try/catch (`:139-145`) can become one `if (!args.noFetch && tryGit(["fetch","origin"], repo) === null) warn(...)`.
  - The exported one-liners `refExists` and `objectExists` can be inlined.

  Even with all of these, the file is unlikely to get below about 80 lines.

### R2-2 MINOR: the F9/F3 attack test does not build the case its comment and the report describe, and the three-dot half of F3 has no test at all
Evidence:
- `collect-from-origin.test.mjs:415-418` has the comment "main moves on again and rewrites the SAME record path with a later Status and a real, merged artifact". The code under it only writes `later-merge.txt`. The record is never rewritten on main.
- The builder report (C1-report-r2.md, F3 section) says the same false thing: "advances main again rewriting the same path with `Status: accepted` and a real merged artifact".
- Separately, I changed `` `${mainFull}...${branchRef}` `` back to two-dot (`mainFull, branchRef`) on a scratch copy. The whole suite still passes (`pass 19 fail 0`).

So nothing tests the case of a non-ancestor branch carrying a stale copy of a record that main rewrote after the fork. Under two-dot that case yields a false `owned` or `accepted-unmerged` row. This is the non-ancestor twin of F3.

Fix (mechanical). I verified it on a scratch copy:
- With the patch, the suite is `pass 20 fail 0`.
- With the patch and two-dot put back, the new test fails.

Replace the tail of the F9 test and add one test after it:
```
-  fs.writeFileSync(path.join(root, "later-merge.txt"), "later\n");
-  commitAll(root, "main moves on");
-  git(["push", "-q", "origin", "main"], root);
-
-  const rows = rowsOf(root).filter((r) => r.branch === "feature/merged");
-  assert.deepEqual(rows, []);
-});
+  fs.writeFileSync(path.join(root, "later-merge.txt"), "later\n");
+  commitAll(root, "main moves on");
+  const laterArtifact = git(["rev-parse", "HEAD"], root).trim();
+  writeRecord(root, "wr-2026-09-26-merged.record.md", ["Work: wr-2026-09-26-merged", "Status: accepted", `Artifact: build/x@${laterArtifact}`, ""]);
+  commitAll(root, "main rewrites the same record with a later Status");
+  git(["push", "-q", "origin", "main"], root);
+
+  const rows = rowsOf(root).filter((r) => r.branch === "feature/merged");
+  assert.deepEqual(rows, []);
+});
+
+test("three-dot: a record main rewrote after an unmerged branch forked is not a row for that branch", () => {
+  const root = initRepoWithOrigin();
+  const shared = writeRecord(root, "wr-2026-09-26-shared.record.md", ["Work: wr-2026-09-26-shared", "Status: owned", "Artifact: none", ""]);
+  commitAll(root, "shared record on main");
+  git(["push", "-q", "origin", "main"], root);
+
+  newBranch(root, "feature/unmerged");
+  fs.writeFileSync(path.join(root, "branch-work.txt"), "w\n");
+  commitAll(root, "unmerged branch work, no record touched");
+  pushBranch(root, "feature/unmerged");
+  backToMain(root);
+
+  writeRecord(root, "wr-2026-09-26-shared.record.md", ["Work: wr-2026-09-26-shared", "Status: accepted", "Artifact: none", ""]);
+  commitAll(root, "main moves the shared record on");
+  git(["push", "-q", "origin", "main"], root);
+
+  const rows = rowsOf(root).filter((r) => r.branch === "feature/unmerged");
+  assert.equal(rows.find((r) => r.recordPath === shared), undefined); // the branch's stale copy is not its change
+  assert.deepEqual(rows.map((r) => r.state), ["no-record"]);
+});
```

### R2-3 MINOR: no merge base (an orphan branch, or a shallow clone whose merge base is past the depth) turns an unknown into a confident `no-record`
This is a round-2 regression: the old two-dot diff handled this case.

Evidence:
- `changedRecordPaths` (`:76-77`) returns `[]` whenever `tryGit` returns null.
- `:156` then pushes a `no-record` row.
- I pushed an orphan branch to the fixture carrying `docs/work/wr-o.record.md` with `Status: accepted`. The collector printed `{"branch":"orphan",...,"recordPath":null,"status":null,...,"state":"no-record"}`.
- Directly, `git diff ... refs/remotes/origin/main...refs/remotes/origin/orphan` prints `fatal: ... no merge base` and exits 128.

So a branch carrying an accepted record is reported as having none. That is an unknown rendered as a confident state, in the direction the lane exists to prevent.

Fix (mechanical): fall back to R1's literal two-dot diff when the three-dot diff fails. I verified it on a scratch copy:
- The orphan now reads `recordPath: docs/work/wr-o.record.md, status: accepted, merged: null, state: accepted-unmerged`.
- The suite passes.
- The regression test below fails on the current code and passes with the patch.
```
-  const out = tryGit(["diff", "--name-only", "--no-renames", "--diff-filter=AM", `${mainFull}...${branchRef}`, "--", ":(top,glob)docs/work/*.record.md"], repo);
-  return out ? out.split("\n").map((s) => s.trim()).filter(Boolean) : [];
+  const diff = (range) => tryGit(["diff", "--name-only", "--no-renames", "--diff-filter=AM", ...range, "--", ":(top,glob)docs/work/*.record.md"], repo);
+  const out = diff([`${mainFull}...${branchRef}`]) ?? diff([mainFull, branchRef]); // no merge base (orphan/shallow): R1's literal two-dot
+  return out ? out.split("\n").map((s) => s.trim()).filter(Boolean) : [];
```
Test to append (verified: fails before the patch, passes after):
```
test("no merge base (orphan branch): its record is still a row, never a confident no-record", () => {
  const root = initRepoWithOrigin();
  git(["checkout", "-q", "--orphan", "orphan"], root);
  git(["rm", "-rq", "--cached", "."], root);
  const rec = writeRecord(root, "wr-2026-09-26-orphan.record.md", ["Work: wr-2026-09-26-orphan", "Status: accepted", "Artifact: none", ""]);
  git(["add", rec], root);
  git(["commit", "-q", "-m", "orphan record"], root);
  pushBranch(root, "orphan");
  git(["checkout", "-q", "-f", "main"], root);

  const rows = rowsOf(root).filter((r) => r.branch === "orphan");
  assert.deepEqual(rows.map((r) => [r.recordPath, r.state]), [[rec, "accepted-unmerged"]]);
});
```

### R2-4 MINOR: the F5 fix (`:(top,glob)`) has no test
Evidence: I reverted the pathspec to `"docs/work/*.record.md"` on a scratch copy, and the suite stayed `pass 19 fail 0`.

Fix (mechanical). Verified: with the pathspec reverted, the pinned fixture test fails; with it restored, the test passes. In the pinned bare-remote fixture test:
```
   const rows = rowsOf(root);
+  assert.deepEqual(rowsOf(path.join(root, "docs")), rows); // F5: a subdirectory --repo reads the same table
   // Look up rows by (branch, recordPath)
```

## Verified and fine (first-class)
- `merged` is still read only from the branch's own blob (`:123`) and never from main's copy. `computeState` returns `accepted-merged` only when `merged === true` (`:106`).
- Row key order still matches `ROW_FIELDS` (`:24`). `noRecordRow` (`:120`) follows the same order.
- Exit code is 0 on every path: the fetch failure, an unresolved main, and the outer catch (`:161`, `:164`). `process.exitCode` does not change that.
- Git verbs in the script: `show-ref`, `for-each-ref`, `log`, `diff`, `show`, `cat-file`, `merge-base`, `fetch`. There is no checkout, reset, update-ref, commit or push. (Informational: the header comment at `:12-13` omits `show-ref`.)
- Informational, not a finding: a squash-merged branch is not an ancestor of main. Its record shows with the branch's own Status, and `merged` is `null` or `false`. That is the safe direction, and this repo merges with merge commits.

## C4 fields (fix round)
Cause: round 2 fixed the code for F1, F3 and F5 correctly, but the tests added alongside those fixes don't reproduce the conditions: execFileSync capture instead of a real shell pipe, main never rewrites the record, no subdirectory `--repo`. Separately, the new three-dot range introduced a no-merge-base failure that maps to `no-record`.
Discriminating check: mutations on a scratch copy. With `process.exit` back, the F1 test passed three times out of three. With two-dot back, 0 of 19 tests failed. With the plain pathspec back, 0 of 19 failed. An orphan branch holding an accepted record printed `state: no-record`.
Fix location: `scripts/collect-from-origin.test.mjs:391-394` (F1 pipe), `:415-424` plus one new test (three-dot), the pinned fixture test after `const rows = rowsOf(root);` (F5), and `scripts/collect-from-origin.mjs:76` (two-dot fallback) plus one new test.
Simplification: none of the fixes adds a mechanism. Each is a one-line pipe change, one extra record write, one fallback expression or one assert. The only line-count cost is +1 runtime line from R2-3, which feeds into F4's waiver decision.

## Method note
All fixtures, mutations and trial patches ran on copies in the session scratchpad (`.../scratchpad/c1r2`), outside the reviewed tree. The worktree's `git status --short` was empty before and after. HEAD is unchanged at `61b6aa60b2bb6e489dd0e257e365d135c89612c7`.
