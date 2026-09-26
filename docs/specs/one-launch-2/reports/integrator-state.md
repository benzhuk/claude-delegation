# Integrator state — one-launch-2 (round 3)

Territory: F1 (build/one-launch-2-F1, sha 4eb7bd1e91f716f902c86681a075eff67e473fc4, review
APPROVE for that exact sha, F1-review.md) — merged into build/one-launch-2. This F1 sha sits
on top of the round-2 sha (8791423) already merged in a prior integrator round (merge commit
2f659bf, then rejected at integrate for a new N2 failure — see integrator-report.md's history
and docs/work/wr-2026-09-26-one-launch-fix.record.md's Log line at 2026-09-26T18:31:00Z).
Range 8791423..4eb7bd1 touches exactly one file: skills/team-build/references/accept-prep.test.mjs
(childEnv seal fix for the N2 finding from the prior round).

Merge commit (this round): c904a4aac6c92d5735c768be8d2a4bc08114af51 (ordinary merge, no rebase,
not pushed). `git rev-parse HEAD` run in /home/ben/Code/wt-olfix after the merge.

Pre-existing uncommitted state in the worktree at start of this round (not mine, left as found,
not staged/committed): modified docs/specs/one-launch-2/reports/F1-gate.log, F1-report.md,
F1-review.md, F1-state.md; untracked F1-n2-gate.log. None of these are touched by the
8791423..4eb7bd1 diff, so the merge did not conflict with them.

## Gate: `node scripts/run-tests.mjs`

Ran three times on the merge commit c904a4a to resolve a one-off flake (see below). Official
log (3rd run, matches base exactly): docs/specs/one-launch-2/reports/integrator-gate.log.
Summary (3rd run): tests 1746 / pass 1741 / fail 2.
Failing test names (3rd run): V4 (skills/multi/scripts/mirror-shim.test.mjs), H6
(skills/multi/scripts/note-send.test.mjs). N2 (hooks.test.mjs) — the round-2 new failure — is
GONE, confirmed fixed.

Run 1 (immediately after merge) additionally showed a third failure, once:
"one injected selection invokes exactly one bound entry and maps lifecycle states to safe
summaries" in skills/decisions/scripts/registered-pickup.contract.test.mjs:98 (assertion
"ordinal selects canonical repo/page order, not fixture creation order"). Investigated:
- Not in F1's diff at all: 8791423..4eb7bd1 touches only accept-prep.test.mjs; F1's full scope
  (contracts.md) never touches skills/decisions/.
- Does not reproduce running the file alone (4/4 clean runs).
- Does not reproduce on run 2 (scratch log) or run 3 (official log) of the full suite at the
  same commit c904a4a — same test, same code, pass/fail differs run to run.
- The test's own in-file comment says the sort it depends on is keyed on `mkdtempSync`'s random
  fixture-directory suffix, not creation order — consistent with an intermittent, pre-existing
  order-dependency, unrelated to this merge.
Conclusion: flaky/non-deterministic, not a new regression caused by F1's merge. Reported as a
fact for the record, not judged away and not silently dropped — see report's Triage section.

Base comparison: scratch worktree at base sha 33aa023bd927b44b23292d540cc0c2aed4ced212, created
under the session scratchpad (never under /home/ben/Code/wt-olfix, never pushed, removed after).
Ran twice to check for the same kind of flake at base: both runs identical, tests 1714 / pass
1709 / fail 2, failing names V4 + H6 only (no analog of the decisions flake seen in either base
run, in two tries).

Failing-test-name diff (branch minus base), by name: none. V4 and H6 are pre-existing on both
sides (matches contracts.md R6's pinned list). No name present on the branch and absent from
base survived to the official (3rd) run.

Territory-scoped gate (verbatim, R6/F1): `node --test skills/team-build/references/build-loop-workflow.test.mjs
skills/team-build/references/accept-prep.test.mjs` from /home/ben/Code/wt-olfix at c904a4a:
tests 100 / pass 100 / fail 0.

Targeted N2 repro: `node --test --test-name-pattern="N2" skills/multi/scripts/hooks.test.mjs`:
tests 1 / pass 1 / fail 0 — confirms the round-3 fix.

Verdict: PASS. No new failing test name vs base, by name, on the official gate run.

Not done (out of scope for integrator): no fix applied, no ship decision made, lead's dogfood
step untouched, pre-existing uncommitted docs edits left as found.
