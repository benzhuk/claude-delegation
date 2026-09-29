VERDICT: BLOCKED_ON_COMPLETENESS_CONTRACT

## Files and symbols
- T3 output target `docs/reports/census-0928/codex-rows.md` does not yet exist; `docs/reports/census-0928/four-read.md` is a consumer and must receive only its pointer line.
- `scripts/four-read.mjs` consumes Census JSON fields including `lead.codex.responseTimeline`, identity, window and combined by-model data; no alternate reader is permitted.
- Five actual records: L31 `wr-2026-09-27-sealed-signal`, L37 `wr-2026-09-28-codex-parity`, L48 `wr-2026-09-28-render-readback`, L49 `wr-2026-09-28-codex-followups`, L52 `wr-2026-09-28-readback-escapes`; all name lead `01a0df4c-2809-7520-b1d7-876cc51a87ee`.
- First/final accept boundaries: L31 `2026-09-28T03:37:01.270Z`; L37 `22:40:15.516Z` then final `22:58:55.152Z`; L48 `23:47:24.000Z`; L49 `2026-09-29T00:42:02.000Z` then final `01:20:03.000Z`; L52 `02:19:01.000Z`.

## Helpers to reuse
- Use each record's `Spec-from`, `Opened`, `Log: ... accepted`, `Lead-session`, and linked existing `.census.json`/`.four-read.json`; original L37/L48/L49/L52 reports are in their `docs/specs/*` evidence lists.
- Lane52 prepared inputs name real lead and child paths and prove `parent_thread_id`; its prior output records 99 lead responses but `leadTurns: 1` for the same window.

## Tests that police this area
- `scripts/four-read.test.mjs` and `.completeness.test.mjs` police JSON provenance/window compatibility; changing reader shape is out of scope.
- `scripts/work-record.test.mjs` prevents presenting PARTIAL/UNSUPPORTED census output as accepted measurement evidence.

## Open questions for the spec
- Current L52 census is explicitly PARTIAL because the root's Sep26+27 default horizon excludes its Sep29 window and later children. Known root id alone fixes lead discovery, not child/window completeness.
- COUNTED rereads need a pinned closure witness: bounded child search through the historical accept boundary plus evidence no in-window child is omitted; resumed children require ancestry traversal, root namespace, and response-id de-dupe across every searched file.
- Per-field status must allow tokens/model/response/`task_started` counts while hook or stall fields stay UNSUPPORTED; four-read must retain unavailable values, never convert them to zero.
- T3 cannot truthfully state whether L49 or L52 is under 20 lead turns until that closure rule and reviewed T1 implementation exist.
