# L2 state — skills/team-build/SKILL.md

## Territory
`skills/team-build/SKILL.md` only. Worktree `/home/ben/Code/wt-one-launch-L2`, branch
`build/one-launch-1-L2`, cut from `fbd7cf6`. HEAD: `0915fb6d8f90fe8dc88b13988b3cc151ab1c7552`.

## Contracts I rely on
`docs/specs/one-launch-1/contracts.md` R2 (args shape), R3 (setup stage), R4 (seam), R5
(accept-prep, record writes), R6 (startFrom), R7 (return shape), R8 (lead session id),
R9 (wake discipline), R10 (Codex). Described the contract, not L1's code — L1 owns
`build-loop-workflow.js`/`.test.mjs` and is being built concurrently.

## Done
Round 1: rewrote "Running the loop from an Opus pane" as the default two-lead-turn flow.
Round 2: applied all 10 findings from `reports/review-L2-r1.md`. Line count 366 -> 392.
Round 3 (this round): applied all 4 findings from `reports/review-L2-r2.md` (0
BLOCKER, 1 MAJOR N1, 3 MINOR N2-N4) — see `reports/L2-report.md` for the full text.
In short: the accept turn no longer feeds accept-prep's `acceptance.censusPath`
straight to `accept` (that census predates the runner's own `Log: reviewed` line, so
`accept` refused it as `census-stale` on every loop build) — it now re-runs the census
at accept time, same as the manual Ship path; the launch turn now says to cut the
integration worktree/branch before opening the record, `recordPath` being
repo-relative to `integrationWorktree`; `setup-failed` moved out of the territory-row
blocker enum into the launch-error/blockers-only list (R3 returns no rows on setup
failure); "exactly one of these decides" became "the first of these that applies
decides" so a blocker and `acceptance: null` can co-occur without ambiguity. Line
count: 392 -> 399.

## Next
Nothing outstanding for L2. Available for a further fix round if a subsequent review
raises a new finding. r2's "notes to the lead" flagged that R5/L1's accept-prep census
step 1 can never pass census-stale either — that is L1/seam territory, not mine; I did
not touch it.

## Open questions
None blocking. Same note as prior rounds: `skills/decisions/scripts/skill-text.test.mjs`'s
"no SKILL.md line starts with `**`" rule only reads `skills/decisions/SKILL.md`, not
this file, so the several `**Label**:` lead-ins here are unaffected.

## How to run my gate
`node --test scripts/work-record.test.mjs skills/team-build/references/build-loop-workflow.test.mjs scripts/native-package.test.mjs scripts/mirror-shared-skills.test.mjs`
(the pinned test that reads this file's content is `scripts/work-record.test.mjs`'s
`skills/team-build/SKILL.md: the census command in the acceptance section...` test, plus
`native-package.test.mjs`'s frontmatter check; `node --test skills/team-build/` does not
work as a directory glob on this Node version — ran the explicit files instead).
172/172 pass. Log: `docs/specs/one-launch-1/reports/L2-gate.log`.
