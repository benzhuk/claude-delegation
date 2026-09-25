VERDICT: PASS c136c5ca9e4658d756e4871b5ccf510f5afc0caa

Focused sealed validation passed: 65 build-census tests and 119 work-record tests (184 total).

M1: a Codex marker window with no per-response rows now has null complete and observed
window counts, `observedLeadTokens: unknown`, and an UNSUPPORTED header; it cannot be a
COUNTED zero census.

M2: conflicting repeated response ids (turn or usage differs) throw visibly; identical
repeats remain deduplicated observations.

M3/M4: Codex coverageSupported is always false with a specific coverageReason. `leadTokens`
is unsupported, complete request/turn/rate fields are null, and verified response-local
diagnostics are separately named observedLeadTokens, observedLeadRequests, and observed
native turn ids. Coexisting token_count events are not treated as malformed or as a
completeness heuristic.

LOW5: marker matching excludes session_meta and turn_context. LOW6: turn_context and
compacted-only truncations route to the Codex reader and fail without metadata. LOW7: docs
state UNSUPPORTED reports are refused by --census and Codex --tasks remains unsupported.

Upstream leadLastMessageAt and unreadable-directory/INCOMPLETE behavior were preserved.
No native Codex child discovery, role totals, conversational leadTurns, model attribution,
or complete per-build usage coverage is claimed; this build requires --no-census.
