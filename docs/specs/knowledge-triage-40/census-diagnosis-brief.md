Task: Diagnose the PARTIAL Codex census from existing structured logs and parser behavior, read-only. Determine whether malformed rows and missing end-bound witnesses are actual stored-data gaps or a reader limitation. No repair or acceptance waiver.
Work: wr-2026-09-29-knowledge-triage.
Inputs: census-execution-report.md, closeout-prep-r2.md, acceptance-window.json; generated census JSON and its named source paths; current scripts/build-census.mjs. Own lead/home/path are already documented. No broad filesystem discovery beyond files named by that census.

Allowed observations: file size/mtime/hash, total line count, first malformed line number/byte length/hash, last complete valid structured timestamp/event type, whether valid metadata rows exist after the malformed row, terminal/coverage markers, and whether the parser stops at the first bad row. Never print or copy a malformed row, conversational text, tool arguments, secret values or arbitrary payloads. Report only metadata. Do not mutate native logs or manufacture witnesses. A read-only diagnostic scanner may skip invalid rows solely to report whether later timestamps exist; it must not become the acceptance census or a production patch.

Check the lead plus the four children named PARTIAL, bounded to that set. Distinguish the child with missing witness only from malformed-row children. Inspect the existing parser's exact error policy and only relevant current-main diff if needed. Do not execute a different census source to get a nicer verdict without a documented cause and root review.

Root already corrected APPROVE spacing and reruns strict check. Also correct the census-execution report's token semantics if its prose confused uncached input, cached input and total fields; use the parser's definitions and label the 46,327,454 versus309,358,100 measures explicitly, without claiming either is a complete build total. Preserve its original captured verdict and counts.

Outputs: docs/specs/knowledge-triage-40/census-diagnosis.md and at most a documented clarification to census-execution-report.md. No source/record/evidence JSON changes, CLI rerun, test, commit, push, peer message, suite, SSH, guard probe or replay. Any guard refusal stops that operation with no alternative route.
Report: VERDICT: DIAGNOSED or INCOMPLETE, verified metadata and causal limits, precise next input/owner needed. Do not propose changing a truthful PARTIAL to COUNTED by ignoring corrupt data.
ETA: 5 minutes. Termination: report and stop.
