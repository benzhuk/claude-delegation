VERDICT: APPROVE a19cac33b267237d6ce30f83d70cb865c6ad4069

Territory readback72b, round 2 (delta re-review). I reviewed sha a19cac33b267237d6ce30f83d70cb865c6ad4069, taken from my own `git rev-parse HEAD` in wt-decisions-readback-72b-readback72b. The round-2 range is 2673d7a2..HEAD, one commit, and the lane base is c3d9f814. The review ran from 10/1 10:09 PM to about 10:25 PM NY. Nothing in the reviewed worktree was modified: `git status --short` was empty before and after. Scratch files are under C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-72b/: the trees rev-r2base, rev-r2prev, rev-r2head and rev-r2mut, the scripts rev2-sim.mjs and rev2-extra.mjs, the logs rev-r2*-publish.log and review-gate.log, and the render rev-r2-render.md.

Summary: both round-1 findings are fixed, and I found no regression. With the delivered tree, a publish through a fake Notion that applies both observed live rewrites exits 0. Every genuine content change I tried still exits 5. The only normalised difference left between the current render and the live page is the Done "last cleared" stamp, which publish takes from the fresh page.

Cause: lane 72 (f1e30b0c) introduced two independent render/readback mismatches. (a) The Bearings Goals-page link was rendered as https://www.notion.so/<id>, and Notion returns https://app.notion.com/p/<id>. This was fixed in round 1 at decisions-render-sections.mjs:22-24. (b) The Waiting items moved into the tab-indented Waiting toggle, so their tags became `\t<details>`/`\t</details>`. Notion drops the blank separator after each indented close, but normalize matched only the column-0 `<details>`/`</details>` strings. This is fixed in round 2 at decisions-render-core.mjs:137-141.
Discriminating check: I rendered the HEAD worktree offline (`node skills/decisions/scripts/decisions-render.mjs render --repo <worktree>`, exit 0, 147 lines) and compared normalize() of it line by line with ~/.local/state/notion-backups/3e1da11277a18174bccfea187d5c3972/2026-10-02T01-50-07-651Z.after.md (scratch rev-ndiff.mjs).
  - HEAD normalize gives 142 vs 142 lines and 1 differing line: L126, R `\t- [ ] Done` vs B `\t- [ ] Done (last cleared: Oct 1, 2026, 8:51 PM America/New_York)`. That stamp is not a mismatch, because publish keeps the fresh page's Done line.
  - The round-1 normalize (2673d7a2), on the same render, gives 147 vs 142 lines and 86 differing lines. The first is at L62: R "" vs B "\t<details>". The render's only 5 blank lines (L62, 75, 88, 98, 107) each directly follow `\t</details>`.
  The normalize change alone takes the diff from 86 lines to the 1 benign line, so it discriminates.
Fix location: skills/decisions/scripts/decisions-render-core.mjs:137-141 (normalize, structural details rule). The tag match strips leading tabs, `const tag = l.replace(/^\t+/, '')`, and the pushed line keeps its tabs. The round-1 renderer constant is at skills/decisions/scripts/decisions-render-sections.mjs:22-24.
Simplification: no new mechanism. One existing, documented equivalence (Notion drops the blank after a structural `</details>`) now also covers the indented position. The comparison stays line-strict, including leading indentation, for every non-blank line.

## Prior findings, verified

### BLOCKER 1 (round 1): second readback cause left unfixed. FIXED
Evidence: decisions-render-core.mjs:137-141 applies the round-1 patch verbatim (`git diff 2673d7a2 HEAD`). I ran a full-publish simulation of the real publish() over a scratch copy of HEAD content (`node rev2-sim.mjs <tree> fec9bc8b... live <mut>`). The fake Notion applies the URL rewrite and drops the blank after `\t</details>`:
  - rev-r2head live none: exit 0. rev-r2prev (2673d7a2) live none: error code 5. The stall is removed.

### MAJOR 1 (round 1): the regression fixture had no Waiting items. FIXED
Evidence: decisions-render-publish.test.mjs:793-804 adds `waitingItem()`. The exit-0 test at :822-838 adds two Waiting items (a-item.md, b-item.md). The fake's rewrite at :812-814 drops the blank after `\t</details>` as well as rewriting the URL. :833 asserts that the written text contains `\t</details>\n\n\t<details>`, so the fixture provably exercises the separator.
The builder changed one assertion against my round-1 prediction, and the change is correct. Publish step 8 writes the readback, not the written text, to last-render.md (decisions-render-publish.mjs:707 `writeFile(lastRenderPath, readback)`). The old `equal(last-render, written)` could therefore not hold once the fake drops blanks. The replacement at :835-837 asserts `normalize(lastRender) === normalize(written)` and that last-render carries `app.notion.com/p/3e3da...`. The second assertion also proves last-render.md was advanced, because PAGE_NO_INPUT carries no such link. This does not weaken the test.

## Checks the reviewer brief requires
1. The new test fails on the base. I copied the HEAD decisions-render-publish.test.mjs into a scratch `git archive` extract of c3d9f814 (rev-r2base) and ran `node --test skills/decisions/scripts/decisions-render-publish.test.mjs`. Result: exit 1, tests 77, pass 76, fail 1. The failing test is "publish (lane 72b): ... is exit 0" (:822), with `readback did not verify ...` at decisions-render-publish.mjs:693. It also fails the same way on the round-1 head 2673d7a2 (rev-r2prev: 77/76/1). As a mutation check, I combined the HEAD core with the base sections.mjs (rev-r2mut), which reverts only the URL fix: 77/76/1, the same test fails. Each half of the fix is therefore independently required by the test.
2. The test passes after the fix, and the fixture is shaped like the live page. On the rev-r2head extract the test file gives 77/77 pass. The fixture uses toggleFiles (three toggles, tab-indented children, trailing `<empty-block/>`, as verified in round 1) plus two Waiting items. The fake applies two real regex rewrites (:812-814) and does not echo the text.
3. A genuinely different line still exits 5. Each case below is a full-publish simulation on HEAD under both live rewrites:
   - changed prose line: exit 5
   - changed github link target (non-rewritten host): exit 5
   - changed Goals page id on app.notion.com: exit 5
   - dropped Waiting "Now:" line: exit 5
   - dropped Components line: exit 5
   - dropped `\t</details>`: exit 5
   - `\t</details>` re-indented to `\t\t</details>`: exit 5
   - `\t</details>` with a space indent instead of a tab: exit 5
   - changed Waiting summary: exit 5
   - two Waiting items swapped: exit 5
   The extra blank line inserted after the last `\t</details>` exits 0. That is the intended equivalence (blank lines carry no content), and it matches column-0 details on the base. In the companion unit test (:840-850), one changed prose line exits 5 and last-render.md is not advanced; it passes in the gate.
4. The fix is in the renderer and normalize, not a looser comparison. The readback compare at decisions-render-publish.mjs:681-694 is unchanged; `git diff --name-only c3d9f814 HEAD` does not list decisions-render-publish.mjs. The normalize change affects only blank lines that directly follow a tab-indented `</details>` at depth > 0 outside a fence. Every pushed line keeps its original leading tabs (`collapsed.push(l)`, not `tag`), so an indentation or nesting change still differs. No non-blank content can newly pass.
5. I re-derived the cause myself; see "Discriminating check" above.
6. Scope. `git diff --name-only c3d9f814 HEAD` lists decisions-render-core.mjs, decisions-render-publish.test.mjs, decisions-render-sections.mjs and decisions-render.test.mjs. All four are in the territory list. Nothing under docs/work or docs/decisions changed.
7. Page-lint and autolink. `node skills/notion-writing/scripts/page-lint.mjs <HEAD render>` printed "page-lint: clean (plain)" and exited 0. render exits 0, so its checkAutolinkLines passes. page-lint.test.mjs passes in the gate.

Gate, which I ran in the worktree: `node --test skills/decisions/scripts/*.test.mjs skills/notion-writing/scripts/*.test.mjs` gave tests 679, pass 679, fail 0, exit 0 (log: scratch review-gate.log). I did not run a full suite, because this is Windows.

## Findings

### MINOR 1: the "(also tab-indented)" note was inserted inside a quoted spec sentence
Evidence: decisions-render-core.mjs:52-53. The comment reads `spec: "... drop a blank separator after a structural closing `</details>` (also tab-indented), drop one ..."`, which attributes the tab-indented clause to the spec quote. The lane-72b rationale already sits beside the code at :137-138. Non-blocking.
Fix (optional): remove the parenthetical from the quoted sentence. The code comment at :137-138 already carries the reason.
Current:
```
// lines to one, drop a blank separator after a structural closing `</details>` (also tab-indented), drop one
```
Replacement:
```
// lines to one, drop a blank separator after a structural closing `</details>`, drop one
```
Optionally add a direct normalize unit test in decisions-render-core.test.mjs: `normalize('# W {toggle="true"}\n\t<details>\n\t<summary>a</summary>\n\t</details>\n\n\t<details>\n\t<summary>b</summary>\n\t</details>')` equals the same text without the blank. The publish-level test already covers the behaviour.

## Verified absent
- No looser comparison. The readback compare is untouched, and normalize still compares leading indentation strictly.
- No new blank-line equivalence outside a tab-indented structural close. In the current render, the only blank lines are the 5 after `\t</details>`.
- No out-of-territory edit, and no docs/work or docs/decisions change.

## Open questions (not decided here; carried from round 1)
- That `https://app.notion.com/p/<id>` reads back unchanged when written is inferred from the backups. The lead's live publish settles it.
- A future Waiting item or session text that carries a `notion.so/<id>` link would hit cause (a) again, because the constant fix covers only the Goals link. Whether normalize should map the two forms generally is the spec's call.
