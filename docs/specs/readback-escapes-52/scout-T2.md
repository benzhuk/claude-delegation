## Files and symbols
- No Lane52 test file, fixture directory, or probe fixture exists at base `bb77a1d`.
- The reusable test home is `C:/Users/benzh/orca/workspaces/claude-delegation/codex-followups-49/skills/decisions/scripts/decisions-render.test.mjs`; it imports `normalize` through the CLI facade at lines 14-20.
- Existing snapshot fixtures are `skills/decisions/scripts/fixtures/render-readback-48/main-merge-r2-decisions-intended-publish-render.md` and `main-merge-r2-decisions-live-after-exit5.md`; test lines 137-150 assert their SHA-256 hashes before decoding.
- Supplied Lane52 raw inputs are `C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/9c61c35a-82dd-4aef-8eca-c99bb0e72e31/scratchpad/lane52-render-before-write.md` (SHA-256 `B448DAB8D79FC7254FD42D100D192A5790E5A7642F2B46E608ED2D8C9C9B93C8`) and `lane52-live-after-write.md` (`A88FA4A5AF57B30F237038F164B3F25EBA334F220EB559D62114542FD5FCC844`).
- A raw `git diff --no-index` finds only two removed structural blank lines, `build/*` versus `build/\\*`, and the cleared-Done timestamp; raw equality and current normalized equality are both false.

## Helpers to reuse
- Reuse `lane48Snapshot(name, expectedHash)` in `decisions-render.test.mjs:137-150` for byte-preserving fixture reads and local SHA-256 attributes.
- Reuse the mutation pattern at `decisions-render.test.mjs:156-183`: derive bullet, tick, and line-order mutants from the pinned readback; add `build/\\*` to `build/x` as the fourth negative.
- Reuse `wireNotion` in `decisions-render-publish.test.mjs:495-504` for an injected post-write readback; it makes no Notion call.

## Tests that police this area
- `decisions-render.test.mjs:152-204` requires source/readback equivalence only for the enumerated cosmetic difference and preserves substantive/fenced differences.
- `decisions-render-publish.test.mjs:235-244` validates this comparator at step 3; `:726-740` keeps step-6 exit 5 for a failed readback.
- Fixture-local `.gitattributes` at `fixtures/render-readback-48/.gitattributes` preserves CRLF bytes; Lane52 fixture placement needs the same attribute if raw bytes contain CRLF.

## Open questions for the spec
- Must the two supplied snapshot files be copied byte-for-byte into a new fixture directory and hash-pinned, or may a test strip/replace the cleared-Done line before comparison? The verbal requirement says both “verbatim” and escape-only equivalence, which the observed timestamp mismatch cannot jointly satisfy.
- After the scratch probe, what exact escaped members and whether fenced/code contexts are in scope for the fixture assertion?
