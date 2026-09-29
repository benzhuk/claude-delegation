# Lane 52 final specification

Authority: pickup.md and skills-fable-lane-52-2. This supersedes the unresolved probe and timestamp questions in preliminary-spec.md. Work wr-2026-09-28-readback-escapes; base bb77a1d97f8dae420917bcaa3e82385451db0662. Root owns the work record. The existing committed normalize(text) interface is the t0 contract, unchanged.

## Observed rule

The one-paragraph scratch-page roundtrip is captured in L52-probe-report.md and its machine-generated manifest. Only these eight candidate characters gained a preceding backslash: asterisk U+002A, left square bracket U+005B, right square bracket U+005D, backtick U+0060, tilde U+007E, greater-than U+003E, pipe U+007C, less-than U+003C. Underscore, hash, minus, plus and exclamation did not. The page was verified against the authorized title/parent and archived, in_trash true, exit0. No inference beyond the probed set.

Extend normalize only: a backslash before a member of that observed set is insignificant in the comparison on either side. Do not drop the character itself, interpret it as a wildcard, strip other backslashes, or change text, case, punctuation, line order, bullet/tick content, or the cleared timestamp. Keep all pre-existing normalization, including the existing structural-fence exception, intact. Do not widen to a generic Markdown punctuation set or introduce another comparison path. Any ambiguity discovered around consecutive backslashes or literal code must be reported with a discriminating example rather than silently expanding the rule.

## Snapshot correction and regression contract

Both supplied incident snapshots remain byte-for-byte unchanged and SHA256 pinned with fixture-local attributes established before commit. skills-fable-lane-52-2 confirms that the original before snapshot was taken with local render rather than publish; it lacks the cleared timestamp publish adds. Therefore the unmodified pair must still compare unequal. Derive the comparison fixture in the test by aligning exactly that one Done metadata line to the live value, asserting the replaced line and replacement count. No timestamp normalization enters production. The existing two blank separator differences are covered by Lane48 behavior.

The metadata-aligned snapshot pair and the raw probe request/readback pair must fail equality on base normalize for the intended escaping mismatch, then pass on the fixed source. Pin which assertion fails and the source hash. Verify both directions and idempotence for the actually observed single-escape inputs. Explicitly preserve inequality for each unobserved candidate prefixed by a backslash.

Against the aligned live snapshot, removing one whole bullet, changing one checkbox tick, moving a substantive line, changing a word, or replacing build/escaped-star branches with build/x branches must still compare unequal. Keep the raw timestamp difference unequal. Existing Lane48 fixtures and normalizer tests must pass. Never edit production waiting-item content or add a guard to avoid the problem.

## Territories and gates

T1 builder: skills/decisions/scripts/decisions-render-core.mjs, normalize and directly explanatory comment only; own report L52-builder-report.md.
T2 independent test author: skills/decisions/scripts/decisions-render.test.mjs, plus fixture directory skills/decisions/scripts/fixtures/readback-escapes-52 and its local attributes; own report L52-test-report.md. Existing test helpers may be reused; no edits to other test files without root ruling.
Root: this spec, record, briefs, review/census/closeout evidence. No marker changes are planned, so docs/census.md stays untouched. No renderer entrypoint, guard, adopt-live semantics, notion.js or lane39 changes.

Focused gate is node --test skills/decisions/scripts/decisions-render.test.mjs skills/decisions/scripts/decisions-render-core.test.mjs skills/decisions/scripts/decisions-render-publish.test.mjs. Test author owns the focused integration gate after both territories are committed; source builder may run a narrow existing normalizer check once. No full suite per builder. Root asks skills-fable for one Opus reviewer once scoped green. Final exact reviewed candidate gets sealed Windows/Netcup gates, then merge/current-main ancestry check and a sealed exact-merge Windows gate. One history bullet inside merge, normal Windows main publish exit0 and bookkeeping receipt, code-mediated close, one RESULT. No recovery flag or page-content rewrite.
