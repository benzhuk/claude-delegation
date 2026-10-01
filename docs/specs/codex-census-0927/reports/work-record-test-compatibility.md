# Work-record Codex caller compatibility

Status: test-only adjustment, September 27, 2026 (America/New_York). Based on `reports/work-record-contract-review.md`.

The real CLI fixture now expects `VERDICT: PARTIAL` with `unknown model attribution`; `acceptRecord` must refuse it with `census-missing` because only `COUNTED` is accepted. The test retains the unchanged-record assertion.

A separate synthetic `UNSUPPORTED` census preserves the legacy specialized diagnostic contract: `census-missing`, `UNSUPPORTED`, and `--no-census`. Existing positive `COUNTED`, accepted-with-census, and explicit `--no-census` tests were left unchanged.

No production source, gate, record, or commit was changed. This writer did not execute tests.
