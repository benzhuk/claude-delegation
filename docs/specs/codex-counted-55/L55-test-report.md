VERDICT: IN_PROGRESS

Cause: the exact base retains two-day discovery and couples Codex COUNTED output to
token-field support.

Discriminating check: `node --test --test-name-pattern "Lane55" scripts/build-census.codex.contract.test.mjs`, run from `baseline-main` at
`72f1dfc1c026c0e410bf6e74d910550e1fe0f843`, produced two assertion failures:
known `leadSession` has no identity evidence, and missing cached input still reports
coverage supported.

Fix location: `scripts/build-census.mjs` (T1). Test location:
`scripts/build-census.codex.contract.test.mjs` (T2).

Simplification: fixtures are native-shaped JSONL generated in the contract test; no
transcript content is retained.

Candidate interim check: the two new Lane55 assertions pass against the uncommitted
T1 source candidate. The full owned contract file remains red (14 pass, 6 fail): legacy
fixtures need temporal terminal witnesses or updated expectations for the new
`coverageSupported` rule; the native sanitized fixture lacks a terminal witness; and
same-id segment union presently raises `Codex response_id conflict across segments for
lead-response` on the logical-segment contract. No focused consumer gate was run while
these failures remain.

Post-merge contract run at `50a66a5339007664bd964f608050178afbd9a7f0`: 13 pass,
8 fail. Two failures are production regressions sent to T1: a duplicate response with
conflicting model/timestamp no longer refuses, and an exact same-id alias is treated as a
response conflict. The other failures are T2 fixture expectations retained from the prior
coverage rule and will be converted to final-spec temporal/PARTIAL or per-field assertions.

## Mandatory case map

`build-census.codex.contract.test.mjs` covers verified/missing/spoofed identity;
old-child tree traversal; response and task-started distinction; duplicate and
conflicting responses; alias/segment conflict; root/parent/depth exclusions; missing
cache/model/reasoning evidence; cache split non-fabrication; pre-window model context;
historical horizon; and explicit unreadable discovery. The two `Lane55` cases pin
canonical-tree identity and temporal COUNTED with unsupported fields. Existing
`work-record.test.mjs` contains the untouched COUNTED acceptance/PARTIAL refusal
consumer assertions. The remaining required additions are nonconflicting resumed segment
union, damaged/open historical variants, cache-write-format proof, reasoning-subset
schema fixture, and real four-read unavailable propagation; they are not claimed PASS.
