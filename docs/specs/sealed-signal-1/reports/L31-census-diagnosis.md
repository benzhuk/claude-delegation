VERDICT: UNAVAILABLE

The preserved `L31-build-census.json` gives two exact coverage reasons:

1. `unverified or out-of-contract discovery candidate` — the native discovery record has 35 candidates and excludes the relevant later candidates as `outside horizon`.
2. `effective census window is outside default discovery horizon` — the requested window is `2026-09-28T02:44:00.000Z` through `2026-09-28T03:29:47.419Z`, while the discovered horizon is only UTC days `2026-09-26` and `2026-09-27`.

The lead file's first metadata timestamp is on September 26, so `build-census.mjs` derives its native horizon from that timestamp and the following UTC day. The build happened September 28. The lead response timeline is still measured, but it cannot turn incomplete native discovery into complete token or child coverage.

The documented CLI flags are `--lead`, repeatable `--tasks`, `--marker`, `--from`, `--to`, `--out`, `--json`, and `--role-map`. There is no documented CLI session-root, native-home, horizon, or date-range discovery flag. Although the internal runner has an unexposed `codexHome` option, it is absent from `parseArgs`; it is not a legitimate CLI override. `--tasks` is explicitly unsupported for native Codex child transcript discovery and cannot establish the missing coverage.

Therefore no existing documented parameter can repair this census without source change. The initial artifacts remain authoritative and unchanged; no revised measurement was run.
