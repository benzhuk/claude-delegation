# O1 state — overdue-asks-1

## Territory
`skills/multi/scripts/note-flush.mjs`, `skills/multi/scripts/note-flush.test.mjs`,
`skills/multi/SKILL.md`. Serves GOAL "work lost or stalled" (spec.md "Why": two lanes stalled 3.5h
each behind an unread by-time). NOT: a new watcher process — the already-running flusher notices.

## Contracts I rely on
contracts.md R1-R7 (state file shape/window/prune/mode, R2 answers/retirement, R3 deadline math, R4
call site/guards/budget/kill switch, R5 reuse `runNoteSend`, R6 territory/gate, R7 integration gate).
scout-O1.md (read from /home/ben/Code/wt-oa/... since not copied into this worktree) for exact line
numbers and the "topic has no field on parseEnvelope" open question.

## Done
- `runOverdueAsks(argv, context, deps)` added: same guards/budget as `runPostFlushPickup`, own kill
  switch `ws-off-overdue` beside `ws-off`, wired into `main()` right after `runPostFlushPickup`, never
  in `drainQuietly` (test asserts both behaviorally and by reading `drainQuietly`'s own source text).
- State file `~/.agents/notes/.overdue-nudged.json` (mode 600, tmp+rename, pruned >8d on every write).
- Deadline math (`overdueDeadlineMs`), topic recovery from id (`overdueTopicFromId`), 15-min grace,
  7-day window, R2 answer/retirement rules, R5 send (dynamic `import('./note-send.mjs')` to avoid a
  2-file static cycle — note-send.mjs already imports this file).
- `--status`/`--json` gain `; overdue: <n> open, <m> nudged` / `overdue: {open,nudged}`, after the
  pickup suffix. 9 pre-existing status-line assertions updated to match (see report).
- 17 new tests added (all 11 spec item-6 cases plus R1/R2/R4 edge cases); one real (unstubbed, dynamic
  import) end-to-end sanity run done outside the suite, then discarded.
- Verbs: `overdue-nudged`, `overdue-no-inbox`, `overdue-skipped (kill switch | state file unreadable)`,
  `overdue-send-failed` (contracts R1, not in spec item 5's list).
- SKILL.md: sentence extension (line ~32) + one paragraph near the `--status` pickup-suffix discussion.

## Next
Nothing outstanding for O1. Open items to flag to the integrator/reviewer, not blocking:
- We never pass `--recipient-repo`/`--sender-repo` to `runNoteSend` (no repo is derivable from a raw
  host-ledger line). `runNoteSend`'s own fallback (`inboxRecord.cwd`, else `process.cwd()`) decides
  where the repo-ledger copy lands, or whether the send throws instead — out of this territory to
  change. A send that throws for ANY reason (unresolved repo, failed inbox post) is
  `overdue-send-failed` and never retried, per R1's literal wording.
- "nudged" in both `--status` and the pass's own return value counts every id RECORDED in the state
  file among currently-open asks, regardless of whether the underlying send actually succeeded (R1
  records the id before attempting the send) — a defensible reading of "once per id ever" flagged in
  the report as an autonomy call.

## Open questions
None unresolved — scout-O1.md's one open question (topic recovery) is resolved: `overdueTopicFromId`
strips the sender prefix then the trailing `-<counter>` from the id.

## How to run my gate
`cd /home/ben/Code/wt-overdue-asks-1-O1 && node --test skills/multi/scripts/note-flush.test.mjs`
Last run: 134/134 pass, 0 fail. Log: `docs/specs/overdue-asks-1/reports/O1-gate.log`.
