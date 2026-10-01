VERDICT: BLOCKED command-denied

Work: `wr-2026-09-27-codex-census`

The required focused command was denied by the environment command policy before it could run: `node --test scripts/build-census.test.mjs > docs/specs/codex-census-0927/reports/C1-C2-gate.log 2>&1`. The mandate says a denied command stops the step and must not be retried through another tool, so no gate, golden byte comparison, commit, or push occurred.

Implemented, pending the required gate:

- `scripts/build-census.mjs`: Codex-only census discovery uses the canonical home’s two UTC date folders, verifies immediate parent edges through depth three, validates usage against the child metadata/root namespace, deduplicates by logical child id plus response id, joins preceding model context, uses unique `task_started.turn_id` values, and makes coverage partial for named discovery or model gaps. `--from`/`--to` now use inclusive offset-bearing time bounds.
- `scripts/build-census.test.mjs`: sanitized dynamic native fixtures cover following-day discovery, depth two, same response ids in distinct children, cumulative-counter exclusion, partial malformed discovery, and inclusive offset windows. No committed fixture path was added; all test fixture rows contain only metadata, turn context, task-started type/timestamp/id, usage, and timestamps.
- `docs/census.md`: documents the measured Codex path and explicit partial behavior.
- `skills/team-build/SKILL.md`: adds the single accept-prep paragraph that retires hand-written Codex inputs only after a complete measured census; lane fourteen’s future refusal remains conditional.

Cause: obsolete Codex refusal paths treated proven native child evidence as unsupported.

Discriminating check: the focused `build-census` test gate, including the preserved Claude golden command, is required to show that Codex additions do not change Claude bytes.

Fix location: `scripts/build-census.mjs`, with the host-scoped contract cases in `scripts/build-census.test.mjs`.

Simplification: removed the Codex `--tasks` and `--from`/`--to` refusal branch from `runCensus`; the Claude reader and formatter route are unchanged.

Remaining unknown: the denied gate means the implementation and exact Claude golden comparison are unverified. A later authorized runner must execute the mandated focused command under the verification mutex, read only its tail/failing names, update this state file, then commit and push the owned territory.
