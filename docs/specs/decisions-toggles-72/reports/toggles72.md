VERDICT: PASS

# Report: toggles72 (lane 72, decisions page toggles)

Serves the GOAL line "more reliable ... rework after acceptance, work lost or stalled": the page Ben reads is regenerated from repo sources, and a stale component or a stale card cannot publish. Nearest NOT: "a rule no script checks" (every rule here has a checking test) and "more parts than the simplest design" (one new module, no top-level sections beyond the three asked for).

Final sha: 26066273bf53edadbc112f44be89e80bd2fa6cdf (three commits on the branch after base 68bf4e16).

## Measured gate
`node scripts/run-tests.mjs` over the 11 gate files, log `reports/toggles72-gate.log`: tests 693, pass 693, fail 0, cancelled 0, skipped 0.
Per file at the last runs: decisions-render 126 pass / 0 fail (110 before the new tests), decisions-render-publish 75/0, decisions-pickup 86/0, page-lint 65/0, decisions-handback 96/0, decisions-read 108/0.
Not run: the full suite (Windows), mirror-shared-skills and native-package tests.

## Files changed (file:line anchors)
- skills/decisions/scripts/decisions-render-sections.mjs (new): buildCardToggle :73, parseBearings :108, buildBearingsToggle :141, parseComponents :173, checkComponentPaths :193, buildComponentsToggle :211.
- skills/decisions/scripts/decisions-render-core.mjs: PAGE_LINT_SKIP :33; render() composes the five toggles around :622.
- skills/decisions/scripts/decisions-read.mjs: waitingIsToggle :204/:231, nested Done :265.
- skills/decisions/scripts/decisions-render-publish.mjs: revertOwnerInput keeps the tab.
- skills/decisions/scripts/decisions-handback.mjs: extractCardToggleSha :132, card WARN lines :563-570.
- skills/notion-writing/scripts/page-lint.mjs: done-last nested :488, top-level-toggle rule :507-518 (registered :39, :560).
- skills/decisions/SKILL.md "Page shape" :370; skills/decisions/references/page-shape.md (new); skills/notion-writing/SKILL.md rule 14 :94 and section 3 :130; skills/decisions/templates/decisions-page.md.
- docs/components.md (new), skills/decisions/scripts/toggles-fixtures.mjs (test helper), handback fixtures decisions-toggles-clean.md, decisions-toggles-card-nosha.md, decisions-toggles-done-not-last.md, regenerated render-decisions.skeleton.md.

## Scope items and proving tests
1. Three toggles: decisions-render.test.mjs "toggles: the page opens with Goal card, Bearings, Components, then Waiting on you now, then History, all toggles"; "Goal card toggle: the card text in full ..."; "Goal card toggle: the sha comes from git log ..."; "Goal card toggle: a missing card.md or a failing git log is BLIND ..."; "Bearings toggle: decision, condition, next action, prediction ..."; "Bearings toggle: the newest assessment by date ..."; "Bearings toggle: a missing field refuses ..."; "Components toggle: one line per component ..."; "real bearings pair: ...".
2. components.md and guard: "Components guard: a skills/, scripts/ or hooks/ path absent from origin/main refuses the render ..."; "Components guard: a path outside skills/, scripts/ and hooks/ is not checked"; "Components: a state word outside the five, a malformed line, or no component refuses"; "real docs/components.md: every line parses ... every backticked path exists in this tree".
3. Hand-back card check (decisions-handback.test.mjs): "card toggle: a matching head is clean ...", "card toggle: a stale card sha blocks with the exact WARN text ...", "card toggle: the head is derived from git ...", "card toggle: a Goal card toggle with no main-at line blocks", "card toggle: a legacy page with no Goal card toggle is not checked ...".
4. Page-lint clean: render test "page-lint: the composed page is clean under the decisions kind with that skip list"; "page-lint: the render skip list is exactly the three rules the render already owns ..."; page-lint.test "fixture: decisions page (decisions) gives exactly [done-last, em-dash-arrow, top-level-toggle] ...".
5. Fixture tests: the three handback fixtures, the regenerated skeleton fixture, the lane 48/52 render snapshots, publish "revertOwnerInput: a ticked Done nested in the Waiting toggle is unticked in place, indentation kept", and the decisions-pickup lane 72 block (:1492).
6. Page-shape rule: page-lint.test "top-level-toggle: red for a top-level paragraph, bullet, callout, checkbox or table; green for toggles and headings" and "top-level-toggle: ignores fenced code, owner comment lines ..."; text in SKILL.md :370, page-shape.md, notion-writing SKILL.md :94 and :130.
7. Done last inside Waiting: page-lint.test "done-last (lane 72): green when Done is the last block inside the Waiting toggle ..." and "done-last (lane 72): red when something follows Done ..."; decisions-read.test six "nested Done: ..." tests (:1320-1360); render test "Waiting toggle: Done is the last block, the comment callout is just above it".
8. Stated once: Ben's quote appears once, in skills/decisions/SKILL.md :374-378; page-shape.md and notion-writing SKILL.md point to it.

## Deviations
- "The quote appears once" was checked by grep, not by an automated test.
- scripts/wiring-check.mjs untouched; wiring-check.test passes unchanged.

## Assumptions
- State words: fed (consumed), measured (a number is read), unfed (shipped, unconsumed), partial, missing; defined in the docs/components.md header comment.
- The guard checks `git ls-tree origin/main` for backticked skills/, scripts/, hooks/ paths only.
- "What is going on" and "This session" are nested inside the Waiting toggle, followed by the comment callout and Done.
- The legacy column-zero layout still parses in the reader, so older pages keep working.
- A bare file path in the card (docs/GOALS.md) is wrapped in backticks to avoid a Notion autolink.
- A legacy page with no Goal card toggle is skipped by the hand-back sha check; a toggle without a "main at" line warns.
- top-level-toggle applies to hand-written decisions pages too; done-last and top-level-toggle are no longer in the render's skip list.
- The Bearings prediction comes from the response's "Check on <M/D H:MM AM/PM>:" line; the condition is optional.
- No separate Done or Closed top-level toggles. No live publish and no Notion network call were made.
