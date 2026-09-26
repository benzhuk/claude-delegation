VERDICT: NEEDS_FIXES (9) d2a62709bf63e8a3574176a3fbdc974ac85cc5c2

# C1 review, round 1: collect-from-origin collector

Reviewed: `/home/ben/Code/wt-collect-from-origin-1-C1` at `d2a62709bf63e8a3574176a3fbdc974ac85cc5c2` (`git rev-parse HEAD`, run by me).
C1's own delta over base 5f057a3: `docs/census.md` (+13), `scripts/collect-from-origin.mjs` (+230), `scripts/collect-from-origin.test.mjs` (+400). Nothing outside C1's territory was touched.

JUDGMENT: collector-never-lies-about-merged-state: HOLDS for the `merged` field. I could not get `merged: true` out of any ambiguous input. It FAILS for the table as a whole. The `--json` output is cut off at 64 KiB when piped (F1). A branch with unmerged work but no record gets no row at all (F2). A fully merged branch gets false `owned` rows (F3). A lead acting on this table without checking it by hand would be misled today, both on this real repo and in my fixture.

Counts: 1 blocker, 3 major, 5 minor, 1 nit.

## Gate: confirmed green, with an environmental caveat
- `node --test scripts/collect-from-origin.test.mjs` on bare `/tmp` fails with `ENOSPC` at `mkdtemp`. The cause is inode exhaustion, not disk space: `df -i /tmp` shows `1048509/1048576` used, while `df -h` shows 4.6G free. This is not a code defect.
- The same command with `FIXTURE_ROOT=/var/tmp/... TMPDIR=/var/tmp/...` gives `tests 17 / pass 17 / fail 0`. That matches the builder's gate log.

## Attack brief results (spec Acceptance, contracts R1)

**No `merged: true` under ambiguity: verified.** `merged` comes only from the branch's own blob (`collect-from-origin.mjs:158`, `blobAt(repo, branchInfo.ref, ...)`). Main's copy of the record is never read. `computeMerged` (131-135) returns null when there is no sha, when main is not verified, or when the object is missing. `computeState` (138) returns `accepted-merged` only when `merged === true`.

My own fixture (in /var/tmp scratch, with its own throwaway `GIT_CONFIG_GLOBAL`):
- Main has `wr-x.record.md`.
- Branch `tie` was pushed at main's exact tip. Main then rewrote the same record to `Status: accepted` with a real merged artifact (a later Status).
- Branch `acc-noart` rewrote the record to `Status: accepted`, `Artifact: build/x@deadbeef`. That is a short sha, so it cannot be parsed as an artifact sha.
- Branch `norecord` has an unmerged commit and no record change.

Output (`--no-fetch --json`), verbatim rows:
```
{"branch":"acc-noart",...,"status":"accepted","artifactSha":null,"merged":null,"hoursSinceLog":10.62,"state":"accepted-unmerged"}
{"branch":"tie",...,"recordPath":"docs/work/wr-x.record.md","status":"owned","artifactSha":null,"merged":null,"hoursSinceLog":11.62,"state":"owned"}
```
- `merged` is never `true`.
- `tie` is fully merged (its tip is main's old tip), but it shows as `owned`. Under the new `docs/census.md` sentence, `owned` is the state that allows "in flight". That is F3.
- `norecord` has real unmerged work and gets no row at all. That is F2.

**Never writes: verified empirically, not just from reading the source.**
- Before and after a `--no-fetch` run I snapshotted three things: the sha256 of every file under `.git`, the full `.git` path list, and `git status --porcelain`. `diff` result: **ZERO-DIFF**.
- A second run with fetch enabled, after an earlier `git fetch`, also left the snapshot unchanged: FETCH_HEAD was rewritten with identical content, and no refs moved. So the only write is the `git fetch` that R1 explicitly allows.
- Grepping the git verbs in the script finds only `show-ref`, `for-each-ref`, `log`, `diff`, `show`, `cat-file`, `merge-base` and `fetch` (lines 63, 71, 85, 92, 98, 113, 122, 186). There is no checkout, reset, update-ref, commit or push.
- `show-ref --verify` is not in R1's list of allowed primitives, but it is read-only. This is informational only, not a finding.

## Findings

### F1 BLOCKER: `process.exit(main())` truncates stdout at 64 KiB when piped, so `--json | jq` on this real repo gets invalid JSON
Evidence: `collect-from-origin.mjs:228-229`. Node writes stdout to a pipe asynchronously, and `process.exit` kills the process before the write flushes. Commands I ran against `/home/ben/Code/claude-delegation` (read-only, `--no-fetch`):
```
node $C --no-fetch --json > file   -> 89616 bytes
node $C --no-fetch --json | wc -c  -> 65536   (three runs, all 65536)
node $C --no-fetch --json | node -e 'JSON.parse(...)' -> PARSE FAIL Unterminated string in JSON at position 65536
```
Text mode is currently 50546 bytes, so it still fits. Once it grows past 64 KiB it will silently drop rows and still exit 0. That is an unknown rendered as a confident table. R4's integrator dogfood and any lead piping the output will hit this.

Fix (mechanical). I verified it on a scratch copy outside the tree: after the change, the piped output parses with 324 rows, and the exit code is 0.
```
-  process.exit(main());
+  process.exitCode = main();
```
Suggested test: spawn the CLI with `stdio: "pipe"` against a fixture whose JSON exceeds 64 KiB (many records), and assert `JSON.parse` succeeds.

### F2 MAJOR: the "changed" set contradicts pinned R1, `no-record` is redefined, and a branch with no record disappears
- R1 (contracts.md) reads: "Changed = the record's blob **on the branch** differs from main's, or main lacks it." The spec reads: "files that **exist on that branch**" and "prints one row per branch".
- `changedRecordPaths` (`collect-from-origin.mjs:92`) runs an unfiltered `git diff --name-only main branch`. That output also includes records main has and the branch lacks (the D direction). `buildRow:159-161` then labels those rows `no-record`. The builder's report calls this "SYMMETRICAL" and the only way `no-record` could ever fire. It is not: the spec's reading is one row per branch, and `no-record` for a branch that carries no changed record.
- Measured on this real repo (`--no-fetch --json`): 324 rows, of which 312 (96%) are `no-record`. `feat/multi-protocol`, `feat/multi-v4` and `feat/working-smarter` produce 68 rows each. Meanwhile my fixture's `norecord` branch, which has unmerged work, produces **zero** rows. The one signal `no-record` exists to give is missing, and noise takes its place.

Fix (mechanical for the filter; small rewrite for the no-record row):
```
-  const out = tryGit(["diff", "--name-only", mainFull, branchRef, "--", "docs/work/*.record.md"], repo);
+  const out = tryGit(["diff", "--name-only", "--no-renames", "--diff-filter=AM", mainFull, branchRef, "--", ":(top,glob)docs/work/*.record.md"], repo);
```
(`:(top,glob)` also fixes F5.) In `main`, when a branch returns zero paths, push one row: `{branch, tipSha, tipDate, recordPath: null, status: null, artifactSha: null, merged: null, hoursSinceLog: null, state: "no-record"}`. The `branchBlob === null` branch in `buildRow` (159-161) then becomes dead code and can be deleted, which helps F4.

Test update: in the pinned-fixture test, replace the `feature/behind-main` assertions (`collect-from-origin.test.mjs:194-235`) with a branch that has an unmerged non-record commit, and expect exactly one `no-record` row with `recordPath: null`.

Predicted outcome (checked on a scratch copy together with F3's guard): the whole suite passes except that one fixture test, which is the one that pins the old behaviour.

### F3 MAJOR (needs a lead ruling, because it narrows R1's literal definition): fully merged branches produce false `owned` rows
Evidence from this real repo:
- `spec/decisions-current`: `merge-base --is-ancestor` of its tip against `origin/main` returns 0, and it has 0 commits ahead of main.
- It still yields 8 `owned` rows (`package-build-P1..P5`, `wr-2026-09-22-rename-build-r1..r3`, with Status `runnable` or `delivered`). Those records were later deleted on main, so R1's "main lacks it" clause applies to them.
- `build/codex-parity-1` (tip is an ancestor of main) shows a stale earlier version of `wr-2026-09-25-census-complete.record.md`.
- My fixture's `tie` branch shows the same stale behaviour: it reads `owned` for a record main has since accepted.

Since `docs/census.md`'s new sentence makes `owned` the state that allows "in flight", this regenerates the incident the lane was written to stop, in the opposite direction.

Recommended ruling and fix:
- Skip any branch whose tip is an ancestor of `--main`. Use `merge-base --is-ancestor`, which R1 already allows: `if (isAncestor(repo, branchInfo.ref, mainFull) === true) continue;`
- Diff three-dot (`` `${mainFull}...${branchRef}` ``), so that only records the branch itself changed since the fork are listed.

Predicted outcome, run on a scratch copy against the real repo (F2 + F3 together): 324 rows become 8, all of them meaningful:
- `build/collect-from-origin-1`: `accepted-unmerged` (one-launch) and `owned` (lane six).
- `build/one-launch-1`: `accepted-unmerged`.
- One `no-record` row each for `build/decisions-actions-1`, `docs/bearings-0925`, `docs/bearings-0926`, `docs/lane-specs-0925` and `feat/working-smarter`.

The attack test still passes under this change.

### F4 MAJOR: the pinned "<= 60 runtime lines" is exceeded threefold
- Evidence: `grep -vE '^\s*(//.*)?$' scripts/collect-from-origin.mjs | wc -l` gives **180**. R1 pins at most 60 lines, comments and blanks not counted. The spec says: "if it needs more, split what does not fit into a finding, **not code**".
- The builder kept all the code and reported the overage instead. That contradicts a pinned contract, and the brief's autonomy line required checking in before departing from R1.

Fix (judgment): cut toward 60 lines. Candidates:
- The 13-line `isMainModule` realpath routine: replace with `if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)`.
- `refExists`, `objectExists` and `isAncestor`: fold into one `ok(args)` helper that returns the exit status.
- `buildRow`'s dead no-record branch (see F2).
- A one-line `formatTable`.
- Inline `commitInfo` once per branch rather than once per row.

If 60 still can't be reached, the lead should record an explicit waiver in the record. The builder's own report does not waive a pinned contract.

### F5 MINOR: `--repo` pointing at a subdirectory silently returns `[]`, with no warning
- Evidence: `node $C --no-fetch --json --repo /home/ben/Code/claude-delegation/scripts` prints `[]` with exit 0 and **nothing on stderr**. The cause is that the pathspec `docs/work/*.record.md` (line 92) is resolved relative to cwd.
- Also, git's default pathspec `*` matches across `/`, so a nested `docs/work/x/y.record.md` would be picked up.
- This is the named failure class: a check that passes because it isn't looking.
- Fix: the `:(top,glob)` pathspec in F2's patch. I verified on a scratch copy that the subdirectory run then returns the same rows as a run from the repo root.

### F6 MINOR: an unresolvable `--main` produces `[]` on stdout, with only a stderr warning
- Evidence: `--main origin/nope` prints `[]` with exit 0, plus a stderr warning. `--repo /var/tmp` (not a repo at all) behaves the same way.
- A `--json | jq` consumer sees "nothing unmerged", which is an unknown rendered as a confident empty table.
- R1 pins exit 0, so this needs a lead ruling. Options: emit JSON `null` instead of `[]` when main is unverified, or print an `UNKNOWN` line on stdout in text mode.

### F7 MINOR: `isAncestor` maps every git failure to a confident `false`
- Evidence: `collect-from-origin.mjs:120-127`. Exit code 128 (for example a shallow or corrupt repo) becomes `merged: false`. The direction is safe (it never shows `true`), but it is an unknown rendered as a confident value.
- Patch:
```
-  } catch {
-    return false;
-  }
-}
-
-// null whenever ancestry
+  } catch (err) {
+    return err && err.status === 1 ? false : null;
+  }
+}
+
+// null whenever ancestry
```
- `computeState(…, null)` already yields `accepted-unmerged`. F3's guard must use `=== true`.

### F8 MINOR: the "never writes" test is not looking at `.git`
- Evidence: `collect-from-origin.test.mjs:361-364` compares only HEAD, the current branch and `git status --porcelain`. A write to refs, config or objects would pass it. (The property does hold; see my ZERO-DIFF check above.)
- Fix: snapshot `find .git -type f` together with the sha256 of each file, before and after, as I did.

### F9 MINOR: the attack test's title claims "tip equals main", but it never builds that case
- Evidence: `collect-from-origin.test.mjs:314` and `337-342` deliberately advance main, so the tip is not equal. The literal tie, or a tip that is an ancestor of main with a later Status on main, is the case that produced the false `owned` rows in F3.
- Fix: add that case. After F3 it should produce zero rows for that branch.

### N1 NIT
`collect-from-origin.test.mjs:206-210` says `docs/census.md`'s third sentence "exists because of exactly this". It does not: that sentence is about "in flight" versus `owned`. Delete the claim.

## Verified and fine
- R1's row key order matches `ROW_FIELDS` (line 25), and the test asserts it for every row.
- `extractArtifactSha` follows R1: the 40-hex after the last `@`, or a bare 40-hex, otherwise null.
- An absent or other Status maps to `owned`. That is a reasonable resolution of the scout's open question.
- A fetch failure warns on stderr and exits 0.
- `origin/HEAD` and `main` are skipped. `--skip` can be repeated.
- R2: the three sentences are present in `docs/census.md:346-357`, and the report says why it chose census.md.
- Informational: real records often carry short shas (for example `feat/next-build-T2@17265e8`). Those always read `artifactSha: null, merged: null, state: accepted-unmerged`. This is R1-correct and the safe direction, but a lead will see them as unmerged even after they merge.

## Method note
All fixtures and trial patches ran in `/var/tmp/c1-review-f6c8ae21`, because the session scratchpad on `/tmp` has no free inodes. They are removed after this report. Nothing in the reviewed worktree was modified: `git status --short` there was clean before and after.
