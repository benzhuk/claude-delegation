# Scout addendum: territory states73 (read at base 7233aa7f, read-only)

## 1. Files and symbols
- docs/subagent-contract.md (119 lines): exists. Report rule is "The report's first line carries the verdict" (line 17) and the termination formula (line 62); no PARTIAL anywhere in it, so "PARTIAL is refused" has nothing to delete there, only to add.
- The "report check script" the spec names DOES NOT EXIST. Nearest is scripts/bugfix-fields.mjs (+ .test.mjs): exports findMissingFields(text), main(argv), CLI `node scripts/bugfix-fields.mjs <report>`, exit 0/1, fenced blocks stripped (stripFencedBlocks), label regex `^[ \t*+-]{0,20}Label:\**[ \t]{0,20}(.+)$`. Model a new scripts/report-check.mjs on it.
- First-line `VERDICT:` is hard-wired elsewhere and is NOT the spec's vocabulary: work-record.mjs:427 (evidence-no-verdict), VERDICT_RE :641, accept parse :1499; agents/*.md safety bullet "first line `VERDICT: <word>`" (agents.test.mjs:111 anchor); build-loop-workflow.js :198-214 and :225 (every worker prompt); mandate-template.md :72.
- scripts/work-record.mjs: STATUSES line 22 = runnable, owned, delivered, rejected, reviewed, accepted, closed, blocked, withdrawn. Spec's set (open, NEEDS BEN, NEEDS <peer>, FAILED, accepted, closed) shares only accepted and closed. bad-status check at :310; accept requires `Status: reviewed` (:1040, :1610); merge-check requires accepted (checkMergeReady :1892); withdraw from WITHDRAWABLE_STATUSES :26; close requires accepted :1838. There is no separate "merge script": merge is merge-check.
- Open records at base (non accepted/closed): reviewed x7, withdrawn x4, blocked x1 (wr-2026-09-24-rollout), plus lane 73's own `owned`. Closed 47, accepted 80.
- docs/work-record.md :35 (Status row), :53-67 (meanings), :309 (bad-status "one of the seven values", already stale: there are nine).
- Decisions renderer: skills/decisions/scripts/decisions-render-core.mjs. Waiting items are source files docs/decisions/waiting/*.md, checked by checkWaitingItem (:448), concatenated verbatim by buildWaitingSection (:475). Item shape: `<details><summary>**title**</summary>` then a tab-indented context line, options, Default line (templates/decision-item.md). "In-progress items" exist only as bullets in docs/decisions/session.md (buildSessionSection :540; max 8 bullets, 200 chars each, :536-537) and the prose now.md (3-5 sentences). The live session.md already writes "In progress, X. Now: ... | To finish: ... | Est: ...".
- Lane 72/72b are on main (page is toggles; Waiting items sit inside `# Waiting on you now {toggle="true"}`, render() :633-647), so the "rebase on lane 72" caveat is already satisfied.
- Hook card / components: docs/components.md (state words fed/measured/unfed/partial/missing; line shape `name | what | state | paths`). docs/goals/card.md has no component text yet; GOALS-v6-draft.md exists beside it.
- skills/team-build/SKILL.md :134-148 (reviewer attack brief, "Verdict ... first"), :517; skills/delegate/SKILL.md :66 ("verdict on line 1"). Each is the one place to state the first-line rule.

## 2. Helpers to reuse
- scripts/bugfix-fields.mjs (labelRegex, rtrim, stripFencedBlocks, main/CLI shape, pathToFileURL guard); scripts/work-record.mjs parseRecord, FIELD_LABELS, KNOWN_LABELS, HEADER_LINE_RE (:69-89), validateRecord (:296+).
- skills/decisions/scripts/decisions-render-core.mjs RefusedError, checkProseLines, checkAutolinkLines, countSentences; fixtures dir skills/decisions/scripts/fixtures/ and toggles-fixtures.mjs.

## 3. Tests that police this area
- scripts/work-record.test.mjs, work-record-closeout.test.mjs, record-closed-and-skip.contract.test.mjs: assert STATUSES, bad-status, reviewed->accepted, withdraw sources.
- hooks/backlog-notice.test.mjs (+ hooks/backlog-notice.js :218-238 classifies runnable/delivered/rejected), scripts/work-census.test.mjs (work-census.mjs :67-112 reads `owned`/`delivered` from Log lines), scripts/collect-from-origin.test.mjs, collect-status.test.mjs (NOTE_STATE_TOKENS :54, STATUSES use :426), scripts/four-read.test.mjs (:608 `owned`).
- agents/agents.test.mjs :108-127: safety block has exactly 11 bullets, must contain `VERDICT: <word>`, stays under 2100 chars. skills/decisions/scripts/skill-text.test.mjs, decisions-render*.test.mjs (session bullet limits, page-lint). build-loop-workflow.test.mjs (worker prompt text).
- Existing records must keep parsing: work-census and every reader call parseRecord on all 147 files.

## 4. Open questions for the spec
1. Which first-line governs which report? Spec line 1 words (DONE, NEEDS BEN, NEEDS <peer>, FAILED + "n of m steps done") collide with `VERDICT: <word>` that evidence checks, accept, and the loop depend on. Does the new line replace VERDICT for runner/lead progress reports only, or all reports? (Brief assumes: progress reports only; reviewer/integrator/builder VERDICT lines unchanged.)
2. No report-check script exists: new scripts/report-check.mjs, or extend bugfix-fields.mjs? (Brief assumes new, mirrored on bugfix-fields.)
3. Status vocabulary: spec has no `owned`, `reviewed`, `runnable`, `delivered`, `rejected`, `blocked`, `withdrawn`, yet accept needs `reviewed` and withdraw exists. Are those retired (with a migration mapping), or kept alongside? Task says existing open records must still parse and closed records are not rewritten.
4. "Accept and merge scripts refuse any other Status word": is validateRecord's bad-status finding also to change, and from what cutoff date (grandfathering by Opened:, as ACCEPTED_WITHOUT_CHECK_CUTOFF does)?
5. Renderer: "one short line under its title" for a waiting item means the first tab-indented line inside `<details>`; for in-progress, does it mean each session.md bullet? Is a missing line a refusal?
6. Where does the item-4 hook-card reference live (docs/components.md header, docs/goals/card.md, or the contract)?
7. "n of m steps done" placement on a NEEDS/FAILED line: `NEEDS BEN: <one line> (2 of 5 steps done)` vs after a separator; is DONE also required to end with it?
