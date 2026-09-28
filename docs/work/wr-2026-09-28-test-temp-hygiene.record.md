Work: wr-2026-09-28-test-temp-hygiene
Scope: docs/specs/test-temp-hygiene-1/spec.md (lane 46 lead spec, rulings P1 to P6) from packet docs/specs/test-temp-hygiene-1/packet.md (skills-fable-lane-46-1, from skills-n-release-0-20-17-2)
Owner: skills-n
Status: delivered
Authority: build, review, integrate, push build/test-temp-hygiene-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; the live proof runs one full suite on Netcup; no release, no install, no manual deletion under /tmp
Next: Opus review and the Windows suite at 2455f1d, then the live proof on Netcup
Worktree: build/test-temp-hygiene-1
Opened: 2026-09-28T22:03:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-28T22:05:00Z
Base: 357fc15d5d2daaf47a9655246a16b852210f0117
Log: 2026-09-28T22:06:59.000Z owned skills-n picked up skills-fable-lane-46-1, ACK sent; lead spec written with rulings P1 to P6 after reading run-tests.mjs and test-home.mjs at 357fc15 (checkSeal forces the sealed home inside the per-run root); Sonnet builder spawned
Log: 2026-09-28T22:23:36.000Z delivered skills-n Sonnet builder DONE 2455f1d (per-run root with TMPDIR TEMP TMP, sealed home inside it, trim on failure, signal removal, 24 h dead-pid sweep, leak check line; one straggler, the nested --no-sweep CLI test, fixed); four full runs each read leak check: 0 new temp entries, two with 0 fail, one straggler fail before the fix, one note-flush H4 timing flake; Opus review and Windows suite started

Scratch directory for this lane (in the body until lane 36 lands the header field): /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-46
