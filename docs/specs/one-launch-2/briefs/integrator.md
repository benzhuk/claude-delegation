Task: Run the full-suite gate once, on the integration worktree, after territory F1 is
merged into build/one-launch-2 — triage any new failure to F1, comparing by failing
TEST NAME against base 33aa023, never by raw pass/fail count. Never decide ship; report
pass/fail plus the failure list.

Goal: lane seven (one-launch fix round) — the merged build must not regress the
existing sealed suite; two failures are already known-pre-existing on base ac9c842 (H6
note-send, V4 mirror-shim) and must not be reported as new.

Work: wr-2026-09-26-one-launch-fix (docs/work/wr-2026-09-26-one-launch-fix.record.md)

Inputs (by path):
- /home/ben/Code/wt-olfix/docs/specs/one-launch-2/spec.md (Acceptance section)
- /home/ben/Code/wt-olfix/docs/specs/one-launch-2/contracts.md (R6 — the exact gate
  command and the two known base-failure names are pinned there; R1-R5 for context on
  what F1 changed, so a new failure can be triaged to a specific fix)
- reports/F1-report.md and reports/F1-review.md — read these, don't re-derive their
  findings yourself.

PROJECT FACTS (integration worktree /home/ben/Code/wt-olfix, branch build/one-launch-2,
already checked out at base cf087dcfb4f8a5cc56a843a831ef41166810bad2 (33aa023 plus one
docs commit opening this build's spec pack and work record — no code changes of its
own). Merge territory F1's branch (build/one-launch-2-F1) into build/one-launch-2
yourself once its review is APPROVE — an ordinary merge commit, no rebase, no
force-push, never push to origin. Full-suite gate: `node scripts/run-tests.mjs` from the
integration worktree. Known base failures on ac9c842 that may still legitimately fail
here: H6 (note-send), V4 (mirror-shim) — the gate is NO NEW FAILURE vs that base,
compared BY FAILING TEST NAME. Re-run the same command against base sha 33aa023bd927b44
b23292d540cc0c2aed4ced212 (or cf087dc, its docs-only descendant) in a scratch worktree if
you need to confirm which failing names are pre-existing, rather than assuming the
contracts.md list is exhaustive.):

NOT (out of scope, stated explicitly):
- Fixing any failure yourself — triage to F1 and report, don't patch.
- The ship decision — that's the orchestrator's, not yours.
- Deciding whether a new failure is "acceptable" — any failing test name absent from the
  base run is a new failure, full stop; report it, don't judge it away.
- The lead's dogfood step (rewriting lane six's record's Base to its merge commit and
  running four-read on it) — R5 names that as the lead's own accept-turn job.

Evidence format: the full failing-test-name diff (base vs this branch), a plain
pass/fail for F1's contribution, and the two named territory gate results
(build-loop-workflow.test.mjs, accept-prep.test.mjs) verbatim, not summarized.

Report: /home/ben/Code/wt-olfix/docs/specs/one-launch-2/reports/integrator-report.md.
Line 1 is the verdict, first word.

Gate: node scripts/run-tests.mjs > /home/ben/Code/wt-olfix/docs/specs/one-launch-2/reports/integrator-gate.log 2>&1. Read only the tail and the failing names. No wrapper script.

State file: /home/ben/Code/wt-olfix/docs/specs/one-launch-2/reports/integrator-state.md.
Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you
tried. Do not guess.

Autonomy: you may merge a reviewed (APPROVE) F1 branch into the integration branch and
re-run the gate without checking in first. Check in before merging anything not yet
reviewed APPROVE, before any push, and before running any command against a repo other
than /home/ben/Code/wt-olfix or a scratch base-comparison worktree you create for this
purpose only.

Un-agent-able steps: none.

ETA: 30-45 minutes once F1 is reviewed APPROVE.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare
"Done" means read the file; nothing is trusted from a final message alone.
