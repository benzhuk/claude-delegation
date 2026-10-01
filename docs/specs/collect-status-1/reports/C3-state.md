# C3 state — collect-status-1

## Territory
`scripts/required-wiring.default.json` (one new row), `skills/continue/SKILL.md` (one paragraph),
`docs/GOALS.md` (conditional, skipped — see report), plus a pre-authorized one-line count bump in
`scripts/wiring-check.test.mjs` and one new fixture test file.

## Contracts I rely on
- contracts.md K1: `file` = `~/.agents/collect/claude-delegation/status.json`, `maxAgeSeconds`
  2700, `requiresFile` = `~/.agents/collect/installed.json` (pinned, used verbatim).
- C1's spec (spec.md): `status.md` is "the file the lead reads" — the paragraph names that path,
  not `status.json` (the wiring check watches `.json`; same directory, written atomically
  together).
- `scripts/wiring-check.mjs`'s `expandHome()`: literal `~`-prefix substitution only, no basename
  computation — confirms the literal path (not a template) is correct here.

## Done
1. Added `collect-status-fresh` row to `scripts/required-wiring.default.json` (after
   `janitor-last-run`), exact K1 values.
2. Bumped `scripts/wiring-check.test.mjs`'s shipped-list count assertion 17→18 (and its comment),
   the one pre-authorized mechanical fix — nothing else in that file touched.
3. Added `## Lane state comes from the collector, once per wave` section to
   `skills/continue/SKILL.md`, after `## Select and run work`.
4. Added `scripts/continue-skill-lane-state.test.mjs` (2 tests) as the fixture backing item 3.
5. Left `docs/GOALS.md` untouched — genuine ambiguity over which section is "the lead-cost
   measure," documented in the report rather than guessed.
6. **Round 2 (review fix, F1 MAJOR):** appended a 3rd test to
   `scripts/continue-skill-lane-state.test.mjs`, verbatim as reviewer round 1 specified, pinning
   the `collect-status-fresh` row's exact `type`/`file`/`maxAgeSeconds`/`whenMissing`/`requiresFile`
   literals against contracts.md K1 (previously only the list-length count was checked, so any
   drift in those literals shipped green). Verified myself: unchanged row → 63/63 pass; a scratch
   mutation of `maxAgeSeconds` (2700→27000) → 1 failure as reviewer predicted; row restored from
   backup, confirmed via `git diff --stat` that only the test file changed.
7. Gate green: `node scripts/run-tests.mjs scripts/wiring-check.test.mjs
   scripts/continue-skill-lane-state.test.mjs` → 63/63 pass, exit 0 (was 62/62 before round 2's
   added test).

## Next
Nothing outstanding in this territory. Reviewer's N1 (2700s bound vs `--every` above 45) and N2
(SKILL.md path generality) are both explicitly advisory/optional, no action required this round. If
a future builder/reviewer decides which GOALS.md section is "the lead-cost measure," that edit is
theirs to make (or the lead can rule it and hand it back).

## Open questions
- Which GOALS.md section (if either) is "the lead-cost measure's status sentence": `## Cut token
  cost hard, lose no benefit` (tokens, no turns) or `## The lead spends judgment, not turns`
  (turns, no tokens)? Neither carries both halves of spec.md:10's 468-turns/86.4M-tokens pair.
  Left for the lead to rule; see report item 3 for full reasoning.

## How to run my gate
```
node scripts/run-tests.mjs scripts/wiring-check.test.mjs scripts/continue-skill-lane-state.test.mjs
```
Exit 0, 63/63 pass expected. Log written to
`docs/specs/collect-status-1/reports/C3-gate.log` by the pinned gate command.
