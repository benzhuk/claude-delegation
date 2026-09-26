VERDICT: PASS c3a97b102716b632132bcb78506edbb141e6640e

# L1 report — round 2 (fixes for review-L1-r1.md)

Worktree: /home/ben/Code/wt-one-launch-L1, branch build/one-launch-1-L1.
Files touched (my territory only): skills/team-build/references/build-loop-workflow.js,
skills/team-build/references/build-loop-workflow.test.mjs. scout-brief.md and both
build-loop-args*.example.json untouched.

Gate: `node --test skills/team-build/references/build-loop-workflow.test.mjs` — 61/61
pass (was 42/42 before this round; +19 new tests). Log:
docs/specs/one-launch-1/reports/L1-gate.log.

## MAJOR findings — all applied

- **M1** (`build-loop-workflow.js`, accept-prep evidence): `decidingReports` now maps
  `approved.map(r => r.findingsPath)` (the reviewer's APPROVE file) instead of
  `r.reportPath` (the builder's own report). Test: the full-fixture test now asserts the
  accept-prep prompt contains each territory's/seam's findings path and never a builder
  report path.
- **M2** (seam delta-review sha leak): `seamPrompt` takes a new `fixSha` param and only
  appends `Commit range: <priorHead>..HEAD` when `!sameSha(priorHead, fixSha)`, mirroring
  `reviewPrompt`'s existing guard. Both call sites now pass `seamFixBuild.sha`. Tests:
  new "M2: seam-fix that makes no new commit does not leak the current HEAD" test, plus
  a new assertion on the existing NEEDS_FIXES→APPROVE seam test for the twin (new-commit)
  case.
- **M3** (unverified accept-prep `integrationHead`): the script now computes
  `expectedHead = seam.verdict === 'APPROVE' ? seam.sha : integrate.headSha` and checks
  `sameSha(acceptResult.integrationHead, expectedHead)`; a mismatch adds
  `{id:'accept-prep', reason:'review-sha-mismatch'}` to `blockers` (acceptance itself is
  still returned — the report says so — but it's flagged). Two new tests cover the
  literal-"HEAD" echo case and the seam-verified-longer-sha case.
- **M4** (accept-prep running on a partial build): a new branch
  `excluded.length > 0 || approved.length === 0` returns
  `acceptance: {skipped: 'territory-blockers'}` before the seam check, per the
  reviewer's recommendation. Two new tests (single-territory-blocked with integrator
  PASS; one-of-two-blocked).
- **M5** (unverified setup brief paths): after per-territory verification, the script now
  checks `setupResult.{reviewerBriefPath,integratorBriefPath,seamBriefPath}` against the
  script's own computed names; any mismatch returns `setup-failed` with id `'*'` before
  using them. Three new tests (wrong seamBriefPath; wrong reviewerBriefPath; wrong
  integratorBriefPath).
- **M6** (journal test that passed because it wasn't looking): the full-fixture test's
  journal is now built live through a wrapping stub (not reconstructed from
  `stub.calls` after the fact), asserts the return entry is last, checks
  `{agentType, model}` against `PINNED_PAIRS`, and asserts the exact sorted label set.

## MINOR findings — applied, with reasoning where the review left a choice

- **m1** (trailing slash): `baseName`/`dirName` strip a trailing `/` before computing.
  Two new tests (worktree nesting; empty slug).
- **m2** (startFrom not validated): folded into the existing `missing-args` reason per
  the review's own fallback ("otherwise fold it into missing-args") rather than
  inventing `invalid-start-from`, since a new reason needs the lead's OK. Validates sha
  shape, verdict enum, NEEDS_FIXES needing a findingsPath, and setup-territory rejection.
  Four new tests.
- **m3** (phase() firing unconditionally): `phase('Setup')` moved inside `if (setupMode)`;
  `phase('Seam')`/`phase('Accept')` now guarded on `integrationWorktree`. No return-value
  change, so no new assertions beyond the existing suite passing.
- **m4** (setup echo risk): setup prompt now tells the runner to report the `rev-parse`
  output "verbatim... never copy the base sha from this prompt".
- **m5** (accept-prep script paths): both `build-census.mjs` and `work-record.mjs` steps
  now say "From the delegation plugin root (resolve it yourself...)", never the
  integration worktree's or target repo's own `scripts/`.
- **m7** (seam sha dropped on rounds-exhausted): `seam.sha` now keeps the last verified
  head on `rounds-exhausted`, only nulled on a hard blocker, for parity with a territory
  row. New assertion on the existing rounds-exhausted test.
- **m9** (test gaps): added setup-dying-twice, branch-mismatch, briefPath-mismatch,
  missing-row-mismatch, seam round-1 sha-mismatch, and seam-agent-dying-twice tests.

## Left unapplied — flagged for the lead, not resolved here

- **m6** (accept-prep Log-line literal on seam SKIPPED): R5 pins the exact line
  `Log: <iso> reviewed <owner> seam r<n> APPROVE <sha>` verbatim in the contract itself;
  the review says changing it for the SKIPPED case "needs the lead's call, since R5 pins
  the literal." Left the prompt's literal unchanged rather than deviate from a pinned
  contract string without the lead's ruling.
- **m8** (brief paths not required on the all-given path): the review's own fix says
  "leave it for the lead to rule on" and notes the current (permissive) behaviour
  "matches 0.20.9 behaviour." Left unchanged; strict enforcement would also require
  editing brief paths into ~8 existing given-path test fixtures per the review's own
  instruction, which is a larger, lead-gated change.

Both are open questions for the lead, not silently dropped.

## Notes

- Header comment: still 42 lines (15-56), within the ≤45-line budget; the return-shape
  and args doc comment didn't need wording changes for this round's fixes.
- No cross-territory files touched; L2's `SKILL.md` is untouched.
- No destructive git; no identity changes; nothing pushed.
