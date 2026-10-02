VERDICT: APPROVE fbe5c591b22a552244a0ea40d8aa02a4a5c2edad
Reviewed head: fbe5c591b22a552244a0ea40d8aa02a4a5c2edad (branch build/decisions-toggles-72-toggles72; the reviewer ran `git rev-parse HEAD` in the territory worktree, and the worktree is clean). Round 3 is a delta review of 4aaa8329..fbe5c591: one commit, 4 files, +23 and -6 lines.

# Review: toggles72, round 3

## What I ran
- **Focused gate.** I ran all 11 files from the territory brief, from the territory worktree. The log is in my scratch folder, not the repo. Result: tests 698, pass 698, fail 0, cancelled 0, leak check 0. This matches the builder's fix3 report: 696 tests plus 2 new ones.
- **Diff read in full.** It touches decisions-render-sections.mjs (2 lines), decisions-render.test.mjs (+1 test), skills/notion-writing/SKILL.md (4 lines) and page-lint.test.mjs (+1 test). All four files are inside the write set.
  - docs/goals/card.md is not touched.
  - The commit author is Ben Zhuk. There is no Co-Authored-By line, no AI byline and no Claude mention.
  - No test does network I/O or a Notion write. The new tests call `parseBearings` and `lintPage` only.
- **Mutation checks.** I ran these on a `git archive` export of HEAD in scratch, never on the worktree. I restored each file and checked it with `cmp`. Every mutation turned a test red:
  - M1: I removed `&& !m[1].includes('|')` (decisions-render-sections.mjs:131). Red: "Bearings toggle: an unfilled template line is not a value (Decision with alternatives, bracketed Prediction)". Result 129 pass, 1 fail.
  - M2: I removed `|| /^\[[^\]]*\]$/.test(text.trim())` (decisions-render-sections.mjs:138). Red: the same test, 129 pass, 1 fail.
  - M3: in the new page-lint test, I renamed the heading to `# Waiting on you`. Red: "decisions page: the hand-written shape notion-writing section 7 describes is clean ...". Result 65 pass, 1 fail.
  - M4: in the same test, I replaced the Goals toggle with a column-0 `> 🎯 goals link` callout. Red: the same test, 65 pass, 1 fail.
- **Real bearings pairs.** I ran `parseBearings` on every dated pair in docs/work/evidence (scratch probe). The results are unchanged from round 2:
  - 09-25 parses as RE-PLAN, 09-29 as RE-PLAN and 10-01 as CONTINUE.
  - 09-24 refuses with no `Next action:`.
  - 09-26 refuses with no Check on or Prediction line.
  - No real `Decision:` line contains `|`. I grepped all seven assessments.
- **Render.** `decisions-render.mjs render --repo .` exits 0. The top-level headings are, in order: Goal card, Bearings, Components, Waiting on you now and History.
- **Stale heading name.** I grepped skills/, hooks/ and scripts/ for `Waiting on you` not followed by `now`. There are no hits in notion-writing/SKILL.md, decisions/SKILL.md, references/page-shape.md or templates/decisions-page.md. The remaining hits are all outside this round's diff and correct:
  - the masked legacy skeleton fixture and mask-fixture.mjs;
  - page-lint.mjs:418 and :464, prefix regexes that also match "now";
  - two page-lint tests of the legacy shape.

## Prior findings, verified
- **B3 (the hand-written decisions page fails page-lint): FIXED.** In skills/notion-writing/SKILL.md, line 89 (rule 9), line 90 (rule 10) and line 139 (section 7) now say `# Waiting on you now {toggle="true"}`.
  - Section 7's two column-0 callouts are now `# 🎯 Goals {toggle="true"}` and `# How to read {toggle="true"}`.
  - Done is the last block inside the Waiting on you now toggle.
  - Line 104 also says "Waiting on you now", so the skill now uses one name throughout.
  - The optional regression test exists at page-lint.test.mjs:288-297, and M3 and M4 show that it discriminates.
  - The rule-id test ("SKILL.md names every rule id ...") is still green.
- **N5 (an unfilled template line is read as a value): FIXED** for the two named fields, Decision and Prediction. The fix is at decisions-render-sections.mjs:131 and :138, applied verbatim from the round-2 patch. The test is at decisions-render.test.mjs:1144-1148, and M1 and M2 confirm it with mutations. A twin remains open: see N7.
- **N6 (the renderer's own `Prediction, check 10/7 3:00 PM:` shape is refused by the fallback): STANDS as a NOTE.** The builder recorded it in fix3 next to the lead's open question about `--clear-done`. It fails safe: it refuses and invents nothing.
- **N4 (the live Notion readback): STANDS.** It is for the lead after merge.

## Scope items (status at fbe5c591)
1. **PASS.** The three toggles regenerate from files on every render. Tests in decisions-render.test.mjs:
   - "toggles: the page opens with Goal card, Bearings, Components ..."
   - "rendering twice ... same bytes"
   - the Goal card tests
   - the Bearings tests: the missing-field refusal; "an unfilled template line is not a value" (new); "a pair shaped like the bearings skill template parses"; and the unpaired-newest test.
2. **PASS.** The components guard fails publish and render on a nonexistent path. Tests: "Components guard: ... refuses" and "Components: a stale path outside the 4th field, or a line that is not a component, refuses". This round did not change it.
3. **PASS.** The card-toggle stale-sha check in decisions-handback is unchanged this round, and its round-1 tests are green.
4. **PASS** for what fixtures can show. The composed page is clean under the render's own lint call, and the render exits 0. The live read is out of scope.
5. **PASS.** The fixtures are in skills/decisions/scripts/fixtures/toggles-fixtures.mjs. Unchanged this round.
6. **PASS.** The page-lint `top-level-toggle` rule and its tests are green. The notion-writing hand-written shape now passes lint. Test: page-lint.test.mjs:288 "decisions page: the hand-written shape notion-writing section 7 describes is clean ...", which is mutation-confirmed.
7. **PASS.** Done is last inside Waiting on you now, and the legacy column-0 layout still parses. Unchanged this round, and the gate is green.
8. **PASS.** The shape rule appears once, with Ben's words, in skills/decisions/SKILL.md. Unchanged this round.

## Findings

### N7 NOTE: an unfilled `Next action:` still parses as a value (a twin of N5)
Evidence:
- The bearings template says `- Next action: [one concrete action or owner decision]` (skills/bearings/references/evidence-template.md:33).
- My probe gave `parseBearings('# B\n- Decision: \`CUT\`\n- Next action: [one concrete action or owner decision]\n- Prediction: x by 10/3.\n', '', 'p')` and got OK, with nextAction `[one concrete action or owner decision]`.
- The `field()` helper at decisions-render-sections.mjs:151 does not check whether the value is a pointer or placeholder.
- The risk is low. A fully unfilled template now refuses on Decision first. Only a partly filled assessment would publish the bracket text, and that text is visibly a placeholder, not an invented fact.

Optional patch for decisions-render-sections.mjs:
- Current: `  if (nextAction === null) throw new RefusedError(\`bearings ${date}: no "Next action:" line in the assessment\`);`
- Replacement: `  if (nextAction === null || /^\[[^\]]*\]$/.test(nextAction)) throw new RefusedError(\`bearings ${date}: no "Next action:" line in the assessment, or it is the unfilled template text\`);`

Predicted result: the probe refuses. The real 09-25, 09-29 and 10-01 pairs are unchanged, because none has a bracket-only next action. The existing "a missing field refuses" test still matches, if it checks `/Next action/`.

### N8 NOTE: a prose `|` on a filled Decision line now refuses
- My probe gave `- Decision: \`CONTINUE\`. Covers a | b.` and got REFUSE: no decision found.
- This fails safe: it refuses and invents nothing. No real assessment has a `|` on its Decision line.
- A tighter guard, if it ever bites: `!/\`\s*\|\s*\`/.test(m[1])`. It matches only the template's backticked alternation.
- No change is needed for merge.

## Areas checked and clean
- The SKILL.md edits change no rule id, and skill-text.test and the page-lint rule-id test are green.
- The new page-lint test builds the Waiting toggle children with the same tab-indent helper as `decisionsPage`, so the fixture shape is consistent.
- The worktree had no modifications before or after this review. I wrote nothing in it.

## C4 fields
Cause: In round 2, the notion-writing rules 9 and 10 and section 7 named the Waiting heading `Waiting on you` and kept column-0 callouts. page-lint's done-last rule only recognises `Waiting on you now` (page-lint.mjs:490), and top-level-toggle forbids column-0 blocks. Separately, the bearings parser accepted the template's unfilled Decision and Prediction lines as values.
Discriminating check: `lintPage` on the section-7 shape gives `[]` at fbe5c591, and goes red when the heading is renamed (M3) or a callout is restored (M4). `parseBearings` refuses the unfilled-template probes, and goes red when either guard is removed (M1 and M2).
Fix location: skills/notion-writing/SKILL.md:89, :90, :104 and :139 (text); decisions-render-sections.mjs:131 and :138; tests at page-lint.test.mjs:288 and decisions-render.test.mjs:1144.
Simplification: One heading name, `Waiting on you now`, is now used across the render, the hand-written page, page-lint and decisions-read. Placeholder text is treated as absent rather than as a value.
