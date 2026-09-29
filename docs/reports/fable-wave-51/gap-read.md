DONE

Host: ben-desktop, checkout C:\Temp\fw-6b95 at 6b95a2d6d0396000472b69ee5e4b9a36d74f3e28 (verified). Transcript: C:\Users\benzh\.claude\projects\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl. Window: 2026-09-28T19:00:00Z to 2026-09-29T01:26:54Z.

Note on row 1: its own wake line (RESULT, kind ASK's predecessor) lands at 2026-09-28T18:59:37.893Z, before the stated window start — but the run it opened kept running past 19:00:00Z, and censusLeadFile's own window semantics (windowStarted/windowEnded are global monotonic flags checked per line, not per-run) tag that still-open run as windowed the moment its activity crosses the boundary, attributing it to the original wake. This is the authoritative build-census.mjs behavior at 6b95a2d, reproduced exactly (confirmed by both a from-scratch script and a debug instrumentation of a scratch copy of build-census.mjs itself); it is why the table has 8 rows rather than 7.

| # | wake time | claude-fable-5-1 tokens | min since previous post (kind) | min to next run opening (opener) |
|---|-----------|------------------------:|---------------------------------|-----------------------------------|
| 1 | 2026-09-28T18:59:37.893Z | 728,827 | 508.2 (wake:RESULT) | 1.2 (wake:BLOCKED) |
| 2 | 2026-09-28T19:52:39.598Z | 2,374,504 | 51.8 (wake:BLOCKED) | 5.1 (human prompt) |
| 3 | 2026-09-28T20:36:21.902Z | 1,082,108 | 43.7 (wake:RESULT) | 3.0 (human prompt) |
| 4 | 2026-09-28T21:13:44.664Z | 1,508,605 | 37.4 (wake:RESULT) | 27.8 (human prompt) |
| 5 | 2026-09-28T22:48:39.082Z | 792,626 | 17.4 (wake:ASK) | 1.7 (wake:ASK) |
| 6 | 2026-09-29T00:00:12.576Z | 1,480,146 | 17.0 (wake:ASK) | 1.5 (other) |
| 7 | 2026-09-29T00:13:58.139Z | 1,019,846 | 13.8 (wake:RESULT) | 2.2 (wake:ASK) |
| 8 | 2026-09-29T01:00:32.591Z | 2,185,825 | 5.3 (wake:ASK) | 5.1 (human prompt) |

No mid-turn queued peer deliveries (queued attachments carrying the wake prefix) occurred anywhere in this transcript — checked directly: 127 "queued" attachments exist, all type `queued_command`, none carrying the peer-wake prefix. So every "previous post" above is a wake line; none is a queued delivery.

Check: sum of column 2 across the 8 rows = 11,172,487. This equals the census ceiling at 6b95a2d (11,172,487) — confirmed against a live run of build-census.mjs's own `censusLeadFile` (`wakeSplit.coalescable.resultByModel`) over the same file and window. Match.

SAVED rule (10-minute hold, as specified):
Only row 8 has column 3 under 10 minutes (5.3 min). Its next opening (01:05:36.453Z) falls 23.4 seconds AFTER its release time (previous post 00:55:13.011Z + 10 min = 01:05:13.011Z), so it fails the second condition. No row satisfies both conditions, and no row shares a release time with another queued row, so:
- Saved token sum: 0
- Saved / 48,886,987: 0.0%

Context only — same rule with a 30-minute hold in place of 10:
Rows 5, 6, 7, and 8 all have column 3 under 30 minutes, and each one's next opening lands before that row's own (previous post + 30 min) release time, so all four qualify independently (no shared release times, so the second clause does not apply).
- Saved token sum: 5,478,443 (792,626 + 1,480,146 + 1,019,846 + 2,185,825)
- Saved / 48,886,987: 11.2%

Left behind on the host (no delete performed, per instructions): C:\Temp\lane51.mjs, C:\Temp\lane51-out*.json, C:\Temp\dbgrun.mjs, C:\Temp\dbgrun-out*.txt, C:\Temp\lane51-dbg\ (a standalone scratch copy of scripts/ used only to instrument a debug print, never run against or written into the real checkout), and C:\Temp\fw-6b95\scripts\build-census.lane51dbg.mjs — a new, additional file (a copy of build-census.mjs with one temporary console.error added) placed inside the checkout tree to debug the row-8 windowing edge case; it does not modify or overwrite the checkout's own build-census.mjs.

