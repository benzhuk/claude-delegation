# Independent Codex census contract tests

Status: revised after C1-C2 review; not run by this test writer after revision (integrator owns execution).

Command: `node --test scripts/build-census.codex.contract.test.mjs`

- Original red baseline: 4 tests run; 0 passed; 4 failed; 0 skipped.
- Every default-discovery fixture now passes its temporary home through the sanctioned `codexHome` injection, matching canonical-home discovery.
- A foreign-root candidate is excluded normally; a selected-root candidate with an unverifiable parent edge is separately asserted partial and excluded.
- The window contract now expects zero lead turns when `task_started` is before `--from`, while retaining the preceding model for the in-window response.
- Isolated cache-read, cache-write, both-missing, and mixed-response cases require `derived_total_tokens`, null/unavailable split fields, and named raw-field availability.
- Missing `reasoning_output_tokens` and native `total_tokens` are separately asserted unavailable while the derived total remains known.
- The revised file contains 8 tests: verified ancestry/depth two, foreign-root exclusion, selected-root unverifiable ancestry, depth four plus unknown model, explicit task additions/de-dup, window model retention, cache availability, mixed cache aggregation, and raw optional-field availability.
- Claude golden bytes are intentionally left to the existing committed golden fixture/tests; this independent file does not duplicate that implementation-owned contract.

Fixtures are runtime-only sanitized JSONL in unique OS temporary directories. They contain metadata, timestamps, ids, model names, and numeric usage fields; no prompt or message content.
