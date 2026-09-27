VERDICT: PASS

# Codex census operations state

- Integration worktree: `C:/Users/benzh/orca/workspaces/claude-delegation/codex-census-1`
- Integration branch: `build/codex-census-1`
- Base: `c25cc70cb180f22fc2f5ddb40a47be501cde9245`
- Work: `wr-2026-09-27-codex-census`, opened runnable at `2026-09-27T11:17:00Z`.
- Lead: root session `01a0df4c-2809-7520-b1d7-876cc51a87ee`.
- Spec: `docs/specs/codex-census-0927/spec.md`, copied from `docs/specs/2026-09-27-codex-census.md@e1b31f7159d3f1f7ba15181d9d312f63fa201151`.

No C1 or C2 builder checkout exists. The lead must first consume the scout result. C1 is limited to `scripts/build-census.mjs`, `scripts/build-census.test.mjs`, and `docs/census.md`; C2 is one paragraph only. `scripts/work-record.mjs`, release/install work, README, and changelog work are excluded.

Blocker recorded by the red-team: the current `four-read.mjs` does not yet cover the native Codex rollout filename, Astra's tier classification, or Codex usage records. No `four-read.mjs` change or placeholder four-number output is authorized until the lead receives the scope ruling for a narrow C3.

High-tier review: `spec-review.md` records the additional required measurement-contract rulings on coverage, discovery horizon/depth, identity, unavailable aggregation, turn/window definitions, and Claude byte preservation. C1 must preserve its Claude golden baseline before source changes. C2 may wait for the lane-fourteen contract if its exact accept-prep wording is unresolved.

Claude golden baseline: `claude-golden-base.md` is the complete stdout from the pinned base command `node scripts/build-census.mjs --lead scripts/build-census.fixtures/lead.jsonl --tasks scripts/build-census.fixtures/tasks`; C1 must reproduce it byte-for-byte using those exact fixture paths and options.

T0 contract: `contracts.md` freezes the existing report shape and the minimum Codex-host metadata C3 may consume if it is later authorized. `briefs/C1-C2.md` assigns the cohesive four-file C1/C2 feature to one mid-tier builder. The C1 checkout is created only after this t0 packet is committed and pushed.

Scout correction: direct child `usage.session_id` and `meta.session_id` both equal the lead session id, while `meta.id` is the child census key. C1 validates usage against `meta.session_id` only after it verifies the ancestry edge; a depth-two probe remains pending before any grandchild assumption is made.

Final scout clarification: depth-two evidence confirms the same root session namespace at depth one and two while `source.subagent.thread_spawn.parent_thread_id` names the immediate logical parent. C1 deduplicates by logical child id plus response id, confines default discovery to the canonical two-day UTC horizon, allows explicit verified `--tasks` candidates outside it, and reports unsupported windows visibly.

Active build: native builder `01a0e2a2-f888-7a23-b091-0356e340a2f4` owns C1+C2 in `C:/Users/benzh/orca/workspaces/claude-delegation/codex-census-1-c1` at `4ab6312`. The independent contract writer owns only the new `scripts/build-census.codex.contract.test.mjs` in the integration checkout; its in-progress file is not staged by the status scribe.

Netcup is reachable read-only with Node 24.18.1. Its shared checkout is dirty and remains untouched; `reports/netcup-prep.md` records the later-gate requirement for a separately fetched origin worktree and complete receipts.

The native lead transcript must use `C:/Users/benzh/AppData/Roaming/orca/codex-accounts/f22a4cc4-fb5a-4af5-aeec-4951188a536a/home` as `CODEX_HOME`. The private rollout routing note is not copied into this repository.
