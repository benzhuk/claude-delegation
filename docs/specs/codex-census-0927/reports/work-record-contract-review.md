VERDICT: STALE_TEST_EXPECTATION

Exact integrated artifact: `f1908a0b1a52426fe440bdcffa590431f9bc1ce0`. Read-only adjudication, September 27, 2026, America/New_York. No production acceptance defect identified; `scripts/work-record.mjs` requires no change for this failure.

Integrator's exact Netcup sealed-run excerpt identifies `scripts/work-record.test.mjs:1622`: expected `/^VERDICT: UNSUPPORTED\b/`, actual `VERDICT: PARTIAL Codex census (unknown model attribution ...; usage rows have unknown model attribution)`. Remote exit was 1. The raw receipt is being collected by the integrator; no rerun was requested or performed by reviewer.

Cause: the real-CLI test at `scripts/work-record.test.mjs:1612` still pins the pre-C1 blanket-unsupported Codex behavior. Its committed `scripts/build-census.fixtures/codex-lead.jsonl` has native usage but no `turn_context` model. Under the pinned contract, the correct result is now PARTIAL with unknown-model evidence, not a complete census and not a blanket unsupported-host result.

Discriminating check: `scripts/work-record.mjs:624` recognizes only `VERDICT: COUNTED`. At lines 763–770, PARTIAL falls into the unrecognized-header refusal with error code `census-missing`; it cannot reach the accepted census-summary path. UNSUPPORTED receives a separate specialized message that includes `--no-census`. The PARTIAL rejection's generic message does not contain those two strings. Therefore merely changing line 1622 would leave obsolete message assertions at lines 1628–1629 failing.

Fix location: test-only update in `scripts/work-record.test.mjs:1612`–1631:

- Rename the real-CLI case to describe PARTIAL Codex rejection.
- Assert the generated header is `VERDICT: PARTIAL` and its reason names unknown model attribution; retain the successful CLI exit assertion.
- Retain the `acceptRecord` rejection, exact `census-missing` code, and final assertion that the record is not accepted.
- Replace the obsolete UNSUPPORTED/`--no-census` message assertions with the actual named header-refusal expectation, such as `/does not begin with the census header line, refused/`.
- Preserve the positive contracts already exercised by the COUNTED recognition test at line 1311, accepted-with-census case at line 1666, and explicit `--no-census` reason/acceptance case at line 1571. The partial case must never be relaxed to acceptance.
- If maintaining dedicated legacy UNSUPPORTED diagnostic coverage, add a separate synthetic UNSUPPORTED report test and retain its `census-missing`, `UNSUPPORTED`, `--no-census`, and unchanged-record assertions. Do not force the real modern producer to emit its obsolete host verdict.

Simplification: update the consumer test to the new producer verdict while retaining its acceptance-refusal invariant. Production still permits only COUNTED reports; no lane-fourteen code edit, broadened recognizer or weakened coverage policy is needed.

Scope: inspected exact source, fixture and integrator-provided failure excerpt only. No test gate, CLI run, source edit, acceptance mutation, cleanup, identity change or denied command occurred. Only this report was written.
