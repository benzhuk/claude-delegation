VERDICT: PASS

# C1 report, round 4: layout-only fix per C1-lead-ruling-r4.md

Worktree `/home/ben/Code/wt-collect-from-origin-1-C1`, branch `build/collect-from-origin-1-C1`,
HEAD `4843ef78219efaf716a3cbffc52e128053a6d71c`. Only `scripts/collect-from-origin.mjs` touched
(`git diff --stat` against the previous commit: 1 file, +69/-30) — the test file, fixtures, and
`docs/census.md` are untouched (`git status --short` after the commit shows nothing outstanding).

## Ruling applied

`docs/specs/collect-from-origin-1/reports/C1-lead-ruling-r4.md` waived the <=60 runtime-line
pin (contracts R1, spec C1.1) at the real size, and asked for one thing: restore
one-statement-per-line layout in `scripts/collect-from-origin.mjs` — undo every `;`-joined line
and split the >100-char lines the round-3 compression introduced (`parseArgs`,
`listOriginBranches`, `commitInfo`, the fetch `try`/`catch`, `objectExists`, `extractArtifactSha`,
`computeMerged`, `computeState`, `buildRow`, `main`'s body) — with no behaviour change, no CLI
change, no test weakening.

I rebuilt the file from `61b6aa6` (the pre-round-3, one-statement-per-line commit) and reapplied
only the round-3 change that was an actual behaviour fix: `changedRecordPaths`'s orphan/shallow-
clone two-dot fallback (round-3 finding R2-3). That fallback is now a named helper,
`diffRecordPaths(repo, range)` (`scripts/collect-from-origin.mjs:75-84`), called twice —
three-dot first, two-dot only if the three-dot range has no merge base — instead of round 3's
inline `const diff = (range) => ...` closure. Everything else (round 3's other reviewer findings,
R2-1/R2-2/R2-4) lived entirely in the test file, which I did not touch, so restoring the `.mjs`
layout to `61b6aa6` and then reapplying just R2-3 is the complete, behaviour-preserving fix.

Verification that the change is layout-only plus the one named exception:
`git diff 61b6aa6 -- scripts/collect-from-origin.mjs` (run in the worktree) produces exactly one
hunk — the `diffRecordPaths` extraction inside `changedRecordPaths` — nothing else in the file
differs from the pre-round-3 commit. Quoting it in full:

```
@@ -72,8 +72,14 @@ function commitInfo(repo, ref) {
 // record --main has and the branch's own tree lacks is not "this branch changed a record".
 // ":(top,glob)" anchors the pathspec at the repo root, so a --repo pointing at a subdirectory
 // (or a nested docs/work/x/y.record.md) can't silently under- or over-match (F5).
+function diffRecordPaths(repo, range) {
+  return tryGit(["diff", "--name-only", "--no-renames", "--diff-filter=AM", ...range, "--", ":(top,glob)docs/work/*.record.md"], repo);
+}
+
 export function changedRecordPaths(repo, mainFull, branchRef) {
-  const out = tryGit(["diff", "--name-only", "--no-renames", "--diff-filter=AM", `${mainFull}...${branchRef}`, "--", ":(top,glob)docs/work/*.record.md"], repo);
+  // No merge base (orphan branch / shallow clone): fall back to R1's literal two-dot range
+  // rather than reading the missing merge base as "no changes" (a confident false negative).
+  const out = diffRecordPaths(repo, [`${mainFull}...${branchRef}`]) ?? diffRecordPaths(repo, [mainFull, branchRef]);
   return out ? out.split("\n").map((s) => s.trim()).filter(Boolean) : [];
 }
```

One more deliberate reversion, flagged as its own deviation below (not a reviewer finding, a
side effect of undoing round 3's line-cutting): the fetch-failure warning text is back to
including `err.message` (`main`'s `try { git(["fetch", "origin"], repo); } catch (err) { warn(...
${err.message...}) }`), reverting round 3's fixed-string version, which existed only because
round 3 collapsed that `try`/`catch` to save lines — a structure this round undoes on purpose.

## Line count (plain fact, not a finding)

`grep -vE '^\s*(//.*)?$' scripts/collect-from-origin.mjs | wc -l` = **114**. The pin is waived
per the ruling; this is reported as a fact, not compared against 60.

## Gate

```
cd /home/ben/Code/wt-collect-from-origin-1-C1 && node --test scripts/collect-from-origin.test.mjs
```
Result: `tests 21 / pass 21 / fail 0 / cancelled 0`. Full log at
`docs/specs/collect-from-origin-1/reports/C1-gate.log`. Same 21 tests as round 3, unchanged
(the test file was not touched this round); all green against the reformatted `.mjs`.

## Deviations / assumptions
- Fetch-failure warning text reverted to include `err.message` (see above) — a side effect of
  undoing round 3's try/catch collapse, not itself a reviewer finding. The only test reading this
  message (`collect-from-origin.test.mjs:332`) matches the loose pattern `/fetch failed/`, which
  holds under either wording; no contract pins the exact text.
- `objectExists` restored as its own named function (was inlined into `computeMerged` in round 3
  purely to save a line) — behaviourally identical, matches `61b6aa6`.
- No CLI flag, output field, row order, state enum, or exit-code behaviour changed. No test
  added, removed, or weakened.

## Answers carried forward (scout-C1.md's two open questions, unchanged from round 1)
Not revisited this round — the ruling scoped this round to the layout fix only ("Fix for this
round, and nothing else"). See `C1-report.md` (round 1) for the original answers; nothing in
this round's diff touches the reasoning behind them.

## Sha
`git rev-parse HEAD` in the worktree: `4843ef78219efaf716a3cbffc52e128053a6d71c`.
