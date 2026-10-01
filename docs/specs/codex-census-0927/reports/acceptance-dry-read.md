VERDICT: PASS

# Lane seventeen acceptance dry read

The current work-record implementation already accepts a fresh `--census` source and an optional `--four-read` JSON source. It requires exactly four ordered number rows when `--four-read` is supplied, preserves their rendered unavailable/partial values, and stamps `accept` with the same `--at` value used by the fresh four-read. This lane must use the candidate `scripts/build-census.mjs` and `scripts/four-read.mjs` after their approved changes are integrated into `build/codex-census-1`, not the released plugin copies, because C1/C3 define the candidate Codex schema and identity behavior.

`scripts/work-record.mjs` remains lane fourteen's boundary. C1/C2/C3 do not edit it. At acceptance, run a fresh candidate census from the native lead transcript using `--from 2026-09-27T11:17:00Z` and the accepted end bound; only then run the candidate four-read against that census and use its JSON with `work-record.mjs accept --census ... --four-read ... --at <same timestamp>`. Preserve the raw candidate census text, four-read JSON and Markdown, acceptance stdout/stderr/exit receipt, and both host gate logs under `docs/work/evidence/` before main.

No bounded live census was re-run at setup: the pinned base explicitly rejects Codex `--from`/`--to` and marks native coverage unsupported, so repeating it before C1 lands cannot establish a measurement. The candidate run after integration is the required fresh receipt; if it remains partial or unavailable, acceptance must retain that state rather than fabricate four available measurements.
