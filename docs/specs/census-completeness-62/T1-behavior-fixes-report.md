VERDICT PASS

Commit: b406ae16ff7764fc24f188445402a5782bff2ad6 (on top of tier fix 34b6bb0b and root-cherry-picked T2 tests)
Changed: scripts/census-measures.mjs, scripts/build-census.mjs, scripts/four-read.mjs (no tests, docs, records touched).
Gate (Global\claude-verify, nonblocking): census-completeness-62.test, four-read.test, four-read.completeness.test, build-census.test, build-census.codex.contract.test, build-census.completeness.test.
  First run: 296 tests, 295 pass, 1 fail (formatJson determinism) -> log T1-behavior-gate.log
  After one fix, rerun (whole same scope, my filter edit did not take effect): 296 tests, 296 pass, 0 fail -> log T1-behavior-rerun.log
Remaining failing assertions: none in this scope. Not run: work-record.test, token-census.test, full suite (not requested).

Fixes:
1 Activity supersede (F3): an unrelated new start over an open predecessor now reclassifies the gap before it as unknown (PARTIAL reason kept); counts only for baselineRuleGaps. Nested only by own root_turn_id naming an open turn.
2 Wake replays: exact replayed rows collapse within a file and across all verified leadSegments (wakes were previously never merged across segments); distinct rows stay distinct.
3 reworkAttribution rewritten to the frozen contract: coverage, reasons, scope declared-links-only, asOf, windowEnd, mature, episodes[{work,parent,admittedAt,source}], outsideWindow[{work,reason}], episodeCount, followUpOf. Opened strictly after acceptance and <= window end; children opened after as-of excluded; asOf before windowEnd => PARTIAL, mature false, observed count; mature = asOf>=windowEnd; unavailable (null count) for no/empty corpus, missing target, no acceptance; unreadable/Work-less nonempty, missing parent, self-link/cycle, conflicting duplicate relevant Work ids PARTIAL; unrelated malformed links ignored; legacy number text kept, follow-up text appended separately.
4 Extra defect found by the old determinism test: default as-of was Date.now() per call, making formatJson nondeterministic; now one instant per process.

Cause: source diverged from frozen contract (F3/F4/F5) and wake transport ignored segments.
Discriminating check: T2 tests activity supersede (with/without shared root), wake replay (1 not 2), six rework tests, formatJson determinism.
Fix location: census-measures.mjs computeCodexActivity; build-census.mjs censusCodexLeadFile + segment merge; four-read.mjs computeReworkAttribution.
Simplification: one wakeReplays map keyed by exact row bytes serves both in-file and cross-segment collapse.
No guard refusals occurred.
