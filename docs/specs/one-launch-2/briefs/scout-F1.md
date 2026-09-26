# Scout — F1 (loop-script fixes, new accept-prep.mjs helper, SKILL.md sentences)

Read at base cf087dcfb4f8a5cc56a843a831ef41166810bad2 (33aa023 + one docs commit).

## Files and symbols
- `skills/team-build/references/build-loop-workflow.js` (813 lines). `acceptPrepPrompt`
  (line 300) is the CURRENT defect: step 1 (build-census.mjs) runs BEFORE step 3 writes
  the record's `Log: ... reviewed` line and rewrites `Status/Artifact/Worktree/Evidence`
  as "exactly these header lines ... and no others" (line 307) — confirms spec defects
  1 and 2 verbatim (order wrong; whole-header overwrite, not a scoped field edit).
  `setupPrompt` (line 267) already threads `seamBriefPath` fine for SETUP-mode
  territories. The GIVEN-territory path never reads `a.seamBriefPath` at all (only
  `reviewerBriefPath`/`integratorBriefPath` are destructured, line 319-320); its seam
  review falls back to `seamBriefToUse = reviewerBriefPathFinal` (line 649) — confirms
  defect 3 exactly: given mode has no seam-brief argument, full stop.
- `skills/team-build/references/build-loop-args.example.json`,
  `...legacy.example.json` — legacy (given) shape has no `seamBriefPath` key at all;
  matches defect 3.
- `skills/team-build/references/accept-prep.mjs` — does not exist; this is the ONE new
  file the lead ruled in (contracts R1-R2), plus its test and fixtures dir (none exist).
- `skills/team-build/SKILL.md` (426 lines) already documents accept-prep's role
  (lines 349, 354, 369, 375, 382, 390, 401) but has no "Base is one sha" sentence yet
  (grep clean for "two bases"/"merge commit") — R5's one sentence is a net-new addition.
- `docs/work/wr-2026-09-26-one-launch-fix.record.md` exists, `Status: owned`, Base
  33aa023bd927b44b23292d540cc0c2aed4ced212 (one sha already, consistent with R5).

## Helpers to reuse
- `scripts/work-record.mjs`: `parseRecord(text)` (line 90); `formatLogLine(at, status,
  owner, note)` (line 437) — the exact Log-line formatter accept-prep.mjs's step 1
  should call rather than hand-building the string; `acceptRecord`'s splice pattern
  (~line 1112: split on `/\r?\n/`, find first blank line, splice new lines before it,
  targeted regex on the `Status:` line only) is the field-scoped-edit shape to imitate —
  note it does NOT write atomically (plain `writeFileSync`, no temp+rename), so R2's
  atomic-write requirement is new work, not reuse.
- `checkAcceptance` is exported (line 773) but R2 pins invoking it as a subprocess
  (`work-record.mjs check-acceptance --record --repo --delivery-ref`), matching the
  existing CLI dispatch at line 1132.
- `scripts/build-census.mjs` already supports `--lead`, `--marker`, `--from/--to`,
  `--out` (grep lines 24-200) — no change needed there.

## Tests that police this area
- `skills/team-build/references/build-loop-workflow.test.mjs` (1487 lines): only asserts
  the RENDERED PROMPT TEXT (e.g. line 985-991 checks findings paths appear in
  `acceptCall.prompt`) — no test exercises real order or header preservation, which is
  exactly the "check that passes because it isn't looking" R1 calls out; the new
  `accept-prep.test.mjs` is where that real assertion must live.
- Existing setup-mode tests (lines 410, 720, 789, 965) pin `seamBriefPath` shape for
  SETUP territories only — a new test must cover GIVEN-mode `seamBriefPath` per R4.

## Open questions for the spec
- R2 says accept-prep.mjs inserts the `Log:` line "before the first blank line" and
  R2 step 1 also says insert `Worktree:` "after the last singleton header line if
  absent" — on a record where `Worktree:` is already present (like this build's own
  record, which has none yet), confirm insert-if-absent vs update-in-place is the only
  branch needed; the spec doesn't say what to do if `Worktree:` exists but the CLI has
  no setter (R2's own text anticipates this: "if the CLI has no in-place setter... say
  so in a finding").
- R3(b)'s "ORDER" test wants a stub `work-record`/`build-census` "under a fake
  --plugin-root" — confirm this means literal replacement scripts at
  `<fake-root>/scripts/work-record.mjs` and `.../build-census.mjs` that accept-prep.mjs
  actually shells out to (matching R2's `--plugin-root` flag), not an in-process mock.
