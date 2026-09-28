Work: wr-2026-09-28-stale-session-guard
Scope: docs/specs/stale-session-guard-1/spec.md (lane 42 lead spec, pinned rulings P1 to P8) from the "Lane 42, stale-session guard" sentence of docs/specs/2026-09-28-parallel-bundle.md at dc16de3, packet docs/specs/stale-session-guard-1/packet.md
Owner: skills-n
Status: reviewed
Authority: build, review, integrate, push build/stale-session-guard-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; the live proof runs only against a scratch HOME; no release, no install, no enforce-file change on any machine
Next: accept, merge into main, close, publish, RESULT to skills-fable; it takes effect on a machine only after a release and a fresh session there
Artifact: a960c366d34ece5ee1044f866f873701c4c5fc08
Evidence: docs/work/evidence/wr-2026-09-28-stale-session-guard-review.md, docs/work/evidence/wr-2026-09-28-stale-session-guard-review-r1.md, docs/work/evidence/wr-2026-09-28-stale-session-guard-suites.md, docs/work/evidence/wr-2026-09-28-stale-session-guard-live.md
Worktree: build/stale-session-guard-1
Opened: 2026-09-28T20:37:43.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-28T19:03:14Z
Base: 2cc3c66b6977024f1df25327d4d4295578d482e9
Log: 2026-09-28T20:39:06.000Z owned skills-n picked up skills-fable-lane-42-1, ACK sent; lead spec written with rulings P1 to P8 (P5: the R0-stale deny is not gated by the enforce file, absent on Netcup, so every other deny is observe-only there)
Log: 2026-09-28T20:39:30.000Z owned skills-n Sonnet builder spawned on P1 to P8, ETA 45 min, transcript watcher running
Log: 2026-09-28T20:55:16.000Z delivered skills-n Sonnet builder DONE aeb7f76 (plugin-staleness.mjs shared helper, R0-stale hard deny outside the enforce file, wiring-check line), full 2646 of 2651 with 0 fail; Opus review r1 and Windows suite started
Log: 2026-09-28T21:02:48.000Z rejected skills-n Opus review r1 NEEDS_FIXES aeb7f76, no false deny found; MAJOR 1 the CLI refuse term has no test, MINOR 2 symlinked home misses, MINOR 3 log field, MINOR 4 red exit without a reason, NIT 5 census placement, all in (lead-ruling-r1.md); Windows 2639 of 2651 with 0 fail once origin/main was fetched into the clone
Log: 2026-09-28T21:09:21.000Z delivered skills-n fix builder DONE a960c36 (MAJOR 1 CLI test fails with the refuse term reverted, MINOR 2 to 4 and NIT 5 as patched), full 2652 of 2657 with 0 fail; Opus delta r2 and Windows suite started
Log: 2026-09-28T21:11:32.000Z reviewed skills-n Opus reviewer a361ba9598eff58b8 delta r2 VERDICT: APPROVE a960c36 (each fix reverted on a scratch copy and its test failed); live proof in a scratch HOME: the 0.20.9 copy denies a builder with R0-stale and hard_deny true, the 0.20.16 copy and a general-purpose spawn pass

Scratch directory for this lane (in the body until lane 36 lands the header field): /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-42

Observed: in a scratch HOME with 0.20.16 installed and no enforce file, the guard run from a 0.20.9 cache copy printed permissionDecision deny with the P6 text for a delegation:builder spawn and logged R0-stale with hard_deny true; the same guard from the 0.20.16 copy, and a general-purpose spawn from the 0.20.9 copy, printed nothing. wiring-check --line --hook printed the stale session line from 0.20.9 only.

Predicts: once a release carrying this is installed, a session that started on an older version gets a refusal naming both versions on its next builder, reviewer, runner or integrator spawn, instead of a builder waiting at a prompt the missing delete guard would have caught; lane 38's counter can count those as R0-stale lines in dispatch-guard.log (work lost or stalled).

Stall: the watcher named in the Log lines is the lead's transcript watcher on each spawned agent; no agent went quiet, every one reported inside its ETA.
