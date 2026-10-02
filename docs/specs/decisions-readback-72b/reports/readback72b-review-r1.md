VERDICT: NEEDS_FIXES (2) 2673d7a2320e0035121ebffc9aeb16a7557af2dc

Territory readback72b, round 1. Reviewed sha 2673d7a2320e0035121ebffc9aeb16a7557af2dc (from my own `git rev-parse HEAD` in wt-decisions-readback-72b-readback72b), base c3d9f814debc5e0fd0e7509af1bdbfaf0e4b4c6e. Review ran 10/1 9:58 PM to about 10:10 PM NY. Nothing in the reviewed worktree was modified (`git status --short` is empty). Scratch: C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-72b/rev-* (base, head and patched copies, simulation scripts, logs).

Summary: the Goals-link fix is real and correct, but it is only one of two causes. The live page has six Waiting items, and a second difference sits between them: a blank line after each tab-indented `</details>`. With the delivered commit, a publish of the current tree through a fake Notion that applies both observed rewrites still exits 5. The builder's discriminating check missed this. It treated lines 62 onward as Waiting-content drift, but they are not drift.

Cause: two independent render/readback mismatches, both introduced by lane 72 (f1e30b0c).
  (a) Delivered and fixed: decisions-render-sections.mjs:22 (base) rendered the Goals link as https://www.notion.so/<id>, and Notion returns https://app.notion.com/p/<id>.
  (b) Not fixed: lane 72 moved the Waiting items into the Waiting toggle via indentLines (decisions-render-core.mjs:644, decisions-render-sections.mjs:30-32). Their tags became `\t<details>` / `\t</details>`, and the blank separator after each close stayed blank. Notion drops that blank line, as it always did for column-0 `</details>`. But normalize's structural-details rule matches only the exact strings `'<details>'` and `'</details>'` (decisions-render-core.mjs:137-138), so the dropped blank after an indented close is no longer absorbed. The readback compare at decisions-render-publish.mjs:681-694 then fails with exit 5.
Discriminating check: I rendered the HEAD tree offline (`node skills/decisions/scripts/decisions-render.mjs render --repo <worktree>`, exit 0, 147 lines) and the base tree (scratch copy, exit 0, 147 lines). The raw diff of the two is line 14 only (the Goals link). I then compared normalize() of each, line by line, against ~/.local/state/notion-backups/3e1da11277a18174bccfea187d5c3972/2026-10-02T01-50-07-651Z.after.md:
  - base render: 87 differing lines, the first at L14 (www.notion.so vs app.notion.com/p), the next at L62 (R "" vs B "\t<details>").
  - HEAD render: 86 differing lines, the first at L62: R "" / B "\t<details>". Raw diff: the render has 5 blank lines (render L62, 75, 88, 98, 107), each directly after `\t</details>`, that the live page lacks. The other raw differences are `\<`/`\|` escapes (absorbed by normalize) and the Done "last cleared" stamp.
  - HEAD render with only those 5 blanks removed (`perl -0pe 's/(\t<\/details>)\n\n/$1\n/g'`): 142 vs 142 lines, exactly 1 differing line, L126 `\t- [ ] Done` vs `\t- [ ] Done (last cleared: ...)`. publish adds that stamp itself (it keeps the fresh page's Done line verbatim), so it is not a mismatch. There is no extra Waiting item and no content drift. The builder report's statement "a Waiting item the live page lacks" is wrong.
  - Corroboration that Notion drops the blank: every pre-lane-72 backup .after.md with column-0 details (00-56-41: 4, 01-01-37: 6, 01-03-36: 6) has 0 blank lines after `</details>`. normalize's own header comment (decisions-render-core.mjs:52-53) records this as observed Notion behaviour. The two post-lane-72 after.md files have 6 `\t<details>` each and 0 blank lines after `\t</details>`.
  - Full-publish simulation (scratch rev-sim2.mjs: real publish() over a scratch copy of HEAD content, fake git, fake Notion; fs writes to a Map):
      base, URL rewrite only: exit 5. HEAD, URL rewrite only: exit 0.
      HEAD, URL rewrite + blank-after-`\t</details>` drop (what live Notion does): exit 5. So the delivered fix does not remove the stall.
      HEAD with the normalize patch below, both rewrites: exit 0.
Fix location: decisions-render-core.mjs:137-138, inside normalize. Extend the existing structural `<details>` separator rule to tab-indented tags (patch below). The delivered renderer constant at decisions-render-sections.mjs:24 stays as it is.
Simplification: no new mechanism. The patch widens an existing, documented equivalence (Notion drops the blank after a structural `</details>`) from column 0 to the indented position lane 72 introduced. The comparison stays line-strict for all content. The delivered one-line constant change adds no code either.

## Findings

### BLOCKER 1: the fix leaves a second readback cause; the next live publish still exits 5
Evidence: decisions-render-core.mjs:137-138 match only the exact `'<details>'` and `'</details>'`. The render emits `\t</details>` + blank + `\t<details>` five times (scratch rev-render-head.md L61-63 and others). The simulation above shows HEAD exits 5 under the observed Notion behaviour and exits 0 with the patch. Command: `node rev-sim2.mjs <tree> fec9bc8bc4b563d57be2551613dd0b0293499296 live none` (in the scratch dir) gives `rev-head live none: error code 5`, then `rev-patch live none: exit 0`.
Fix (mechanical patch, skills/decisions/scripts/decisions-render-core.mjs):
Current:
```
    if (!fence && l === '<details>') detailsDepth += 1;
    const isStructuralDetailsClose = !fence && detailsDepth > 0 && l === '</details>';
```
Replacement:
```
    // Lane 72 nests the Waiting items in a toggle, so their tags arrive tab-indented; Notion drops
    // the blank separator after an indented structural close exactly as after a column-0 one.
    const tag = l.replace(/^\t+/, '');
    if (!fence && tag === '<details>') detailsDepth += 1;
    const isStructuralDetailsClose = !fence && detailsDepth > 0 && tag === '</details>';
```
Predicted and measured outcome (on a scratch copy only, never the worktree): the full-publish simulation of the current tree under both live rewrites goes from exit 5 to exit 0. The territory test set on the patched scratch copy gives 679 tests, 678 pass, 1 fail. That failure is "CLI: real process, without --head, calls real git", and the unpatched scratch HEAD copy fails it identically, because scratch has no .git. So the patch breaks no existing test. Optionally add "(also tab-indented)" to the normalize header comment at :52-53.

### MAJOR 1: the regression fixture has no Waiting items, so it cannot see cause (b)
Evidence: decisions-render-publish.test.mjs:43-51 `baseFiles` (toggleFiles + now/session/history) has no docs/decisions/waiting/ files. The new test at :807 therefore renders "Nothing right now." with no `<details>` at all. The live page has 6 Waiting items. `wireRewritingNotion` (:796-805) applies only the URL rewrite. The fixture does have the three toggles, tab-indented children and the trailing `<empty-block/>`, but it is not shaped like the live page where the failure lives.
Fix: in the lane-72b exit-0 test, add at least two Waiting items to `files`, under p('docs','decisions','waiting','a-item.md') and 'b-item.md', in the item format used at decisions-render.test.mjs:737. Extend the fake's rewrite to also drop the blank after an indented close:
Current (decisions-render-publish.test.mjs:799):
```
  const rewrite = (md) => mutate(md.replace(/https:\/\/(?:www\.)?notion\.so\/([0-9a-f]{32})/g, 'https://app.notion.com/p/$1'));
```
Replacement:
```
  const rewrite = (md) => mutate(md
    .replace(/https:\/\/(?:www\.)?notion\.so\/([0-9a-f]{32})/g, 'https://app.notion.com/p/$1')
    .replace(/(\t<\/details>)\n\n/g, '$1\n'));
```
Also assert in the test that the written text contains `\t</details>\n\n\t<details>`, so the fixture provably exercises the separator. Predicted outcome: the test fails on base c3d9f814 (URL) and on the current HEAD 2673d7a2 (blank separator), and passes with both fixes. The exit-5 companion test keeps passing, since its planted prose change survives normalize.

## Checks the reviewer brief requires
1. New test fails on the base: confirmed. I copied the HEAD test file into a scratch extract of c3d9f814 and ran `node --test skills/decisions/scripts/decisions-render-publish.test.mjs`: tests 77, pass 76, fail 1. The failing test is the one at :807, with "readback did not verify ..." and code 5 (log: scratch rev-base-publish.log).
2. Passes after the fix; fixture shape; real rewrite: it passes at HEAD (gate below). The fake applies a real regex rewrite (:799) and does not echo the text. The fixture has the three toggles, tab-indented children and the trailing `<empty-block/>`, but no Waiting items (MAJOR 1).
3. A genuinely different line still exits 5: confirmed by full-publish simulation, on HEAD and on HEAD+patch, under the URL-only and the live rewrites. A changed prose line, a changed github link target, a changed Goals page id on the rewritten host, a dropped Waiting "Now:" line, a dropped Components line and a dropped `\t</details>` line all give exit 5. One case changes with the patch: an extra blank line inserted directly after the last `\t</details>` gives exit 0, the same treatment column-0 details already get. Blank lines carry no content.
4. Fix in renderer, not a looser comparison: verified. The diff touches only the decisions-render-sections.mjs:22-24 constant (plus comment). decisions-render-core.mjs and decisions-render-publish.mjs are unchanged (`git diff --name-only c3d9f814 HEAD` lists 3 files, neither of those). No real mismatch can newly pass at HEAD.
5. Cause re-derived: see Discriminating check. Cause (a) is confirmed; cause (b) is new and unfixed (BLOCKER 1).
6. Scope: `git diff --name-only c3d9f814 HEAD` gives decisions-render-publish.test.mjs, decisions-render-sections.mjs and decisions-render.test.mjs, all in the territory list. There is no docs/work or docs/decisions change. The decisions-render.test.mjs:1106 assertion change is justified by the constant change.
7. Page-lint and autolink: `page-lint.mjs <HEAD render>` (plain) is clean. render exits 0, so the render's own checkAutolinkLines passes. page-lint.test.mjs and skill-text.test.mjs pass in the gate. `--kind decisions` reports 12 em-dash-arrow hits at render L134-145, which are History bullets from the history files. They come from content rendered identically on the base (base and HEAD renders differ only at L14), so they predate this lane and are out of scope.

Gate, run by me in the worktree: `node --test skills/decisions/scripts/*.test.mjs skills/notion-writing/scripts/*.test.mjs` gives tests 679, pass 679, fail 0, exit 0 (log: scratch review-gate.log). I did not run a full suite (Windows).

## Verified absent
- The URL fix does not let a changed link through: a different Goals page id on app.notion.com still exits 5.
- The delivered change does not alter normalize or the readback compare.
- There are no other `notion.so` links in the current render sources (docs/decisions, docs/goals, docs/components.md; grep found none).

## Open questions (not decided here)
- That writing `https://app.notion.com/p/<id>` reads back unchanged is inferred: the backups show this as the returned form of a written notion.so link. No backup shows app.notion.com being written and read back. The lead's live publish settles it.
- A future Waiting item or session text that carries a `notion.so/<id>` link would hit cause (a) again. The constant fix covers only the Goals link. Whether normalize should map notion.so/<id> to app.notion.com/p/<id> generally is the spec's call.
- Fixing cause (b) in the renderer instead (no blank separator inside the indented Waiting block) would change rendered lines, which the territory brief requires a check-in for. The normalize patch avoids that.
