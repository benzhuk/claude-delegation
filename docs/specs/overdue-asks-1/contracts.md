# overdue-asks-1: pinned contracts (the lead's rulings on the spec)

Spec: `docs/specs/overdue-asks-1/spec.md` (lane thirteen, from origin/docs/lane-specs-0925 at 57a4763). The spec stands as written. These rulings only pin what it leaves open, and they answer the reviewer attack brief in advance. Base: 3bd6ef6 (origin/main, lane ten merged, so H6 and V4 are green on Linux).

## R1. Once per id, and a bounded state file
- Delivery is at most once. The id is written to `~/.agents/notes/.overdue-nudged.json` BEFORE the send is attempted. A send that throws or returns not-ok is logged `overdue-send-failed [<id>]` and is not retried. That is the "once per id ever" of spec item 3.
- Window: only an ASK whose deadline falls within the last 7 days is considered. Older ones are ignored, never nudged.
- Prune: entries older than 8 days are pruned on each write. That is the cap. A pruned id cannot come back, because its ASK is outside the 7-day window.
- The state file is written atomically (temp file plus rename) and created mode 600 on POSIX.
- A corrupt or unreadable state file is logged once per pass, and the pass does nothing (fail closed on the nudge, fail open on the drain).

## R2. What answers or retires an ASK
- Answered: any envelope in the corpus with kind RESULT or BLOCKED whose `re` names the ASK's id. ACK and FYI do not answer it. An ASK that carries `re <id>` does not answer either.
- Retired: an ASK whose id the existing `supersededIds` helper reports as superseded is never nudged. The superseding ASK is judged on its own by-time.
- A BLOCKED written by note-flush itself (`from note-flush`) counts as an answer like any other. The multi skill already tells its recipient what to do next.

## R3. Deadline
- The deadline is the envelope's own M.D.YY date plus the `by` HH:MM, in `DEFAULT_ZONE`. When `by` is earlier than the note's own HH:MM, the deadline is the next day.
- Worked example: sent 9.26.26 23:50, by 00:10, gives a deadline of 9.27.26 00:10 and a nudge at 00:25 or later.
- A `by` that is not exactly `H:MM` or `HH:MM` (for example "tonight", "15:00 NY" or empty) is ignored. So is a line that `parseEnvelope` rejects.

## R4. Where the pass runs, and failure
- The pass runs only from `main()`'s standalone path, next to `runPostFlushPickup` and under the same guards. It never runs from `drainQuietly` or the piggyback path. A test asserts that `drainQuietly` never calls it.
- Every throw inside the pass is caught at its call site. The drain's result and exit code are unchanged, as the pickup already does.
- Kill switches: `~/.agents/ws-off` or `~/.agents/ws-off-overdue` → log `overdue-skipped (kill switch)` at most once per pass and do nothing.

## R5. The send
- Reuse the in-process send the pickup already uses. Do not add a second send path.
- The BLOCKED line is in spec item 3. Its id is `note-flush-<topic>-overdue-<n>` or whatever the existing id helper yields for sender note-flush. It must never collide with the ASK id.
- The repo ledger is written only when the pickup's recipient-repo route can name a repo. Otherwise the host ledger only, and the report says which.
- Lead amendment, 2026-09-26 23:55 NY, after O1 round 3 (reports/O1-review-3.md MAJOR 1). When neither party's registered inbox cwd resolves, the nudge is logged `overdue-send-failed ... no repo resolvable` and the id is recorded, and nothing is sent. Both parties' worktrees are gone, so no live session is left to wake. note-send has no host-ledger-only path, and adding one is a second mechanism this lane does not need. That drop is the accepted behaviour.

## R6. Territories
- O1 (Sonnet): `skills/multi/scripts/note-flush.mjs`, `skills/multi/scripts/note-flush.test.mjs`, `skills/multi/SKILL.md`. Gate: `node --test skills/multi/scripts/note-flush.test.mjs`.
- O2 (Sonnet): `agents/builder.md` and the builder mandate in `skills/team-build/references/build-loop-workflow.js`, the spec's sentence only. If a test in `skills/team-build/references/build-loop-workflow.test.mjs` pins the mandate text, update that test too, and only that. Gate: `node --test skills/team-build/references/build-loop-workflow.test.mjs`.
- No builder writes `docs/work/`. No builder deletes any directory, its own scratch included. Leave scratch where it is and name it in the report.

## R7. Gates
- Integration: `node scripts/run-tests.mjs` with ZERO failures on Linux. The known host-load timing flake in `hooks/delegation-reminder.test.mjs`, if it appears, is rerun alone before any verdict.
- Second host: the lead's runner on Windows, from a bundle that carries `refs/remotes/origin/main`.
