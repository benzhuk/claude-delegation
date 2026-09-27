VERDICT: APPROVE 6131258738d4a4bf3004f945152c1f45034cc4dc

# F3 review, round 1

Reviewed at `6131258738d4a4bf3004f945152c1f45034cc4dc`, which I read myself with `git rev-parse HEAD` in /home/ben/Code/wt-measure-truth-1-F3 on branch build/measure-truth-1-F3. The base is `278f349a35f2436385ad4e8711820771f5c1c08f`. The review was read-only. `git status --short` was empty before and after the suite ran.

Blockers: 0. Majors: 0. Minors: 0. Two Info notes follow; neither blocks.

## Attacks run and results

1. **The sentence matches the spec exactly in both files: verified, no defect.**
   - I pulled the quoted sentence out of spec.md line 26 with a regex. It is 301 bytes, all ASCII, with straight apostrophes.
   - I searched each file's full text for it after collapsing each newline and its surrounding indentation to one space.
   - Result: `skills/multi/SKILL.md` has exactly 1 match and `skills/team-build/SKILL.md` has exactly 1 match. In both files the text starting at `Never poll` begins with the full spec sentence.
   - The only difference from the spec's single line is where the lines break. That matches the hard-wrapped prose around it (the lines above and below are wrapped the same way) and renders the same in Markdown. No words, punctuation, digits (15, 2026-09-26, 3.5) or capitals (ASK, BLOCKED) differ.
   - At base, both files contain `Never poll` 0 times. After the change each contains it once, so the sentence appears once per file as R8 requires.

2. **Nothing else changed in either file: verified, no defect.**
   - `git diff --stat base..HEAD` shows two files, 7 insertions and 1 deletion.
   - The single deleted line is `  behaviour.` in skills/multi/SKILL.md:40. It comes back unchanged as the first word of the new continuation line, `  behaviour. Never poll for …`. The existing prose is untouched.
   - skills/team-build/SKILL.md:194-196 is purely additive: one new bullet between the ETA/slow-agent-ladder bullet and the **Round-3 Research line** bullet. Nothing around it was edited.
   - One commit, `docs(skills): …`. No trailers. The author and committer are the owner's configured identity. No files outside the two named in R9.

3. **Placement matches the brief: verified.**
   - multi: the sentence continues the **Receipts, not heartbeats.** bullet, which is the receipts paragraph.
   - team-build: the sentence is a standalone bullet right after the pacing/check-in bullet in "## Iteration mechanics".
   - The brief allows either continuation or a standalone bullet in each file, so both choices are allowed.

4. **Full suite is still green: re-ran it myself, did not rely on the builder's log.**
   - I ran `node scripts/run-tests.mjs` in the worktree, logging to my scratch folder.
   - It exited 0 with: tests 2002, pass 1999, fail 0, cancelled 0, skipped 3. This matches the builder's reported tail.

5. **The sentence refers to a mechanism that actually exists: verified.**
   - Lane thirteen's overdue-ASK pass is `runOverdueAsks` in `skills/multi/scripts/note-flush.mjs`, with a 15-minute `OVERDUE_GRACE_MS`. It is recorded in docs/work/wr-2026-09-26-overdue-asks.record.md.
   - So the sentence does not advertise a missing mechanism, and no new mechanism was added.

## Info (non-blocking; nothing for the builder to do)

- **I1 (Info): the "15 minutes overdue → BLOCKED" promise has a condition the spec's wording leaves out.**
  - Per the lane-thirteen record (R8 of overdue-asks-1), the nudge fires only when the answer side can be seen on this host. Otherwise it logs `overdue-cross-host`. Lane fifteen (ledger-both-halves) exists to close that gap.
  - The spec requires this exact wording, and skills/multi/SKILL.md already documents the condition in lane thirteen's overdue paragraph. So this is not a defect in F3.
  - Fix: none for the builder. If the spec author wants the promise qualified, that is a spec change.
- **I2 (Info): process notes on the builder's report, not the code.**
  - Line 1 of the report is `VERDICT: PASS`, not APPROVE/NEEDS_FIXES wording.
  - The builder did not open `wr-measure-truth-1-F3` because an existing record, `wr-2026-09-27-measure-truth`, already covers the spec pack.
  - Both are for the orchestrator to reconcile. Neither affects the delivered change.

## Verdict
APPROVE. The sentence is word-for-word the spec's in both files, once each. Nothing else changed. The full suite is green at `6131258738d4a4bf3004f945152c1f45034cc4dc`.
