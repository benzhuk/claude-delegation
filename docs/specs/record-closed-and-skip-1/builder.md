Task: implement Lane 23 exactly within L23 territory and the root rulings.
Goal: reduce lost/stalled work and non-lane attention without new mechanisms.
Work: wr-2026-09-27-record-closed-and-skip
Inputs: spec.md (Lane 23 only), plan.md, scout-L23.md in this directory; docs/mandate-template.md and docs/concurrency-budget.md.

PROJECT FACTS: Windows PowerShell, Node built-in tests, no dependency install needed. One builder owns all source territory. Preserve exports/callers and installed collector CLI defaults except pinned new filtering default. Only docs/census.md is currently an authorized existing doc. Root owns docs/work records. No automatic source edits outside territory. Native Codex manual sequence, models map mid to Terra, reviewer to Astra.

NOT: run-tests.mjs, test-home.mjs, janitor timer, multi scripts, work records, installs, releases, main merge, peer messages, Notion, unrelated refactors, subagents. No removal wrappers; no denied action retry. Never change Git identity, trailers, force, reset, clean or stash. Git add, commit, push separately.

Evidence format: VERDICT first, exact source SHA, scope list, test commands/counts/native exits, raw logs. Cause:, Discriminating check:, Fix location:, Simplification: are required. State unknowns honestly. Use one focused gate per changed artifact through a non-deleting Windows named mutex, no full suite. If failed, report before rerunning; root grants a changed fix round. Gate can use node --test scripts/work-record.test.mjs scripts/continuation.test.mjs scripts/collect-from-origin.test.mjs scripts/collect-status.test.mjs with stdout/stderr to reports/L23-gate.log, exit code retained. Coordinate mutex named Global\claude-verify (same across processes); no shell string-built runner or disk deletion lock. Read only failing names and tail.

Report: docs/specs/record-closed-and-skip-1/reports/L23-builder.md
State file: docs/specs/record-closed-and-skip-1/reports/L23-state.md
Autonomy: implement within territory, write own report/state, commit source and reports. Independent contract tests belong to another agent. Stop on ambiguous safety, out-of-territory dependency, or denial and report exact evidence.
Un-agent-able: none for source work. Cross-host sealed gate, fresh measured acceptance and close live proof belong to integration/root.
ETA: 30 minutes, progress at deadline if still active.
Fix kind: bug
Class: record-state-and-collector-noise
Base sha: 0c926057a948c4365cf92d82d8fb584cbcc77dcd
Regression test: independent contract tests will be supplied by root.
Termination: report, commit exact artifact, then stop.
