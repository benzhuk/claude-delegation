Task: One seam-scoped pass, after the integrator's `PASS`
(docs/specs/withdraw-status-1/reports/integrator-report.md), on the boundary between
W1's new `withdraw` command/`withdrawn` status and everything downstream that consumes
it — the two real consumer files, and the lead's own dogfood step that runs next. This
build has one code territory, so this is not a cross-territory-contract seam in the
usual sense; it is the handoff from "unit-tested in isolation" to "actually changes what
a live hook prints, on the real integration branch head, against the real two Sep-23
records" — a boundary the reviewer's per-territory pass does not cross.
Goal: prove, on the merged integration branch (not W1's own worktree), that withdrawing
a record really does make `hooks/backlog-notice.js`'s "N rejected awaiting a fix round"
line go to zero for a withdrawn record, and that `scripts/collect-from-origin.mjs` never
shows that record as `owned` or `rejected` — end to end, not just per the unit tests.
Work: wr-2026-09-26-withdraw-status (docs/work/wr-2026-09-26-withdraw-status.record.md
— read-only for you; only the lead writes it).

Inputs (by path):
- docs/specs/withdraw-status-1/spec.md (the "Dogfood" section names the exact two
  records and their exact reasons/--superseded-by usage the lead will run next)
- docs/specs/withdraw-status-1/contracts.md (R2, R3, R5)
- docs/specs/withdraw-status-1/reports/W1-report.md, reviewer-report.md,
  integrator-report.md
- `/home/ben/Code/wt-withdraw` (the integration worktree, on branch
  `build/withdraw-status-1`, post-merge) — read the two real records yourselves:
  `docs/work/wr-2026-09-23-native-claude-pilot.record.md` and
  `docs/work/wr-2026-09-23-native-instruction-review.record.md`

PROJECT FACTS: work on the integration worktree's checked-out state as the integrator
left it (post-merge, pre-push). Pure Node, `node --test <files>` or the file directly
via `node scripts/work-record.mjs withdraw ...` for a manual dry run against a SCRATCH
COPY of a record, never the live `docs/work/` files themselves (that stays the lead's
own dogfood step, not yours to perform for real). Never set a git identity; never push;
no trailers.

NOT (out of scope, stated explicitly):
- Do not actually run `withdraw` against the real `docs/work/*.record.md` files — copy
  a fixture into a scratch directory first (outside `docs/work/`) and run it there, or
  use the same in-memory/fixture-file approach the unit tests already use. The real
  dogfood run on the real two records is the lead's step (R5), verbatim, after this pass.
- Do not re-review W1's code for correctness bugs already in the reviewer's scope
  (transition table, refusals) — this pass is the live handoff, not a second unit review.
- Do not decide ship — report only.

Evidence format: verdict `APPROVE`/`SKIPPED`/`NEEDS_FIXES` as the literal first line.
For each check below, quote the ACTUAL line the hook or collector printed (or would
print against your scratch fixture), never a description of what you expect it to say.

Checks:
1. Copy `wr-2026-09-23-native-claude-pilot.record.md`'s real current header (Status:,
   Owner:, etc.) into a scratch fixture, run `work-record.mjs withdraw` against the
   scratch copy with the exact reason spec.md's Dogfood section gives it ("closed
   without a fix round: the native artifact never materialized and the effort continued
   under a later record"), and confirm it succeeds — i.e. the record's CURRENT real
   Status: is one of the allowed source statuses (rejected/blocked/runnable/owned); if
   it is not (e.g. someone already moved it), that is a finding, not something to work
   around.
2. Same for `wr-2026-09-23-native-instruction-review.record.md` with
   `--superseded-by wr-2026-09-23-instruction-consistency` — confirm that record exists
   on disk at the path the tool resolves against (R2: "resolve against the record's own
   docs/work directory").
3. Run the withdrawn scratch fixture through `hooks/backlog-notice.js`'s classify/build
   path (or the smallest live call that exercises it) alongside the OTHER real, unmodified
   records in `docs/work/`, and quote the resulting backlog line — confirm the withdrawn
   fixture contributes to none of the three counts.
4. Run the same scratch fixture through `scripts/collect-from-origin.mjs`'s
   `computeState` (or the smallest live call) and quote the resulting `state` value —
   confirm it is not `"owned"` and not `"rejected"`.
5. Confirm the merged integration branch (post-W1-merge) still has zero test regressions
   introduced by the merge itself beyond what the integrator already reported (a sanity
   re-check of the integrator's own PASS, not a re-run of the full suite).

Termination: report to docs/specs/withdraw-status-1/reports/seam-report.md, first line
`VERDICT: <word>`, then stop.
