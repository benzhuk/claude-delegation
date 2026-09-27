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
Round 3 fix against `O1-review-2.md`'s only carried finding (MAJOR 1, "partly fixed"): the review's
ruling (b′) — fix the "twin" in target selection so a reachable recipient is never skipped in favor of
a sender whose registered `cwd` is gone (`note-flush.mjs:1475-1482`), the exact three-line shape the
review suggested, needing no lead ruling. Ruling (a) (a `note-send.mjs` change, out of O1's file list)
remains unresolved and is restated for the lead in the report, not decided here. New test:
`note-flush.test.mjs:1990`, mutation-checked (reverted the fix in a scratch edit, confirmed the new
test alone fails, restored). Gate: 142/142 (was 141).

Round 1 (all as before) plus round 2 fixes against `O1-review-1.md` (all reviewer-verified findings):
- **MAJOR 1**: `--recipient-repo` is now passed explicitly, pre-checked against `inboxes[target].cwd`
  existing on disk (`note-flush.mjs:1489-1506`); when it doesn't resolve, nothing is sent at all
  (`overdue-send-failed ... no repo resolvable`, id still recorded). Replaces round 1's reliance on
  `runNoteSend`'s own cwd fallback, which the review showed can write a repo ledger under the flusher's
  own cwd. Option (a) (a `note-send.mjs` change) was left to the lead, per the review's own framing.
- **MAJOR 2**: SKILL.md's two kill-switch paths corrected from `~/.agents/notes/ws-off*` to
  `~/.agents/ws-off*`, matching the code. This report's own line was fixed too.
- **MINOR 3**: `--needs none` added to the nudge's send argv.
- **MINOR 4**: 3 tests added verbatim from the review (ASK-re-ASK, mixed malformed `by`s, prune+mode
  600), plus one more proving the shared `ws-off` switch alone also skips the pass.
- **MINOR 5**: SKILL.md's `; overdue: <n> open, <m> nudged` explanation reworded — the review's exact
  replacement text — to say what "nudged" actually counts (recorded, not necessarily delivered).
- NIT 6/7 and "observations for the lead": left as-is, not builder defects.
- All pre-existing tests that expect an actual send now register their inbox with `cwd: home` (an
  existing tmp dir) so the MAJOR 1 gate still lets the stub through — mechanical test-only change.

## Next
Nothing outstanding for O1 that stays in-territory. Flagged for the lead in the report's "Deviations"
section (round 3): whether to authorize ruling (a) — a small `note-send.mjs` change (out of O1's file
list) so the genuinely-both-unreachable case also lands in the host ledger instead of dropping (logged,
not silent). Round 3's fix (b′) already removes the twin: a reachable party is never skipped in favor
of an unreachable one.

## Open questions
None O1 can resolve alone — ruling (a) vs. amending R5 to accept (b′) as final is the lead's call.

## How to run my gate
`cd /home/ben/Code/wt-overdue-asks-1-O1 && node --test skills/multi/scripts/note-flush.test.mjs`
Last run: 142/142 pass, 0 fail (round 2 was 141/141). Log: `docs/specs/overdue-asks-1/reports/O1-gate.log`.
