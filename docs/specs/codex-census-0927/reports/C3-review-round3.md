VERDICT: APPROVE 7d50ab0ef79a1ab0e699e9ea2706585d73379207

Independent final delta review, September 27, 2026, America/New_York. Exact candidate HEAD confirmed read-only. This closes the remaining spec-identity finding in `C3-review-round2.md`; previous review reports remain preserved.

No remaining defect found in the reviewed delta.

Cause: Codex spec identity now uses the same semantic identity validation as Codex build identity, with a Spec-session-specific label. Identical unavailable placeholders no longer authenticate evidence.

Discriminating check: independent in-memory calls against the exact candidate exercised both Codex and Claude build hosts. A valid matching 23-token Codex spec yields totals 46 and 143 respectively. Matching `unknown`, `unavailable`, blank and whitespace identities; missing native or requested identity; and mismatched identities all preserve build subtotals 23/120 and explicitly report a partial unavailable spec slice. No invalid case adds the spec's 23 tokens or silently substitutes zero for verified spec work.

Fix location: `scripts/four-read.mjs` reuses `codexIdentityReason(specCensus, fields['spec-session'], 'Spec-session')` before accepting the spec slice, while keeping the existing host-specific model policy and derived-token accounting. No further fix is requested.

Simplification: one existing identity validator now serves both Codex census roles. No new reader, discovery mechanism, report shape or Claude-only behavior was introduced.

Durable regression coverage: `computeTopTierTokens: a Codex spec slice requires a usable matching Spec-session identity for either build host` supplies the negative identity table for both hosts; the existing `each mixed-host build and spec slice uses its own default top-tier policy` test supplies valid mixed-host positives and explicit-policy override coverage. The exact-case valid positive was also independently rerun in memory during this review.

Integrator confirmed exact candidate focused gate 69/69, exit 0. The unchanged Claude golden assertions remain in that gate. Previous review independently established JSON/Markdown byte identity; the current narrow delta affects only the Codex spec validation branch and generalizes the identity helper's existing default label without changing Claude output. No test gate was run by reviewer.

Approval is for this exact C3 artifact. Integration-only independent-test corrections, native-fixture checks and final combined acceptance remain separate integrator/root responsibilities. Candidate stayed read-only; no full suite, cleanup/deletion, identity changes or denied commands occurred.
