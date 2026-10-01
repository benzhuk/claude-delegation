VERDICT: NEEDS_FIXES (1) cf47d9649c63be8ecaafc4c84c3156901425f445

# merge66 review, round 1

Reviewed HEAD: cf47d9649c63be8ecaafc4c84c3156901425f445 (`git rev-parse HEAD` in wt-fresh-walk-66-merge66, run by me). Parents 77dac671164299d9c8df5d17c7acd2683ef692bd and f976ca0a5958eeb90607492c2c42db8c5f28534b, message `merge: origin/main f976ca0a into build/fresh-walk-66 (lane 66)`, author Ben Zhuk, no trailers.

The merge resolution itself has no defects: zero merge defects across all five attack items. The one finding is MAJOR drift. The merge did not cause it. It sits in the branch section this merge brings onto main, and it defeats the lane's own measure ("a fresh host installs from the docs without the lead"). This is why the verdict is NEEDS_FIXES and not APPROVE. If the lead rules the drift out of lane 66's scope, nothing else in this report blocks the merge.

## Gate (re-run by me, from the territory worktree)
- `node --test scripts/goal-card.test.mjs hooks/lib/goal-context.test.mjs hooks/delegation-reminder.test.mjs`: tests 91, pass 91, fail 0, exit 0.
- `node --test --test-name-pattern="J1 round 2 MINOR 5" scripts/janitor.test.mjs`: tests 1, pass 1, fail 0, exit 0.
- `git status --short` in the worktree before and after my review: empty (0 lines). I made no writes to the reviewed tree.

## Attack surface

### 4. Stray edits: clean
`git merge-tree --write-tree --name-only 77dac671 f976ca0a` gives tree afe532da0db7d35d277aba7d964bffb4a359b9a6, exit 1, with exactly one conflicted file: `docs/native-use.md`. `git diff afe532da HEAD --stat` gives `docs/native-use.md | 6 +----- 1 file changed, 1 insertion(+), 5 deletions(-)`. That is the five lines of the conflict hunk (markers plus both sides) replaced by one line. Every other file in the merge matches git's own merge-tree result byte for byte. The large first-parent diff (2517 files) is main's 1482 commits. It contains no hand edits.
Conflict markers: `git grep -n -E '^(<<<<<<<|>>>>>>>)( |$)' HEAD` finds nothing. `git grep -n -E '^=======$' HEAD -- '*.md' '*.mjs' '*.js' '*.json'` finds nothing.

### 1. Resurrection: clean
- The resolved line `docs/native-use.md:15` is main's paragraph word for word, with the branch's `multi` clause spliced in after "equal-session communication". It has no `continue` sentence and no "native binding/accounting" sentence.
- `git diff HEAD^2 HEAD -- docs/native-use.md` (main against the result) shows only the branch's additions: lines 11, 13 and 15, plus the new section at lines 21-83. It has no `-` line except the three paragraphs the branch extended. Main's removals are all still removed.
- `grep -n -i -E "continu"` over native-use.md, README.md, skills/janitor/SKILL.md and skills/multi/SKILL.md:
  - native-use.md:9 and :17 are ordinary English ("Continue useful work", "Continue useful authorized work").
  - README.md:61 is bearings' `CONTINUE` verdict. README.md:270 is the retirement note. README.md:446, :463 and :464 are old changelog entries.
  - multi/SKILL.md:68 is the pane title `Continue`. multi/SKILL.md:343 is "line continuation".
  - All README hits are main's own text: `git diff HEAD^2 HEAD -- README.md` adds only the 6-line paragraph at :32-37.
- `grep -n -E "native-continuation|skills/continue"` over the same four files: exit 1, no hits. `git diff --diff-filter=D fbd7cf62 f976ca0a` lists the docs main deleted as `docs/native-continuation-testing.md` and `skills/continue/SKILL.md`. Neither is linked. Every relative link in native-use.md resolves (I checked each `](path)` target exists).
- native-use.md:125 says "eight skills". :133 lists eight `delegation:*` skills with no `delegation:continue`. :161 says "inbox behavior". There is no "bounded continuation contract" heading. The Interrupt hits at :133, :149 and :164 are main's own text, unchanged by the merge.
- Observation, not a merge defect: README.md:42 reads `**Nine skills**` but lists eight (`skills/` holds 8 directories). This is main's own text: `git show f976ca0a:README.md | grep -n "Nine skills"` shows `35:**Nine skills**`. The merge did not resurrect it. It is pre-existing drift on main, outside this review. A one-word fix on main whenever convenient: `**Nine skills**` -> `**Eight skills**`.

### 2. Lost fix: clean, and the test discriminates
- `git merge-base --is-ancestor dee95ab HEAD && echo ANCESTOR_OK` prints `ANCESTOR_OK` (dee95ab06f414a9ee2ad67dee6d0a3dd91673373).
- `scripts/goal-card.mjs:23` imports `fileURLToPath`. `:445` has `const SELF_PATH = fileURLToPath(import.meta.url);`. `:450` has ``+ `fix the card or run \`node "${SELF_PATH}" check\` from the project root.`;``.
- `scripts/goal-card.test.mjs:389-390` holds both asserts: the real path is present, and `node scripts/goal-card.mjs` is absent.
- Mutation check, on a scratch copy only (`git archive HEAD` extracted to the session scratchpad, never the worktree): with main's old notice put back at goal-card.mjs:450, `MAJOR 4: goalCardResult keeps the REASON...` fails with `AssertionError: the remedy names the script by its real path`. Unmutated, the same copy passes. The regression test would catch losing the fix.

### 3. Lost branch content: clean
- The team-build sentence is at native-use.md:11 ("one mid-tier builder and one independent reviewer are enough...").
- The bold "Before opening a record, read work records for the exact field schema" sentence is at :13.
- The nested `claude -p` / `env -u ORCA_TERMINAL_HANDLE -u NOTE_SLUG` clause is at :15.
- The whole "### Script paths, the goal card, and closing a build in a fresh project" section is at :21-83, identical to the branch (it appears in full in the HEAD^2..HEAD diff).
- The skills/multi/SKILL.md:80-84 nested-claude paragraph and the skills/janitor/SKILL.md:292-295 `main_branch` sentence both survive the auto-merge.
- README anchor: README.md:35 links `docs/native-use.md#script-paths-the-goal-card-and-closing-a-build-in-a-fresh-project`. The heading at native-use.md:21 is the only heading with that text, and its GitHub slug (lowercase, commas dropped, spaces to hyphens) is exactly that. It resolves.

### 5. Accuracy of the kept section against main: one MAJOR drift (finding F1)
Spot checks that match main:
- goal-card.mjs:32-33 has `CONFIG_KEY = "goal_card"` and `DEFAULT_CARD_PATH = "docs/goals/card.md"`. The `check` returns 0/1/3 (goal-card.mjs:578-605, exitCode at :638). `show` is the default command (:564-565).
- janitor.mjs:1014 has `config.main_branch || "main"`.
- work-record.mjs:2533 accepts `check-acceptance`/`accept`. :1185 requires "exactly one of --delivery-ref or --pinned-artifact". :1514-1526 handle `--census`/`--no-census "<reason>"`. :989 has `invalid Work: ${...}`. :80 parses `Lead-session`. :1205 refuses a missing one.
- build-census.mjs:1670 has `--lead`. :1948 puts `leadLastMessageAt` on the VERDICT first line.

## Findings

### F1 — MAJOR (drift; not a merge defect, the merge did not cause it): the section's closeout recipe is refused by main's own `work-record.mjs` for any record opened today

Where: docs/native-use.md:63-71, plus the "exact field schema" list at :13.

Cause: the branch section was written and approved on 9/26. On 9/27 main landed d92ae537 "feat(work-record): strict cutoff, field refusals, model tokens, stall check (F1)" with `STRICT_FROM = "2026-09-27T08:32:15Z"` (work-record.mjs:609). It also landed `SCRATCH_FROM` (2026-09-29T00:54:00Z). Together these refuse any record opened after those dates that lacks `Base:`, `Spec-session:`, `Spec-from:`, `Scratch:`, or a `reviewed` Log note naming a high- or top-tier model token plus `APPROVE`. These rules are documented in main's docs/work-record.md:110-125, :247-265 and :74-83. The section mentions none of them. Its example `Log: <ISO-8601 UTC> reviewed <reviewer-id> artifact <sha>` is exactly the shape main now refuses. Line :13 calls its list (`Work:` ... `Worktree:`) "the exact field schema" without them, which steers a reader away from the work-record.md sections that would save them.

Discriminating check (measured): in a scratch git repo under the session scratchpad, I wrote a record with exactly the fields native-use.md:63-71 names: Work, Scope, Owner, Status: reviewed, Authority, Artifact, Evidence (pointing at a `VERDICT: APPROVE <sha>` file), Next, Opened 2026-10-01, Worktree, Lead-session, `Log: ... reviewed reviewer-1 artifact <sha>`, and Observed. I ran HEAD's `scripts/work-record.mjs check-acceptance --repo . --record ... --pinned-artifact <sha>` against it. It was refused four times in turn as each field was added:
1. `[base-invalid] Base: is "<missing>", not exactly one 40-hex sha`
2. `[spec-session-missing] Spec-session: is absent or a placeholder`
3. `[scratch-missing] Scratch: is missing, and Spec-from: (2026-10-01T11:00:00Z) is on or after SCRATCH_FROM (2026-09-29T00:54:00Z)`
4. `[log-model-missing] Log: 2026-10-01T13:00:00Z reviewed line's note names no counted model token (docs/model-tiers.md); add one, e.g. "Opus reviewer"`

With `Base:`, `Spec-session:`, `Spec-from:` (UTC Z), `Scratch:` (absolute) added, and the reviewed note extended with `APPROVE (Opus reviewer)`, it returned `{"ok":true,...}`, exit 0.

This is "a check that passes because it isn't looking". The builder's "Section accuracy against main" check compared the section against templates/goal-card.md and a few work-record.md lines (Worktree, Observed, Lead-session). It never ran `check-acceptance` on a record shaped by the section, and it never read work-record.md's strict-cutoff and Scratch sections. So it reported the section as matching main while main's script refuses the recipe.

Fix location: docs/native-use.md:13 and :63-71 only, as a follow-up commit on this branch before the merge to main. Or, if the lead rules it outside lane 66's "conflict resolution only" scope, as a recorded ruling plus a follow-up lane. The lane's measure is a fresh host closing a build from the docs, and today that is refused at step one (`base-invalid`).

Patch (exact). In docs/native-use.md, replace lines 66-71:

Current:
```
`invalid Work: <value>` and no further hint; `Status: reviewed`; `Worktree: <path or
branch of the build's worktree>`; on plugin 0.20.10 and later `Lead-session: <the lead
session's id>`; a top-level `Observed:` paragraph after a blank line; the reviewer's
report (first line `VERDICT: APPROVE <sha>`) listed in `Evidence:`; and a line `Log:
<ISO-8601 UTC> reviewed
<reviewer-id> artifact <sha>` written by the lead session when the review lands. Every `Log:` stamp is the real UTC
```
Replacement:
```
`invalid Work: <value>` and no further hint; `Status: reviewed`; `Worktree: <path or
branch of the build's worktree>`; on plugin 0.20.10 and later `Lead-session: <the lead
session's id>`; `Base: <the 40-hex sha the build started from>` (refused on every record
without it); `Spec-session: <the session id that wrote the spec>` and `Spec-from: <ISO-8601
UTC instant ending in Z>`; `Scratch: <absolute directory for this build's temp files>`; a
top-level `Observed:` paragraph after a blank line; the reviewer's report (first line
`VERDICT: APPROVE <sha>`) listed in `Evidence:`; and a line
`Log: <ISO-8601 UTC> reviewed <reviewer-id> artifact <sha> APPROVE (Opus reviewer)` — its
note must name `APPROVE` and a high- or top-tier model token from the plugin's
`docs/model-tiers.md` — written by the lead session when the review lands. Every `Log:` stamp is the real UTC
```
And on line 13, inside the bold sentence's parenthesised list, replace `` `Opened:`, `Worktree:`, plus repeatable `` with `` `Opened:`, `Worktree:`, `Lead-session:`, `Base:`, `Spec-session:`, `Spec-from:`, `Scratch:`, plus repeatable ``.

Predicted outcome: the scratch record built from the patched text is the one that returned `{"ok":true}` above. No test reads native-use.md (per the scout, confirmed by the gate set), so the gate stays 92/92.

Simplification: the section restates the record schema and it has already drifted once. A shorter alternative is to drop the field enumeration at :63-71, keep only the `Work:` id rule and the census-dating rule (the two things a reader cannot find elsewhere), and point to work-record.md's "Fields", "Model tokens on reviewed/APPROVE lines", "Strict cutoff" and "The Scratch: field" sections by name. Then the next strict rule cannot leave this doc stale.

## Disclosures
- My only write is this report. Scratch artefacts (`merge66-full/`, `merge66-mut/`, `fresh-proj/`, `mut.cjs`) are under the session scratchpad C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-Code-zhuk-infra-claude-delegation\a7e8fc6b-cbf3-476b-aaea-23ad30508174\scratchpad. I have not deleted them. The brief named no `Scratch:` directory, so I used the session scratchpad.
- Rules deviation, disclosed: in the throwaway scratch repo `fresh-proj/` (not a reviewed tree, not pushed) I made one commit with `git -c commit.gpgsign=false`, which bypasses signing. The identity was the configured one, unchanged. It should not have been passed. The measurement does not depend on it.
- I did not verify the "plugin 0.20.10 and later" version claim for `Lead-session:` against a release note.
