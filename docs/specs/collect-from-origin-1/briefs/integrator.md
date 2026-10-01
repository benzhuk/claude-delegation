Task: Run the full-suite gate once, on the integration worktree, after both territories
(C1, C2) are merged into build/collect-from-origin-1 — triage any new failure to its
territory, then run the R4 dogfood invocation and paste its table into your report.
Never decide ship; report pass/fail plus the failure list.

Goal: lane six (collect-from-origin) — the merged build must not regress the existing
sealed suite, and the collector must actually work against this real repo before Ben
ever sees it.

Work: wr-2026-09-26-collect-from-origin (docs/work/wr-2026-09-26-collect-from-origin.record.md)

Inputs (by path):
- /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/spec.md (Acceptance —
  dogfood requirement)
- /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/contracts.md (R4, Gates —
  the exact base-failure names and the dogfood command are pinned there)
- Both territories' reports: reports/C1-report.md, reports/C2-report.md, and both
  reviews: reports/C1-review.md, reports/C2-review.md — read these, don't re-derive
  their findings yourself.

PROJECT FACTS (integration worktree: /home/ben/Code/wt-collect-1, branch
build/collect-from-origin-1, already checked out at base 5f057a3959323bd0fd01231e6fe6d47688991cec.
Merge each territory's branch into build/collect-from-origin-1 yourself once its review
is APPROVE — ordinary merge commits, no rebase, no force-push, never push to origin.
Full-suite gate: `node scripts/run-tests.mjs` from the integration worktree. Known base
failures on ac9c842 that may still legitimately fail here: H6 (note-send), V4
(mirror-shim) — the gate is NO NEW FAILURE vs that base, compared BY FAILING TEST NAME,
not by raw pass/fail count. Re-run the same command against base sha ac9c842 in a
scratch worktree if you need to confirm which failing names are pre-existing, rather
than assuming the contracts.md list is exhaustive.):

NOT (out of scope, stated explicitly):
- Fixing any failure yourself — triage to the owning territory (C1 or C2) and report,
  don't patch.
- The ship decision — that's the orchestrator's, not yours.
- Deciding whether a new failure is "acceptable" — any failing test name absent from the
  base run is a new failure, full stop; report it, don't judge it away.

Evidence format: the full failing-test-name diff (base vs this branch), a plain pass/fail
per territory's contribution, and the dogfood table verbatim (never summarized/truncated
— it's at most 60 runtime lines by the collector's own contract).

Report: /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/reports/integrator-report.md.
Line 1 is the verdict, first word.

Gate: node scripts/run-tests.mjs > /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/reports/integrator-gate.log 2>&1. Read only the tail and the failing names. No wrapper script.

State file: /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/reports/integrator-state.md.
Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you
tried. Do not guess.

Autonomy: you may merge a reviewed (APPROVE) territory branch into the integration branch
and re-run the gate without checking in first. Check in before merging anything not yet
reviewed APPROVE, before any push, and before running the dogfood command against any
repo other than /home/ben/Code/claude-delegation.

Un-agent-able steps: none.

ETA: 30-45 minutes once both territories are reviewed APPROVE.

R4 dogfood command (run from this worktree, after the merge, read-only — fetch allowed):
node scripts/collect-from-origin.mjs --repo /home/ben/Code/claude-delegation --json

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare
"Done" means read the file; nothing is trusted from a final message alone.
