VERDICT: PASS

# L2 report — fix round 3 (r2 findings)

Worktree: `/home/ben/Code/wt-one-launch-L2`, branch `build/one-launch-1-L2`.
Base for this round: `65f4217d79735fbdb0a4b4b84e7f2a085afd7a8d` (reviewed sha, tree
clean, matched before edits). New commit: `0915fb6d8f90fe8dc88b13988b3cc151ab1c7552`.
File touched: `skills/team-build/SKILL.md` only.

Line count: 392 -> 399 (+7). Still over the brief's "fewer than 371" expected shape,
same as r2 noted (the r1/r2 rounds added contract detail the reviewer required; r2's
own note says the lead can accept this or ask for trims elsewhere).

## Findings applied (all 4 from review-L2-r2.md)

- **N1 (MAJOR)**: accept-turn PASS branch no longer passes `acceptance.censusPath`
  straight to `accept`. It now re-runs the census (Ship's `build-census.mjs` command)
  first, with the reviewer's rationale (`acceptance.censusPath` predates its own
  `Log: ... reviewed` line, so `accept` refuses it as `census-stale`) inlined, then
  runs `accept --census <that file>`. `--no-census` is now reserved for "the census
  itself breaks", not the null-censusPath case. Applied the reviewer's exact fix text
  for both the accept-turn paragraph (was L349-351) and the census-at-accept rule (was
  L368).
- **N2 (MINOR)**: launch turn now says to cut the integration worktree/branch from
  `baseSha` before opening the record, and that `recordPath` is repo-relative to
  `integrationWorktree` — matching how `accept`/`check-acceptance` resolve it
  (`path.resolve(repoRoot, recordPath)`).
- **N3 (MINOR)**: `setup-failed` moved out of the territory-row `blocker` enum (R3
  returns no rows on setup failure) and into the launch-error/blockers-only list
  alongside `missing-args`/`mixed-territory-modes`, explicit "with no rows".
- **N4 (MINOR)**: "exactly one of these decides" changed to "the first of these that
  applies decides", and "`acceptance: null` means" changed to "`acceptance: null` with
  no blockers means" (a `*`/`setup-failed` blocker can co-occur with `acceptance: null`
  since the early return nulls every stage field).

Also made one whitespace-only wrap fix in the launch-turn paragraph (moved "Then make
ONE Workflow call, `{scriptPath: ...}`" onto one flowing line instead of an orphaned
line break) — not a reviewer finding, purely cosmetic, no wording change.

## Gate run

`node --test scripts/work-record.test.mjs scripts/native-package.test.mjs
scripts/mirror-shared-skills.test.mjs skills/team-build/references/build-loop-workflow.test.mjs`
(the same set r2 ran, since that command already covers every test that reads
`skills/team-build/SKILL.md` plus the loop script's own tests): **172/172 pass, 0
fail**. Full log at
`/home/ben/Code/claude-delegation-lane4/docs/specs/one-launch-1/reports/L2-gate.log`.

Did not re-run the full `node scripts/run-tests.mjs` suite — r2 already established the
2 failures there (V4/H6 in `skills/multi`) are pre-existing at base `fbd7cf6` and
unrelated to this file; this round's diff is confined to `SKILL.md`.

## Deviations / assumptions

None beyond the reviewer's own fix text, applied verbatim where given (N1) or per the
stated intent (N2-N4). No other files touched. No git identity changes, no destructive
git, no peer notes sent.
