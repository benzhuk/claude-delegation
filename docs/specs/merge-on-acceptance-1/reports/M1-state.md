# M1 state — the merge gate and the page entry

## Territory
Docs-only: `skills/team-build/SKILL.md`, `skills/decisions/SKILL.md`,
`skills/decisions/templates/decision-item.md`, `docs/census.md`, `docs/pane-setup.md`.
Worktree `/home/ben/Code/wt-merge-on-acceptance-1-M1`, branch
`build/merge-on-acceptance-1-M1`.

## Contracts I rely on
`docs/specs/merge-on-acceptance-1/contracts.md` R2-R7 (this territory's rule text,
conflict handling, second-host evidence timing, Done-window write rules, test pins).
`briefs/M1.md` and `briefs/scout-M1.md` for exact line numbers and the two open-question
rulings. Round-2 fixes applied against `reports/M1-review-1.md`'s findings.

## Done
Round 1 landed all five exact-edit items (commit 3078f1b). Round 2 (this pass, commit
`e5d10f5b1fc011aade8854ca888834a3ee6a1932`) applied every verified reviewer finding:
- F1 (major): reordered team-build's Ship paragraph and Accept turn so the second-host
  gate log is written into the record's evidence *before* `accept` runs, never after;
  dropped the meaningless "per the M1 rule" label in favor of "per Ship's merge
  paragraph".
- F2 (major): decisions SKILL.md's Done-clear paragraph now states the reversed order
  for a registered pickup round (clear Done first, then account) right where a lead
  reads it, cross-referencing the Done-window rules under "Reading answers".
- F3 (major): the two-writers/anchored-edit sentence in decisions SKILL.md now states
  the Done-checked exception inline (don't write if Done is checked; carry the Closed
  entry verbatim in the RESULT instead); team-build's route sentence now points to "the
  exact shape and the Done-checked exception".
- F4 (major): both new merge paragraphs (decisions SKILL.md merge rule and R5's
  pickup-host sentence) now carry an explicit "(not checked)"/"not checked by any
  script" marker.
- Minors m1 (pane-setup fable bullet: "puts... to the owner as a decision item", not
  "decides"), m2 (decision-item.md release line no longer wraps inside its own code
  span), m3 (census.md: "after every merge to main", not "at every merge tick"), m5
  (Waiting item reworded to "a decision item under Waiting (template shape, with
  options)" in both team-build and decisions SKILL.md) — all applied.
- m4 (wording question, no hard requirement): reworded "already committed as record
  evidence from before `accept` ran" to "already written into the record's evidence
  before `accept` ran (committed with the accepted record)" in both files, per the
  reviewer's own first suggested option, to avoid implying a premature git commit that
  live-mode `accept --delivery-ref` would refuse against. No lead was available to rule
  on this in-round; flagged as my own call in the report.

Verified: `grep -rn "merge item\|merges to main take your word"` outside the five files
still hits only `docs/work/`, `docs/specs/` (historical build records/specs) and
`README.md:259` (0.20.11 changelog, out of scope) — same as round 1's "Notes" section.
Gate green 157/157. Secondary tests (native-package, mirror-shared-skills,
build-census, build-loop-workflow) green 159/159.

## Next
Nothing outstanding in this territory. GOALS.md:21's contradiction with the new rule is
still flagged for the lead to raise with Ben (not edited, per NOT list) — same open item
as round 1, unchanged by this round.

## Open questions
None unresolved.

## How to run my gate
```
node --test skills/decisions/scripts/skill-text.test.mjs scripts/work-record.test.mjs \
  > docs/specs/merge-on-acceptance-1/reports/M1-gate.log 2>&1
node --test scripts/native-package.test.mjs scripts/mirror-shared-skills.test.mjs \
  scripts/build-census.test.mjs skills/team-build/references/build-loop-workflow.test.mjs
```
Both green as of `e5d10f5b1fc011aade8854ca888834a3ee6a1932`.
