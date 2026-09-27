# Mandate — seam reviewer, ledger-both-halves-1

Task: One pass, after L1 reaches `APPROVE`, scoped to where L1's new sender-host/mirror logic in
`note-send.mjs` meets the REST of the repo that calls into it — files L1's own gate never runs.
This build has one territory (L1), so there is no cross-territory prose/code mismatch between
builders to hunt — the seam here is between L1's narrow file list and every OTHER caller of
`runNoteSend`, chiefly `note-flush.mjs`'s `runOverdueAsks` (note-flush.mjs:1512), plus the two
SKILL.md prose edits' agreement with what the code actually does.

Goal: the spec's Why — both hosts hold both halves, so the overdue-cross-host rule and the
four-number read stop being wrong by half. Your job is to catch a caller of the new mirror path
that L1's own gate (`note-send.test.mjs` + N2) does not exercise, and a SKILL.md sentence that
reads well but doesn't match the merged code's actual behaviour.

Work: wr-2026-09-27-ledger-both-halves (`docs/work/wr-2026-09-27-ledger-both-halves.record.md`).

Inputs (by path):
- `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/contracts.md` — R1 (host table), R2
  (append-ledger + spawn shape), R3 (where the mirror runs and does not).
- `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/briefs/scout-L1.md` — the open question
  about `note-flush.mjs:1512` calling `runNoteSend` for its own nudge sends; this is the seam's
  central question.
- L1's approved diff (worktree `/home/ben/Code/wt-ledger-both-halves-1-L1`) and its final report
  (`reports/L1.md`) — specifically its stated resolution of the section-4 open question, and the
  reviewer's verdict on whether that resolution holds (`reports/L1-review-*.md`).
- The integration worktree after L1 merges in: `/home/ben/Code/wt-lbh`, branch
  `build/ledger-both-halves-1`.

PROJECT FACTS:
- Never set or switch a git identity; never push; no trailers; never send peer notes.
- You are read-only against the integrated tree — you may run tests to confirm a claim, but you
  never edit a file.
- Test runner: `node --test <file>`.

NOT (out of scope):
- You do not re-litigate L1's own gate or its reviewer's verdict on the files L1 itself owns with
  NO cross-file angle — name it as a note, not a blocker, and defer to the orchestrator.
- You do not run the full local sealed suite (the integrator's job) or the second-host suite / the
  real-ssh smoke (the lead's job, contracts R5).
- You do not edit `note-flush.mjs`, `transport.mjs`, or any other file — read/run only.

Evidence format: every finding carries file:line in BOTH the changed code (note-send.mjs) and the
consumer/prose file where the mismatch sits, and the exact command you ran to confirm which side
is right. Verdict `APPROVE`/`NEEDS_FIXES` first.

## What to check, specifically

1. **`runOverdueAsks`'s nudge-send call, unexercised by L1's own gate.** L1's territory gate runs
   only `note-send.test.mjs` and `hooks.test.mjs`'s N2 pattern — it never runs
   `note-flush.test.mjs`, which exercises `runOverdueAsks`'s real call into `runNoteSend`. Run
   `node --test skills/multi/scripts/note-flush.test.mjs` yourself on the integrated tree and
   confirm it's green. If it's red, that's a direct consequence of the mirror logic reaching a
   caller L1 never tested — a blocker, however narrow L1's own file list was.
2. **Independently verify L1's stated resolution.** Construct (or find, in `note-flush.test.mjs`) a
   scenario where `runOverdueAsks` actually sends a nudge, and check by hand whether that
   invocation's environment could ever carry `SSH_CONNECTION`/`SSH_CLIENT`/`--sender-host` in a way
   that would make the mirror fire unexpectedly for a note-flush-originated send. If you can
   construct such a scenario, that's a real gap in "never from note-flush" — name it precisely
   (what env, what call path) rather than asserting it in the abstract.
3. **The outbox retry and `drainQuietly` truly never reach the mirror.** Confirm by reading
   `note-flush.mjs`'s outbox-processing code (around where `deliverToInbox`/`twoPhaseSend` are
   called directly) that it genuinely never imports or calls `runNoteSend` — grep
   `note-flush.mjs` for `runNoteSend` and confirm the only hit is `runOverdueAsks`'s own nudge
   send (point 1), not the retry path. If a retry path DOES route through `runNoteSend` somewhere
   this scout missed, that changes the whole analysis — a blocker to report immediately.
4. **The two SKILL.md sentences match the code.** Read the merged `SKILL.md` prose (the
   cross-host paragraph and the overdue-cross-host sentence) against what the merged
   `note-send.mjs` code actually does for `mirrorLedger` — does the prose's description of when a
   mirror happens (or doesn't) match the code's actual conditions (host table lookup, `--no-mirror`,
   local-host equality check)? A prose claim that overstates what the mirror covers (e.g. implying
   the repo ledger IS mirrored, when spec item 2 and R3 say it explicitly is not) is a blocker.
5. **Nothing outside L1's own map changed as a side effect.** `git diff --stat
   026a7a0717964a5bcf3d70a93240f9ff1cfa8004..HEAD -- . ':!docs/specs' ':!docs/work'` on the
   integration branch should show only `skills/multi/scripts/note-send.mjs`,
   `skills/multi/scripts/note-send.test.mjs`, and `skills/multi/SKILL.md`.

Report: `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/reports/seam.md`. Line 1 is the
verdict, first word: `APPROVE` or `NEEDS_FIXES` (or `SKIPPED` only if there is genuinely nothing to
check, which should not happen here — `runNoteSend` has a real caller in `note-flush.mjs`).

A result of zero seam findings is a good answer if you genuinely checked all five points above;
name what you checked and how.

Autonomy: you decide APPROVE/NEEDS_FIXES for the seam only; you never decide ship.

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
