VERDICT: UNSUPPORTED

A truthful lane-scoped Codex census ran from the account-specific CODEX_HOME using the exact Lead-session JSONL rollout-2026-09-26T15-58-25-01a0df4c-2809-7520-b1d7-876cc51a87ee.jsonl and marker wr-2026-09-26-gate-under-load. The marker was found; its window is 2026-09-26T22:51:19.543Z through 2026-09-26T23:43:19.681Z. Raw census artifacts are docs/work/evidence/wr-2026-09-26-gate-under-load-census.md and .json.

The census reports complete response coverage, lead tokens, lead turns, child discovery, role attribution, and by-model attribution as unsupported. It exposes only diagnostic observations: 11,989,508 deduplicated observed lead tokens, 72 observed requests, and one observed native turn id inside the marked window. These are not represented as complete measures.

The provisional four-read artifacts are docs/work/evidence/wr-2026-09-26-gate-under-load-four-read-preaccept.md and .json. Its snapshot reports: top-tier tokens unavailable; hours ask to accepted 1.0h at its preaccept snapshot with gap unavailable; rework after acceptance 0 commits/0 re-accept logs; work lost or stalled unavailable. The reader rejects the census lead-file basename as a match for the bare Lead-session UUID, so its transcript-derived values remain unavailable. This snapshot is not passed to accept because its accept-at timestamp is not the eventual acceptance timestamp.

At acceptance, accept --census must not be used because the actual census verdict is UNSUPPORTED. Use --no-census with these coverage, turn, child-attribution, and four-read identity limitations; do not invent usage, lead-turn, seven-day, or stall values.
