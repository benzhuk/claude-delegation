VERDICT: PASS

Territory readback72b, fix round 2. Worktree wt-decisions-readback-72b-readback72b, sha a19cac33b267237d6ce30f83d70cb865c6ad4069 (base of round 2: 2673d7a2).

Applied both reviewer findings:
- BLOCKER 1: decisions-render-core.mjs normalize now strips leading tabs before matching the structural <details>/</details> tags, so the blank Notion drops after a tab-indented close is absorbed as it is at column 0. Header comment notes "(also tab-indented)". Patch is the reviewer's, verbatim.
- MAJOR 1: decisions-render-publish.test.mjs lane-72b exit-0 test now has two Waiting items (a-item.md, b-item.md via a waitingItem helper), the fake Notion also drops the blank after \t</details>, and the test asserts the written text contains "\t</details>\n\n\t<details>".
- One correction to the reviewer's prediction: last-render.md holds the readback (publish step 8 writes readback), not the written text, so the old assertion equal(last-render, written) failed once the fake drops blanks. It now asserts normalize(lastRender) === normalize(written) and that last-render carries the app.notion.com link form.

Discriminating check: copied the tree to scratch with the original (HEAD~) core and ran decisions-render-publish.test.mjs: 77 tests, 76 pass, 1 fail, the lane-72b exit-0 test. With the patch the same file passes. The exit-5 companion test still passes.

Gate: node --test skills/decisions/scripts/*.test.mjs skills/notion-writing/scripts/*.test.mjs gives tests 679, pass 679, fail 0. Log: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-72b/docs/specs/decisions-readback-72b/reports/readback72b-gate.log

Files changed: skills/decisions/scripts/decisions-render-core.mjs, skills/decisions/scripts/decisions-render-publish.test.mjs (both in territory). Nothing deleted; scratch copy left at the session scratchpad lane-72b-r2.
Open: the lead's live publish still settles that app.notion.com/p/<id> reads back unchanged.
