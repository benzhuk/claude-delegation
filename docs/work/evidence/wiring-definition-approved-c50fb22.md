VERDICT: APPROVE c50fb22618812a9b98ffe84668bbcdd3306ff7d9

# Wiring definition admission — independent Astra review

Verdict: APPROVE exact source artifact `c50fb22618812a9b98ffe84668bbcdd3306ff7d9`.

Scope: `ae613fc..c50fb22` for `scripts/wiring-check.mjs` and its test, read against `docs/specs/2026-09-23-wiring-unknown-evidence.md` and complete current evaluator. No source edits, no production settings, no native host/model execution, no full sealed gate.

The single admission validator repairs the late native review findings at their shared boundary. Selected missing or incorrectly typed required fields cannot reach filesystem evaluation or become known absence. Explicit empty hook substring retains the existing String.includes('') match-any behavior; undefined/null/numeric substrings are rejected. Empty substring does not invent presence when the selected event has no command. Valid private override precedence and explicit platform exclusions are preserved. Denied switch inspection is unknown while known present/absent switches remain informational. Moving the injected filesystem lookup inside the existing off-switch try preserves fail-silent handling for unavailable off-switch evidence. The removed invalid-row branch was redundant with merge admission; original invalid rows still generate input-level uncertainty.

Observed verification:

- `node --test scripts/wiring-check.test.mjs`: actual process exit 0; 47 tests, 47 pass, 0 fail, 0 cancelled/skipped. Retained output: `wiring-definition-review-tests.log` in this report's directory.
- Independently authored `wiring-definition-independent.mjs`: actual process exit 0; 81 cases passed. Matrix covers missing/null/numeric/object/array required fields before filesystem access; invalid fresh thresholds; both empty-substring polarities with present/absent commands; denied switch privacy; ENOENT/ENOTDIR informational switch absence; excluded malformed definitions; private override replacing malformed public definition; throwing fsImpl accessor in --line returning 0 and no output. The script is retained in this report's directory.
- Source files remained clean during review; HEAD checked before and after review.

No blocking findings in this finite delta. Nonblocking documentation nit: the type inventory still says switch is "always info" although inaccessible evidence now correctly yields unknown; the shared general unknown rule is implemented. Updating that comment would improve accuracy and does not require another runtime mechanism.

Boundaries: this is a declared-condition diagnostic, not a complete hook-schema validator or proof that an installed host executed a hook. Tests do not establish live installation, two-host production readiness, or progress on macro deliverable/quality metrics. Missing platform selectors retain existing semantics; expanding optional selector schema is outside this repair. No proposal to harden injected nonstring utf8 reads was adopted: real Node fs utf8 reads return strings.
