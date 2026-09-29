VERDICT: PASS

Tested candidate: `112313869b8777182f6e7adf6b07deb820092ec2`; production blob `127043eff29bf548cef6d68a254592c826abf41c`; contract blob `0a75b2fa04123211b8bf8b1a389f0823065c97ac`; generic-test blob `848ff984aee4665a33435990036fbc17bc89820d`.

Cause: the exact base `72f1dfc1c026c0e410bf6e74d910550e1fe0f843` used a two-day discovery horizon, coupled temporal COUNTED to field support, lacked segment union and complete temporal witnesses, and could expose unsupported values as exact totals.

Discriminating check: the retained base scratch `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\codex-counted-55\baseline-main` produced the original meaningful red: known `leadSession` had no verified identity evidence and missing cached input remained falsely coverage-supported. Later retained red receipts exposed same-id segment conflict, child usage-conflict non-refusal, unconditional task-turn/nudge support, open-child completeness, invalid future-child exemption, filtered timestamp completeness, and an injected-filesystem boundary regression. Equal-usage duplicate model/timestamp disagreement is intentionally unavailable/PARTIAL, not a throwing usage conflict.

Fix location: production `scripts/build-census.mjs`; independent contracts `scripts/build-census.codex.contract.test.mjs`; root-authorized Codex-only legacy contract alignment `scripts/build-census.test.mjs`.

Simplification: all new fixtures are native-shaped, synthetic JSONL without prompt content; the existing sanitized native fixture bytes are unchanged.

Mandatory case map: identity/out-of-horizon/old-child and spoof rejection are at contract lines 380 and 423; segment union, aliases, and usage conflict are at line 435 and the earlier logical-identity contract; damaged/open/historical/completed/future-child witnesses are at lines 452 and 541; missing required fields, cache-write schema proof, reasoning subset, exact derivation, response/turn distinction, malformed task ids, and nudge evidence are at lines 485 and 529; unchanged four-read unavailable propagation is at line 515. Equal-usage duplicate attribution conflicts are pinned in the earlier contract cases and generic line 215. Malformed prefix preservation and same-id nonoverlap union are pinned at generic lines 244 and 362. Existing Claude assertions and the generic injected-filesystem assertion were not weakened.

Final focused gate: `node --test scripts/build-census.test.mjs scripts/build-census.codex.contract.test.mjs scripts/build-census.completeness.test.mjs scripts/build-census.wake-split.test.mjs scripts/four-read.test.mjs scripts/four-read.completeness.test.mjs scripts/work-record.test.mjs`, under process-owned `Global\claude-verify`, acquired within 60 seconds and released in `finally`. Native exit `0`; 498 tests, 498 pass, 0 fail, 0 skipped, 0 todo; 34857.2577 ms. Raw receipt: `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\codex-counted-55\t2-focused-green.txt`; immediate native exit: adjacent `.exit` file.

The earlier exit-1 focused receipt was superseded after material source/test corrections. The base scratch and commit history retain the red-before-green evidence.
