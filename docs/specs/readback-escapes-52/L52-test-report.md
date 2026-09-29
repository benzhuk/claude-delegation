VERDICT: PASS

Cause: Notion readback adds one literal backslash before only the eight probe-observed Markdown characters, while the common comparison previously treated that punctuation change as content.
Discriminating check: On exact base `bb77a1d97f8dae420917bcaa3e82385451db0662`, an isolated scratch checkout with the independent T2 tests exits `1`: 98 pass, 2 fail, 100 total. The only failures are `Lane52 byte-pinned snapshots compare after only Done metadata alignment` and `Lane52 probe request and readback compare for only the observed escape set`; their assertion diffs identify `build/*` versus `build/\\*` and the eight observed probe escapes. Raw output and immediate native exit: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/readback-escapes-52/base-red.raw.log` and `base-red.exit`.
Fix location: `skills/decisions/scripts/decisions-render-core.mjs`, `normalize()` (builder revision `b45e8ba`; SHA-1 `3c55daf619aea14861086706c2da1359df8c4104`).
Simplification: the tests reuse the production `normalize()` export and existing fixture helper pattern; they add no comparison path, timestamp normalization, production-content change, live write, or broad suite.

T2 fixtures are raw byte copies guarded by `fixtures/readback-escapes-52/.gitattributes` before their first staging: `lane52-render-before-write.md` SHA-256 `B448DAB8D79FC7254FD42D100D192A5790E5A7642F2B46E608ED2D8C9C9B93C8`; `lane52-live-after-write.md` `A88FA4A5AF57B30F237038F164B3F25EBA334F220EB559D62114542FD5FCC844`; `probe-request.md` `117A5C0F257FD42BC6CBA3B10AEB603B07E63B2D85735BF6CE36DCFB1D35264D`; `readback.md` `01FCC13F70C603E1E222A23986E33C879EFE3EB1A1C0A87393A10B7FEF43A3DD`; and `proof-manifest.json` `65BDAF2BB9679B3116CC3F0B054550FA34AD9659FBDD786B4FC9E78D2DFCBCFB`. The test computes every pin from fixture bytes.

The sole focused integration gate was run once from the integrated builder source under process-owned `Global\\claude-verify`, acquired within 60 seconds and released/disposed in `finally`:

`node --test skills/decisions/scripts/decisions-render.test.mjs skills/decisions/scripts/decisions-render-core.test.mjs skills/decisions/scripts/decisions-render-publish.test.mjs`

It exited `0`: 149 pass, 0 fail, 149 total. Raw output and immediate native exit: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/readback-escapes-52/final-focused-green.raw.log` and `final-focused-green.exit`.

The new assertions align exactly one `Done` metadata line before snapshot comparison, preserve raw timestamp inequality, require both the raw probe pair and every observed single escape to compare equal and idempotently, preserve each unobserved escaped candidate as unequal, and keep removal of a whole bullet, a checkbox change, substantive-line movement, a word change, and `build/\\*` to `build/x` unequal.

Fresh detached checkout verification at T2 commit `6fa0520b5dd8462c45a53aa7c53b7ca4386b6362` was clean and preserved every pin above. `git ls-files --eol` reports `attr/-text` for the fixture directory; the two snapshots, request, readback, and manifest hash to their asserted values there. This verifies the fixture-local byte protection before review or integration.
