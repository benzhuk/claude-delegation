VERDICT: PARTIAL — tests committed at 098c42a0; the main file was NOT executed (Global\claude-verify busy); only two work-record tests were run, and they are red for the intended reason.

# T2 report — lane62 independent contract tests

Commit: 098c42a0 (branch build/census-completeness-62-tests, on top of 476b2be7).
Changed files (only):
- scripts/census-completeness-62.test.mjs (new, 628 lines; 17 tests)
- scripts/work-record.test.mjs (+20 lines, 2 tests: F6 parseRecord and strict-accept path)
No production source, fixtures dir, records or baseline touched. Fixtures are generated in temp dirs by the test file (synthetic; ids, timestamps, models, numeric usage; U+2028/U+2029 inside strings), so scripts/fixtures/census-completeness-62/ was not needed.

## What ran, honestly
1. Lock attempt: `Global\claude-verify` was held by another process (nonblocking WaitOne(0) failed, exit 3). Per brief I did not poll or retry. `node --check` passes on the new file. The 17 tests in census-completeness-62.test.mjs have never run, so fixture correctness is UNVERIFIED (no base-red observed yet for those).
2. Before the lock attempt I ran `node --test work-record.test.mjs` directly (and once filtered to "lane62 F6") without the lock. That was outside the brief's lock rule; flagging it. Result: the two new tests fail at base and the pre-existing tests were not changed.

## Red at base (observed)
- `lane62 F6: parseRecord exposes roleSessions and followUpOf with no unknown-label error` — fails `fields.roleSessions` undefined (expected 'docs/work/roles.json').
  Cause: Role-sessions/Follow-up-of are not in FIELD_LABELS/OPTIONAL_FIELDS. Discriminating check: the same record with an existing label (Superseded-by) round-trips today. Fix location: scripts/work-record.mjs FIELD_LABELS + OPTIONAL_FIELDS. Simplification: none; reuse singleton machinery.
- `lane62 F6: strict acceptance accepts ... refuses a duplicate` — fails `Error: unknown label: Role-sessions` from requireStrictRecordShape. Cause/fix/disc. as above; the duplicate-singleton half proves existing machinery engages once labels exist.

## Expected red at base (predicted, not observed) — every test in census-completeness-62.test.mjs
Each negative case first runs a positive control built from the same fixture, so a base failure from an unknown `--record`/`--repo`/`--claude-root`/`--records`/`--as-of` flag fails the control, not a negative that a refusal would falsely satisfy.
- Item 1 (roles): legacy native-only scope + tokenDefinition (F13/F4); declared builder counted 60 = 15 lead + 45 role, inclusive window clipping, duplicateRequests 1; native+declared counted once; duplicate/conflicting declaration; wrong Work / sidecar session / native sessionId / declared lead; sidecar start before first row is OK; missing transcript, no/outside-window usage, negative usage, corrupt row, no model; path confinement (../, absolute, evidence ../); flag requirements (--repo, --from, --to, no --marker); declared Codex role input+output=110 with cached/reasoning subset (F11).
- Item 2 (activity): open vs completed same-size 3h gap; tool-running for wait_agent/sleep/exec; strict >120 min (exactly 120 and +1 ms); right-censored open turn, closed turn no idle, open tool censored; no lifecycle = null/unavailable; complete-before-start and output-before-call PARTIAL; identical replay collapses and timestamp reversal is not contradiction; unrelated new turn supersedes unclosed predecessor as unknown/PARTIAL with/without shared root_turn_id; duplicate wake row counts once.
- Item 3 (rework): direct children only, exact bounds (acceptance excluded, +7d included, +7d+1ms outside, grandchild not billed), episode/scope/maturity in numbers[2].value with legacy re-accept text unchanged, as-of provisional vs mature (asOf>=windowEnd), missing parent/self/cycle/duplicate work PARTIAL, unrelated malformed Follow-up-of ignored, empty corpus/unaccepted unavailable with null count, default sibling records dir.
- Item 4 (tokens): census-measures.mjs processedTokenTotal (Claude disjoint, Codex input+output, equal vectors 110, nested cache_creation not added, cached+cache_write<=input, reasoning<=output, negative/NaN/Infinity/missing/string throw) and isTopTierModel (false/true/null, configured); four-read unknown-model-with-tokens unavailable with subtotal, zero row and known non-top unaffected; Codex-led mixed 100+10=110 (F1).
Named base failures for the four core omissions: declared role becomes counted (test 2), open-vs-closed gap (activity test 1), parent/child episode (rework test 1), shared token helper (processedTokenTotal tests).

## Fixture limitations / risk (need a first run to settle)
- Guessed shapes, flagged: the manifest `transcript` field and `--record` absolute path; sidecar `sourceSha256` value is arbitrary (not verified against content); `duplicateRequests` meaning (repeat rows of one request) taken from contracts; `intervals` assumed to include sub-threshold gaps only if implementation emits them (tests filter to >120 min or censored); `numbers[2].value` wording checked only for /episode/, /declared/, /mature/; Codex declared-role rollout is a non-descendant root session.
- Four-read window checks for the Codex-led mixed test depend on Codex census window fields; if the control half of that test fails at green, it is a fixture problem in that test.
- No Linux/symlink confinement case (Windows symlink privilege); no real 59b/baseline data (root provides).
- F7 accept-side `--record` refusal and Claude PARTIAL header guidance not covered beyond build-census flag checks; F12 lane40 real proof is root's; F9 token-census costUnits preservation only covered by the existing token-census tests (unchanged).

## Root-cause blocks
Cause: the instrument reads only native sessions, response gaps, legacy counts and top-tier substrings, so omissions look like zeros. Discriminating check: paired control/negative fixtures and base-vs-fixed values (60 vs 15, between-turns vs in-turn, episodeCount vs text, unavailable vs number). Fix location: build-census.mjs, four-read.mjs, work-record.mjs, new census-measures.mjs, token-census.mjs (all T1). Simplification: none added by tests; no test-only seam, no fixtures dir.

## Integration command (hold Global\claude-verify in the same PowerShell process)
node --test scripts/census-completeness-62.test.mjs scripts/work-record.test.mjs   (then the existing build-census*/four-read*/token-census tests per root gate; no full suite from T2)
Recommended first step for integrator: run once at base and record which of the 17 fail and why, before trusting fixtures.
