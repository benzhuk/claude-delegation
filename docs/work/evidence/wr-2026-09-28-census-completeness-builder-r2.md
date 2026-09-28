VERDICT: DONE d2000ee78626b069a19055081fcd74c36f78e8e2

Lane 38 round 2, branch build/census-completeness-1, pushed. Serves the GOAL line "work lost or stalled"; nearest NOT: "a host-specific primitive as the shared contract" (Codex now counted through the same envelope, not a Claude-only marker).

## Fixes
- F1 (option a, verified): `runCodexCensus` counts Codex wakes as `response_item` / `message` / `user` records with exactly one `input_text` part holding one envelope line (`classifyCodexWake`), windowed like the tokens, split note-flush vs Done-tick. Shape read on a LIVE rollout that received a queued note: `01a0dab2-065e-7a31-bff4-9aecfe1fa833` at 2026-09-25T22:32:53Z (no "unverified" caveat needed). The `event_msg` `item_completed` `UserMessage` echo is not counted. `stallNudges` is computed for Codex leads (ledger-based). Codex Stop-blocks stay `null` with `stopBlocksUnavailable` = "no Codex rollout record of a Stop-hook block is established; the Stop reason appears only inside tool output". four-read prints wakes for a Codex census and the Stop-block reason.
- F2: census.md Secrecy sentence replaced with the reviewer's text.
- F3: census.md "not a wake" paragraph now covers the `queued_command` note-flush attachment; fixture line present and a test asserts it classifies as neither wake nor Stop-block.
- F4: ledger fixture line `skills-fable-stall-review-1`; four-read test pins that it is not a nudge to skills-o (anchor `^collect-.+-stall-`).
- I1: census.md says the dispatching note arrives before `Opened:` and is not counted.
- census.md: the stale "Codex is not read for wakes" sentence and the four-read item-4 "or a Codex census" wording are corrected.

## Tests
- New fixture `scripts/build-census.fixtures/completeness/codex-lead.jsonl` (2 wakes: 1 note-flush + 1 Done-tick; echo, developer hook context, multi-line text as negatives).
- build-census.completeness.test.mjs: 13 tests (queued_command, Codex counts, slug inference and window, classifyCodexWake negatives). four-read.completeness.test.mjs: 6 tests (stale Codex assertion rewritten, Codex row added).
- Touched files (build-census, completeness, codex contract, four-read, four-read completeness): 220 pass, 0 fail.
- Full `node scripts/run-tests.mjs`: 2676 tests, 2664 pass, 0 fail, 12 skipped (log: full-r2.log in this folder).

## Live rerun (lane 32, wr-2026-09-27-autolink-guard, window 2026-09-28T03:06:46Z..10:28:19Z, slug skills-o, Windows ledger)
census: wakes 1 (1 note-flush, 0 Done-tick); stopBlocks 0; stallNudges 0 to skills-o.
four-read L row ends: `wakes 1 (1 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-o`. Same as round 1. Outputs: live-census-r2.md/json, live-four-read-r2.md.

## Caveats
- Stall nudges count only the ledger given; nudges to a lead on another host sit in that host's ledger.
- The Codex wake shape is verified on one live rollout plus the inbox-codex.mjs format; the fixture reproduces it.
