Territory: F1 (one-launch fix round) — build-loop-workflow.js, its test, args example
files, skills/team-build/SKILL.md (one sentence), accept-prep.mjs + test + fixtures.

Contracts I rely on: docs/specs/one-launch-2/contracts.md R1-R8 (R2 pins accept-prep.mjs's
CLI flags/step order exactly; R3 pins its test list; R4 pins loop-script changes; R5 pins
the one SKILL.md sentence; R6 pins the gate; R7 setup-path normalisation; R8 says
Base-of/parents go in the record BODY, never a header line — a lead ruling I applied to
the R5 sentence this round after review finding M2).

Done round 2 (F1-review.md round-1 findings, applied except M4): B1 BLOCKER (insertLine
helper fixes header-splice corruption, 2 tests); M1 (samePath for the 4 sibling-path
compares, 3 tests); M2 (SKILL.md sentence reworded to match R8, body not header); M3
(acceptPrepPrompt cd's to plugin root, names all 3 placeholders); m1 (`--evidence none`
no longer a literal path); m2 (runCensus mkdirs --census-out dir); m3 (`--marker`
single-quoted); m4 (empty-string seamBriefPath falls back via `||`); m5 (headSha wording
says "full 40-character"). NOT applied: M4 (census-stale re-check) — needs a LEAD ruling
on R2's pinned step-3 shape; flagged, not silently dropped; still open, see below.

Gate (round 2): 100/100 pass (was 92; +8 new tests). Re-ran R3b ORDER negative
demonstration against a step1/step2-swapped copy: only ORDER fails, still discriminates.

Done round 3 (integrator-report.md finding, N2 triaged to F1, sha
4eb7bd1e91f716f902c86681a075eff67e473fc4): accept-prep.test.mjs's 4 spawnSync sites (orig
lines 367/395/423/441) spread the runner env directly instead of the sealed `childEnv()`
helper (skills/multi/scripts/test-child-env.mjs), tripping the repo-wide N2 invariant
(hooks.test.mjs) even though this territory's own gate never runs that file. Fixed:
imported `childEnv` (same relative path build-loop-workflow.test.mjs already uses),
routed all 4 sites through `childEnv(tmp, { ORDER_LOG, RECORD_ABS_PATH })`, using each
test's own fixture tmp dir as the "home" arg. No fixture files changed; R3(a) byte-diff
assertions unaffected. Only file touched: accept-prep.test.mjs.

Next: nothing outstanding except the M4 lead ruling (unresolved, lead's call, not
re-litigated this round since no new finding named it).

Open questions: M4's resolution (accept-prep report census-stale itself vs. lead re-runs
census at accept-turn vs. a future scripts/ change) is the lead's call, not mine —
out of this territory's autonomy (R2's pinned CLI shape) and out of scope (scripts/ is
explicitly NOT this lane).

How to run my gate:
node --test skills/team-build/references/build-loop-workflow.test.mjs skills/team-build/references/accept-prep.test.mjs
(run from /home/ben/Code/wt-one-launch-2-F1): exit 0, 100/100 pass.
Also (the reviewer-named repro): node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs
(same worktree): exit 0, 1/1 pass.
Logs at docs/specs/one-launch-2/reports/F1-gate.log and F1-n2-gate.log (in wt-olfix).
