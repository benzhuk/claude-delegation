VERDICT: APPROVE 0915fb6d8f90fe8dc88b13988b3cc151ab1c7552

# Review L2 r3: skills/team-build/SKILL.md (delta re-review)

JUDGMENT: Opus review per the spec (Sonnet builds, Opus reviews).
Worktree `/home/ben/Code/wt-one-launch-L2`. I ran `git rev-parse HEAD` myself and got `0915fb6d8f90fe8dc88b13988b3cc151ab1c7552`. The tree is clean.
Range `65f4217..HEAD` is one commit (`0915fb6`). It touches one file, `skills/team-build/SKILL.md` (+22/-15). Measured line count: 392 -> 399.

Tests I ran:
- `node --test scripts/work-record.test.mjs scripts/native-package.test.mjs scripts/mirror-shared-skills.test.mjs skills/team-build/references/build-loop-workflow.test.mjs`: 172/172 pass.
- `node --test skills/decisions/scripts/skill-text.test.mjs`: 10/10 pass.
- I grepped every `*.test.mjs` that mentions `SKILL.md`. Only `scripts/work-record.test.mjs` names `team-build/SKILL.md`, and it is covered by the run above. The `skills/multi` tests do not read team-build.

Counts: 0 BLOCKER, 0 MAJOR, 0 MINOR.

## Prior findings (r2): all 4 verified fixed
- N1 (MAJOR): the Accept turn (L353-359) now re-runs the census at accept, with `--out <integrationWorktree>/docs/work/evidence/<work-id>-census.md`, and then runs `accept --census <that file>`. `--no-census` is now only for a broken census. The census-at-accept rule (L372-376) no longer calls `acceptance.censusPath` the accept census.
  - I checked the mechanics against `scripts/work-record.mjs`. `accept` reads the census into memory (`loadCensus`, L1000). Then it writes the copy to `<evidenceDir>/<work>-census.md` (L1006-1010, L1024-1027), which is the same path as the lead's `--out` when Evidence lives in `docs/work/evidence`. That is a harmless same-bytes overwrite.
  - census-stale (L774-791) compares the census's `leadLastMessageAt` to the last `Log: reviewed`. The lead's `.jsonl` gains the Workflow-completion notification after the runner's `Log:` line, so the fresh census passes.
  - `checkAcceptance` has no clean-tree requirement, so an untracked census file in the integration worktree does not trip it.
- N2 (MINOR): L322-324 now says to cut the integration worktree/branch from `baseSha` and to open the record inside it, with `recordPath` repo-relative to `integrationWorktree`. This matches `path.resolve(repoRoot, recordPath)`.
- N3 (MINOR): `setup-failed` is no longer in the row `blocker` enum. L343-345 puts it in the blockers-only launch-error list "with no rows". That matches R3 and `earlyReturn` (`territories: []`). The text does not pin its id, which is correct: R3 is `{ id, reason }`, and L1 uses either `*` or the territory id.
- N4 (MINOR): L360 now reads "the first of these that applies". L362 reads "`acceptance: null` with no blockers means ...".

## Regression hunt: none found
- The diff touches only the loop section. Ship (L209-280), roles, tiers, `JUDGMENT:` lines and bug-fix fields are byte-identical to r2's reviewed text. README.md is untouched.
- Arg names, stage order and return fields still match contracts.md R2-R7. The Codex paragraph (R10) and the startFrom paragraph (R6) are unchanged and still correct.
- The builder's one cosmetic re-wrap at L325-326 changes no words.

## Notes to the lead (not counted as findings)
- L346-347 still says "`seam`/`acceptance` are `null` only when no `integrationWorktree` was given". This is the contract's own wording (R4, R5), so the skill is faithful to the contract. L1's `earlyReturn` (`build-loop-workflow.js:324-325`) also nulls them on launch errors (`missing-args`, `mixed-territory-modes`, `setup-failed`). The Accept-turn ordering (blockers first, L360-362) still routes the lead correctly, so no decision goes wrong.
  - If you want the two to agree, you can either amend R4/R5 or make a one-line skill edit. Current text: "`seam`/`acceptance` are `null` only when no `integrationWorktree` was given;". Replacement: "`seam`/`acceptance` are `null` only when no `integrationWorktree` was given or the launch errored;".
  - This belongs to the seam review or the contract, not to L2.
- The accept census now departs from brief item 1 and R5 ("--census <censusPath>") on purpose, per r2 N1. The contract flaw in R5 step 1 is still open: under census-stale, accept-prep's census can never be the accept census. The same goes for the plugin-root `--out` in L1's accept-prep prompt. Both still need your ruling.
- The line count is 399, above the brief's expected shape of "fewer than 371". Every line added since r1 is contract detail that review required. Accepting the count or asking for trims elsewhere is your call.

Cause: r2 found that the accept turn sent accept-prep's census to `accept`, which always refuses it as census-stale. It also found three contract-accuracy gaps: the record's location, `setup-failed` listed as a row blocker, and an "exactly one decides" rule.
Discriminating check: `work-record.mjs:774-791` census-stale compares `leadLastMessageAt` to the last `Log: reviewed`. SKILL.md L353-359 now sends a census taken during the accept turn, after that line. R3 plus `earlyReturn` give `territories: []`, and SKILL.md L343-345 now says "with no rows".
Fix location: skills/team-build/SKILL.md L322-326 (N2), L343-345 (N3), L353-362 (N1 and N4), L372-376 (N1).
Simplification: the accept census is now one rule with no loop special case: re-run it at accept, always, as Ship already says.
