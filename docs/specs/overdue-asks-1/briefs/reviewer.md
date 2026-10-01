Mandate — independent reviewer (per territory), overdue-asks-1

Task: Adversarially review ONE territory's builder output (O1 or O2 — you are spawned
once per territory, fresh each time) against the spec pack, and return
`APPROVE`/`NEEDS_FIXES` with concrete, file:line-grounded findings. Read-only; you never
edit the territory's files. Spawn only after that territory's own gate is green.

Goal: same as the territory's own — "work lost or stalled" and "hours ask to accepted"
from the spec's Why section. Your job is to catch anything that would silently defeat
that goal, reintroduce a design the contracts reject, or leave the reviewer's own attack
brief (spec's Acceptance section) unaddressed.

Work: wr-2026-09-26-overdue-asks (docs/work/wr-2026-09-26-overdue-asks.record.md).

Inputs (by path):
- The territory's own brief: `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/briefs/O1.md`
  or `.../briefs/O2.md` (whichever you're reviewing).
- `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/spec.md` and `contracts.md` — contracts
  win on any disagreement. contracts.md R7's second paragraph is the spec's own reviewer
  attack brief, restated below per-territory.
- The territory's own scout addendum (`scout-O1.md` or `scout-O2.md`), same directory.
- The builder's report and diff in its worktree (`/home/ben/Code/wt-overdue-asks-1-O1` or
  `-O2`) and its gate log at
  `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/reports/<territory>-gate.log`.

PROJECT FACTS:
- `node --test <file>` is the test runner; no build step for either territory's own gate.
- Never set or switch a git identity; never push; no trailers; never send peer notes.
- Verdict word first: `APPROVE` or `NEEDS_FIXES`, on its own at the top of your report.

## Attack brief — O1 (note-flush.mjs overdue pass)

The spec's own Acceptance section names this exact attack brief; treat every item as a
required check, not a suggestion:
1. **Double nudge.** A nudge posted twice for one id across drains, or across days. Read
   the state-file write ordering (R1: id written BEFORE the send is attempted) and
   confirm a test proves a second drain, same id, sends nothing.
2. **Retirement.** A nudge for an ASK that a later `supersedes` retired. Confirm
   `supersededIds` is checked and a superseded id is never nudged, with a test.
3. **Timezone edge.** A note sent at 23:50 with `by 00:10` — confirm the deadline math
   (R3) produces the next day's 00:10 and the nudge fires at 00:25 or later, not sooner
   and not using the note's own calendar date naively.
4. **An ASK whose `re` reply is itself an ASK.** Confirm this does NOT answer the
   original — only RESULT/BLOCKED with `re <id>` answers (R2); a reply that is itself an
   ASK (needing its own by-time judged separately) must not be mistaken for a close-out.
5. **The piggyback path.** Confirm `drainQuietly` never calls `runOverdueAsks` — there
   should be a direct test asserting this, not just an absence of a call in a diff read.
6. **Unbounded growth of the state file.** Confirm R1's window (7 days considered) and
   prune (entries older than 8 days pruned on write) are both implemented and tested, and
   that the report states which strategy (cap vs. prune-by-age) was used — R1 already
   says prune-by-age is the answer; confirm the builder didn't invent a different cap
   instead.
7. **Send failure.** Confirm a throwing/not-ok send is logged `overdue-send-failed [<id>]`
   and NOT retried (R1), and that the drain's own result/exit code is completely unchanged
   by any failure inside the overdue pass (R4) — read the call site's try/catch, don't
   just trust a green gate.
8. Malformed `by` (not `H:MM`/`HH:MM`) is ignored, never thrown as an error, and never
   causes the whole pass to abort for OTHER, well-formed ASKs in the same corpus.
9. Confirm the state file is created mode 600 on POSIX and written atomically (temp file
   + rename) — read the actual write code, not just a comment claiming it.
10. Confirm the BLOCKED note's id (via the id helper's prefix, sender `note-flush`) can
    never collide with the ASK's own id (R5) — check the prefix used is distinct.
11. Confirm the repo-ledger-vs-host-ledger-only choice (R5's last bullet) is implemented
    and the report states which happened for at least one exercised case.
12. Confirm `--status`/`--json`'s new `overdue` field/suffix appears AFTER the existing
    pickup suffix (spec item 4), and that no pre-existing `--status`/`--json` test's
    assertions were weakened (rather than correctly extended) to make room for it — read
    the diff on any touched existing test, not just the new ones.

## Attack brief — O2 (the one-sentence builder rule)

1. **Sentence is verbatim.** Byte-compare the sentence added to both files against the
   spec's exact wording — no paraphrase, no dropped clause, no added editorializing.
2. **Placement.** Confirm it sits beside the existing `rm -rf` line in `agents/builder.md`
   (still inside the safety-block fence) and inside the `BUILD_MANDATE` constant (not a
   different mandate) in build-loop-workflow.js.
3. **No collateral edits.** Diff both files against base and confirm nothing else moved —
   no rewording of neighboring bullets, no reordering, no whitespace-only churn beyond
   what the one insertion requires.
4. **R9 still passes.** Run
   `node --test skills/team-build/references/build-loop-workflow.test.mjs` yourself and
   confirm the "every mandate constant carries the note-send prohibition" test still
   passes — the new sentence must not break that regex's ability to capture the whole
   `BUILD_MANDATE` declaration or separate "Never send peer notes." from it.
5. **No test-file changes beyond necessity.** Confirm the builder did not add new
   assertions to build-loop-workflow.test.mjs unless its own edit broke an existing one —
   contracts R6 makes that conditional, and the scout found no test currently pins this
   text beyond R9.

Report: `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/reports/<territory>-review-<round>.md`
(e.g. `O1-review-1.md`, `O2-review-1.md` — increment `<round>` on each re-review). Line 1
is the verdict, first word: `APPROVE` or `NEEDS_FIXES`.

A result of zero findings is a good answer if you genuinely attacked all the angles above
and found nothing — say what you tried, don't manufacture a finding to look thorough.

Autonomy: you decide APPROVE/NEEDS_FIXES; you never decide to merge, accept, or ship —
that's the orchestrator's and the lead's call.

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
