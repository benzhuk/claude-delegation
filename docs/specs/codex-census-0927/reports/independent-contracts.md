# Independent Codex census contract tests

Status: revised after C1-C2 review; not run by this test writer after revision (integrator owns execution).

Command: `node --test scripts/build-census.codex.contract.test.mjs`

- Original red baseline: 4 tests run; 0 passed; 4 failed; 0 skipped.
- Every default-discovery fixture now passes its temporary home through the sanctioned `codexHome` injection, matching canonical-home discovery.
- A foreign-root candidate is excluded normally; a selected-root candidate with an unverifiable parent edge is separately asserted partial and excluded.
- The window contract now expects zero lead turns when `task_started` is before `--from`, while retaining the preceding model for the in-window response.
- Isolated cache-read, cache-write, both-missing, and mixed-response cases require `derived_total_tokens`, null split fields, aggregate-level `unavailable` names, and JSON/text serialization while coverage remains complete.
- Missing `reasoning_output_tokens` and native `total_tokens` are separately aggregate-unavailable while the derived total remains known.
- The file now contains 18 tests: verified ancestry/depth two, foreign-root exclusion, selected-root unverifiable ancestry, depth four plus unknown model, explicit task additions/de-dup, window model retention, cache availability, mixed cache aggregation, raw optional-field availability, the native fixture, and the six reviewed regressions below.
- One test consumes the whitelist-native fixture set from a temporary canonical-home layout, placing one verified child on the following UTC day and checking discovery, model join, root namespace, and derived totals. It has not been executed by this writer.
- Six additional independent regressions retain the reviewed F2–F7 contract: individually named model/timestamp/raw duplicate throws plus exact-repeat de-dup; inclusive lead-marker child windows; implicit third-day horizon versus a bounded valid slice; lead/child identity-copy conflicts; explicit missing tasks versus optional default-day absence; and rejected-parent descendants. None has been executed by this writer.
- Claude golden bytes are intentionally left to the existing committed golden fixture/tests; this independent file does not duplicate that implementation-owned contract.

Fixtures are runtime-only sanitized JSONL in unique OS temporary directories. They contain metadata, timestamps, ids, model names, and numeric usage fields; no prompt or message content.
