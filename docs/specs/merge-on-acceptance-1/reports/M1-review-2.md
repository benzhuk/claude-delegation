VERDICT: APPROVE e5d10f5b1fc011aade8854ca888834a3ee6a1932

APPROVE

# M1 review, round 2 (delta): the merge gate and the page entry

Reviewed: worktree `/home/ben/Code/wt-merge-on-acceptance-1-M1`. I ran `git rev-parse HEAD` myself:
`e5d10f5b1fc011aade8854ca888834a3ee6a1932`. The range 3078f1b..HEAD is one commit (e5d10f5). The
working tree is clean. The delta touches only the five territory files: 45 insertions, 33 deletions.

Count: 0 blockers, 0 majors, 0 new minors. All four round-1 majors are fixed, and so are the
four minors that were applied. I found no regressions.

## Prior findings: verification

- **F1 (R4 ordering): fixed.**
  - `skills/team-build/SKILL.md:256-261`, the Ship paragraph, now opens with "Before that
    `accept`": push the integration branch, run the second-host suite, and write its gate log
    into the record's evidence "never after `accept`". Only after that does it say "After that
    `accept --census` … succeeds, push the branch with its accepted record".
  - The Accept turn at `:389-398` now reads "first push the integration branch and write the
    second-host suite's gate log into the record's evidence (Ship's merge paragraph: before
    `accept`, never after); then re-run the census now … then run … accept".
  - "per the M1 rule" is gone. It now reads "per Ship's merge paragraph", and `## Ship` exists
    at `:209`.
  - I checked that the new order does not trip census-stale. `scripts/work-record.mjs:812-851`
    compares the census only against the last `Log: ... reviewed` line, not against evidence
    edits. Writing the evidence before re-running the census is therefore safe, and the Accept
    turn re-runs the census after that write anyway.
- **F2 (Done-clear order): fixed.** `skills/decisions/SKILL.md:97-100` now adds the reversed
  order (clear Done first, then account) for a registered pickup round. It says why
  (NEEDS_RECONCILIATION), which matches `redteam.md:30`, and points to the Done-window rules.
  The cross-reference target `## Reading answers` exists at `:123`.
- **F3 (lane lead's write route): fixed.** The two-writers sentence at `decisions/SKILL.md:77-79`
  now carries the Done-checked exception. `team-build/SKILL.md:272` now points to "the exact
  shape and the Done-checked exception".
- **F4 (`(not checked)` marker): fixed.** The merge paragraph at `decisions/SKILL.md:61` says
  "not checked by any script". The pickup-host sentence at `:227` ends "(not checked)".
- **m1:** fixed. `pane-setup.md:9-14`: fable now "puts" a release or install to the owner as a
  decision item. It no longer "decides" one.
- **m2:** fixed. `grep -rn "installs take your word per item" skills` gets one hit, at
  `decision-item.md:30`.
- **m3:** fixed. `census.md:352` now reads "after every merge to main". Outside `docs/work/`,
  `docs/specs/` and README:259, the repo has no live "merge tick" text.
- **m5:** fixed. Both skills now say "a decision item under Waiting (template shape, with
  options)".
- **m4:** the builder's own call, which it flagged openly. The text now says "written into the
  record's evidence before `accept` ran (committed with the accepted record)". This is the first
  of the two options I offered in round 1. It matches live-mode `accept --delivery-ref`, which
  needs HEAD == Artifact, and it matches the practice in the prior record. I accept it.

## Attack angles re-run on HEAD

1. **Test pins.** I ran `node --test skills/decisions/scripts/skill-text.test.mjs
   scripts/work-record.test.mjs` myself: 157 tests, 157 pass, 0 fail. That matches the tail of
   `M1-gate.log`.
   - The four secondary files (`native-package`, `mirror-shared-skills`, `build-census`,
     `build-loop-workflow`): 159 tests, 159 pass.
   - `grep -n '^\s*\*\*' skills/decisions/SKILL.md` finds 0 lines.
   - Lines `:49-50` are byte-identical to base 6d8ba95 (checked by diff).
   - The wrap "do not hand back, fix the" / "read first" is at `:339-340`. It was at base
     `:307-308` and moved only because of insertions; its text is unchanged.
   - The start of the 800-char slice ("Run the census at accept time") is unchanged.
2. **Old mechanism.** `grep -rn "merge item\|merges to main take your word\|merge tick\|M1 rule"`,
   excluding `.git`, `docs/work/` and `docs/specs/`, gets exactly one hit: `README.md:259`. That
   is the 0.20.11 changelog line, which round 1 already ruled historical and out of scope.
   The record's Authority line uses "M1 rule". That line belongs to the orchestrator and is not
   M1 territory.
3. **Files outside the territory.** `git diff --stat 6d8ba95 HEAD` shows no change to
   `docs/GOALS.md`, `scripts/collect-from-origin.mjs`, `hooks/`, `skills/multi/`,
   `skills/decisions/scripts/`, `.codex-plugin/` or `README.md`. The builder's report names
   GOALS.md:21 again.
4. **Closed-entry shape and R3 strict conflict rule.** Both are unchanged from round 1, where I
   verified them. The delta did not alter either sentence, apart from the Waiting-item shape
   wording (m5).
5. **R5 rules.** They are still in their own paragraph, now at `decisions/SKILL.md:218-227`. The
   Page rules and the write route now point to them instead of contradicting them.

## Notes (no action required)

- `decisions/SKILL.md:77-79`: the Done-checked parenthetical is written for any writer, but its
  consequence names "the Closed entry … into the RESULT". That makes its scope the lane lead's
  Closed-entry post. The owner lead's own first write, which clears Done, is governed by R5 rule
  1 at `:219-221`. I see no conflict in practice.
- `decisions/SKILL.md:99-100` ends with two parentheticals back to back: "(the Done-window rules
  under "Reading answers") (not checked)". This is style only.
- `pane-setup.md:10-12`: "puts … to the owner as a decision item, and any Waiting item a lane
  lead cannot resolve" reads a little awkwardly. The meaning (fable routes both) is intact.

## C4 fields

Cause: n/a. This is a docs feature territory. The round-1 defects were old-order text left next
to the new R4/R5 rules.
Discriminating check: read `team-build/SKILL.md:256-261,389-398` and `decisions/SKILL.md:77-79,97-100`.
Neither orders the second-host log after `accept`, and neither orders account-then-clear inside
a registered pickup round. Both hold at e5d10f5.
Fix location: `skills/team-build/SKILL.md:256-272,389-398`; `skills/decisions/SKILL.md:56-79,97-100,227`;
`docs/census.md:352`; `docs/pane-setup.md:9-14`; `skills/decisions/templates/decision-item.md:28-31`.
Simplification: none needed. Each fix is a clause-level text edit, with no new structure.
