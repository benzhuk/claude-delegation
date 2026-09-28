VERDICT: PASS

Base: `926c6f801ce21383b06bd5f92ffb18b5ca2603bc`.
Regression commit: `be517dbb0dceb958f44adabf7996e351ff570644`.
Tested production change: `skills/decisions/scripts/decisions-render-core.mjs` blob `feda39eb9dcfa4e171bee06547846916afd10bb1` (uncommitted at final gate time); its diff adds only structural `</details>` separator handling, strict fence tracking, and idempotent blank-run consumption.

Cause: Notion readback removes the separator blank line after a structural closing `</details>`, while the shared comparison retained it.
Discriminating check: normalize the byte-pinned intended/live Lane37 snapshots through the production export; their sole separator delta fails on the base and passes with the production change.
Fix location: `skills/decisions/scripts/decisions-render-core.mjs`, `normalize()`.
Simplification: no retry, adoption, page write, or test-only normalizer was added.

Fixtures are byte-pinned by in-test SHA-256: intended `535914342B07C360AB2FBC59699598C2012F547C3C7F501FCC5CC8EC8D755E1E`; live `5E38CB6460AC8B4C7255E785716ED664A4C028DD3CB3C5A74A8EDFB90BBE6DB1`.

Red command: `node --test skills/decisions/scripts/decisions-render.test.mjs skills/decisions/scripts/decisions-render-publish.test.mjs`; native exit `1`, 143 pass / 1 fail / 144 tests. The only failure was exact intended/live equality. Raw: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/render-readback-48/lane48-red.raw.log`.

An intermediate post-fix run exited `1` because an LF-only test mutation did not alter CRLF fixture bytes; it is retained at `lane48-green.raw.log`. The mutation was corrected to assert it changes the raw snapshot before normalization.

Green command: `node --test skills/decisions/scripts/decisions-render.test.mjs skills/decisions/scripts/decisions-render-publish.test.mjs`; native exit `0`, 145 pass / 0 fail / 145 tests. Exact equality passes; removed bullet, changed tick, moved line, and fenced literals (backtick, tilde, longer fence, and a suffixed non-closing delimiter) remain unequal; structural blank-run normalization is idempotent. Final raw: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/render-readback-48/lane48-final-fence-green.raw.log`. The earlier 145/145 receipt remains at `lane48-final-green.raw.log`.
