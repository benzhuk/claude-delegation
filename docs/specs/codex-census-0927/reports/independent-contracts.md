# Independent Codex census contract tests

Status: RED against the pre-C1 implementation on 2026-09-27 America/New_York.

Command: `node --test scripts/build-census.codex.contract.test.mjs`

- 4 tests run; 0 passed; 4 failed; 0 skipped.
- Verified ancestry/depth-two/common-root namespace case is blocked by `coverageSupported: false`.
- Depth-four/unknown-model/unavailable case lacks the required `lead.codex` metadata.
- Explicit outside-home child plus copied-lead de-dup is blocked by the Codex `--tasks` rejection.
- Pre-window model attribution is blocked by the Codex `--from/--to` rejection.
- The first case also requires foreign-parent exclusion, distinct-child response-id accounting, and unique `task_started` turns despite repeated contexts.
- Claude golden bytes are intentionally left to the existing committed golden fixture/tests; this independent file does not duplicate that implementation-owned contract.

Fixtures are runtime-only sanitized JSONL in unique OS temporary directories. They contain metadata, timestamps, ids, model names, and numeric usage fields; no prompt or message content.
