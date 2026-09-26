VERDICT: NEEDS_FIXES (4) 3078f1bc0370a771959dd44f2944d2aea846932d

NEEDS_FIXES

# M1 review, round 1 — the merge gate and the page entry

Reviewed: worktree `/home/ben/Code/wt-merge-on-acceptance-1-M1`, HEAD
`3078f1bc0370a771959dd44f2944d2aea846932d` (from `git rev-parse HEAD`, run by me). The builder
commit is 3078f1b on top of 24e02ea (spec pack), which is on top of base 6d8ba95. Working tree
clean. Diff 24e02ea..HEAD touches exactly the five territory files.

Count: 0 blockers, 4 majors, 5 minors, plus notes. Majors 1 to 3 are the attack brief's own
angles #6 and #7 (red-team F1). The rules are all present. Majors 1 and 2 are two places where
the surrounding text still orders things the old way, which a lead would follow. Major 3 is the
lane lead's write route, which never points to the Done-checked rule it must obey.

## Majors

### F1 (major): the Accept turn still orders the second-host suite after `accept` (R4, attack #6)

Evidence:
- `skills/team-build/SKILL.md:385-394` is the Accept turn, the default loop path. It says: run
  the census, run `accept`, "push the branch, merge into main per the M1 rule once the
  second-host suite is green, post the Closed entry". The second-host run comes after
  `accept`. That is exactly the ordering R4 forbids: the log must be record evidence before
  `accept`, because any record change after `accept` needs a fresh check. The brief dictated
  this sentence word for word, but contracts.md wins and R4 is explicit.
- `skills/team-build/SKILL.md:256-262` (the Ship paragraph) tells the same story in the same
  order: "After that `accept --census` … succeeds, push … Then, once the sealed suite is green
  on a second host …". It then adds "already committed as record evidence from before `accept`
  ran". The correct rule is there, but only as a clause that looks backwards. A lead reading in
  order has already run `accept` by the time it reaches that clause.
- "per the M1 rule" (`:393`) is a label from this build's territories. It means nothing to a
  future reader of the skill. No test pins either sentence: I grepped every `*.mjs` for
  "ONE RESULT", "Accept turn", "re-run the census now", "M1 rule" and "Closed entry", with zero
  hits.

Fix: apply both patches.

Patch 1a, `skills/team-build/SKILL.md:256-263`. Current:
```
After that `accept --census` (or `--no-census`) succeeds, push the branch with its
accepted record. Then, once the sealed suite is green on a second host from origin (a
Windows host when built on Linux, a Linux host when built on Windows — the lane lead runs
it through ssh as a prior lane did, or asks the spec lead), with that second-host gate log
already committed as record evidence from before `accept` ran (any record change after
`accept` needs a fresh check), the record on origin says accepted, and its Opus review
verdicts are in its evidence, the lane lead merges its branch into main with a merge
commit and pushes. Any conflict when merging into main — not just a non-additive one —
```
Replacement:
```
Before that `accept`, push the integration branch and run the sealed suite on a second
host from origin (a Windows host when built on Linux, a Linux host when built on Windows
— the lane lead runs it through ssh as a prior lane did, or asks the spec lead), and
commit that second-host gate log as record evidence then, never after `accept` (any
record change after `accept` needs a fresh check). After that `accept --census` (or
`--no-census`) succeeds, push the branch with its accepted record. Once the record on
origin says accepted and its Opus review verdicts and green second-host gate log are in
its evidence, the lane lead merges its branch into main with a merge commit and pushes.
Any conflict when merging into main — not just a non-additive one —
```
Line 264 onward stays as it is. Predicted outcome: `work-record.test.mjs`'s 800-character slice
still starts at "Run the census at accept time" (`:251`). All six tokens it asserts sit on
`:251`, so the test stays green. The slice now ends a little earlier inside the new text, which
the test does not check.

Patch 1b, `skills/team-build/SKILL.md:387` and `:392-394`. Current `:387`:
```
`PASS`: re-run the census now (Ship's `build-census.mjs` command, `--out
```
Replacement:
```
`PASS`: first push the integration branch and commit the second-host suite's gate log as
record evidence (Ship's merge paragraph: before `accept`, never after); then re-run the
census now (Ship's `build-census.mjs` command, `--out
```
Current `:392-394`:
```
(`--no-census "<reason>"` only when the census itself breaks), push the branch, merge into
main per the M1 rule once the second-host suite is green, post the Closed entry, and only
then send ONE RESULT.
```
Replacement:
```
(`--no-census "<reason>"` only when the census itself breaks), push the branch, merge into
main per Ship's merge paragraph, post the Closed entry, and only then send ONE RESULT.
```
See also minor m4 on the word "committed". Whatever the lead rules there applies to both
patches.

### F2 (major): decisions SKILL.md still says "account, then clear Done", the ordering red-team F1 blamed for the wedge

Evidence: `skills/decisions/SKILL.md:88-93` still reads "Account those inputs, reconcile a
changed fresh read if necessary, then clear it as `- [ ] Done (last cleared: …)`". This is the
same text as base `6d8ba95:skills/decisions/SKILL.md:76-78`. Red-team F1 (`redteam.md:30`)
names that very passage: "the owner lead's own handling edits, which SKILL.md:76-78 orders
before clearing Done … One such write in the Done-checked window silences the Done wake". The
new R5 rule 1 at `:211-214` reverses the order, but only inside the pickup section. The Page
rules, where a lead actually learns how to handle Done, still teach the wedging order, and no
cross-reference ties the two together. Result: two contradictory instructions in one file, and
the one a lead meets first is the unsafe one. Nothing pins `:88-93`. I grepped every `*.mjs`
for "absent Done line", "Account those" and "then clear it": no test hits.

Fix, `skills/decisions/SKILL.md:93`. Current:
```
open decisions; an absent Done line blocks the hand-back.
```
Replacement:
```
open decisions; an absent Done line blocks the hand-back. In a registered pickup round
the order is the reverse — clear Done first, then account — because any page edit while
that round's Done is still checked moves its receipt to NEEDS_RECONCILIATION (the
Done-window rules under "Reading answers") (not checked).
```
Predicted outcome: no line starts with `**`, and the pins at `:49-50` and `:332-333` are
untouched. `skill-text.test.mjs` stays green.

### F3 (major): the lane lead's write route never points to the Done-checked rule it must obey (R5 rule 2)

Evidence: R5 rule 2 (a lane lead whose fresh read shows Done checked does not write) exists
only at `skills/decisions/SKILL.md:214-216`, in "Reading answers > One-shot pickup". A lane lead
never reads that section to post a Closed entry. The route it actually follows says nothing
about Done:
- `team-build/SKILL.md:267-271` sends it to "the decisions skill's existing `notion.js edit
  --safe` anchored-edit route (`skills/decisions/SKILL.md` names the exact shape)".
- That route is `decisions/SKILL.md:56-82`: "read the page fresh seconds before the write, make
  one `notion.js edit --safe` anchored edit …".

Placing the rules in their own paragraph is right (attack #7 asked for that). But the fresh
read the rule depends on sits in the two-writers sentence, and that sentence never mentions
Done. A lane lead that follows `:75-82` exactly writes into a checked-Done window. That is the
F1 wedge this build was meant to prevent, and it would silently defeat "work stalled".

Fix, `skills/decisions/SKILL.md:75-76`. Current:
```
Two writers never edit the page at once: read the page fresh seconds before the write,
make one `notion.js edit --safe` anchored edit, then reread it and confirm the Closed
```
Replacement:
```
Two writers never edit the page at once: read the page fresh seconds before the write
(if that read shows Done checked, do not write at all: the Closed entry goes verbatim
into the RESULT, per the Done-window rules under "Reading answers"), make one
`notion.js edit --safe` anchored edit, then reread it and confirm the Closed
```
Optional, same intent, `skills/team-build/SKILL.md:270-271`. Current:
`(`skills/decisions/SKILL.md` names the exact shape), and only then sends its RESULT; no`.
Replacement:
`(`skills/decisions/SKILL.md` names the exact shape and the Done-checked exception), and only then sends its RESULT; no`.
Predicted outcome: the pins hold. The `notion.js edit\n--safe` regex still matches at
`:49-50`, and no new line starts with `**`.

### F4 (major, contract miss): the second-host condition is not marked `(not checked)` (R4)

Evidence: contracts.md R4 and brief M1 `:85-86` both require it: "The second-host condition is
marked `(not checked)` in house style." In `skills/decisions/SKILL.md:56-73` (the new merge
paragraph) and `:211-220` (the new R5 paragraph), `grep -n "not checked"` finds no marker
inside either paragraph. Every neighbouring rule in this file carries one. This marker is how
the build discloses red-team's nearest NOT: "a rule no script checks".

Fix, `skills/decisions/SKILL.md:61`. Current:
```
check), the lane lead merges its branch into main with a merge commit and pushes, then
```
Replacement:
```
check; not checked by any script), the lane lead merges its branch into main with a merge commit and pushes, then
```
Also `:219-220`. Current:
```
recipient's own host, so registering pickup on the wrong host silently dead-letters the
wake.
```
Replacement:
```
recipient's own host, so registering pickup on the wrong host silently dead-letters the
wake (not checked).
```
Predicted outcome: the pins are unaffected.

## Minors (recommended, not required for APPROVE)

- m1, `docs/pane-setup.md:10-11`: the fable role bullet now says fable "is the pane that decides
  a release or install to the owner's machines". That contradicts the rule written in both
  skills: releases and installs stay on the owner's word, and fable only routes them (step 4
  at `:40-43` says it correctly). Current:
  `the high-tier red-team's report, and is the pane that decides a release or install to`
  / `the owner's machines and any Waiting item a lane lead cannot resolve on its own (a`.
  Replacement:
  `the high-tier red-team's report, and is the pane that puts a release or install to the`
  / `owner's machines to the owner as a decision item, and any Waiting item a lane lead cannot resolve on its own (a`.
- m2, `skills/decisions/templates/decision-item.md:29-30`: the new No-default text wraps inside
  its code span (`No default: installs take your word` + newline + `per item`), so
  `grep "installs take your word per item"` finds nothing in the repo. That is the grep this
  very build used to prove the old phrase was unique. Current:
  ```
  `- [ ] Install now` and `- [ ] Hold`, last line `No default: installs take your word
  per item`; its evidence is the merged changelog lines copied from the Closed entries
  it covers, not a fresh writeup.
  ```
  Replacement:
  ```
  `- [ ] Install now` and `- [ ] Hold`, last line
  `No default: installs take your word per item`; its evidence is the merged changelog
  lines copied from the Closed entries it covers, not a fresh writeup.
  ```
- m3, `docs/census.md:352`: "The collector is run before any lane dispatch and at every merge
  tick". A merge tick was Ben ticking a merge item, and this build removes that event. The new
  four-hour check at `:358-360` needs the collector to run. As written, it now runs only before
  a dispatch. Replace `and at every merge tick, never only when a` with
  `and after every merge to main, never only when a`.
- m4 (contract wording, for the lead to rule on): the phrase "committed as record evidence
  before `accept`" (R4; `team-build:259-260`, `decisions:59-60`) is a trap if taken literally
  as a git commit on the delivery branch. Live-mode `accept --delivery-ref`, the Accept turn's
  mode, refuses when the branch head is not `Artifact:`: `scripts/work-record.mjs:869-871`
  ("Artifact … does not match delivery") and `:912-916` (Worktree HEAD ≠ artifact). A prior
  record shows the working practice. `wr-2026-09-26-collect-from-origin` has
  `Artifact: …@645eb79` and `Worktree: build/collect-from-origin-1`, and its record commit
  3048d19 landed after `accept`, so the record edits stay uncommitted until after `accept`.
  Either word it as "written into the record's evidence before `accept` (committed with the
  accepted record)", or say that pinned mode (`--pinned-artifact`) is needed. The loud refusal
  would stall a lead; it would not corrupt anything.
- m5, `team-build/SKILL.md:264-265` and `decisions/SKILL.md:66-67`: "post a Waiting item
  naming the conflicting paths" gives no shape. Everything under Waiting must be a
  template-shaped decision item with options (`decisions/SKILL.md:99-105`). A bare
  `<details>` with no options is a reader WARN (`decisions-read.mjs:338-341`), and red-team
  `:81` notes a page warning makes pickup INVALID. Suggest "post a decision item under Waiting
  (template shape, with options) naming the conflicting paths".

## Notes (no action in M1)

- `README.md:259` still says "lanes post their own merge item". It is the 0.20.11 changelog
  entry, a record of what shipped then. Rewriting it would falsify release history, and
  README is off-limits to M1 (contracts territory map). I judge it not a live-mechanism
  defect. This build's own changelog line should say it replaces 0.20.11's merge item. The
  builder flagged the same line. Every other `merge item` / `merges to main take your word`
  hit is under `docs/work/` or `docs/specs/`, which is historical evidence or this build's
  own plan.
- `templates/goal-card.md:43`: "The merge ask asks which non-goal a change comes closest to".
  The merge ask this refers to is gone. It is outside M1's territory, so the lead should decide
  where that question now lives.
- Builder-report gap: its grep for tests reading the edited files missed
  `scripts/native-package.test.mjs` (it reads every `skills/*/SKILL.md` frontmatter). I ran it
  together with `build-loop-workflow.test.mjs`, `build-census.test.mjs` and
  `mirror-shared-skills.test.mjs`: 159 of 159 passed.

## Verified clean (attack angles with no defect)

1. Test pins. I ran `node --test skills/decisions/scripts/skill-text.test.mjs
   scripts/work-record.test.mjs` myself: 157 tests, 157 passed, 0 failed, matching the gate
   log tail. `grep -n '^\s*\*\*' skills/decisions/SKILL.md` finds 0 lines. The wrap at `:49-50`
   (`notion.js edit` / `--safe`) is byte-identical to base `:49-50`. The wrap at `:332-333`
   (`do not hand back, fix the` / `read first`) is byte-identical to base `:307-308`; it moved
   only because of the insertion at `:211`. The 800-character slice still contains every
   asserted token, all on `:251`.
2. Old mechanism: in live skill and doc text, 0 hits outside the README changelog line
   discussed above.
3. `docs/GOALS.md` has zero diff against base (`git diff --stat 6d8ba95 HEAD -- docs/GOALS.md`
   is empty). The builder's report names `docs/GOALS.md:21` explicitly and quotes it; I
   verified the quote matches the file. No edit was made.
4. The Closed-entry shape is exact in both places it appears: `decisions/SKILL.md:64` and
   `team-build/SKILL.md:268-269`. The latter wraps inside the code span; that is harmless and
   does not start a line with `**`. Both are plain bullets, and neither the template nor
   pane-setup gives a divergent example.
5. R3 is strict in both skills: "Any conflict … — not just a non-additive one — means no merge"
   (`team-build:263-264`) and "Any conflict …, of any kind, means no merge" (`decisions:66-67`).
   `grep -rn "additive\|resolve as"` over skills/ and the edited docs finds no surviving
   carve-out. The non-ancestor merge-commit suite rule is present in both.
6. R5: all three Done-window rules plus the pickup-host sentence are in their own paragraph at
   `decisions/SKILL.md:211-220`, next to the registered-pickup material. Their content matches
   red-team F1 and contracts R5. Majors F2 and F3 are about the text around them, not about the
   rules themselves.
7. Release and install: one sentence in `team-build:274-276` and one in `decisions:70-73`. The
   template's release item is genuinely new text (options Install now / Hold, its own evidence
   clause) and carries no stale merge wording. `collect-from-origin.mjs`, `hooks/`,
   `skills/multi/`, `skills/decisions/scripts/`, `.codex-plugin/` and `README.md` all have
   zero diff.

## C4 fields

Cause: n/a. This is a docs feature territory, not a bug fix. The nearest analogue is F1/F2,
where old ordering text survived next to the new rule.
Discriminating check: read `team-build/SKILL.md:385-394` and `decisions/SKILL.md:88-93` after
the fix. Neither may order a step after `accept` or after the Done-clear that R4 or R5 places
before it.
Fix location: `skills/team-build/SKILL.md:256-263,387,392-394`;
`skills/decisions/SKILL.md:61,75-76,93,219-220`.
Simplification: none. Each fix is a clause-level text edit, with no new structure.
