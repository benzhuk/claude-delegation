Task: Delta spec review of lane40b after eight findings, before source implementation.
Goal: Rule out false COUNTED evidence and tests passing without observing counts.
Work: wr-2026-09-29-census-reader.
Inputs: docs/specs/census-reader-40b/implementation-contract.md (Opus spec findings resolved section), spec.md, terminal-ruling.md, scripts/jsonl-lines.mjs stub, docs/work/evidence/wr-2026-09-29-census-reader-spec-review-r1.md. Same named source/test scope as spec-review-brief.md.
PROJECT FACTS: No production fix implemented. Author resolved item_completed ambiguity as unsupported, task_complete only. Contract applies child witness in bounded/open modes and pins all eight findings. Tests independent and being authored. Retention tests may correctly be base-green; actual defect tests must be red. Note aggregate segment ordering risk and ensure conservative ambiguity is adequate without expanding into new mechanisms.
NOT: no production/test edits, work records, private logs, config/env inspection, SSH, full suites, guard reroute or child agents.
Evidence: VERDICT APPROVE exact SHA or NEEDS_FIXES first. Confirm each prior finding and only new blocking gaps. Cause:, Discriminating check:, Fix location:, Simplification: required.
Report: supplied by review-run.
Autonomy: named source and synthetic fixture reads, no full gate.
Un-agent-able: none.
ETA: 5 minutes. JUDGMENT: can a builder following the revised contract return false COUNTED or pass a regression without observing the defect?
Termination: report then stop.
