Task: Independently review the delivered C1+C2 implementation against the pinned Codex census contract; issue an exact-sha verdict after the builder's focused gate is green.
Goal: Prevent a complete-looking Codex measurement that actually drops, duplicates, or silently zeroes native evidence, while preserving byte-identical Claude behavior.
Work: wr-2026-09-27-codex-census

Inputs (by path):
- docs/specs/codex-census-0927/spec.md
- docs/specs/codex-census-0927/contracts.md
- docs/specs/codex-census-0927/scout-C1.md
- docs/specs/codex-census-0927/spec-review.md
- docs/specs/codex-census-0927/briefs/C1-C2.md
- docs/specs/codex-census-0927/reports/independent-contracts.md
- scripts/build-census.codex.contract.test.mjs
- docs/specs/codex-census-0927/claude-golden-base.md

PROJECT FACTS (at most 25 lines):
- Review the delivered builder SHA in its C1+C2 checkout; do not review an integration tree that differs from that SHA.
- Owned implementation files are scripts/build-census.mjs, scripts/build-census.test.mjs, docs/census.md, and one paragraph in skills/team-build/SKILL.md.
- The independent contract test intentionally has a 0/4 red baseline before C1. Run it only after C1 is present, together with focused disposable-fixture tests; never run the repository full suite in this review.
- Codex default discovery is canonical-home lead UTC folder plus next UTC folder. Explicit --tasks candidates outside that home require verified immediate-parent ancestry and the common root session namespace.
- A child has logical meta.id but validates usage.session_id against meta.session_id and the lead root namespace. Dedup is logical id plus response id.
- task_started unique turn ids define Codex leadTurns. Offset-bearing --from/--to endpoints are inclusive, and preceding turn_context model state remains available.
- C3/four-read is not in this review. scripts/work-record.mjs is lane fourteen territory.

NOT (out of scope, stated explicitly):
- Do not edit source, tests, documentation, docs/work/, gates, rollout files, or the builder branch.
- Do not run the full suite, create a worktree, launch an agent, accept the record, release, install, or modify README/changelog.

Evidence format: First line must be exactly `VERDICT: APPROVE <full-builder-sha>` or `VERDICT: NEEDS_FIXES`. Cite file:line and a targeted observed result for every finding. Your report must also include non-empty `Cause:`, `Discriminating check:`, `Fix location:`, and `Simplification:` lines; for APPROVE, state the verified absence of a defect in those fields.

Attack brief:
- Defeat lead/home boundaries: same-day files from a second home, `--tasks` files outside the home, a copied lead, a foreign parent, and malformed/missing source metadata.
- Verify every immediate parent edge, depth relative to the selected lead, depth-four exclusion/incomplete visibility, and common-root namespace at depth two.
- Attempt response-id collisions across distinct child meta.ids, duplicate/conflicting responses within one logical child, and usage keyed to child id rather than root session namespace.
- Check a pre-window model context feeding an in-window response, inclusive offset endpoints, unknown model becoming partial, missing optional fields staying unavailable rather than zero, and cache fields not inflating additive totals.
- Verify unique task_started turns despite repeated turn_context rows and Claude output byte identity at the exact committed fixture paths.
- Inspect the C2 paragraph: it must state conditional candidate-census/accept-prep behavior honestly and must not claim C3 or lane-fourteen enforcement has already landed.

Report: docs/specs/codex-census-0927/reports/C1-C2-review.md. Line 1 is the verdict, first word.

Gate: node --test scripts/build-census.test.mjs scripts/build-census.codex.contract.test.mjs > docs/specs/codex-census-0927/reports/C1-C2-review-gate.log 2>&1. Read only the tail and the failing names. No wrapper script.

State file: docs/specs/codex-census-0927/reports/C1-C2-review-state.md. Keep it current after every gate.

Autonomy: Review only the delivered SHA. Decide whether the implementation meets the pinned contract; report every violation as a concrete fix. Stop and report if the builder gate is not green, the candidate SHA is absent, or any command is denied.

Un-agent-able steps: C3 scope and implementation, integration, acceptance, Netcup suite, and any live census remain with the lead.
ETA: 45 minutes; report or park by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
