Task: Independently red-team lane40b's pinned spec and proposed reader/completion contract before implementation.
Goal: Accurate census without an unknown rendered as a confident number; repair the existing measurement instrument.
Work: wr-2026-09-29-census-reader.
Inputs: docs/specs/census-reader-40b/spec.md (verbatim authority), implementation-contract.md, scout.md, prior-diagnosis-review.md; scripts/jsonl-lines.mjs contract stub.
PROJECT FACTS: Node MJS; source build-census.mjs and token-census.mjs; tests build-census*.test.mjs. Scope read only those named files and four-read.mjs plus synthetic fixture helpers. No live logs, config searches, credentials, environment inspection, SSH or full suites. No implementation or work-record edits. report only.
Attack: LF framing with U+2028/U+2029, UTF8 chunking, CRLF, final remainder/errors; completion for latest task, trailing benign rows, repeated/new task ids, timestamp conflict, corruption; excluded completed pre-window zero-usage children versus incomplete ones. A check passing because it is not looking is the primary failure class. Call out any coverage weakening.
Proposed interpretation: clean completed children can be excluded before zero-usage checks, but corrupt or conflicting evidence remains PARTIAL even outside the window. Existing task_complete needs matching latest started turn. item_completed completion payload unsupported pending explicit author shape (ASK sent); never infer completion from arbitrary item_completed or assistant text. Review whether this narrows the packet safely and identify unresolved contracts. No source implementation until the contract is clear.
Evidence: exact file:line, severity, concrete minimal correction; verdict first, APPROVE exact reviewed SHA or NEEDS_FIXES. Bug fields required: Cause:, Discriminating check:, Fix location:, Simplification:.
Report: supplied by review-run command. Do not change other files. Any guard refusal ends that operation; no reroute.
Autonomy: bounded named-code/fixture reads and tiny synthetic checks; no fan-out.
Un-agent-able: no external credentials or private session reads needed.
ETA: 6 minutes. JUDGMENT: decide whether the contract permits false COUNTED evidence or has missing framing/completion cases.
Termination: report then stop.
