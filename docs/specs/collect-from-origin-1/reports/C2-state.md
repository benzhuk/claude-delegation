# C2 state — lane posts its own merge item (round 2, fix round)

## Territory
skills/team-build/SKILL.md, skills/decisions/SKILL.md,
skills/decisions/templates/decision-item.md. Worktree
/home/ben/Code/wt-collect-from-origin-1-C2, branch build/collect-from-origin-1-C2.

## Contracts I rely on
- contracts.md R3: decisions route is existing `notion.js edit --safe` anchored edit;
  no new command. Merge item title `Merge <branch> into main (<tip sha>)`; evidence
  line carries the record's four numbers + census leadTurns, `unmeasured` if either is
  absent; options merge-now / merge-and-release / hold; `No default: merges to main
  take your word per item`. Keep additions short, one step in the accept sequence not
  a section — now honored in BOTH accept sequences (Ship by-hand, and the loop's
  Accept turn), per review round-1 finding F1.
- scout-C2.md: only test file reading any of the three C2 files directly is
  skills/decisions/scripts/skill-text.test.mjs; work-record.test.mjs also reads
  team-build/SKILL.md (census slice); native-package.test.mjs also reads every bundled
  SKILL.md's frontmatter (found in review round 1, F6) — decision-item.md has no
  reader anywhere.

## Done
Round 1 committed 3ff5635 (reviewed, NEEDS_FIXES 6: MAJOR F1/F2/F3, MINOR F4/F5/F6).
Round 2 applies all six: F1/F2/F4/F5 as exact reviewer-proposed text edits to
team-build/SKILL.md and decisions/SKILL.md; F3/F6 as report corrections only (no code
— reviewer's own fix for those two is report text). Committed
1468a6303fda1972e1ac103c9835fb7db4cc886b (see `git rev-parse HEAD` in worktree for the
authoritative 40-char value; report's Sha line carries the same value, run fresh, not
from memory). Gate green: skill-text.test.mjs 10/10 (log at C2-gate.log). Reviewer's
named re-review scope also run and green: work-record.test.mjs's one relevant test +
native-package.test.mjs (name-filtered) 2/2; native-package.test.mjs unfiltered 3/3
(no tmp-dir dependency, unaffected by host /tmp inode pressure). Full before/after
diffs for all four code fixes and the corrected F3/F6 answers are in C2-report.md.

## Next
Nothing outstanding in this territory pending re-review. If the next review round
finds anything, apply it the same way: reviewer-proposed text verbatim at the named
anchor, then re-run the three-file scope above.

## Open questions
None outstanding. F3 (Codex mirror) corrected in this round's report: a mirror exists
(plugin.json `skills: ./skills/`, plus `~/.agents/skills/decisions` symlink on this
host) and carries this rule; whether it can *post* depends on `notion.js edit --safe`
being deployed on the Codex host with a Notion key in its environment — not verified
on any Codex host; this Claude host's own deployed notion.js lacks `--safe` (chezmoi
source has it, undeployed). Until verified, Codex posting is treated as unsupported;
the RESULT-carries-the-text-verbatim fallback in team-build/SKILL.md's Ship section
applies.

## How to run my gate
```
cd /home/ben/Code/wt-collect-from-origin-1-C2
node --test skills/decisions/scripts/skill-text.test.mjs
```
Reviewer's fuller re-review scope (all green as of this round, no tmp-dir issues):
```
node --test --test-name-pattern='SKILL.md|bundled skill' scripts/work-record.test.mjs scripts/native-package.test.mjs
node --test scripts/native-package.test.mjs
```
