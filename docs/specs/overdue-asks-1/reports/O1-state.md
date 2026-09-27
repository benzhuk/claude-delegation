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
Nothing outstanding for O1. Flagged for the lead in the report's "Deviations" section: option (b)
(implemented) means a registered inbox with no/stale `cwd` now gets NO nudge, vs. round 1's
possibly-misrouted one. Worth a lead ruling on option (a) if that turns out to matter on real hosts.

## Open questions
None unresolved.

## How to run my gate
`cd /home/ben/Code/wt-overdue-asks-1-O1 && node --test skills/multi/scripts/note-flush.test.mjs`
Last run: 141/141 pass, 0 fail (round 1 was 134/134). Log: `docs/specs/overdue-asks-1/reports/O1-gate.log`.
