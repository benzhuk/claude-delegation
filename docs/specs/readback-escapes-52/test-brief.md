Task: Independently implement the snapshot/probe regression and substantive-negative checks in final-spec.md. Prove red on exact base then green on builder source.
Goal: rework after acceptance, narrow readback equivalence without hiding changed content.
Work: wr-2026-09-28-readback-escapes.
Inputs: final-spec.md, scout-T2.md, L52-probe-report.md, and scratch/t2-fixture-copy-list.md plus proof-manifest.json. Scratch is C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/readback-escapes-52.
PROJECT FACTS: Integration workdir C:/Users/benzh/orca/workspaces/claude-delegation/readback-escapes-52, branch build/readback-escapes-52. Explicit workdir each command. Own only decisions-render.test.mjs, new fixture directory/local attributes, own L52-test-report.md. Root alone writes docs/work. No git identity/reset/force/clean/stash/install. Coordinate shared index with builder through collaboration, never multi/inbox registration. Preserve raw files exactly; compute pins programmatically from actual bytes, not manually transcribed strings. Local attributes must preserve bytes on fresh checkout/Linux before first fixture commit, as Lane48 taught.
NOT: production edits, other tests without root ruling, page writes, full suites, work record edits, changing timestamps inside normalize, loosening assertions after a failing gate.
Evidence format: first line VERDICT: PASS or BLOCKED, actual native exits/assertions for base-red and final-green, source hash/revision from tools, fixture byte pins and fresh-checkout verification. Four nonempty fields Cause:, Discriminating check:, Fix location:, Simplification:.
Report: docs/specs/readback-escapes-52/L52-test-report.md.
Gate: node --test skills/decisions/scripts/decisions-render.test.mjs skills/decisions/scripts/decisions-render-core.test.mjs skills/decisions/scripts/decisions-render-publish.test.mjs, after builder ready. Use process-owned Global claude-verify mutex with<=60s acquisition and finally release; preserve raw stdout and native exit separately. No broad suite.
State file: scratch/T2-state.md.
Autonomy: isolated exact-base scratch copies for discriminating red, no mutation of tracked production. One final focused gate on integrated source, then commit only owned files/report. Reuse existing fixture helpers when useful, no duplicate comparison implementation.
Un-agent-able steps: probe completed; live main publish is integrator-owned.
ETA: 20 minutes, report or park then.
Fix kind: bug
Class: notion-readback-escaping
Regression test: skills/decisions/scripts/decisions-render.test.mjs
Base sha: bb77a1d97f8dae420917bcaa3e82385451db0662
Termination: report at stated path then stop. Do not discard any earlier failed receipt.
