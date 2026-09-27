VERDICT: NEEDS_FIXES 826485c227b0d4377769174e93c79829bf49e884

# Lead stall note, F2 round 3 relaunch (lead skills-n)

The round 3 builder hung for over an hour on a permission prompt. It had chained `rm -rf "$SCRATCH/f2r3-mutate"` into a Bash call at 2026-09-27T09:48:32Z. The lead stopped the loop and committed the builder's uncommitted edits unchanged as 826485c: 265 lines in scripts/four-read.mjs and scripts/four-read.test.mjs, neither gated nor reviewed.

Your task is round 3 of F2. The findings to fix are in docs/specs/measure-truth-1/reports/F2-review-round2.md (MAJOR-A, MAJOR-B and the three MINORs).
1. Start at 826485c. Read that diff first, since it is the previous builder's partial attempt. Keep it where it is correct and fix it where it is not.
2. Commit, run your gate and report.

Never run `rm`, `rm -rf` or `git clean` in any command. A fresh scratch dir uses a new unique name (`mktemp -d` under the scratchpad), and nothing is ever deleted. This stall has now cost three lanes.
