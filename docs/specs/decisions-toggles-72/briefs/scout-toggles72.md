# Scout: toggles72 (base 68bf4e16, read-only, 10/1 evening NY)

## 1. Files and symbols
- `skills/decisions/scripts/decisions-render-core.mjs` (675 lines) exists. `render()` at L600 emits, in order: `# Waiting on you now` (plain H1, not a toggle), `# What is going on`, `# This session ...`, `# History {toggle="true"}`, comment callout, `doneLine`, `<empty-block/>`. Premise holds: no Goal card, Bearings or Components section exists. `REPO_BLOB_BASE` (L45) is `https://github.com/benzhuk/claude-delegation/blob/main`. `PAGE_LINT_SKIP` (L30) skips `done-last`.
- `render()` self-checks with `parseDocument` + `computeExitCode` (L630-640), then lints kind `decisions`. Any new top block must survive both.
- `decisions-render.mjs` is CLI only; it re-exports core and publish. Keep new exports re-exported here.
- `decisions-render-publish.mjs` (747 lines): `revertOwnerInput` (L214) finds the Done line by `^-\s*\[[xX]\]\s*<label>\s*$` (column 0 only); `extractDoneLineVerbatim` (L202). Both assume Done at column 0.
- `decisions-read.mjs`: `finalizeDone` (L127) warns `Done is not the last line` and, at L240, `Done line is indented`. Moving Done inside the Waiting toggle (spec item 7) trips both. Pickup maps them to `DONE_NOT_LAST` / `DONE_INDENTED` (decisions-pickup.mjs L408-412). Handback prints WARN on warnings.
- `skills/notion-writing/scripts/page-lint.mjs`: `done-last` (L484) requires the last non-blank line to be `- [ ] Done`; `PAGE_LINT_SKIP` hides it from the renderer today. No top-level-is-a-toggle rule exists yet (spec item 6 adds one). `RULES` at L27, `RUNNERS`, `lintPage` L536.
- `decisions-handback.mjs`: `extractPageSha` L107, `shaMatch` L119, stale check L532-537 covers the Goals page only. Item 3 adds the card toggle on the decisions page here.
- `goals-mirror.mjs`: `computeSha` L249 (`git log -1 --format=%h origin/main -- docs/GOALS.md docs/goals/card.md`) and `buildCardBlock` L62. `docs/goals/card.md` is 5 lines (GOAL, NOT, DONE, STOP, SOURCE).
- `docs/components.md` does NOT exist. `docs/work/evidence/2026-09-28-component-map.md` section A (L11-~105) exists: tables with columns Component, Where, State and evidence, Measure today, Last value, Serves. Its state vocabulary is "shipped, shipped but unfed, shipped but unmeasured, partial, missing", NOT the spec's fed, measured, unfed, partial, missing. It lists `skills/continue/`, `scripts/continuation*.mjs`, `hooks/continuation-native.mjs`; `skills/continue/` is gone on this tree (retired).
- Newest bearings pair: `docs/work/evidence/2026-10-01-bearings-assessment.md` and `-response.md`. Assessment verdict line is `CONTINUE` (line 1); response is prose with a numbered "What I do now" and a "Check on 10/2 3:00 PM" line. No machine-readable decision/condition/next-action/prediction fields: they must be parsed from prose.
- `skills/decisions/references/` and `skills/notion-writing/references/` do not exist. `skills/decisions/SKILL.md` is 477 lines; `skills/notion-writing/SKILL.md` 185 lines (rule 11 at L91 says the last line of a decisions page is Done; the render layout is stated at L129).
- Work record: `docs/work/wr-2026-10-01-decisions-toggles.record.md`. No `docs/specs/decisions-toggles-72/contracts` file exists; the spec is the only contract.

## 2. Helpers to reuse
- `computeSha`, `buildCardBlock`, `defaultGit` in `skills/decisions/scripts/goals-mirror.mjs` (export what is needed; `buildCardBlock` is not exported now).
- `REPO_BLOB_BASE`, `checkProseLines`, `checkAutolinkLines`, `defaultReadFile`, `defaultReaddir`, `defaultExecGit`, `listDated` pattern in the core; `fakeFs` in decisions-render.test.mjs L36 for fixtures.
- `lintPage`, `formatViolations` from page-lint; `parseDocument`, `computeExitCode` from decisions-read.
- `scripts/wiring-check.mjs` check types `file_exists` / `json_value` are machine-state checks; they do not read a doc's contents.

## 3. Tests that police this area
- `skills/decisions/scripts/decisions-render.test.mjs` (1016 lines) and `decisions-render-publish.test.mjs` (1405): exact page shape, Done last, drift and revert-owner-input behaviour. Section order changes will break many assertions.
- `decisions-read.test.mjs`, `decisions-handback.test.mjs`, `decisions-pickup.test.mjs` and `fixtures/handback/*.md`, `fixtures/render-readback-48/*`, `fixtures/readback-escapes-52/*`: Done at column 0 and last. Moving Done moves every one of these.
- `skill-text.test.mjs`: pins literal command strings in decisions SKILL.md; `registered-pickup.contract.test.mjs`; `decisions-archive.contract.test.mjs`.
- `skills/notion-writing/scripts/page-lint.test.mjs` (607): rule table and `done-last`. `scripts/wiring-check.test.mjs` (1492). `scripts/mirror-shared-skills.test.mjs` and `scripts/native-package.test.mjs` read SKILL.md files.

## 4. Open questions for the spec
1. State words: the spec says fed, measured, unfed, partial, missing; the source map uses other words. Which meaning does each spec word carry (assumption in the brief: fed = shipped and something consumes its output, measured = shipped and a number is read from it, unfed = shipped, nothing consumes it)?
2. Spec item 2 allows `wiring-check.mjs` or the renderer's own guard for the components path check. The brief picks the renderer guard (wiring-check reads machine state, not repo docs). Confirm.
3. Moving Done inside the Waiting toggle changes the reader's "column 0, last line" contract used by read, handback, pickup and publish. Spec item 7 says the pickup fixture moves; it does not say whether `Done is not the last line` / `Done line is indented` stay as warnings for the legacy layout. Brief assumes: new layout is canonical, legacy column-0 layout still parses.
4. Item 6 lists top-level names (Goal card, Bearings, Components, Waiting on you now, Done, Closed, History) but the current page also has "What is going on" and "This session". Where do those two go? Brief assumes they nest inside Waiting on you now (detail nests inside); "Done" and "Closed" as separate top-level toggles are not defined by any source today.
5. The live page ID and a live publish are out of this build (no Notion writes).
