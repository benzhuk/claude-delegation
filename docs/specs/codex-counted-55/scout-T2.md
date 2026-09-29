VERDICT: READY_WITH_CONTRACT_GAPS

## Files and symbols
- Existing direct territory tests are `scripts/build-census.codex.contract.test.mjs` and `scripts/build-census.completeness.test.mjs`; fixtures are under `scripts/build-census.fixtures/codex-native-sanitized/` and `scripts/build-census.fixtures/completeness/`.
- `build-census.codex.contract.test.mjs` is the place for known-id/outside-horizon, spoof/duplicate id, parent/root/depth, missing-field, malformed/truncated, and response-vs-task-started assertions.
- `build-census.test.mjs` owns generic CLI/text compatibility. No source-independent test folder is required; adding a new one would duplicate the established contract suite.

## Helpers to reuse
- Import `runCensus`, `censusCodexLeadFile`, `formatText`, and `formatJson` from `scripts/build-census.mjs`; test native-shaped JSONL with temporary paths rather than live logs.
- Reuse sanitized native provenance and the fixture pattern; no transcript content or credentials should enter fixtures.

## Tests that police this area
- Existing Codex tests already constrain verified `session_meta`, response-id conflict de-dupe, unknown model/timestamp partiality, root namespace, ancestry depth, and horizon discovery.
- `scripts/work-record.test.mjs` constrains downstream acceptance: only `VERDICT: COUNTED` is recognised; `PARTIAL`/`UNSUPPORTED` cannot become an accepted census.
- `scripts/four-read.completeness.test.mjs` and `scripts/four-read.test.mjs` constrain JSON fields used for token/gap/four-number derivation; T2 must not alter their consumer assumptions.

## Open questions for the spec
- Pin fixtures for a verified lead whose file is outside date horizon, and for a no-id caller that remains horizon-bounded; current CLI supplies a lead path, not record identity.
- Pin a truncation definition: malformed JSON is presently an exception, but EOF after syntactically valid final row has no native truncation signal.
- Require separate assertions for 99 deduped response rows and one unique `task_started`; never assert equality.
- Add a closure-boundary fixture (child begins/resumes after historical window) before promising COUNTED for a still-open root.
