VERDICT: COUNTED — 97541f077b7736185601f49846da090c7da3ff88

P2 added a verified Codex lead reader in `scripts/build-census.mjs`, synthetic schema
fixtures, focused tests, and one documentation paragraph.

Validation: `node scripts/run-tests.mjs scripts/build-census.test.mjs` passed 60/60 in a
sealed temporary home.

Metadata-only probe of the authorized current source at completion: Codex CLI 0.155.1;
17,878 valid rows; 2,090 `token_usage_record` rows; all 2,090 matched the known root
session id; no other or missing session attribution; 2,090 unique response ids; 31 native
turn ids. The source remained live during probing, so these are an observation snapshot.

The reader sums only deduplicated `payload.usage` by verified `response_id`; it rejects a
missing/mismatched session, response, turn, or invalid usage instead of producing zero.
It never sums `turn_token_usage` or `thread_token_usage`. Model attribution is `unknown`
because the observed usage and assistant-response records carry no reliable model field.
`leadTurns` is explicitly unsupported: the observed response records do not establish
assistant/user conversational ordering. `nativeTurnCount` is reported separately and is
not labeled as `leadTurns`. Existing marker matching supplies build-window scope without
inventing a build id.

No overlap with the upstream census directory-error fixes was observed in this checkout.

Fix delta in `cc97f0d3d00235ed59348873288cf27eef615776`: a verified Codex session with no
per-response token rows now emits `VERDICT: UNSUPPORTED` and `leadTokens: unsupported`,
never a counted zero. A truncated stream containing a Codex token record is routed to the
Codex reader and fails visibly if metadata is absent. Usage now requires a real object and
finite nonnegative counters; absent optional cache counters are distinct from invalid
values. The flat Summary also states that native Codex child discovery/usage is unsupported,
so combined and role totals do not imply complete Codex build spend.

Fix delta in `97541f077b7736185601f49846da090c7da3ff88`: `response_item`- and
`event_msg`-only truncated streams are recognized as Codex and fail visibly without a
verified session metadata row. A recognized Codex transcript rejects malformed JSON rather
than silently skipping possible usage. Codex rejects `--tasks`, disables Claude default
subagent discovery, and emits no child/role/combined-spend tables; native Codex child usage
is not supported by this reader. A wholly unrecognizable malformed file still follows the
legacy Claude path and may skip malformed rows, recorded as a remaining host-detection
limitation rather than a Codex attribution claim.
