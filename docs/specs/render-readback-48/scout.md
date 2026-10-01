VERDICT READY
Base: origin/main 926c6f801ce21383b06bd5f92ffb18b5ca2603bc (fresh fetch 2026-09-28).
Orca checkout: C:/Users/benzh/orca/workspaces/claude-delegation/render-readback-48
Branch: build/render-readback-48; Orca show recognizes this HEAD/base/worktree.
Scope correction: comparison implementation was extracted from the named CLI into
skills/decisions/scripts/decisions-render-core.mjs; decisions-render.mjs re-exports normalize.
Patch normalize(text)->string only; no export/API change and no new stubs/mechanisms.
Consumers: decisions-render-publish.mjs step 3 drift/backup/adopt and step 6 readback.
Existing normalizer removes CRLF, trailing whitespace, blank runs, final newline, and final marker.
Live snapshot SHA256: 5E38CB6460AC8B4C7255E785716ED664A4C028DD3CB3C5A74A8EDFB90BBE6DB1
Intended SHA256: 535914342B07C360AB2FBC59699598C2012F547C3C7F501FCC5CC8EC8D755E1E
Copied untouched under this scratch root; copied hashes match the source hashes.
Exact normalized source diff: live lacks one LF after closing details; intended has it.
Escaped hunk: live `</details>\\r\\n<details>`; intended `</details>\\r\\n\\r\\n<details>`.
No differing blank after </callout>; neither snapshot establishes any other whitespace rule.
Missing final newline is already insignificant because normalize removes trailing blank lines.
Risk: global blank-run collapsing is broader than snapshot evidence; do not widen it further.
Risk: rule must be token/line-contextual so code-fence/content blank lines, removed bullets, ticks,
or moved content remain unequal.
Implementation focus: normalize at decisions-render-core.mjs:33; public re-export at decisions-render.mjs:37.
Tests: decisions-render.test.mjs normalize unit block (starts line 103); add exact snapshot equality.
Tests: decisions-render-publish.test.mjs existing readback failure test line 726; add pass plus
removed-bullet and changed-tick mutations through publish/readback, each must remain exit 5.
No suites run; no production/source/document changes made by scout.
