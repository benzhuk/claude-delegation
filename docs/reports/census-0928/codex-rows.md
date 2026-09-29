VERDICT: OBSERVED final-main rereads

Generator source and fresh `origin/main`: `4e36981b0adb9f0799b2a5060b09e0e44f2a6d34`. The five rereads ran in a clean detached final-main checkout; every census and four-read native exit is zero. The [manifest](codex-evidence/L55-reread-manifest.json) records command arrays, raw stdout/stderr, provenance, and the preserved SHA-256 hashes of every original record, census, and four-read input.

# Codex native rows

| lane | graph-only top-tier tokens (no spec slice) | native lead turns | final-main coverage |
|---|---:|---:|---|
| L31 | [13,760,385](codex-evidence/final-main-4e36981-001/L31/four-read.json) | [1](codex-evidence/final-main-4e36981-001/L31/build-census.json) | `OBSERVED`; `coverageSupported=true` |
| L37 | [26,445,465](codex-evidence/final-main-4e36981-001/L37/four-read.json) | [2](codex-evidence/final-main-4e36981-001/L37/build-census.json) | `OBSERVED`; `coverageSupported=true` |
| L48 | [10,726,282](codex-evidence/final-main-4e36981-001/L48/four-read.json) | [1](codex-evidence/final-main-4e36981-001/L48/build-census.json) | `OBSERVED`; `coverageSupported=true` |
| L49 | [22,357,188](codex-evidence/final-main-4e36981-001/L49/four-read.json) | [2](codex-evidence/final-main-4e36981-001/L49/build-census.json) | `OBSERVED`; `coverageSupported=true` |
| L52 | [11,306,438](codex-evidence/final-main-4e36981-001/L52/four-read.json) | [1](codex-evidence/final-main-4e36981-001/L52/build-census.json) | `OBSERVED`; `coverageSupported=true` |

These are graph-only counts from the verified canonical Codex lead-session graph over each record's `Opened` through final accepted window. They are not total build costs: no spec slice was run, external peer-review costs are unavailable, and native Agent/Task/Workflow stall attribution is **UNSUPPORTED**. Each four-read therefore labels the token number `partial (no spec slice)` and the work-lost/stalled number unavailable for stall classification.

L37's first/final accepts are `2026-09-28T22:40:15.516Z` / `2026-09-28T22:58:55.152Z`; L49's are `2026-09-29T00:42:02.000Z` / `2026-09-29T01:20:03.000Z`. Existing four-read retains first acceptance for elapsed/rework semantics. The preserved [Lane37 exact-base PARTIAL baseline](../../../specs/codex-counted-55/L55-lane37-baseline.census.md) remains separate from this final-main evidence.
