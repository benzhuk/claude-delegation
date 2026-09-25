VERDICT: PASS

# Seam fix round 3 — build-loop-workflow.js / SKILL.md

Goal-card line served: DONE (a build goes spec to accepted through the plugin) — this
round removes N1, an accept-prep false blocker that would have stopped a real, correctly
merged build from ever reaching the census/accept step. Nearest NOT avoided: no new
mechanism added; N4 (a contract-literal deviation) is left to the lead rather than
patched in code, per its own "no code change" instruction.

Worktree: `/home/ben/Code/claude-delegation-lane4` (branch `build/one-launch-1`).
Findings applied from: `docs/specs/one-launch-1/reports/seam-r2.md` (HEAD at review time
`a548b145c0c4dc6e3e7d9e1c3dabf639315cac94`).
Fix commit (code): `3609483f1cbfaaac2f4705098a8b4ac7dacd02ee`. This report and its state
file were committed on top of that as `70dc805e2ca16d9094f3d45c7f6a8d3c861a94ec`, the sha
this report field names below (the last commit in the worktree, per `git rev-parse HEAD`
run after it).

Applied every seam-reviewer-verified finding in one round (N1 MAJOR, N2/N3 MINOR). N4 is
explicitly a lead ruling on contracts.md with "no code change" per the finding itself, so
it is left open — not something a builder can apply.

## MAJOR

- **N1** — `acceptReportPath` (script) was computed as
  `${dirName(specPath)}/reports/accept-prep.md`, unanchored, while the accept-prep
  runner's own prompt (R5 steps 1 and 4) moves its cwd to the delegation plugin root. A
  repo-relative `specPath` (the common case, e.g. the example args) then resolved to a
  path under the plugin root rather than the target repo — the same bug class as S2.
  Fixed the same way S2 anchored the evidence/record paths: when `specPath` does not
  start with `/`, the report path is now `${integrationWorktree}/${dirName(specPath)}/reports/accept-prep.md`;
  an absolute `specPath` is untouched. Added `acceptReportPathFor(args)` to the test
  file mirroring this exact logic, and swapped it into all 7 call sites that previously
  called `reportPathFor(args.specPath, "accept-prep")` (lines then at 921, 1214, 1233,
  1291, 1316, 1369, and 1455 in the pre-round file; the example-args site now passes
  `example`).

## MINOR

- **N2** — twin of S4: the setup prompt's integration clause
  (``The integrator brief names integration worktree ${w}, branch ${b}, full-suite gate
  ${g}.``) rendered a literal `undefined` for `branch`/`full-suite gate` whenever
  `integrationBranch`/`integrationGate` were absent, even though S1's `integratePrompt`
  already guarded both fields. Each field is now independently conditional, matching the
  guard shape S1 already uses. New test: `N2: the setup prompt never renders undefined
  when integrationBranch/integrationGate are absent`.
- **N3** — SKILL.md's Accept-turn routing sentence named only the `integrationHead`
  reason for an `accept-prep` blocker entry (`review-sha-mismatch`), leaving the second
  reason the script has emitted since round 2 (`report-path-mismatch`) undocumented.
  Both reasons are now named inline.

## Deferred (lead action, no code change)

- **N4** — s10's `seam SKIPPED` rendering (applied in round 2) deviates from
  contracts.md R5 step 3's pinned Log literal, which presupposes an APPROVE seam. The
  finding itself says this needs a lead ruling on contracts.md (amend the literal to
  allow `seam SKIPPED`, or revert the r2 script/SKILL rendering) rather than a builder
  fix — script and SKILL already agree with each other, so there is no seam defect to
  patch in this territory. Left untouched; flagged for the lead.

## Tests

`node --test skills/team-build/references/build-loop-workflow.test.mjs`: 68/68 pass
(67 prior + 1 new N2 test; N1's 7 call-site swaps and N3 needed no new test — they
reuse/extend existing assertions).

## Gate

`node scripts/run-tests.mjs` (full suite, per integrator brief's lead ruling: gate is
"no NEW failure vs base fbd7cf6"):

```
tests 1595
pass 1590
fail 2
skipped 3
```

The 2 failing tests are exactly the two the integrator brief's lead ruling names as
known base failures (both by test name, matched verbatim):
- `V4: a real install writes one shim per command, each naming ITS OWN command in its
  errors` (skills/multi/scripts/mirror-shim.test.mjs)
- `H6: a plain checkout resolves to itself, and backslashes are normalised (L1)`
  (skills/multi/scripts/note-send.test.mjs)

Neither file is in my territory (L1: build-loop-workflow.js/.test.mjs/example.json/
scout-brief.md; L2: SKILL.md) and neither failure was touched by this round's diff. No
new failure vs base fbd7cf6.

## Files changed

- `skills/team-build/references/build-loop-workflow.js`
- `skills/team-build/references/build-loop-workflow.test.mjs`
- `skills/team-build/SKILL.md`

## Not touched

`docs/specs/one-launch-1/briefs/integrator.md`, `docs/work/wr-2026-09-25-one-launch.record.md`,
`docs/specs/one-launch-1/reports/integrate.md`, `docs/specs/one-launch-1/reports/seam-r1.md`,
`docs/specs/one-launch-1/reports/seam-r2.md` — pre-existing local modifications/untracked
files from other agents' rounds, left exactly as found (not staged, not committed).

No peer notes were sent.
