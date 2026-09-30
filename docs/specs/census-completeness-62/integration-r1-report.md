VERDICT: PARTIAL (gate PASS, lane40 proof PASS, baseline arithmetic PASS; parent/child four-read BLOCKED on missing input)

Candidate: worktree HEAD c8172507 (f31bb165 source + docs-only commit on top, diff stat shows only two docs files). Task named b406ae16; HEAD includes it.

## Scoped gate
scoped-gate-r1.ps1: process exclusion clean, nonblocking Global\claude-verify acquired once, released in finally. One node --test over all eight files.
Result: 580 tests, 580 pass, 0 fail, 0 cancelled, 0 skipped. Log integration-r1-gate.log, receipt integration-r1-gate.receipt.txt. No fixes or test edits.

## Lane40 AFTER (control-after/lane40-after.{json,txt}) vs BEFORE (control-before)
Same lead-session, codex-home, from 2026-09-29T19:17:00Z, to 2026-09-30T04:15:42.727Z; added --record docs/work/wr-2026-09-29-knowledge-triage.record.md --repo . --claude-root C:/Users/benzh/.claude. Exit 0.
- Lead unchanged: COUNTED 926 Codex responses, leadTurns 19, wall 7.25 h, wakes 19, stopBlocks 1, gpt-5.6-sol 77,804,337, gpt-6-astra 120,291,865.
- Added by declared roles: claude-opus-5-5 7,019,028 processed (reviewer 6,777,693 + spec-reviewer 241,335; sums match). Six roles declared, 6 complete, 0 PARTIAL, 0 omitted. Requests added 130 (42, 24, 8, 12, 36, 8), duplicateRequests 0 each. subagentFiles 59 -> 65. native unmapped 79,184,570 unchanged.
- Scope: measurementScope native-plus-declared, tokenDefinition processed-v1. Limitations printed: declaration is the lane attribution authority; declared set never proves no undeclared role; token totals not comparable to a lead-only hand-run baseline.
- Native-only stays reproducible: before numbers unchanged inside the after run.

## Duplicate declaration no double count
No temp fixture made (avoided new seam, nothing to clean). Covered by existing gate test scripts/census-completeness-62.test.mjs "an identical duplicate declaration collapses; conflicting role declarations are PARTIAL" (requests 3, duplicateRequests 0 for identical duplicate) and the native-overlap test (3 already-native requests dropped, duplicateRequests 3). Both in the 580 green. Not re-proven on the real record.

## Baseline vectors (baseline-arith.mjs, baseline-arith.out.json)
Top-tier (fable|opus) of lead.windowByModel reproduces all five published scalars exactly: N3 132,533,844; N4 46,706,274; N2 17,298,421; W1 8,446,104; W2 11,407,524.
Native-inclusive (combined) alternative: N3 248,462,538 (+115,928,694, 91 subagent files); N4 50,649,619 (+3,943,345); N2, W1, W2 equal lead-only. Scope mismatch: published = lead-only, current reads sum lead+subagents, so N3 and N4 baselines are understated if compared to a native-inclusive after number.

## Parent/child four-read: BLOCKED
wr-2026-09-29-janitor-acts and wr-2026-09-30-mirror-shim share lead session f6c8ae21 on the Linux host (/home/ben/.claude/...). Transcript is not on this Windows box and SSH is out of scope; evidence holds only the census .md, and four-read refuses anything but a build-census --json file (exit 2). I did not fabricate a stub census. Child Follow-up-of: wr-2026-09-29-janitor-acts is present (record line 13). Provisional episode/child-parent text is covered only by the six rework tests in the green gate. Need: the two census JSONs (or a go to read them via SSH/another host).
No records, source, tests or guards touched; no cleanup needed. Untracked in worktree: only pre-existing docs files.
