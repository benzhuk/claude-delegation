Territory: C1 (lane 36, lane-closeout) round 2 - fixes for `reports/C1-review.md`
(Opus NEEDS_FIXES, 18 findings/2 critical), rulings L1-L10 in
`docs/specs/lane-closeout-1/addendum-C1-r2.md`. Worktree
`/home/ben/Code/claude-delegation-wt/lane-closeout-1-C1`, branch `wt/lane-closeout-1-C1`.

Contracts I rely on:
- Started from round-1 base `ad2aac97d7ff48836809b69e6584694841a03120` (own prior work, already
  landed).
- brief-C1.md's gate command and non-negotiables (no shell deletions, denied command stops that
  step, no git identity/trailers, no push), unchanged from round 1.
- addendum-C1-r2.md's L1-L10 rulings override the findings doc where they differ; otherwise fix
  every finding as proposed.
- The docs/GOALS.md STALE test failure is pre-existing at base, explicitly not my responsibility.

Done (this round, on top of round 1):
- F1/F2 (both CRITICAL) fixed: live ignored-file dirty check in `closeoutWorktree`; fetch-first
  everywhere in `sweepOrigin`, keep-on-stale-tip.
- F3-F11 (all MAJOR/MEDIUM) fixed: scratch containment + bounded .git-entry walk + fail-closed
  worktree-list; multi-form record-branch matching (F4/L8); `close --dry-run` without `--closeout`
  refused (F5/L9); closeout Log: owner fix (F6); worktree-step refuses target that is/contains
  `--repo` (F7); real scratch-layout roots (F8/L6); Windows-shaped Scratch: values accepted +
  wrong-convention refused at delete-time (F9/L7); repeated `--exclude` accumulates + warns on
  no-match (F10); `--by` gates all four closeout steps before step 1, malformed `--by` refused
  (F11/L3).
- M2 (full ref names + `--prune`), M4 (sweep-origin exit 2 on any failure), M6 partial (docs/*,
  feat/* not-under-build/; symlinked-ancestor scratch case; DELEGATION_SCRATCH_ROOTS exercised via
  F8/L6 tests) done. M1 documented. M3/M5 fixed in code, not independently fixture-tested this
  round. M7 explicitly deferred (perf, not correctness). M8 confirmed untouched this round.
- Three commits: `d40ceed0` (bulk fixes+tests+docs), `8b019d63` (M6 gaps), `f10c7929` (M4 exitCode
  assertion) - final/reported sha.
- Gate green except the one pre-existing failure: territory 381/378 pass (1 pre-existing fail, 2
  skipped); full suite 2659/2653 pass (1 pre-existing fail, 5 skipped), log at
  `docs/specs/lane-closeout-1/reports/C1-r2-gate.log`.
- Both CRITICAL repros (F1, F2) re-run from the reviewer's own scripts on fresh fixtures, before
  (base `ad2aac9`) and after (this round); all 4 transcripts quoted in `reports/C1-r2-report.md`.
- Report written: `docs/specs/lane-closeout-1/reports/C1-r2-report.md` (line 1
  `DONE f10c7929711134ce0260741b2ade293ac8e4deb0`, full findings table, gate numbers, repro
  transcripts, deviations section).

Next: none pending for this round. If a round 3 is dispatched: M6's win32-case-folding and
duplicate-`Scratch:`-singleton test gaps, and F3/M3/M5's fixture-level tests (currently code-only,
verified by read not by test), are the named honest gaps to pick up first.

Open questions: none blocking. Noted but not resolved: the findings doc's own summary line says
"18 findings" while the body lists 19 discrete items (F1-F11 + M1-M8); did not attempt to
reconcile the count, just dispositioned every item present in the body.

How to run my gate:
- Territory: `cd /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1 && node --test
  scripts/work-record.test.mjs scripts/work-record-closeout.test.mjs scripts/janitor.test.mjs
  scripts/record-closed-and-skip.contract.test.mjs`
- Full suite (as required by brief-C1.md): `cd /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1
  && node scripts/run-tests.mjs > docs/specs/lane-closeout-1/reports/C1-r2-gate.log 2>&1` (expect
  exit 1, 1 pre-existing docs/GOALS.md failure only).
