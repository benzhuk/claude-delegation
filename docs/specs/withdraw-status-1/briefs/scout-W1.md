# Scout — W1 (withdraw status + command + exclusions)

Read at base a8bffb6 (build/withdraw-status-1).

## 1. Files and symbols
- `scripts/work-record.mjs` (1169 lines): `STATUSES` line 11 (7 values, no `withdrawn`).
  `KNOWN_LABELS` line 61 has no `superseded-by`/`superseded by`; `FIELD_LABELS` line 44
  is the singleton-header list `acceptRecord` writes new headers into — same shape to
  extend for `Superseded-by:`. `acceptRecord` (985-1131) is the exact pattern to mirror:
  `statusRe` regex swap (line ~1047), insert new lines before the first blank line
  (`blankIdx`, line ~1121), preserve every other byte, refuse-before-write via
  `checkAcceptance`-style pre-checks. `parseAcceptanceArgs`/`acceptanceMain` (1131-1169)
  dispatch only `check-acceptance`/`accept`; a `withdraw` command needs its own branch
  here (`argv[0]` check, its own flag map).
- `hooks/backlog-notice.js` (371 lines): `classify()` (213-238) buckets by literal
  `status === 'runnable'|'delivered'|'rejected'`; a `withdrawn` record already falls
  through untouched (not runnable/delivered/rejected), so no code change may be needed
  here — confirm with a fixture, the spec still wants "one test per exclusion."
  `buildLine` (241) composes the "N rejected awaiting a fix round" text spec quotes.
- `hooks/multi-codex-hook.mjs`: does NOT list work-record.mjs records. Its `card.status`
  (lines 79-82, from `goal-card.mjs`) is a goal-card result, an unrelated "status" name.
  R3's "only if it lists records" premise does not hold here — no change expected.
- `scripts/collect-from-origin.mjs` (177 lines): `computeState(status, merged)`
  (111-113) is the one place that needs a real fix — today ANY status that isn't
  `accepted`/`rejected` (including a future `withdrawn`) maps to `"owned"` (line 113
  comment: "absent/unparseable/any other -> owned (R1)"). Contract R3 requires
  withdrawn never show as owned or rejected: add a branch before the `owned` fallback.

## 2. Helpers to reuse
- `scripts/work-record.test.mjs` line 28 `mkRecordText(overrides, extraLines, body)` —
  the fixture builder for record text; extend `overrides.status` for withdrawn cases.
- `formatLogLine(at, status, owner, note)` (work-record.mjs line 437) — reuse verbatim
  for the withdraw Log line; `note` already free-text so `<reason>` (and
  `superseded-by <name>` if that goes in Log:, per spec item 2's fallback) fits it.
- `childEnv()` (imported across `scripts/*.test.mjs`, `hooks/*.test.mjs`) — every fixture
  git/subprocess spawn in new tests must go through it, never bare `process.env`.
- `readConfinedRegularFile` (used inside `acceptRecord`/`checkAcceptance`) — the
  path-confinement read already used for record files; reuse for `withdraw`'s read.

## 3. Tests that police this area
- `scripts/work-record.test.mjs:207` `"STATUSES includes rejected and has seven values"`
  — WILL fail once `withdrawn` is added; must be updated to eight, in the same territory.
- `scripts/work-record.test.mjs:232` FINDING_CODES "fourteen total" — only breaks if a
  new finding code is added; spec doesn't ask for one, leave alone.
- `scripts/collect-from-origin.test.mjs:122` `"computeState: accepted maps by merged,
  rejected passes through, everything else is owned"` — its own name asserts the exact
  behavior R3 says must change for `withdrawn`; this test's title/body needs updating
  alongside the fix, or it will assert the old (wrong) behavior.
- `scripts/collect-from-origin.test.mjs:166` bare-remote fixture enumerates every state
  string; add `withdrawn` to that enumeration.

## 4. Open questions for the spec
- Where does `Superseded-by:` live if the parser test at collect-from-origin.md line
  356-357 (`docs/census.md`) also enumerates collector states — does that doc list need
  the new terminal state too, or is R4's "docs/ and skills/" grep already covering it
  (found: `docs/work-record.md:35`, `:48-55` Status-meanings list, and
  `skills/team-build/SKILL.md:169,217` — all plain prose lists, not code)?
- Contract R2 lets `Superseded-by:` fall back to the Log line "if the parser rejects
  unknown headers" — but R1 already mandates adding it as a known label, so this
  fallback branch should never trigger; confirm with the lead that R1 makes R2's
  conditional moot rather than something to implement defensively.
