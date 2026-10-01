VERDICT: PASS

# C1 report, round 3: fixes for C1-review-r2.md

Worktree `/home/ben/Code/wt-collect-from-origin-1-C1`, branch `build/collect-from-origin-1-C1`,
HEAD `0bf8be8f74cbeddbbefb3a5c8a8c72a47a2b23c6`. Only `scripts/collect-from-origin.mjs` and
`scripts/collect-from-origin.test.mjs` touched (`git diff --stat` against the previous commit:
2 files, +72/-64) — nothing else in the tree changed (`git status --short` is clean after the
commit).

Goal card: this territory serves the census/collect lane of "hours ask to accepted" and "rework
after acceptance" — a durable, read-only signal against a pushed-but-unmerged branch being
under-reported. Nearest NOT: "a rule no script checks" — every fix below ships with a test that
fails on the pre-fix code and passes on the post-fix code, verified by me before committing.

## Findings applied (every reviewer-verified item in C1-review-r2.md)

### R2-1 MAJOR — F1 regression test didn't reproduce the truncation
`scripts/collect-from-origin.test.mjs:391-395`. Replaced the `execFileSync(process.execPath, […])`
capture (which never hits the non-blocking-pipe path) with a real shell pipe:
`execFileSync("sh", ["-c", '"$0" "$1" --repo "$2" --no-fetch --json | cat', process.execPath, scriptPath, root], …)`.
Verified on my own copy of the test: with `collect-from-origin.mjs:134` reverted to
`process.exit(main())`, this test now fails (`AssertionError [ERR_ASSERTION]: expected output over
64 KiB, got 65536 bytes`, or the JSON.parse throws on truncated output); with the fix in place it
passes. Full suite run after restoring the fix: still `pass 21 / fail 0`.

### R2-2 MINOR — F3/F9 attack test's comment didn't match its code; three-dot half of F3 untested
`scripts/collect-from-origin.test.mjs:417-423`: after the ff-merge, main now actually rewrites the
same record path (`wr-2026-09-26-merged.record.md`) with `Status: accepted` and a real merged
`Artifact:`, exactly as the comment above it says. Added
`scripts/collect-from-origin.test.mjs:432-449`, "three-dot: a record main rewrote after an
unmerged branch forked is not a row for that branch" — a non-ancestor branch (`feature/unmerged`)
never touches a shared record; main later rewrites that same record; the branch's rows must not
include it. This is the non-ancestor twin of F3, which two-dot silently got wrong.

### R2-3 MINOR — no merge base (orphan branch) read as a confident `no-record`
`scripts/collect-from-origin.mjs:67-72`. `changedRecordPaths` now tries the three-dot range first
and, only if that fails (no merge base — `diff(...) === null`), falls back to R1's literal
two-dot range: `diff([mainFull, branchRef])`. Added the regression test at
`scripts/collect-from-origin.test.mjs:452-463` (an orphan branch carrying an `accepted` record) —
before the fix this produced `state: "no-record"`; after, `["docs/work/wr-2026-09-26-orphan.record.md",
"accepted-unmerged"]`.

### R2-4 MINOR — F5 subdirectory `--repo` fix had no test
`scripts/collect-from-origin.test.mjs:230`: `assert.deepEqual(rowsOf(path.join(root, "docs")), rows);`
added right after the pinned fixture's `rowsOf(root)` call, asserting a `--repo` pointed at a
subdirectory reads the identical table.

### F4 MAJOR (carried, judgment) — runtime lines still over the <= 60 pin
Before this round: 111 (per the round-2 review's own count plus my R2-3 fix, 112). After: **77**
(`grep -vE '^\s*(//.*)?$' scripts/collect-from-origin.mjs | wc -l`). I applied every mechanical
candidate the reviewer named — `parseArgs` collapsed to a denser if/else-if chain, `commitInfo`
and `listOriginBranches` folded to single-expression bodies, the fetch `try`/`catch` reduced to
one guarded `tryGit(...) === null` check, `objectExists` inlined into `computeMerged` — and went
further in the same style: `extractArtifactSha`, `computeMerged`, `computeState`, `buildRow`, and
`main`'s body are now denser (comma-joined `const`s, ternary chains, the `mainVerified` branch
loop folded into `mainVerified ? listOriginBranches(...) : []` instead of a wrapping `if`).

I did not go further than this. The remaining bulk is `main`'s own control flow (fetch, skip set,
the branch/record loop, the outer try/catch) and the parse/build helpers it calls — cutting more
would mean deleting structure (e.g., merging the whole loop body into one reduce expression, or
folding the try/catch's two `return 0`s into a single ternary-driven return) for a handful of
lines, trading real readability and testability for a number that may still not reach 60. This
stays a judgment call for the lead: waive the pin at 77, or name what specifically to cut next.
No waiver appears in `docs/work/wr-2026-09-26-collect-from-origin.record.md` or contracts.md as of
this commit, so I report the gap plainly rather than assert compliance.

F6 (deferred per the round-1 and round-2 reviews, needs a lead ruling on output shape) is
unchanged, consistent with both prior reviews' own instruction that this is not a builder call.

## Gate
```
cd /home/ben/Code/wt-collect-from-origin-1-C1 && node --test scripts/collect-from-origin.test.mjs
```
Result: `tests 21 / pass 21 / fail 0 / cancelled 0`. Full log at
`docs/specs/collect-from-origin-1/reports/C1-gate.log`. Two tests are new this round (three-dot
twin, orphan branch); the rest are the round-2 suite, all still green with the R2-1 pipe fix and
the F5 subdirectory assertion folded into the existing fixture.

## Deviations / assumptions
- Fetch-failure warning text changed from including `err.message` to a fixed string
  (`"collect-from-origin: git fetch failed, proceeding with local refs"`) as part of collapsing the
  try/catch for F4. The only test that reads this message (`collect-from-origin.test.mjs:332`)
  matches on `/fetch failed/`, which still holds; no contract pins the exact wording. Flagging this
  as a deviation from the literal round-1/round-2 code, not from any pinned text.
- No other behavior, flag, output field, or exit code changed from what R1 pins.

## Sha
`git rev-parse HEAD` in the worktree: `0bf8be8f74cbeddbbefb3a5c8a8c72a47a2b23c6`.
