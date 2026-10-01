VERDICT: FAIL bc309e4a834eb0ad00d8a094c9593ca149ece72e

The clean local integration artifact preserving the exact C1 and C3 candidate commits
ran `node --test scripts/build-census.codex.contract.test.mjs` through the approved
non-deleting mutex. Native exit was `1`: 17 passed, 1 failed, duration `468.5603ms`.
The immediate native exit and raw stdout/stderr transcript are versioned in the adjacent
receipts. Before Git staging, the raw transcript was `2898` bytes with SHA-256
`B10271DCEAE9F62369B1D13BAF30E1B99787FF98DCE16945D3EAABEA5268459C`.

The sole failure is `scripts/build-census.codex.contract.test.mjs:264`, `Codex contract:
a lead-only marker includes child responses at and after its shared boundary`; assertion
`:279` returned `false` where `true` was expected. This artifact is pushed for read-only
adjudication. No source/test edit, rerun, Windows full suite, Netcup gate, acceptance, or
main merge followed this failure.
