VERDICT: NEEDS_FIXES (1) 0bf8be8f74cbeddbbefb3a5c8a8c72a47a2b23c6

# C1 review, round 3: collect-from-origin collector (delta re-review)

Reviewed: `/home/ben/Code/wt-collect-from-origin-1-C1` at `0bf8be8f74cbeddbbefb3a5c8a8c72a47a2b23c6` (I ran `git rev-parse HEAD` myself). The range `61b6aa6..HEAD` is one commit, `0bf8be8`. It touches only `scripts/collect-from-origin.mjs` and `scripts/collect-from-origin.test.mjs`, both inside C1's territory (+72/-64). `git status --short` in the worktree was empty before and after my review.

JUDGMENT: collector-never-lies-about-merged-state HOLDS. All four round-2 findings (R2-1..R2-4) are fixed, and each has a regression test. I put each bug back on a scratch copy, and each test failed. The only open item is F4, the pinned runtime-line limit: the file has 77 runtime lines against a limit of 60. Most of the drop from 112 came from joining statements onto shared lines, not from removing code. Only a lead waiver or real cuts can close it.

Counts: 0 blockers, 1 major (F4, carried), 0 minor. F6 is still a lead-ruling item and is not counted.

## Gate: genuinely green
- `node --test scripts/collect-from-origin.test.mjs` in the worktree gives `tests 21 / pass 21 / fail 0`. The tail of `reports/C1-gate.log` agrees (`fail 0`).
- `grep -vE '^\s*(//.*)?$' scripts/collect-from-origin.mjs | wc -l` gives **77**, which matches the builder's count.

## Attack brief (spec Acceptance, contracts R1): re-run by me, empirically
I built a fresh fixture in the session scratchpad (`.../scratchpad/c1r3/fx2`) with a bare origin. Its branches:
- `tie`: tip equals main's original tip.
- `tie2`: sets `Status: accepted` with no `Artifact:` line. Main fast-forwarded to it and then rewrote the SAME `docs/work/wr-a.record.md` with a later `Status: accepted` and `Artifact: build/x@<real main sha>`.
- `notmerged`: forked from `tie2` before main's rewrite, and rewrote the same path with `Artifact: build@nothex`.
- `tipeq`: tip equals the new main tip.
- `orph`: an orphan branch carrying `Status: accepted` and `Artifact: garbage`.

Output of `--no-fetch --json`, verbatim:
```
[{"branch":"notmerged","tipSha":"14b5f9d0c9ed09f0a5063a12b5075e8710e4c272","tipDate":"2026-09-26T09:11:11-04:00","recordPath":"docs/work/wr-a.record.md","status":"accepted","artifactSha":null,"merged":null,"hoursSinceLog":null,"state":"accepted-unmerged"},{"branch":"orph","tipSha":"5592bc34efd79d3ea963709e50d953c73f058a1e","tipDate":"2026-09-26T09:11:11-04:00","recordPath":"docs/work/wr-o.record.md","status":"accepted","artifactSha":null,"merged":null,"hoursSinceLog":null,"state":"accepted-unmerged"}]
```
- `tie`, `tie2` and `tipeq` are ancestors of main, so they are skipped (`collect-from-origin.mjs:123`).
- The two ambiguous rows both read `merged: null`. `merged` is never `true`.
- The orphan now produces a real row instead of a confident `no-record`, so R2-3 is closed in practice.
- `--repo <fixture>/docs` returns the same 2 rows.

**Never writes, verified empirically.** I took a sha256 of every file under `.git` plus `git status --porcelain`, before and after each run:
- `--no-fetch` run: **ZERO-DIFF**.
- Run with the fetch enabled, after a warm-up fetch: **ZERO-DIFF**.

**Real repo** (`/home/ben/Code/claude-delegation`, `--no-fetch --json`, read-only): 8 rows, the same set round 2 recorded. `build/collect-from-origin-1` and `build/one-launch-1` are `accepted-unmerged` with `merged: false`, one row is `owned`, and five are `no-record`. The piped JSON parses.

## Prior findings: status (each checked by putting the bug back on a scratch copy, `.../scratchpad/c1r3/scripts`)

| Finding | Status | Evidence |
|---|---|---|
| R2-1 MAJOR (F1 test not looking) | **Fixed** | `test.mjs:392-397` now pipes through `sh -c '... \| cat'`. With `:138` put back to `process.exit(main())`, the F1 test failed 4 runs out of 4 (`pass 0 fail 1`). With the fix restored, it passed 2 out of 2. |
| R2-2 MINOR (attack test / three-dot untested) | **Fixed** | `test.mjs:423-425`: main now really rewrites the same record. New test at `:432-451`. Putting two-dot back (`const out = diff([mainFull, branchRef])`) fails exactly that test (`pass 20 fail 1`). Removing the ancestor skip at `:123` fails the attack test and one other test (`fail 2`). |
| R2-3 MINOR (no merge base read as `no-record`) | **Fixed** | Line `:70` falls back to R1's literal two-dot diff. Removing the fallback fails the new orphan test at `:453-465` (`fail 1`). The fixture above confirms it end to end. |
| R2-4 MINOR (F5 untested) | **Fixed** | `test.mjs:230` compares the subdirectory `--repo` table with the root one. Putting the plain pathspec `docs/work/*.record.md` back fails the pinned fixture test (`fail 1`). |
| F4 MAJOR (<= 60 runtime lines) | **Open: 77 vs 60** | See below. |
| F6 MINOR (`[]` when main is unresolved) | Unchanged, correctly deferred | This needs a lead ruling on the output shape. Not counted. |

## Findings

### F4 MAJOR (carried): runtime lines are 77 against a pinned <= 60, and most of the round-3 drop is line-joining
Evidence:
- `grep -vE '^\s*(//.*)?$' scripts/collect-from-origin.mjs | wc -l` gives `77`. Contracts R1 (contracts.md:18) pins "<= 60 runtime lines". spec.md:11 adds "if it needs more, split what does not fit into a finding, not code".
- I found no waiver in `docs/work/wr-2026-09-26-collect-from-origin.record.md` or in contracts.md.
- The cut from 112 to 77 lines (-31%) removed only 3.9% of the code. Non-whitespace characters of runtime code went from 5281 at `61b6aa6` to 5074 at HEAD.
- Runtime lines over 100 characters went from 15 to 25. Examples:
  - `:90` (218 chars): `computeMerged`, with the `cat-file` check inlined into a ternary.
  - `:104` (202), `:109` (194), `:54` (180), `:93` (179).
- 11 lines now hold two or more `;`-separated statements, for example `:58-59` and `:131`.

So the counter moved mostly because statements were joined onto shared lines, not because code was removed. The metric now reads close to compliance while the file's real size is almost unchanged. That is a check that passes because it isn't looking. The builder reported the gap openly and did not claim compliance, which is correct process. They also applied exactly the collapses round 2 suggested. This finding is on the state of the file, not on the builder's candour.

Fix (judgment; the lead decides). Either:
- **(a)** Record an explicit waiver of the 60-line pin in the work record at the real size. If waived, I recommend the builder restore one statement per line, as at `61b6aa6` plus the round-3 behaviour changes (about 112 lines). The joined lines buy nothing once the pin is waived, and they make the 218-character `computeMerged` harder to audit.
- **(b)** Per spec.md:11, move what does not fit out of the code and into a finding. Candidates that would really remove code:
  - the `parseArgs` export plus its unit test, replaced by a flag table;
  - the `formatTable` / `--json` duality;
  - `commitInfo`'s `tipDate` read.

  Each of these touches R1's pinned CLI surface, so it needs the same lead ruling.

Joining more lines is not a fix.

## Verified and fine (first-class)
- The round-3 refactor preserves behaviour:
  - `extractArtifactSha` (`:80`): `v` is already trimmed, so trimming the no-`@` branch as well changes nothing.
  - `computeMerged` (`:90`) still returns `null` unless the artifact is a 40-hex sha, main is verified, and `cat-file -e <sha>^{commit}` is exactly `true`.
  - `computeState` (`:93`) still returns `accepted-merged` only on `merged === true`.
  - The loop at `:122` over `mainVerified ? listOriginBranches(...) : []` is equivalent to the old `if (mainVerified)`.
- The fetch check `tryGit(["fetch","origin"]) === null` (`:118`) is correct: a successful quiet fetch returns `""`, not `null`.
- Exit code is still 0 on every path (`:129`, `:131`, `:138`).
- Git verbs are unchanged: `show-ref`, `for-each-ref`, `log`, `diff`, `show`, `cat-file`, `merge-base`, `fetch`. There is no checkout or write verb.
- Informational, not counted:
  - The fetch warning no longer carries `err.message`, so it loses diagnostic detail. No contract pins the wording.
  - The destructuring defaults at `:115` apply only to `undefined`, not `null` as the old `??` did. No caller passes `null`.
  - The header comment at `:12-13` still omits `show-ref`.
  - If both the three-dot and the two-dot diff fail (only when the branch's objects are missing), the branch still gets a `no-record` row. Its `tipSha: null` shows the unknown. This was already true in earlier rounds.

## C4 fields (fix round)
Cause: F4 is still open because the 60-line pin in contracts R1 was set below the size of the specified behaviour. The round-3 cuts reached 77 mostly by joining statements (character count -3.9%), so the rest needs a lead ruling, not more compaction.
Discriminating check: on a scratch copy I put back each round-2 bug (`process.exit`, the two-dot range, no fallback, the plain pathspec, no ancestor skip), and each one failed its named test. The line count `grep -vE '^\s*(//.*)?$' ... | wc -l` gives 77, and the non-whitespace character count went from 5281 to 5074.
Fix location: `docs/work/wr-2026-09-26-collect-from-origin.record.md` (the lead's waiver), or `scripts/collect-from-origin.mjs` if the lead names code to move out.
Simplification: once waived, un-join the joined statements (one per line). That costs lines but adds no mechanism and makes `:90` and `:104-109` auditable again.

## Method note
All fixtures, mutations and trial patches ran in the session scratchpad (`.../scratchpad/c1r3`), outside the reviewed tree. The scratch copy of the script was byte-identical to HEAD after every mutation (`cmp` confirmed). The worktree's `git status --short` was empty at the end, and HEAD is unchanged at `0bf8be8f74cbeddbbefb3a5c8a8c72a47a2b23c6`.
