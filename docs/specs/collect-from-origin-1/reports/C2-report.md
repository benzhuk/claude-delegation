VERDICT: PASS

# C2 report — lane posts its own merge item (round 2, fix round)

Worktree: /home/ben/Code/wt-collect-from-origin-1-C2, branch build/collect-from-origin-1-C2.
Round 1 commit (reviewed): 3ff5635fbca0433981851fc63eb059afab06e56b.
This round's commit: 1468a6303fda1972e1ac103c9835fb7db4cc886b (`git rev-parse HEAD`, run
fresh after the commit below).

Reviewer report applied in full:
/home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/reports/C2-review.md
(VERDICT: NEEDS_FIXES (6), MAJOR 3 / MINOR 3). All six findings addressed this round:
F1, F2, F4, F5 as code edits; F3, F6 as report corrections (no code change — the
reviewer's fixes for those two are report-only).

## Files touched this round (same three, no new files)
- skills/team-build/SKILL.md
- skills/decisions/SKILL.md
- skills/decisions/templates/decision-item.md — unaffected this round; the reviewer
  raised no finding against it, so it is byte-identical to round 1's committed version.

## F1 — the loop's Accept turn now carries the same step as Ship's by-hand path

Before (skills/team-build/SKILL.md, the loop's Accept-turn sentence, ending the
`work-record.mjs accept` paragraph):
```
(`--no-census "<reason>"` only when the census itself breaks) and send ONE RESULT.
```
After:
```
(`--no-census "<reason>"` only when the census itself breaks), push the branch, post its
merge item to the decisions page (Ship), and only then send ONE RESULT.
```
This is the reviewer's exact mechanical fix (C2-review.md F1). Both accept sequences —
Ship's by-hand path and the loop's Accept turn — now name push, then merge item, then
RESULT, in the same order.

Verified not to touch work-record.test.mjs's census slice (work-record.test.mjs:1815-1827,
which anchors on "Run the census at accept time" well before this sentence): re-ran that
test by name after the edit, still passes (see Gate below).

## F4 — the push is now an explicit step, not a precondition of the trigger

Before (skills/team-build/SKILL.md, Ship section, immediately after the census-command
paragraph ending "...see `docs/census.md`."):
```
After that `accept --census` (or `--no-census`) succeeds and the branch is pushed, the
lane lead posts its own merge item for that branch to the owner's decisions page —
```
After:
```
After that `accept --census` (or `--no-census`) succeeds, push the branch with its
accepted record; then the lane lead posts its own merge item for that branch to the
owner's decisions page —
```
This is the reviewer's exact mechanical fix (C2-review.md F4). "the branch is pushed"
(a precondition a lead could silently never meet) becomes "push the branch" (an
instructed step), matching F1's wording in the loop's Accept turn.

## F2 — the decisions paragraph states the two-writers rule itself instead of pointing at a rule that isn't there

Before (skills/decisions/SKILL.md, end of the new merge-item paragraph):
```
merges to main take your word per item`. It is one more item through the same
anchored-edit route, never a second writer at once: the fresh-read, one-anchored-edit,
retry-once-on-a-changed-anchor rule just above applies to it exactly as to any other
write.
```
After:
```
merges to main take your word per item`. Two writers never edit the page at once: read
the page fresh seconds before the write, make one `notion.js edit --safe` anchored edit,
then reread it and confirm with `scripts/decisions-read.mjs` that the item is there. If
the anchor changed (exit 3), the pass stops as above; reread fresh and retry once with a
new anchor taken from those fresh bytes, never the same edit blind. A second exit 3, or
any exit 4, leaves the item unposted and the RESULT carries its text verbatim.
```
This is the reviewer's exact mechanical fix (C2-review.md F2). Confirmed by grep before
writing: no "retry-once" or "second writer" rule exists anywhere else in
skills/decisions/SKILL.md (`grep -n -i 'retry\|changed anchor\|two writers\|second
writer\|reader check\|at once' skills/decisions/SKILL.md` — only this new paragraph and
line 310's unrelated goals-mirror sentence match). The new sentence states the rule in
full (fresh read, one anchored edit, reader check via `decisions-read.mjs`, retry once on
a changed anchor, stop on a second failure) rather than citing an absent "rule just
above."

## F5 — an absent four-number or census figure is written `unmeasured`, never estimated

Before (skills/decisions/SKILL.md, inside the same paragraph, the evidence-line clause):
```
two-line evidence entry carrying the record's four numbers and the census's
lead-turns figure; options merge-now / merge-and-release / hold; and `No default:
```
After:
```
two-line evidence entry carrying the record's four numbers and the census's
lead-turns figure, copied, never recomputed (either one absent, from `--no-census` or a
record with no `Four numbers:` line, is written `unmeasured`, never estimated); options
merge-now / merge-and-release / hold; and `No default:
```
This is the reviewer's exact mechanical fix (C2-review.md F5). Closes the path where
Ship's own `--no-census` allowance, or a record with no `Four numbers:` line, would
otherwise invite a lead to estimate a number on the one line Ben acts on without
re-verifying.

## F3 — corrected: a Codex mirror of the decisions skill does exist, and this host's deployed `notion.js` cannot post today

Round 1's report answered "No... there is no Codex mirror of `skills/decisions/`...
anywhere in this tree," based on `grep -r "decisions" .codex-plugin` finding nothing. The
reviewer showed that grep was looking in the wrong place (a check that isn't looking):

- `.codex-plugin/plugin.json` (this worktree) line 5: `"skills": "./skills/"` — the
  Codex plugin ships this exact skills directory, decisions included, by directory
  reference, not by naming the skill in the manifest text.
- `skills/decisions/SKILL.md:264-273` (`### Copied layout`) documents a second delivery
  path: "A copied Codex skill at `~/.agents/skills/decisions`."
- On this host: `ls -la ~/.agents/skills/decisions` shows
  `decisions -> /home/ben/Code/claude-delegation/skills/decisions` — a live symlink, so a
  Codex session reading its own skills tree on this host reads this exact file,
  including this round's F2/F5 fixes, byte for byte.

So the corrected answer: a Codex mirror of the decisions skill exists and carries this
same instruction text (both by the plugin's `skills: ./skills/` reference and by the
`~/.agents/skills/decisions` symlink on this host). Whether a Codex lane can *post* the
item is a separate question the round-1 report never checked: it depends on the deployed
`notion.js edit --safe` flag and a Notion key in the Codex process's environment, not on
whether the skill text exists.

Checked on this host:
- `~/.claude/scripts/notion.js` (30,467 bytes, Aug 17) — `grep -n -- "--safe\|exit(3\|exit(4"
  ~/.claude/scripts/notion.js` finds nothing; `grep -c -- "--safe" ~/.claude/scripts/notion.js`
  = 0. This deployed copy has no `--safe` flag and no exit-3/exit-4 mapping.
- `~/.local/share/chezmoi/dot_claude/scripts/notion.js` (the chezmoi source, newer,
  Sep 21) does have `--safe` (line 1301: `else if (a === "--safe") flags.safe = true;`,
  plus usage text at lines 1332-1337 and the pre-check comment at line 570). This source
  copy has not been deployed to `~/.claude/scripts/notion.js` on this host.

That gap is host deployment state, outside C2's three files and outside this territory's
scope to fix — but it is exactly the fact the "state plainly" instruction asks for.
Conclusion, stated plainly: a Codex mirror of the decisions skill exists on this host and
elsewhere per the plugin manifest, and it carries this round's rule; whether it can post
the item depends on `notion.js edit --safe` being deployed on the Codex host with a
Notion key in the Codex process's environment — not verified on any actual Codex host,
and on this Claude host specifically, the deployed `notion.js` lacks `--safe`, so posting
would fail here too if attempted through this deployed copy. Until a Codex host is
verified to have `--safe` deployed, treat Codex posting as unsupported: the fallback
already written in team-build/SKILL.md's Ship section applies (the Codex lane's RESULT
carries the merge item text verbatim, so the collector still finds the branch from the
pushed record).

## F6 — corrected: three test files read the C2 territory, not two

Round 1's grep matched literal file paths only and missed one reader. Re-checked this
round:
- `skills/decisions/scripts/skill-text.test.mjs` — reads `skills/decisions/SKILL.md`
  directly (`readFileSync(... '../SKILL.md')`).
- `scripts/work-record.test.mjs` — reads `skills/team-build/SKILL.md` directly
  (work-record.test.mjs:1816).
- `scripts/native-package.test.mjs` — iterates every bundled skill directory
  (`fs.readdirSync(path.join(ROOT, 'skills'), ...)`, native-package.test.mjs:45-52) and
  `readFileSync`s each one's `SKILL.md`, asserting a closed frontmatter block with `name`
  and `description`. Both `skills/team-build/SKILL.md` and `skills/decisions/SKILL.md`
  are in that iteration; this round's edits sit well inside the body, below the
  frontmatter block, so this assertion is unaffected.
- No test file anywhere reads `skills/decisions/templates/decision-item.md` — this part
  of round 1's finding stands unchanged (a genuine "not found," not a gap introduced by
  either round).

## Gate

Brief's pinned Gate command, run verbatim after this round's edits, output at
docs/specs/collect-from-origin-1/reports/C2-gate.log:
```
node --test skills/decisions/scripts/skill-text.test.mjs
```
tail: `tests 10`, `pass 10`, `fail 0`.

Reviewer's named re-review scope, all three run this round:
1. `node --test skills/decisions/scripts/skill-text.test.mjs` — 10/10 pass (above).
2. `node --test --test-name-pattern='SKILL.md|bundled skill' scripts/work-record.test.mjs
   scripts/native-package.test.mjs` — `tests 2`, `pass 2`, `fail 0`:
   - `every bundled skill has a closed frontmatter block with name and description`
   - `skills/team-build/SKILL.md: the census command in the acceptance section names
     build-census.mjs with --lead, --marker and --out, run after the last review's Log
     line`
3. `node --test scripts/native-package.test.mjs` in full (no name filter) — `tests 3`,
   `pass 3`, `fail 0` (this file has no `mkdtemp`/tmp-dir dependency, so the host's
   shared-`/tmp` inode pressure the reviewer flagged does not apply to it).

Did not attempt a full unfiltered run of `work-record.test.mjs` this round: `df -i /tmp`
still shows the shared tmpfs at 1,048,506-1,048,507/1,048,576 inodes used (69-70 free,
same host condition the reviewer identified as pre-existing and unrelated to this diff),
and pointing `TMPDIR` at the scratch folder does not help — the scratch folder resolves
to the same tmpfs mount. The name-filtered run above exercises the one
work-record.test.mjs test that actually reads a C2 file, without needing the fixture
helper's temp directories that the other, unrelated tests in that file use.

## Deviations / assumptions
- None beyond the reviewer's own fixes: all four code edits (F1, F2, F4, F5) are the
  reviewer's exact proposed replacement text, applied verbatim at the exact anchors
  named in C2-review.md.
- decision-item.md is untouched this round (no finding against it).
- Never set a git identity, never pushed, never touched `docs/work/`, never sent a peer
  note, no destructive git — only `git add`/`git commit` on the two files this round
  actually changed (team-build/SKILL.md, decisions/SKILL.md).

Sha: 1468a6303fda1972e1ac103c9835fb7db4cc886b
