VERDICT: APPROVE 9cd8368a2406e1d3ca1f5365a3ec279008e0e174
Reviewed head: 9cd8368a2406e1d3ca1f5365a3ec279008e0e174 (lane-72 worktree, from `git rev-parse HEAD`). This round 2 review covers the suite-finding fix only. It is a delta review of 33330b81..9cd8368a: two commits, d86d5b89 (the fix) and 9cd8368a (the builder report).

# Review: toggles72, round 2 (the suite finding)

## Prior finding, verified
- **Suite finding (mask-fixture.test.mjs:88 fails on Netcup and Hetzner): FIXED.**
  - **Cause.** The committed skeleton at skills/notion-writing/scripts/fixtures/render-decisions.skeleton.md was hand-masked. It used capital `X` runs and masked the renderer's fixed section names (Goal card, Bearings, Components) and labels (Decision, Next action, Links). The masker writes lowercase `x` and did not know those names. So the skeleton was not a fixed point of `maskText`, and the test at mask-fixture.test.mjs:90 failed.
  - **The fix.** mask-fixture.mjs:21-30 adds these to KEYWORDS: `Waiting on you now`, `Goal card`, `Bearings`, `Components`, `Decision`, `Condition`, `Next action`, `Prediction` and `Links`. The skeleton was regenerated through the masker.
  - **The labels match the renderer's output.** decisions-render-sections.mjs:203-209 emits `Decision:`, `Condition:`, `Next action:`, `Prediction` and `Links:`. The toggle names are Goal card, Bearings, Components and Waiting on you now.
- **The test was not weakened.** One assertion changed, at mask-fixture.test.mjs:37: `# Waiting on you now` used to mask to `# Waiting on you xxx`, and now it stays as it is. That change is the intended new behaviour. The property the old assertion protected was that a shorter keyword does not swallow the word after it. Line 39 keeps that property with `# Waiting on you soon` -> `# Waiting on you xxxx`, and line 38 adds `# Goal card`. The fixed-point test (lines 83-92), the leak test and the vocabulary grep test are byte-for-byte unchanged.
- **Mutation check.** I copied skills/notion-writing/scripts to my scratch folder (lane-72/review-r2), outside the repo. I put the 33330b81 mask-fixture.mjs back in that copy and ran `node --test mask-fixture.test.mjs` against the new skeleton. Three tests went red:
  - "maskLine: the keywords the rules key on survive"
  - "every committed fixture is a skeleton ... masker leaves it unchanged"
  - "committed fixtures: a plain word grep finds only the keyword vocabulary"

  So the fix is what turns them green. I made no change in the worktree.

## What I ran
- **Focused gate, from the lane-72 worktree.** Files: mask-fixture.test.mjs, page-lint.test.mjs, scripts/mirror-shared-skills.test.mjs and every skills/decisions/scripts/*.test.mjs. Command: `node scripts/run-tests.mjs <files>`. Result: tests 720, pass 716, fail 0, cancelled 0, skipped 3, todo 1, leak check 0 new temp entries.
- **Diff read in full.** It touches 3 code and fixture files plus the builder report. All three are under skills/notion-writing/scripts, the same files the suite finding named. None of them is a mirrored copy elsewhere in the repo: `git ls-files` shows only these paths.
  - docs/goals/card.md is not touched.
  - No AI byline, no network and no Notion write in the changed tests.
- **Worktree state.** `git status` shows one tracked modification, docs/work/wr-2026-10-01-decisions-toggles.loop-state.json. It was there before I started and belongs to the orchestrator. Apart from this report, I wrote nothing in the worktree.

## Scope items (status at 9cd8368a)
This round changed only the masker, its test and one lint fixture. No renderer, handback, guard or page-lint rule code changed (`git diff --name-only`). Each item below rests on its round-3 named test, which is still green in the 720-test run above.
1. **PASS.** The three toggles regenerate on every publish. decisions-render.test.mjs: "toggles: the page opens with Goal card, Bearings, Components ...", "rendering twice ... same bytes", and the Bearings missing-field refusal tests.
2. **PASS.** The components guard fails on a nonexistent path and passes on a real one: "Components guard: ... refuses".
3. **PASS.** The card-toggle stale-sha check in decisions-handback is unchanged, and its tests are green.
4. **PASS** for what fixtures can show. The page-lint test "fixture: today's render (decisions, the render skip list) gives []" reads the regenerated skeleton and stays clean (page-lint.test.mjs:584). mirror-shared-skills.test.mjs:255 lints the mirrored copy clean as plain. The live read is out of scope.
5. **PASS.** skills/decisions/scripts/fixtures/toggles-fixtures.mjs is unchanged.
6. **PASS.** page-lint `top-level-toggle` is unchanged and green.
7. **PASS.** Done is last inside Waiting on you now, and the legacy column-0 layout still parses. Unchanged and green.
8. **PASS.** The shape rule in skills/decisions/SKILL.md is unchanged.

## Findings

### N9 NOTE: common words now survive masking on any page
- mask-fixture.mjs:24 adds `Decision`, `Condition`, `Prediction` and `Links`.
- These are ordinary English words. When a future real page is masked, those words in prose will now stay readable in a public skeleton, not only when they are labels. Example: "the Decision on pricing" becomes "xxx Decision xx xxxxxxx".
- The leak is one generic word at a time and carries no private noun, so it is not a blocker.
- Fix, only if it ever matters: keep these labels only at the start of a line before a colon. The approach would be a `LABELS` list matched by `^\t*(?:[-*]\s+)?(?:\*\*)?(Decision|Condition|Next action|Prediction|Links)(?=:)`, applied ahead of `PROTECT` in `maskPiece`. That keeps the skeleton a fixed point and masks the same words in prose. No change is needed for merge.

### N10 NOTE: the Bearings toggle in the skeleton has no Prediction line
- render-decisions.skeleton.md:5-9 holds Decision, Next action and Links. The renderer always emits a Prediction line (decisions-render-sections.mjs:206).
- The round-1 skeleton had the same three lines, so this round did not introduce it.
- It only weakens how closely the lint fixture mirrors a real render. The page-lint rules do not key on Bearings content.
- Optional: regenerate the skeleton from a current real render the next time the fixture is touched.

## Areas checked and clean
- The keyword boundary still holds. `Decision` does not match inside `Decisions` or `Undecided`: the `(?![\p{L}\p{N}])` guard is at mask-fixture.mjs:40, and the test at line 41 is green.
- Longest-first ordering (mask-fixture.mjs:38) lets `Waiting on you now` win over `Waiting on you`, and line 39 confirms the shorter keyword does not extend.
- All 4+ committed skeletons are still fixed points with no leaks. The test covers every .md file in fixtures/.

## C4 fields
Cause: The render-decisions skeleton was hand-masked with capital X runs, and the renderer's fixed names and labels were not in the masker's KEYWORDS. So `maskText(skeleton) !== skeleton`, and mask-fixture.test.mjs:90 failed on the full suite.
Discriminating check: With the 33330b81 mask-fixture.mjs put back on a scratch copy against the new skeleton, three mask-fixture tests fail. With the HEAD masker, all pass (720 tests, 0 fail).
Fix location: skills/notion-writing/scripts/mask-fixture.mjs:21-30 (KEYWORDS), skills/notion-writing/scripts/fixtures/render-decisions.skeleton.md:1-14 (regenerated), skills/notion-writing/scripts/mask-fixture.test.mjs:37-39.
Simplification: The fixture is now generated by the masker, not written by hand. Being a fixed point holds by construction, so no separate hand-masking convention is needed.
