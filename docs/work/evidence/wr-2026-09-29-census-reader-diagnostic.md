VERDICT COUNTED (as emitted; DIAGNOSTIC, unaccepted provisional evidence, not the post-review/gate census)
Emitted first line: `VERDICT: COUNTED 95 Codex responses (leadTurns 1); UNSUPPORTED stallNudges, stalls, 58 subagent files, leadLastMessageAt: 2026-09-30T03:40:17.625Z`
Code artifact: integration checkout census-reader-40b at 4f4edbc4e470e6faa4f9598763dbb4800468bb3e, clean tree, scripts/build-census.mjs unchanged. Ran once, exit 0, empty stderr.
Args (C1 of accept-preflight-report.md, one run): --lead <brief lead rollout path> --lead-session 01a0df4c-2809-7520-b1d7-876cc51a87ee --codex-home <brief home dir> --from 2026-09-30T03:00:00Z --to 2026-09-30T03:39:47Z --ledger-dir docs/ledger --lead-slug skills-a --out diagnostic.census.md --json diagnostic.census.json
Outputs (this scratch dir): diagnostic.census.md, diagnostic.census.json (plus diagnostic.stdout, diagnostic.stderr2). Old outputs untouched.
Times: effective window 2026-09-30T03:00:00Z to 03:39:47Z (NYC 23:00:00 to 23:39:47 on 9/29). Lead window start 03:00:00.455Z, window end 03:39:35.026Z, last lead message 03:40:17.625Z, wall clock 0.66 h.

Counts (no transcript content):
- Codex lead requests: leadTurns 1; window responses 95; total responses on disk 3060; 58 subagent files counted.
- Discovery scope: complete true, canonical-session-tree, reason null. Lead identity verified. Excluded 136 (135 unrelated, 1 duplicate lead/path). coverageSupported true, coverageReason null.
- Tokens in window by model:
  gpt-5.6-sol: native input 12,221,931 (cache read 12,003,328), output 43,789, derived total 12,265,720
  gpt-6-astra: native input 10,707,124 (cache read 10,501,760), output 47,730, derived total 10,754,854
- Fields COUNTED: model, input, cached input, cache write (0), output, reasoning output, derived total, responses, leadTurns, wakes, stopBlocks.
- UNSUPPORTED (not partial reasons): stalls (native Agent/Task/Workflow stall attribution unsupported); stallNudges (docs/ledger does not exist in the integration checkout, "ledger dir unreadable").

Partial reasons: none. No malformed rows, no unreadable files or directories.
Notes for root: (1) the window ends 30 s before the last lead message, so a row after --to exists, which is the end-bound witness for the lead. (2) stallNudges will stay unavailable unless the real ledger dir is passed; I used docs/ledger as written in C1 and did not search for another. (3) Root events after 03:39:47Z belong to the later post-gate census, not this one.
