# Scout: territory loop67 (read at base 677c4a90e81f14cabd805679dcc5431d9a2ca93d; line numbers are that tree's)

## 1. Files and symbols
- `skills/team-build/references/build-loop-workflow.js` (897 lines) exists. Premise partly stale: item 4's short-versus-full sha defect is already fixed (`sameSha` line 255 accepts a 7+ hex prefix of a full sha; `longerSha` 272) and relative-path setup compare is already fixed (`normalizePath` 194, `resolveAgainst` 216, `samePath` 225). What is still broken on Windows: all three helpers and line 852 (`specPath.startsWith('/')`) treat only a leading `/` as absolute, so `C:/...` is read as relative and gets `<integrationWorktree>/` prepended. Fix the cause in those helpers (drive-letter absolute).
- Same file: no timeout anywhere. Every agent call passes an opts const (`buildOpts1`, `reviewOpts1`, `integrateOpts`, `seamOpts1`, `acceptOpts`, `setupOpts`); the Workflow `agent()` opts are `label, phase, schema, model, effort, isolation, agentType` and nothing else (workflow-authoring reference), so no per-agent wall-clock option exists. The script has no clock and no fs (banned tokens test).
- Same file: `startFrom` is validated at 431-452 and used in `runTerritory` 554-578; setup mode rejects it. State-file resume must coexist with it (startFrom wins).
- Same file: accept-prep failure is mislabelled at 878-887: `acceptReportMismatch` fires whenever `acceptResult.reportPath !== acceptReportPath`, even when the runner returned a failed accept-prep; the result is never checked for `checkAcceptance`/exit failure first.
- `skills/team-build/references/accept-prep.mjs` (342 lines): `editRecord` throws `missing-field` for absent Status/Artifact/Evidence (lines 194, 201, 208) but inserts `Worktree:` when absent. `SINGLETON_LABELS` (duplicated list, line 143) lacks Artifact-repo, Superseded-by, Scratch.
- `scripts/work-record.mjs` (2653 lines): `FIELD_LABELS` 68-88 has no `Workflow` or `Measure`; `KNOWN_LABELS` 96 is built from it, so a header `Workflow:` hits `unknown label` at 182 (parseRecord) and 975 (requireStrictRecordShape). Today the lane's own record keeps `Measure:`/`Workflow:` below the blank line, which hides this. `SCRATCH_FROM` 118, `checkScratchField` 126. `Artifact X does not match delivery Y` is thrown at 1357 (live mode compares Artifact to delivery-ref tip; a record-only commit after accept-prep moves the tip).
- `skills/team-build/SKILL.md` (483 lines): by-hand rule for under two territories is at 342 ("Below two territories, run Setup through Ship above by hand"); heading 338; Setup step 7 (record opening fields, line 70 on) lists no `Scratch:`, `Artifact:` or `Evidence:`; accept turn 395-414; "Resuming (`startFrom`)" 431-436; Codex manual paragraph 438-441 stays.
- `docs/work-record.md`: field table 30-49 (no `Workflow:`/`Measure:`); `Scratch:` rules 67-90.
- `scripts/work-census.mjs` (per-record rows via `listRecords`/`parseRecord`, `perWorkReport` 99, `formatText` 136) is where "the census reports the line per build" can read the new header field; `scripts/build-census.mjs` reads session files, not records.

## 2. Helpers to reuse
- `skills/team-build/references/accept-prep.mjs`: `matchField`, `insertLine`, `lastSingletonIdx`, `splitPreservingEol` (insert-if-absent already exists for `Worktree:`; reuse it for `Artifact:`/`Evidence:`).
- `scripts/work-record.mjs`: `FIELD_LABELS`, `checkScratchField`, `parseRecord`, `listRecords`, `validateRecord` (accept a new label by adding to `FIELD_LABELS`, nothing else).
- `skills/team-build/references/build-loop-workflow.test.mjs`: `runScript`, `makeAgentStub` (label-keyed stub; an unscripted label throws), `buildResult/reviewResult/integrateResult`, `BASE_ARGS`.
- `skills/team-build/references/fixtures/accept-prep/` record fixtures; `scripts/work-record.test.mjs` `makeAcceptanceFixture`.

## 3. Tests that police this area
- `build-loop-workflow.test.mjs` L-C4.3: bans `Date.now`, `new Date`, `Math.random`, `process.`, `fs.`, `require(`, `import`, `isolation` anywhere in the script file, comments included.
- L-C4.4 (157): every `agent(` opts const is matched by `const X = {[^}]*}` (no nested braces) and must carry `agentType` and `model` from the four pinned pairs; a timeout key must sit in a flat const.
- L-C4.5 `args ?? {}` first reference to args; L-C4.2/7 meta phases exactly Setup, Build, Review, Fix, Integrate, Seam, Accept in order (a new Suite phase changes this test; edit it deliberately); L-C4.6 `log(` within 5 lines of `rounds-exhausted`; R9 every `*_MANDATE` carries `Never send peer notes.`; example args files parse and launch (1676-1755).
- `accept-prep.test.mjs` R3a byte-preservation of unowned lines, B1 no-trailing-newline, `missing-field` test at 200 (flips if accept-prep starts inserting Status/Artifact/Evidence).
- `scripts/work-record.test.mjs` 2271 pins the SKILL.md census paragraph text ("Run the census at accept time", `--lead`, `--marker`, `--out`, `Log: ... reviewed`, `accept --census` within 800 chars); do not reword that paragraph. Also `work-record-closeout.test.mjs`, `work-census.test.mjs`, `native-package.test.mjs` (skill set), `mirror-shared-skills.test.mjs`.

## 4. Open questions for the spec
- No per-agent time limit exists in `agent()` and the script has neither clock nor timers: which nearest mechanism needs no new part (a deadline line in each builder mandate plus a runner-owned watchdog, or the Workflow's own run-level abort)? The spec says rule it and say so in the record.
- The script has no fs: the state file must be read and written by a mid-tier runner agent. Is one extra runner call per phase acceptable under "no new mechanism"?
- Where does the second-host suite run from (named host, ssh alias, branch pushed to origin first)? The prompt gives no host names; and "none on Windows" conflicts with the Windows-built lane only if the host arg is absent.
- Per-build census line: work-census rows, or the work-record validator, or both?
