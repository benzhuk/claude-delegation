# Preserve unknown timing evidence in the existing census

Observed trigger: the real status-revision record contains a malformed prose Log line, `Sol delivered ...`. Existing shared parsing exposes `at: Sol`, `status: delivered`, so work-census prints `Sol` as first-delivered time. Invalid acceptance/opened timestamps can also reach naive Date.parse subtraction and render NaNm or negative elapsed as ordinary measurement. The producer error remains a documented error; do not invent historical timestamps or erase the original evidence.

Goal: credible delivery measurements. Hypothesis: validating timing evidence at the existing census's measurement boundary yields unknown instead of malformed timestamps/durations, without another event store or changing work admission.

Owned territory: scripts/work-census.mjs and scripts/work-census.test.mjs only. Reuse shared listRecords/parseRecord unchanged. No new files in runtime, schema, ledger, service or dependency. Existing valid timestamp and report output contracts remain. Builder uses the existing mid tier; parent owns all work records and docs.

Requirements:
- Reproduce the observed malformed Log in a meaningful test through shared record parsing or actual CLI fixture.
- Census first-status timing fields must never expose non-date strings as timestamps. Use null for invalid evidence.
- Elapsed requires valid start/end and nonnegative finite difference. Invalid/missing evidence remains null plus a clear explanatory label; never NaNm or a fabricated zero.
- A malformed latest accepted timestamp must not silently fall back to an older accepted/reviewed timestamp and imply an earlier completion. The latest selected acceptance still governs, but its measurement is unknown. Preserve valid selection semantics and existing labels for ordinary missing fields.
- Accept supported ISO timestamps with Z or explicit offsets, including existing fractional-second precision. Bound validation to real evidence requirements; do not build a timestamp framework or reject documented valid timestamps due formatting preferences.
- Preserve input record bytes and history. This is read-only measurement validation, no repair/migration of records.
- Scope excludes token accounting, new outcome comparisons and unrelated Rounds policy.

Verification: builder runs focused census tests. Independent reviewer reproduces actual malformed input, invalid endpoint and reversed chronology, and checks ordinary valid values/regressions. One root-owned full sealed gate after reviewed change. Preserve real process exits/counts/output, no empty-wrapper PASS. Native provider trials need not repeat for this pure measurement change.
