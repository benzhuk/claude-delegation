# C1 state — collect-from-origin collector

## Territory
scripts/collect-from-origin.mjs, scripts/collect-from-origin.test.mjs, docs/census.md's
three-sentence addition. Worktree /home/ben/Code/wt-collect-from-origin-1-C1, branch
build/collect-from-origin-1-C1. Nothing else touched. Round 3, at
0bf8be8f74cbeddbbefb3a5c8a8c72a47a2b23c6.

## Contracts I rely on
- contracts.md R1: CLI shape, row fields/order, state enum, artifact-sha extraction rule,
  git-plumbing-only, exit 0 always, <=60 runtime lines (still not met at 77 — see Open
  questions).
- contracts.md R2: three sentences in docs/census.md (untouched this round, unaffected by
  the review's findings).
- work-record.mjs's `parseRecord(text)` (imported, not re-derived).

## Done (round 3 — every finding in C1-review-r2.md)
- R2-1 MAJOR fixed: the F1 regression test now runs the CLI through a real shell pipe
  (`sh -c '"$0" ... | cat'`, `collect-from-origin.test.mjs:391-395`) instead of
  execFileSync's own capture, so it actually reproduces the 64 KiB non-blocking-pipe
  truncation `process.exit` caused. Verified: fails with the old `process.exit(main())`
  put back, passes with the fix.
- R2-2 MINOR fixed: the F3/F9 attack test's tail now really rewrites the same record path
  on main with a later Status after the ff-merge (`:417-423`), matching its own comment
  and the report. Added the three-dot twin as its own test (`:432-449`): a non-ancestor
  branch carrying a stale copy of a record main later rewrote is not a row for that
  branch.
- R2-3 MINOR fixed: `changedRecordPaths` (`collect-from-origin.mjs:67-72`) falls back to
  a literal two-dot diff when the three-dot range has no merge base (orphan branch /
  shallow clone) — that case now reads as an honest row instead of a confident
  `no-record`. Regression test at `:452-463` (orphan branch fixture).
- R2-4 MINOR fixed: added the F5 subdirectory-`--repo` regression test
  (`collect-from-origin.test.mjs:230`, `assert.deepEqual(rowsOf(path.join(root, "docs")), rows)`).
- F4 MAJOR: cut further, 111 -> 77 non-blank/non-comment lines (grep count). Applied every
  mechanical candidate the reviewer named (parseArgs, listOriginBranches, commitInfo,
  fetch try/catch, inlined objectExists) plus more of the same kind (denser one-liners for
  extractArtifactSha, computeMerged/computeState, buildRow, main's body). Still above the
  pinned <=60 — see Open questions.
- Gate: 21/21 pass (19 base + 2 new this round).

## Next
Nothing else planned for C1 unless the lead rules on F4 or F6.

## Open questions
- F4's 60-line budget: still not met (77 vs 60) after exhausting every mechanical cut the
  reviewer suggested and more. Further cuts would mean deleting structure (merging
  main()'s try/catch further, collapsing the branch loop into one expression), which
  trades readability/testability for a few more lines with no guarantee of reaching 60.
  Needs a lead ruling: waive the pin, or say what to cut next.
- F6 (unchanged, per round-2 review: needs a lead ruling on output shape, not a builder
  call) — still open, not applied.

## How to run my gate
`cd /home/ben/Code/wt-collect-from-origin-1-C1 && node --test scripts/collect-from-origin.test.mjs`
21/21 pass this round (ran clean, no FIXTURE_ROOT workaround needed).
