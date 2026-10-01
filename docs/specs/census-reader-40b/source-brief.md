Task: Implement bounded lane40b census reader repairs from the pinned contract and independent spec review. Do not author the tests that gate you.
Goal: Repair census evidence loss and stalled lane40 acceptance without hiding unknown/corrupt evidence.
Work: wr-2026-09-29-census-reader-source, parent wr-2026-09-29-census-reader.
Inputs: C:/Users/benzh/orca/workspaces/claude-delegation/census-reader-40b/docs/specs/census-reader-40b/spec.md, implementation-contract.md, terminal-ruling.md, scout.md, prior-diagnosis-review.md. Root supplies spec review report path at launch.
Worktree: C:/Users/benzh/orca/workspaces/claude-delegation/census-reader-40b-source. Base fb63673. Own exactly scripts/jsonl-lines.mjs, scripts/build-census.mjs, scripts/token-census.mjs. Four-read already uses LF, no changes. Audit other scripts/skills readline readers with narrow code search; list follow-up, no scope expansion.
PROJECT FACTS: Node MJS, no dependencies. Mid-tier Sonnet writes source. Independent author owns tests and root owns all work records. Stub lfLines accepts decoded string chunks, LF framing only, one trailing CR removed, errors propagate, no extra final row after LF. Keep streaming and existing consumer policy. Benign rows cannot erase latest task completion. New task cannot borrow old task completion. Preserve corruption/conflict reasons before completed pre-window exclusion. Existing public APIs remain compatible.
NOT: no test edits, records, private transcript reads, config or secret searches, environment enumeration, SSH, guard replay, identity changes, pushes, full suite, cleanup or child agents. No fabricated payloads. Guard refusal stops operation, never reroute.
Evidence: VERDICT first, exact source commit, per-contract implementation map, scoped gate output paths and limitations. Include Cause:, Discriminating check:, Fix location:, Simplification:. Report other readline JSONL readers even if none.
Report: C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/census-reader-40b/source-report.md.
State file: same directory source-state.md.
Gate: scoped existing tests scripts/build-census*.test.mjs and scripts/token-census.test.mjs through nonblocking Global\claude-verify mutex, only when independent author has released it. If busy, report source ready and gate pending, do not wait/spin. Root integrates independently authored new tests later. Capture stdout to scratch and report only summary/failures. No wrapper framework.
Autonomy: implementation decisions within contracts, exact-path commits. Do not merge/cherry-pick other branches. Root integrates.
Un-agent-able: none needed.
ETA: 12 minutes, report progress if unfinished. Fix kind: bug. Class: census-evidence-loss. Base sha: 960c7df.
Termination: commit, write report and stop. No own acceptance or ship judgment.
