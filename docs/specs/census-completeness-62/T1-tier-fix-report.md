VERDICT PASS

Commit: 34b6bb0b20318faa3c0e0ae92545ffd13b1a022f
Changed: scripts/census-measures.mjs (isTopTierModel: after a configured match, any known family incl. DEFAULT_TOP_TIER_MODELS returns false; only unknown families null; comment), docs/census.md (filter semantics).
Checked: node --check only; no suite run (T2 holds the mutex), no test changes.
Effect: DELEGATION_TOP_TIER=gpt-6-astra now excludes claude-opus without an unclassified cell; expected to clear the single old-test override failure (unverified by me).
Cause: default-top names were neither configured nor in the lower list, so null.
Discriminating check: isTopTierModel("claude-opus-5-5",["gpt-6-astra"]) === false.
Fix location: census-measures.mjs.
Simplification: none needed.
