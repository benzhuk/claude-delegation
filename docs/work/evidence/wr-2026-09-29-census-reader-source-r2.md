VERDICT: SOURCE_READY
Commit: 6120e22e64f4484c175b1768a82e203d2b9326a6 (parent 749c670f) on benzhuk/census-reader-40b-source. Only scripts/jsonl-lines.mjs changed (+5/-4 lines).
Patch: code-review-r1.md A2 "Replacement" applied verbatim (chunk-local indexOf; the pending remainder is joined only with the first segment of the next chunk). No other change.
Focused: jsonl-lines.test.mjs from integration dc53988d in a plain-file scratch overlay (scripts/ only, r2-overlay) with my jsonl-lines.mjs overlaid, run via nonblocking Global\claude-verify (was free): 5 tests, 5 pass, 0 fail. Output: source-r2-gate.out. Limit: only the jsonl-lines test file this round; no census-level suites.
Timings (same synthetic one-row payload: 64 KiB 'a' string chunks then LF, bench-r2.mjs):
 before: 8MB 185 ms, 32MB 2965 ms (source-r2-bench-before.txt)
 after:  8MB 3 ms, 32MB 14 ms (source-r2-bench-after.txt)
No timing test or production seam added.
Semantics kept: non-string TypeError, CR stripped after joining (CR/LF across chunks), source error skips the pending remainder, early return via for-await, EOF remainder including CR-only.
Guard note: the delete-guard refused two Bash calls (the first included an unneeded recursive delete of a scratch path; the second only because my heredoc text contained that command string). I dropped the delete, deleted nothing, and did not reroute. Scratch left for the lead: r2-overlay/ and bench-r2.mjs in this directory.
Cause: lfLines did rest += chunk and rescanned the whole pending row from offset 0 on every chunk, so one very long row cost quadratic time.
Discriminating check: 32MB single-row payload, 2965 ms before vs 14 ms after; 4x size gave about 16x time before and about 4x after.
Fix location: scripts/jsonl-lines.mjs, lfLines loop body.
Simplification: same generator, search only the new chunk; no new helper or state.
