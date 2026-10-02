VERDICT: PASS
# toggles72 fix round 2

Gate (11 files): tests 696, pass 696, fail 0, cancelled 0 (log: toggles72-gate.log). Was 693; +3 new tests.

## Applied
- B1 (decisions-render-sections.mjs): newestBearingsDate picks the newest date with both assessment and response files; with assessments but no pair it is BLIND, with no assessment at all it refuses. parseBearings reads the decision from line 1 (bare verdict, or DECISION:/VERDICT: plus verdict), else the first `Decision:` line (list item, `#`-heading or bare; backticks/bold stripped, first word). Prediction: response `Check on <M/D H:MM AM|PM>:` line first, else a `Prediction...:` line in the response, else the assessment's, never a pointer ("see ..."), else refuse. checkDate may be null; the toggle prints `Prediction: <text>` then. Checked on the tree: 2026-09-25, 2026-09-29, 2026-10-01 now parse (decision RE-PLAN, RE-PLAN, CONTINUE); 2026-09-24 still refuses (no Next action line), 09-26 refuses (no prediction text), 09-27/09-28 unpaired. The real 10-01 toggle renders byte-identical to before.
  Tests (decisions-render.test.mjs): "Bearings toggle: a pair shaped like the bearings skill template parses ...", "... an assessment with no response yet does not blind the page ...". Existing missing-response test still BLIND.
- B2 (skills/notion-writing/SKILL.md): rules 9, 10, 11 and the section 7 hand-written bullet now say `# Waiting on you {toggle="true"}` with tab-indented children, never a `<details>`, Done last inside it, legacy column-0 Done fails top-level-toggle.
- N1: components guard now reads paths from the whole line, and a non-blank line outside the header comment that is not `- ...` refuses. Test: "Components: a stale path outside the 4th field, or a line that is not a component, refuses". Real docs/components.md still parses (34 rows).
- N3: toggles-fixtures.mjs moved to skills/decisions/scripts/fixtures/; three test imports updated.

## Deviations / notes
- N2: skills/notion-writing/scripts/fixtures/render-decisions.skeleton.md was regenerated in round 1 (page-lint.test and mirror-shared-skills.test read it); outside the write set list but a necessary consequence of the render change.
- N4: Notion readback of the new shape is unverified until the live publish; expect publish step 6 exit 5 with a backup path on first live publish.
- Escalated to the lead (not done): whether a Bearings parse failure should block --clear-done at all (degraded toggle with links only), and whether the bearings template should name the exact field lines the renderer reads. Both change the brief's refuse rule or files outside the write set.
