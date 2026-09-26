Task: One seam-scoped review, after both C1 and C2 are individually reviewed APPROVE and
merged into the integration branch — check the boundary between them, not either
territory's internals again.

Goal: lane six (collect-from-origin) — confirm the two territories agree with each other
where they touch the same ground, since neither territory's own reviewer ever saw the
other's diff.

Work: wr-2026-09-26-collect-from-origin (docs/work/wr-2026-09-26-collect-from-origin.record.md)

Inputs (by path):
- /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/spec.md (Why, both
  Territory sections, Acceptance)
- /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/contracts.md (all of R1-R4)
- reports/C1-report.md, reports/C2-report.md, reports/C1-review.md, reports/C2-review.md
- The merged tree itself, at /home/ben/Code/wt-collect-1 (integration worktree), after
  the integrator's merge

PROJECT FACTS (read-only pass over the merged integration worktree
/home/ben/Code/wt-collect-1. No new code — findings only.):

NOT (out of scope, stated explicitly):
- Re-reviewing either territory's own correctness in isolation — that was each
  territory's own reviewer's job; you look ONLY at the joints between them.
- Fixing anything — findings, with a concrete fix, relayed to whichever territory owns
  the file.

Evidence format: verdict word first (APPROVE or NEEDS_FIXES), then each seam finding with
file:line on both sides of the joint.

Seam-specific checks (the actual boundary between C1 and C2, neither territory's brief
covers these alone):
1. C1's `docs/census.md` addition (spec item C1.3) says the collector's table "goes into
   the bearings packet" and describes when it's run (before dispatch, at every merge
   tick). C2's `skills/team-build/SKILL.md` addition describes the lane posting its OWN
   merge item at accept time. Confirm these two do not contradict each other about WHO
   or WHAT surfaces an accepted-unmerged branch to Ben — C1's collector is a pull (a
   report someone reads), C2's merge item is a push (posted to the decisions page); both
   should coexist, neither should claim to replace the other, and neither doc should
   assert the other doesn't exist.
2. C2's merge-item evidence line quotes "the record's four numbers (four-read)" — check
   that C1 introduced no change to the `docs/work/*.record.md` header-line shape (it
   shouldn't have; C1 only READS records) that would make C2's `Four numbers:` line
   citation stale or wrong.
3. Neither territory's edit should reference the other territory's not-yet-existent
   command by name in a way that would break if run standalone — e.g. C2's SKILL.md
   text should not claim `collect-from-origin.mjs` is invoked automatically as part of
   the accept sequence unless C1's contract actually wires that (it doesn't — spec C2
   only wires the decisions-page post, not a collector invocation; confirm this).
4. Confirm the merged tree's full suite gate (integrator's own run) shows no interaction
   failure that neither territory's own scoped gate would have caught alone (a test that
   only fails once both diffs are present).

Report: /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/reports/seam-review.md.
Line 1 is the verdict, first word.

State file: none — a seam review is a one-off lane.

A result of zero, "not found" or "could not determine" is a good answer. Say what you
tried. Do not guess.

Autonomy: full autonomy to run any read-only command over the merged worktree. Check in
before touching any file.

Un-agent-able steps: none.

ETA: 20-30 minutes.

JUDGMENT: pull-and-push-signals-coexist-without-contradiction

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare
"Done" means read the file; nothing is trusted from a final message alone.
