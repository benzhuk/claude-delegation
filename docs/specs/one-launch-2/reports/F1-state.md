Territory: F1 (one-launch fix round) — build-loop-workflow.js, its test, args example
files, skills/team-build/SKILL.md (one sentence), accept-prep.mjs + test + fixtures.

Contracts I rely on: docs/specs/one-launch-2/contracts.md R1-R8 (R2 pins accept-prep.mjs's
CLI flags/step order exactly; R3 pins its test list; R4 pins loop-script changes; R5 pins
the one SKILL.md sentence; R6 pins the gate; R7 setup-path normalisation; R8 says
Base-of/parents go in the record BODY, never a header line — a lead ruling I applied to
the R5 sentence this round after review finding M2).

Done round 2 (F1-review.md round-1 findings, applied except M4):
- B1 (BLOCKER): added `insertLine` helper in accept-prep.mjs; both header splices
  (Worktree insert, Log append) now go through it so a header-only, no-trailing-newline
  record never gets its last unowned line glued to the new one. Two new tests.
- M1: build-loop-workflow.js's four sibling-path compares (reviewer/integrator/seam
  brief, report) now use `samePath` like the territory rows already did (R7). 3 new tests.
- M2: SKILL.md's one sentence reworded so Base parents go in the record body, matching
  R8 (was contradicting it, per the review).
- M3: acceptPrepPrompt now tells the runner to `cd` to the plugin root before running the
  helper command, and names all three bracketed placeholders (was "two").
- m1: `--evidence none` no longer appended as a literal evidence path (reuses
  splitEvidenceList on both sides of the merge).
- m2: runCensus now mkdirs the --census-out directory before spawning build-census.mjs.
- m3: `--marker` is now single-quoted (shell-escaped) in the rendered command.
- m4: an empty-string seamBriefPath now falls back to the reviewer brief (`||` not `??`).
- m5: integratePrompt now says "report headSha as the full 40-character output of..."
  explicitly, since nothing else in the mandate requires that length.
- NOT applied: M4 (census-stale can still surface at the lead's real `accept --census`
  even though accept-prep's own step 3 looks clean) — the review itself says this needs a
  LEAD ruling on R2's pinned step-3 shape (three options given, one of which — passing
  --census through step 3 — would change R2's pinned CLI). No R9 ruling exists in
  contracts.md as of this round; applying any option unilaterally would exceed this
  territory's "check in before changing... step order R2 pins" autonomy boundary. Flagged
  for the lead/integrator, not silently dropped.

Gate: 100/100 pass (was 92; +8 new tests: B1 x2, M1 x3, m1 x1(2 cases), m2 x1, m4 x1, plus
M3/m3/m5 asserted inline in existing tests). Re-ran the R3b ORDER negative demonstration
in scratch against a step1/step2-swapped copy post-fix: 16/17 pass, only ORDER fails with
`sawReviewedLog=false` — still discriminates correctly.

Next: nothing outstanding in this territory except the M4 lead ruling noted above.

Open questions: M4's resolution (accept-prep report census-stale itself vs. lead re-runs
census at accept-turn vs. a future scripts/ change) is the lead's call, not mine —
out of this territory's autonomy (R2's pinned CLI shape) and out of scope (scripts/ is
explicitly NOT this lane).

How to run my gate:
node --test skills/team-build/references/build-loop-workflow.test.mjs skills/team-build/references/accept-prep.test.mjs
(run from /home/ben/Code/wt-one-launch-2-F1). Log at
docs/specs/one-launch-2/reports/F1-gate.log (in wt-olfix): exit 0, 100/100 pass.
