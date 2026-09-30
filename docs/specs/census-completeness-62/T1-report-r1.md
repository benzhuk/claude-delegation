VERDICT NEEDS_FIXES
(T1 territory is implemented and committed; 10 old tests pin superseded output and need T2 updates via root. No new-behaviour test has run against this code yet.)

Commit: 7cf696e8341c2fe55eb738b1b68eb2a3e732baad (branch build/census-completeness-62-source, base a3aa244b)
Changed files: scripts/build-census.mjs, scripts/four-read.mjs, scripts/token-census.mjs, scripts/work-record.mjs, scripts/census-measures.mjs (new), docs/census.md, docs/work-record.md
Gate: node --test on the 7 listed files, one run under Global\claude-verify: tests 546, pass 536, fail 10. Log: C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/census-completeness-62/T1-gate.log
Not run: no smoke or fixture test of the new declared-role reader or the activity state machine beyond what the gate files cover; `node --check` passed on every file.

Cause: the census omitted declared detached roles, used a host-split tier default, measured only >30min/heuristic gaps, and had no follow-up attribution.
Discriminating check: Codex100 + ClaudeOpus10 gives four-read 110; 120-min gap exact gives 0, 121 gives 1; follow-up count changes only with Follow-up-of links.
Fix location: census-measures.mjs (token total, tier, activity), build-census.mjs (declared roles, flags), four-read.mjs (scope suffix, baseline gaps, attribution), work-record.mjs (fields, PARTIAL refusal, listRecords unreadable flag).
Simplification: one parseRecord shared by accept and four-read; one processed-v1 function shared by three tools.

Awaiting independent T2 integration (new behaviour, untested by me): F1 union tier/derived totals, F2/F3 activity counts, F4/F5 attribution, F7 CLI guards, F8 declared reader, F9 unclassified, F10 lead-only companion, F11 manifest confinement.

Old tests pinning superseded output (not loosened; T2 via root):
- four-read.test: stall-row tests (3 nudge tests, lane10, lane16) — numbers[3] now ends with "; baseline-rule event gaps over 120 min: ...UNSUPPORTED" text.
- four-read.test: computeTopTierTokens host-split default (F1 union; with DELEGATION_TOP_TIER override the opus model is unclassified, F9).
- four-read.test: fixture build expects 2 companions (now 3 with measurementScope only; fixture census has none — check), golden JSON/markdown now has reworkAttribution and a follow-up suffix on numbers[2]; Codex test asserts no extra fs reads (corpus readdir of records dir).
- four-read.test: parseArgs deep-equal lacks --records/--as-of keys.
Changed to keep an old pin: work-record PARTIAL refusal message applies to "VERDICT: PARTIAL Claude" only; Codex PARTIAL keeps the generic refusal.
Compatibility gap: legacy censuses without measurementScope keep old text; four-read always appends follow-up text (F5).
Note: secret-guard hook fired a likely false positive after a token-census.mjs edit (no key in the edit); reported to Ben in-session.
