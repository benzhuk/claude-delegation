VERDICT: APPROVE ae613fc2bdd216078bda740d6a9f16599d819d85

Independent final source review, September23,2026 America/New_York. Scope: scripts/wiring-check.mjs and scripts/wiring-check.test.mjs against pinned22a31e2 repair contract, carrying forward the complete reader/input/privacy review and checking the final selected-command delta. No repository edits or broad native reruns.

Four-field disposition
1. Location/severity: previous selected-handler MEDIUM false-green at inspectHookGroup is resolved; all prior f57b2ec reader/validation/main-fallback findings are also resolved by reviewed preceding deltas.
2. Evidence: unchanged independent selected-command reproducer now returns unknown/okfalse for declared command with numeric command and missing command; valid prompt handler remains known absent/oktrue. The focused test additionally exercises null command, valid command match (stale for hook_absent) and nonmatch (ok). Saved current output wiring-selected-command-approved-ae613fc.json. Rejected1b54 report preserved separately as wiring-unknown-rejected-1b54bbd-review.md before this final report update.
3. Impact: command evidence shape is inspected before claiming known absence. Narrow guard does not create new host requirements or attempt a general hook-schema validator. Legitimate empty/unrelated/noncommand configurations retain existing absence semantics.
4. Fix and verification: Object.hasOwn detects missing command for declared command handlers; any present nonstring command becomes unknown. Independent source inspection plus node scripts/run-tests.mjs scripts/wiring-check.test.mjs -> exit0,42passed,0failed,0skipped; sealed-home-CpH07M. No new blocking finding.

Cumulative evidence boundaries accepted
- Required read/stat/parse failures remain unknown; ENOENT/ENOTDIR preserve known absence. Optional private-list absence is normal while unreadable/malformed private input is fixed input-level unknown.
- Invalid rows produce bounded fixed diagnostic uncertainty before merging can erase them. Valid private precedence is preserved; explicit empty and valid platform-excluded scopes remain no-applicable rather than invented installation failures.
- Malformed selected root/hooks/event/group/handler containers and malformed command values produce unknown. Known matching commands/nonmatches and valid prompt handlers retain their intended result.
- Secret actual values against boolean/numeric expected values are not printed; raw per-check and outer exception text is not printed. The original independent secret/error/false-green probes passed on preceding1b54 with saved results wiring-review-lwZQTQ/summary.json; final two-line semantic guard does not change those paths.
- Protected mixed-case inboxes.json refusal occurs before read/stat/exists access. Intentional switch/env info, genuine missing whenMissing:info, no-applicable scope, bounded one-line unknown notices, and off-switch/access-error line silence were independently asserted in the preceding complete boundary review and remain covered by the42-test gate.
- Diagnostic finding exit remains0; usage error remains1. Janitor consumes existing row shape without demonstrated required modification. No new scheduler/repair/configuration/provider behavior.

Documentation seam
Previously reviewed42a8 gate-receipt wording accurately requires actual process completion, exit code, counts and retained output; PowerShell LASTEXITCODE must be captured immediately and StrictMode alone does not enforce native failure. This final delta adds no new documentation claim.

Limits
This approval establishes the finite diagnostic source contract, not whole-machine health or installed hook execution. The independent native plugin review runs immutable e39 source and remains a separate historical observation; it must not be relabeled as ae613fc native proof. Full sealed integration/release gate stays parent-owned. Earlier rejected reports and their described negative evidence remain available; the reusable selected-command repro rewrites its current-result JSON on each run, so use the dated review reports to distinguish rejected and accepted observations.
