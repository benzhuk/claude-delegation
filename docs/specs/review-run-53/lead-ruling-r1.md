# Lane 53 lead ruling on code review r1 (NEEDS_FIXES (14) 4c2b974)

The review is docs/specs/review-run-53/review-r1.md. The live probe round 2 is docs/specs/review-run-53/probes-r2.md. Its probe A measured the P7 Write escape still open under dontAsk, as review finding 1 predicted.

All 14 findings are adopted with their fixes, except for the choices below.

- **Finding 1.** Take (a) and (b) as written. For (c), the mode goes back to the ruling's default, `auto`:
  - Keep `auto` if P5 (a real benign review, zero denials, report written through the scoped Write rule) and P7 both pass under it.
  - Use dontAsk only if auto fails P5. Then use the explicit read-only Bash allowlist the review describes, and name in build.md what the reviewer lost.
  - The unit test on the spawn-boundary argv is required.
  - Add a `Gap:` paragraph to build.md for the residual prefix-rule bypasses (`env git ...`, an absolute-path git, and similar). Under `auto` the classifier backs them up, which is parity with today's Agent-tool reviewer.
- **Finding 3.** Take the simpler alternative: drop PowerShell from the child's `--tools` and `--allowedTools` on every platform. Bash is Git Bash on Windows, and one tool means one deny list. A unit test asserts that PowerShell is absent.
- **Finding 14.** Take the review's suggested fix.
- **Finding 11.** Run the spec's real P4, the before/after hashes, in this round.

Live probe budget for this round: at most 10 real `claude -p` runs, on Netcup only, against decoys. Run the review's "Items for the live probe round" 1 to 5, in that order, with item 1's "before any fix" part skipped: probes-r2 A already measured it.

Items 6 (Windows), 7 (Codex-launched) and 8 (P2b after release) are lead steps after this round and are not the builder's.
