VERDICT: APPROVE 4843ef78219efaf716a3cbffc52e128053a6d71c

# C1 review, round 4: collect-from-origin collector (delta re-review after the F4 waiver)

Reviewed: `/home/ben/Code/wt-collect-from-origin-1-C1` at `4843ef78219efaf716a3cbffc52e128053a6d71c` (I ran `git rev-parse HEAD` myself). The range `0bf8be8..HEAD` is one commit, `4843ef7`. It touches only `scripts/collect-from-origin.mjs` (+69/-30, from `git diff --stat 0bf8be8..HEAD`). The test file, the fixtures and `docs/census.md` are unchanged. The worktree's `git status --short` was empty before and after my review.

Scope, per `C1-lead-ruling-r4.md`: check that the change is layout-only, that the tests are unchanged and green, and that F1-F3/F5 have not regressed. The line count is no longer a finding.

JUDGMENT: collector-never-lies-about-merged-state HOLDS at HEAD. I re-ran the attack brief empirically and it passed. The never-writes check gave zero diff with and without fetch. Every earlier regression test still catches its bug against the reformatted file.

Counts: 0 blockers, 0 major, 0 minor. F4 is waived by the lead. F6 is still a lead-ruling item and is not counted.

## Gate: genuinely green
- I ran `node --test scripts/collect-from-origin.test.mjs` in the worktree: `tests 21 / pass 21 / fail 0 / cancelled 0`. The tail of `reports/C1-gate.log` agrees (`fail 0`).
- `grep -vE '^\s*(//.*)?$' scripts/collect-from-origin.mjs | wc -l` gives **114**, which matches the builder's count. This is a plain fact, since the pin is waived.

## Layout-only: verified
1. **`git diff 61b6aa6 HEAD -- scripts/ docs/`**
   - For `.mjs`, it shows exactly one hunk: the `diffRecordPaths` helper at `:75-77` and its three-dot-then-two-dot call at `:79-84`. That is the R2-3 fallback, the only round-3 behaviour change in `.mjs`.
   - The rest of the output is the round-3 test-file changes: R2-1, R2-2 and R2-4 plus the orphan test. `git diff --stat 0bf8be8..HEAD` confirms the test file is untouched.
   - So the builder's claim holds exactly: HEAD `.mjs` = `61b6aa6` `.mjs` + R2-3.
2. **`git diff 0bf8be8 HEAD -- scripts/collect-from-origin.mjs`**, read hunk by hunk. Every hunk is a split of `;`- or `,`-joined statements, or an arrow function turned back into a `function` declaration, except these semantic deltas. All are behaviour-neutral or intended:
   - `extractArtifactSha` (`:92-94`): round 3 trimmed `candidate` in both branches. HEAD trims only the `@`-slice branch. `v` is already trimmed at `:92`, so the result is identical.
   - `computeMerged` (`:106-109`): `objectExists` is a named helper again (`:98`). Same predicate, same order.
   - `main` opts (`:140-142`): `??` replaces destructuring defaults, which now also covers `null`. It is equal or stricter, and no caller passes `null`.
   - Fetch (`:146-152`): the `try`/`catch` is back, and the warning includes `err.message` again, as at `61b6aa6`. The round-3 reviewer noted the lost diagnostic detail, so this restores it. No contract pins the text. The test at `test.mjs:332` matches `/fetch failed/`.
   - Loop (`:157-164`): `if (mainVerified) for (...)` is equivalent to round 3's `for (... mainVerified ? list : [])`.
   - `listOriginBranches` (`:56-57`): `if (out === null) return []` is equivalent to round 3's `?? ""`, since both produce `[]`.
3. **Outputs compared across versions.** I ran the round-3 file (`git show 0bf8be8:...` into the scratchpad) and HEAD with `--no-fetch --json`, with `hoursSinceLog` normalised because it is time-based. Two repos:
   - my attack fixture: **identical**;
   - the real repo `/home/ben/Code/claude-delegation`: **identical**.
4. **Joined statements left at HEAD.** Only `:28` (`tryGit`), `:32` (`ok`) and `:162` (`{ rows.push(...); continue; }`) remain, and all three are unchanged since `61b6aa6`. Lines over 100 characters: 16 at `61b6aa6`, 17 at HEAD (the `:76` and `:82` pair replaced one line), and 27 at `0bf8be8`. The round-3 compression is fully undone, so the ruling's "as at 61b6aa6 plus the round-3 behaviour changes" is met.

## Attack brief (spec Acceptance, contracts R1): re-run by me, empirically
I built the fixture in the scratchpad (`.../scratchpad/c1r4/fx`) with a bare origin and a throwaway `GIT_CONFIG_GLOBAL`. Its branches:
- `tie`: tip equals main's original tip.
- `tie2`: `Status: accepted` with no `Artifact:` line. Main fast-forwarded to it and then rewrote the SAME `docs/work/wr-a.record.md` with a later `Status: accepted` and `Artifact: build/x@<real main sha>`.
- `notmerged`: forked before that rewrite, with `Artifact: build@nothex`.
- `tipeq`: tip equals the new main tip.
- `orph`: an orphan with `Artifact: garbage`.
- `fakesha`: a well-formed 40-hex sha that names no object.

Output of `--no-fetch --json`, verbatim:
```
[{"branch":"fakesha","tipSha":"bed6e3ca03e254080f3ca6ac2d4b214b93f41488","tipDate":"2026-09-26T09:23:09-04:00","recordPath":"docs/work/wr-a.record.md","status":"accepted","artifactSha":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef","merged":null,"hoursSinceLog":null,"state":"accepted-unmerged"},{"branch":"notmerged","tipSha":"007146188d25671feec929bb25d0ed64bc9c8a0f","tipDate":"2026-09-26T09:23:08-04:00","recordPath":"docs/work/wr-a.record.md","status":"accepted","artifactSha":null,"merged":null,"hoursSinceLog":null,"state":"accepted-unmerged"},{"branch":"orph","tipSha":"2be1fc12325be4a12b18137bcfae11b1aae0da32","tipDate":"2026-09-26T09:23:09-04:00","recordPath":"docs/work/wr-o.record.md","status":"accepted","artifactSha":null,"merged":null,"hoursSinceLog":null,"state":"accepted-unmerged"}]
```
exit=0
- `tie`, `tie2` and `tipeq` are ancestors of main, so they are skipped (`:159`).
- Every ambiguous row reads `merged: null`, and `merged` is never `true`.
- An unparseable artifact gives `artifactSha: null, merged: null`, as R1 requires.
- `--repo <fixture>/docs` returns the same 3 rows.

**Never writes, verified empirically.** I took a sha256 of every file under `.git` plus `git status --porcelain`, before and after each run:
- `--no-fetch --json`: **NOFETCH-ZERO-DIFF**.
- With fetch (after a warm-up fetch): **FETCH-ZERO-DIFF**.
- `--repo <subdir> --no-fetch`: **SUBDIR-ZERO-DIFF**.

**Fetch-failure path:** a repo whose origin is `/nonexistent/path` gives the warning `collect-from-origin: git fetch failed, proceeding with local refs: Command failed: git fetch origin ...`, then the `--main not found` warning, a header-only table, and `exit=0`.

**Real repo** (`/home/ben/Code/claude-delegation`, `--no-fetch`, read-only): 8 rows.
- `build/collect-from-origin-1` and `build/one-launch-1` are `accepted-unmerged` with `merged false`.
- One `build/collect-from-origin-1` row is now `rejected` (in round 3 it was `owned`). The round-3 code gives the identical table today, so the repo changed, not the code.
- Five rows are `no-record`.

## Prior findings: no regression (each bug put back on a separate scratch copy of HEAD, `.../scratchpad/c1r4/m-*`)

| Bug put back | Result against the unchanged test file |
|---|---|
| F1: `process.exitCode = main()` -> `process.exit(main())` | `fail 1`, the F1 regression test (a real `\| cat` pipe) |
| F3 / R2-2: three-dot -> two-dot range | `fail 1`, the "three-dot: a record main rewrote..." test |
| F3: ancestor skip at `:159` removed | `fail 2`, the identical-branch test and the fully-merged attack test |
| F5 / R2-4: `:(top,glob)docs/...` -> `docs/...` | `fail 1`, the pinned bare-remote fixture (subdirectory `--repo` comparison) |
| R2-3: two-dot fallback removed | `fail 1`, the orphan "no merge base" test |
| R1 core: `computeMerged` returns `true` when the artifact is missing | `fail 2`, the attack test ("tip equals main and Artifact: is missing never reads as merged...") and the orphan test |

- The unmutated scratch copy gives `pass 21 fail 0`.
- The worktree file was byte-identical to my scratch baseline afterwards (`cmp` confirmed).

## Verified and fine (first-class)
- No tests were added, removed or weakened. The test file is byte-identical to `0bf8be8`.
- No CLI flag, output field, row order, state enum or exit-code change. `parseArgs` is `:34-45`, `ROW_FIELDS` is `:24`, and every path returns 0 (`:166`, `:170`).
- Git verbs are unchanged: `show-ref`, `for-each-ref`, `log`, `diff`, `show`, `cat-file`, `merge-base`, `fetch`. There is no checkout or write verb.
- Informational, not a finding: removing the `objectExists` guard from `computeMerged` (`:107`) still gives `pass 21`. The mutant is equivalent, not an unguarded path. For a missing object or a non-commit object, `git merge-base --is-ancestor` exits 128: I measured `exit=128` for `deadbeef…` and for a tree sha. `ok` maps 128 to `null` (`:32`), so `merged` stays `null` either way. The guard is belt-and-braces, and removing it is not "an unknown rendered as a confident number".
- Informational, carried from round 3: the header comment at `:12-13` still does not mention `show-ref`.

## C4 fields (fix round)
Cause: in round 3 the builder joined statements onto shared lines to get under a size pin, and that made the file harder to audit. The lead waived the pin (C1-lead-ruling-r4.md), and the builder rebuilt the file from `61b6aa6` plus the R2-3 fallback.
Discriminating check: `git diff 61b6aa6 HEAD -- scripts/collect-from-origin.mjs` shows one hunk, R2-3 only. The round-3 file and HEAD give identical JSON on the attack fixture and on the real repo. Six known bugs, put back one at a time on scratch copies, each fail their named test.
Fix location: `scripts/collect-from-origin.mjs` only (layout; the named `diffRecordPaths` helper at `:75-84`).
Simplification: one statement per line again. The `changedRecordPaths` fallback closure became a named two-line helper. No new mechanism was added.

## Method note
All fixtures, mutations and output comparisons ran in the session scratchpad (`.../scratchpad/c1r4`) with a throwaway git config, outside the reviewed tree. The worktree's `git status --short` was empty at the end, and HEAD is unchanged at `4843ef78219efaf716a3cbffc52e128053a6d71c`.
