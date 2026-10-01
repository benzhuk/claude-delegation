VERDICT: NEEDS_FIXES (6) 3ff5635fbca0433981851fc63eb059afab06e56b

# C2 review, round 1: the lane posts its own merge item

Reviewed worktree: /home/ben/Code/wt-collect-from-origin-1-C2
`git rev-parse HEAD` (run by the reviewer): 3ff5635fbca0433981851fc63eb059afab06e56b
Commit under review: 3ff5635 (`git show HEAD`: 3 files, +27/-1: skills/team-build/SKILL.md,
skills/decisions/SKILL.md, skills/decisions/templates/decision-item.md). Worktree clean.

Severity counts: BLOCKER 0, MAJOR 3, MINOR 3.

JUDGMENT: merge-item-shape-matches-contracts = YES for the shape text itself
(decisions/SKILL.md:57-61 matches R3 word for word). NO for the rule's placement: the
default loop path's accept sequence still skips it (F1), and the two-writers rule it
points to does not exist (F2).
JUDGMENT: collector-never-lies-about-merged-state = n/a to C2. C2 ships no collector code.
The Codex fallback sentence (team-build/SKILL.md:261-263) leaves the branch findable by
the collector through the pushed record, as spec C2 item 3 requires.

## Gate: re-run by the reviewer, green

- `node --test skills/decisions/scripts/skill-text.test.mjs` gave tests 10, pass 10, fail 0.
- Contracts define the C2 gate as "the tests that read the three C2 files". Three test files
  read them, not two as the report says (see F6):
  `node --test --test-name-pattern='SKILL.md|bundled skill' scripts/work-record.test.mjs scripts/native-package.test.mjs`
  gave:
  `✔ every bundled skill has a closed frontmatter block with name and description`
  `✔ skills/team-build/SKILL.md: the census command in the acceptance section ...`
  (tests 2, pass 2, fail 0).
- I did not re-run the full work-record.test.mjs. /tmp is out of inodes (`df -i /tmp`:
  1048287/1048576 used, and later 100% full), and my scratch folder is on the same tmpfs.
  A full run with TMPDIR pointed at scratch failed with `ENOSPC mkdtemp` inside the test's
  own fixture helper. That is a host condition, not caused by this diff. The two tests
  that actually read the C2 files do not use temp dirs, and I ran them by name above.

## Verified absences (first-class findings)

- No asserted string was removed or reworded. The decisions/SKILL.md diff is a pure
  insertion (10 `+` lines, 0 `-` lines). Every literal that skill-text.test.mjs asserts
  (lines 22-23, 27, 31, 35, 39-40, 50, 57-58, 62) sits outside the inserted block and is
  byte-identical. No new line starts with `**`. The stale string (`'in chat ' + 'too'`)
  appears in none of the edited .md files. The test passes 10/10.
- In team-build/SKILL.md, the one `-` line is a paragraph split. The text of
  "`docs/census.md`. `accept` is the only intended code path..." is preserved exactly
  (lines 254 and 265). The census-command slice that work-record.test.mjs:1815-1827
  checks is unchanged and still passes.
- The fenced fill-in block in the decision-item template is untouched. The added text
  (decision-item.md:24-27) sits outside the fence.
- The merge-item shape matches R3 exactly (decisions/SKILL.md:57-61):
  - title `Merge <branch> into main (<tip sha>)`
  - evidence carrying "the record's four numbers and the census's lead-turns figure"
  - options merge-now / merge-and-release / hold
  - `No default: merges to main take your word per item`

  The template pointer (decision-item.md:24-27) repeats title, options and No-default
  exactly.
- No new posting command was invented. The route is named as the existing
  `notion.js edit --safe` (team-build/SKILL.md:258), the same string decisions/SKILL.md:49-50
  already pins.
- Scope held: only the three C2 files were touched. Nothing in C1, off-limits files,
  `docs/work/` or README.md changed.

## Findings

### F1: MAJOR. The default (loop) accept sequence still reads accept, then RESULT, with no merge item

Evidence: the new rule sits only in Ship (team-build/SKILL.md:256-263), which is the
by-hand path. SKILL.md:320 says the loop "is the DEFAULT way to run a build with two or
more territories", and "Below two territories, run Setup through Ship above by hand."
The loop's **Accept turn** (SKILL.md:371-378) spells out its own sequence, and it ends:

    (`--no-census "<reason>"` only when the census itself breaks) and send ONE RESULT.

A lead following the Accept turn, which is the path this build and most builds use, goes
straight from `accept` to RESULT. There is no push and no merge item. The attack brief
asked whether the anchor "genuinely runs AFTER accept --census and the push ... and
BEFORE the RESULT is sent — read the inserted paragraph in context". In context, it is
an aside on the by-hand path, and the default path's explicit sequence contradicts it.
R3 asks for "one step in the accept sequence". There are two accept sequences, and only
one of them got the step.

Fix (mechanical, one line, still a small local insertion per R3). In
skills/team-build/SKILL.md:378:

Current:
```
(`--no-census "<reason>"` only when the census itself breaks) and send ONE RESULT.
```
Replacement:
```
(`--no-census "<reason>"` only when the census itself breaks), push the branch, post its
merge item to the decisions page (Ship), and only then send ONE RESULT.
```
Predicted outcome: both accept sequences carry the step in the same order. The census
slice in work-record.test.mjs:1815-1827 anchors on "Run the census at accept time"
(line 252), well before line 378, so it is unaffected. None of the three reading tests
asserts on "send ONE RESULT"; my grep of every test naming SKILL.md found only the three
files listed under Gate. Re-run all three.

### F2: MAJOR. The decisions paragraph cites a "retry-once-on-a-changed-anchor rule just above" that does not exist, and it drops the reader check

Evidence: decisions/SKILL.md:61-64 says "the fresh-read, one-anchored-edit,
retry-once-on-a-changed-anchor rule just above applies to it exactly as to any other
write." Running `grep -n -i 'retry\|changed anchor\|two writers\|second writer\|reader check\|at once'`
on skills/decisions/SKILL.md finds only:
- line 52: "reread the page fresh, do not retry the same edit blind"
- lines 62-63: the builder's own sentence
- line 310: the goals-mirror section, "reconcile from a fresh read before retrying"

No retry-once rule exists anywhere in the file. The rule "just above" (lines 48-54) says
the opposite in spirit: exit 3/4 *stops the pass*.

Spec C2 item 2 requires the paragraph to state that "two writers never edit the page at
once (fresh read, one anchored edit, reader check, retry once on a changed anchor)". The
builder delegated that to a rule that is not there (the scout's addendum claimed it was;
the builder did not check), and "reader check" is missing entirely. This is the named
failure class: a check that passes because it isn't looking. The cross-reference looks
satisfied, but the thing it points at is absent.

Fix (mechanical). Replace the last sentence of the new paragraph in
skills/decisions/SKILL.md:61-64:

Current:
```
merges to main take your word per item`. It is one more item through the same
anchored-edit route, never a second writer at once: the fresh-read, one-anchored-edit,
retry-once-on-a-changed-anchor rule just above applies to it exactly as to any other
write.
```
Replacement:
```
merges to main take your word per item`. Two writers never edit the page at once: read
the page fresh seconds before the write, make one `notion.js edit --safe` anchored edit,
then reread it and confirm with `scripts/decisions-read.mjs` that the item is there. If
the anchor changed (exit 3), the pass stops as above; reread fresh and retry once with a
new anchor taken from those fresh bytes, never the same edit blind. A second exit 3, or
any exit 4, leaves the item unposted and the RESULT carries its text verbatim.
```
Predicted outcome: no line starts with `**`, and the stale string is absent. The asserted
"Exit 3 or exit 4 from that edit stops the" (line 51) and the `notion.js edit\n--safe`
match (lines 49-50) are untouched, so skill-text.test.mjs stays 10/10. The four parts
spec item 2 names are all stated, and the retry-once is reconciled with the existing
stop rule instead of contradicting it.

### F3: MAJOR. The report's Codex answer is factually wrong (a check that isn't looking)

Evidence: C2-report.md, answer 2, says: "No. ... `.codex-plugin/` contains only
`plugin.json`; there is no Codex mirror of `skills/decisions/` ... anywhere in this tree."
But:
- `.codex-plugin/plugin.json` line 5 is `"skills": "./skills/"`. The Codex plugin ships
  this same skills directory, decisions included. The builder's
  `grep -r "decisions" .codex-plugin` could not find that, because the file names the
  directory, not the skill.
- skills/decisions/SKILL.md:264-273 (`### Copied layout`) documents "A copied Codex skill
  at `~/.agents/skills/decisions`".
- On this host, `ls -la ~/.agents/skills` shows
  `decisions -> /home/ben/Code/claude-delegation/skills/decisions`, which is a live Codex
  mirror.

So a Codex mirror exists and carries the same instruction text. Whether it can *post*
depends on something the report never checked: a host-level
`~/.claude/scripts/notion.js` with `edit --safe`, plus a Notion key in the Codex
process's environment. On this Linux host, the deployed `~/.claude/scripts/notion.js`
(30467 bytes, Aug 17) has no `--safe` flag and no exit-3/4 mapping
(`grep -n -- "--safe\|exit(3\|exit(4"` found nothing). The chezmoi source copy (Sep 21)
has `--safe` at line 1301. That gap would block a Claude lane on this host too. It is
host deployment state outside C2's files, but it is exactly the kind of fact the "state
plainly" answer has to carry.

Fix (report only, no code). Rewrite answer 2 and the matching "Codex" paragraph along
these lines: "A Codex mirror exists (plugin.json `skills: ./skills/`, and
`~/.agents/skills/decisions`, a symlink here, a copied layout elsewhere per
decisions/SKILL.md:264-273), and it carries this same rule. Posting depends on
`notion.js edit --safe` being deployed on the Codex host with a Notion key in the Codex
environment. Not verified on any Codex host. On this host the deployed notion.js lacks
`--safe`. Until verified, treat Codex posting as unsupported: the fallback in
team-build/SKILL.md:261-263 applies." If you can determine an answer, give it; if not,
say "could not determine" and say what you tried.

### F4: MINOR. The rule is conditioned on a push that team-build/SKILL.md never instructs

Evidence: `grep -n -i push skills/team-build/SKILL.md` matches only line 256, the new
paragraph. Neither Ship nor the Accept turn tells the lead to push. As written, "After
that `accept --census` ... succeeds and the branch is pushed" makes the push a
precondition rather than a step, so a lead who never pushes never meets the trigger.

Fix (mechanical). In skills/team-build/SKILL.md:256-257:

Current:
```
After that `accept --census` (or `--no-census`) succeeds and the branch is pushed, the
lane lead posts its own merge item for that branch to the owner's decisions page —
```
Replacement:
```
After that `accept --census` (or `--no-census`) succeeds, push the branch with its
accepted record; then the lane lead posts its own merge item for that branch to the
owner's decisions page —
```
Predicted outcome: push becomes an explicit step in the order the attack brief asks for.
This matches F1's Accept-turn wording. It is outside the work-record test's census slice.

### F5: MINOR. Unknown must not become a number: the evidence line has no rule for a waived census or a missing four-numbers line

Evidence: team-build/SKILL.md:256 explicitly allows `--no-census`, and a record on a base
without `--four-read` has no `Four numbers:` line. The shape paragraph
(decisions/SKILL.md:58-59) still requires "the record's four numbers and the census's
lead-turns figure" with no instruction for when either is absent. A lead is then invited
to estimate one. That is the failure class of an unknown rendered as a confident number,
on the one line Ben acts on without re-verifying.

Fix (mechanical). In skills/decisions/SKILL.md:58-59:

Current:
```
two-line evidence entry carrying the record's four numbers and the census's
lead-turns figure; options merge-now / merge-and-release / hold; and `No default:
```
Replacement:
```
two-line evidence entry carrying the record's four numbers and the census's
lead-turns figure, copied, never recomputed (either one absent, from `--no-census` or a
record with no `Four numbers:` line, is written `unmeasured`, never estimated); options
merge-now / merge-and-release / hold; and `No default:
```
Predicted outcome: skill-text.test.mjs stays green, since no asserted literal is touched
and no line starts with `**`.

### F6: MINOR. The report undercounts the gate's test files

Evidence: the report says the grep found "exactly two matches". But
scripts/native-package.test.mjs:44-58 reads `skills/<skill>/SKILL.md` for every bundled
skill, team-build and decisions included (it asserts closed frontmatter with name and
description). The report's grep matched literal paths only, so this file was missed. It
passes against this diff (I ran it; see Gate).

Fix (report only). Name native-package.test.mjs as the third reading test, and record its
pass in the gate evidence after the F1/F2/F4/F5 edits.

## Re-review scope

The next round needs only:
- the three C2 files' diffs
- skill-text.test.mjs (full), plus the two named tests in work-record.test.mjs and
  native-package.test.mjs
- the corrected report answer for F3
