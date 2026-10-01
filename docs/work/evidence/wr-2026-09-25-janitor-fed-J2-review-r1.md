VERDICT: APPROVE 2a60f32b33c632101474e8557f76030e2678f234

# J2 review, round 1: the skill and the mirror

Work: wr-2026-09-25-janitor-fed-j2
Worktree: C:/Users/benzh/Code/janitor-fed/wt-j2 (branch build/janitor-fed-1-j2)
Reviewed sha: 2a60f32b33c632101474e8557f76030e2678f234 (from `git rev-parse HEAD`, run by me in the worktree)
Diff reviewed: HEAD~1..HEAD (ac9c842..2a60f32): 3 files, +22 / -5, matching the builder's stat.
Working tree after review: `git status --short` is empty. I made no writes to the reviewed tree.

JUDGMENT: J2 cannot make the janitor remove anything, since it touches no janitor code. Its skill text tells the truth about the cadence, the flags and the mirror. One sentence, copied word for word from the spec, overlaps with the SAFE definition when read literally (F1). The integrator has to reconcile it with whatever discriminator J1 actually lands.

## Gate (I ran it myself)
- `node --test scripts/mirror-shared-skills.test.mjs scripts/mirror-prereq.test.mjs`: tests 15, pass 15, fail 0.
- Cross-check `node --test scripts/native-package.test.mjs`: 3/3 pass. That covers the janitor frontmatter and the `skills/` listing at scripts/native-package.test.mjs:50.
- Mutation check on a scratch copy (git archive of HEAD, outside the reviewed tree): I removed `'janitor'` from `PLUGIN_SKILLS`, and mirror-shared-skills.test.mjs went to 9 pass, 2 fail:
  - `janitor must be in PLUGIN_SKILLS (lane five, J2)`
  - `janitor did not resolve to any skill source at all`
  So the test pins the change, twice.

## Attack brief answers (verified absences are findings)
1. **The cadence sentences match the spec.** They do. At skills/janitor/SKILL.md:106-107 the integrator runs `janitor --record` "and then" `janitor --apply`, "in that order", after every accepted build, and pastes the JUDGMENT table into the RESULT. At :107-108 a Sonnet runner does the same once a day per host from the main checkout. At :108-111 JUDGMENT goes to the owner's decisions page as ONE item with a recommendation per line, "never as several separate asks". That is consistent with the existing single batched pass at :76-79, with no contradiction.
2. **UNSTARTED and the age floor are one sentence each.** They are, at :60-62 and :63-64, each a single sentence. UNSTARTED carries the label `unstarted (tip is main)`, the worktree's age, "never as SAFE and never as merged". The age floor carries "`--min-age-hours` (default 6)", "never SAFE, whatever else is true" and "reported with its age". See F1 for a problem with the wording.
3. **The flag names match J1's spec.** `--record`, `--apply` and `--min-age-hours` are spelled exactly as spec Territory J1 items 2 and 4 spell them. No other flag names were invented. J1 has no commits yet (wt-j1 is at ac9c842 with a clean tree), so this checks against the spec, not against J1's code.
4. **The mirror change is only a name added to a list.** Confirmed. scripts/mirror-shared-skills.mjs:77 appends `'janitor'` to `PLUGIN_SKILLS`, and nothing else in the file changed. skills/janitor/SKILL.md has no `../_docs/` relative links, so no shared-docs inventory change is needed. The `<plugin>/scripts/janitor.mjs` placeholder at :10 follows the same convention as the other mirrored skills (skills/multi/SKILL.md:81, :271).
5. **A test pins it.** Confirmed by the mutation check above.
6. **Out-of-bounds files.** README.md, skills/team-build/** and scripts/janitor.mjs are all untouched (diff stat).

## Findings

### F1: MINOR (fix at integration, once J1 lands). Read literally, the UNSTARTED sentence covers every SAFE branch.
- Evidence: skills/janitor/SKILL.md:60-61 says UNSTARTED is a tip that "equals `origin/<main>`'s tip (or has zero commits not on it)". skills/janitor/SKILL.md:40-41 and :45 say that SAFE requires the branch to be merged, with `origin/<main>` containing its tip. A branch whose tip `origin/<main>` contains is a branch with zero commits not on `origin/<main>`. Read literally, the two sets are the same, and the skill implies that SAFE can never be non-empty.
- Why this does not block J2: the parenthetical is word for word from the binding spec (Territory J1 item 1 and Territory J2 item 1). The builder followed it. Which discriminator actually separates "never started" from "merged" (for example first-parent membership on main, or the branch never having moved since it was cut) is J1's design decision, and J2 cannot know it yet.
- Fix: when J1 lands, the integrator rewrites the parenthetical to describe J1's real test. If J1 treats UNSTARTED as "no commits of its own since it was cut", the exact edit is:
  - old: `whose tip equals \`origin/<main>\`'s tip (or has zero commits not on it)`
  - new: `whose tip equals \`origin/<main>\`'s tip (or that has no commits of its own since it was cut from main)`
  - Predicted outcome: the skill no longer implies that SAFE is always empty, and the J1 reviewer's reading of "merged vs unstarted" matches the text.
- If J1 instead implements the literal spec wording, the J1 review should flag that SAFE can never fire. Either way, the integrator must not merge without reconciling this one phrase.

### F2: MINOR (outside J2's Owns; the integrator or lead should apply it). codex/README.md lists the mirrored set without janitor.
- Evidence: codex/README.md:30 has `` `skills/{multi,delegate,team-build,decisions,notion-writing,dev-server,bearings,continue}` ``. After this change the mirror also publishes `janitor`, so the Codex doc now understates what gets published.
- Fix (mechanical, codex/README.md:30):
  - old: `` `skills/{multi,delegate,team-build,decisions,notion-writing,dev-server,bearings,continue}` ``
  - new: `` `skills/{multi,delegate,team-build,decisions,notion-writing,dev-server,bearings,continue,janitor}` ``
- The J2 brief scoped the builder to three files, so this is not a builder defect. It is doc drift that the integration commit should close.

### F3: NIT. The flags paragraph does not name `--record` or `--min-age-hours`.
- Evidence: skills/janitor/SKILL.md:71-75 describes `--apply` and `--json`. `--record` appears only in the Cadence section (:106), and `--min-age-hours` only in the JUDGMENT bullet (:63). Neither the default record directory (`docs/work/evidence/janitor/`) nor what a record writes (`<dir>/<date>-<host>.json` plus a `drift.md` line) is stated anywhere in the skill.
- Fix (optional, after J1 lands, one sentence after :75): "`--record [dir]` also writes `<dir>/<YYYY-MM-DD>-<host>.json` and appends a line to `<dir>/drift.md` (default dir `docs/work/evidence/janitor/`); `--min-age-hours N` sets the age floor (default 6)." The spec does not require this of J2.

## Counts
BLOCKER 0, MAJOR 0, MINOR 2 (F1, which is conditional on integration, and F2, which is outside the territory), NIT 1.
