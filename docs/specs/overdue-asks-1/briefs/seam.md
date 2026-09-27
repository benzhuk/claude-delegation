Mandate — seam reviewer, overdue-asks-1

Task: One pass, after both O1 and O2 have independently reached `APPROVE`, scoped to
where these two territories' claims about the SAME builder-safety rule (the one-sentence
"never delete a directory" text) and the SAME "never wake anyone with a silent stall"
goal must agree with each other and with the actual code — not a re-review of either
territory's own correctness, which its own reviewer already covered.

Goal: this build's two territories are nearly disjoint (O1 is runtime code in
skills/multi/, O2 is two prose files in agents/ and skills/team-build/) but both exist
because of the SAME incident (spec's Why section: two lanes stalled 3.5 hours each). Your
job is to catch a seam where the two territories' framing of that incident, or of what a
"silent" failure means, would tell a reader two different things.

Work: wr-2026-09-26-overdue-asks (docs/work/wr-2026-09-26-overdue-asks.record.md).

Inputs (by path):
- `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/spec.md` — the Why section is the shared
  origin story both territories draw from.
- `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/contracts.md` — R6 (territories), R7
  (gates).
- Both territories' own approved diffs (in their worktrees,
  `/home/ben/Code/wt-overdue-asks-1-O1` and `-O2`) plus their reviewer reports
  (`reports/O1-review-*.md`, `reports/O2-review-*.md`).
- The integration worktree after both merge in: `/home/ben/Code/wt-oa`, branch
  `build/overdue-asks-1`.

PROJECT FACTS:
- Never set or switch a git identity; never push; no trailers; never send peer notes.
- You are read-only against the integrated tree — you may run tests to confirm a claim,
  but you never edit a file.

NOT (out of scope):
- You do not re-litigate either territory's own gate or its own reviewer's verdict — if
  you disagree with a settled call inside one territory that has NO cross-territory
  angle, name it as a note, not a blocker, and defer to the orchestrator.
- You do not run the full local sealed suite (that's the integrator's job) or the
  second-host suite (that's the lead's).

Evidence format: every finding carries file:line in BOTH territories' files where the
mismatch sits (or an explicit statement that a given check below found no file on one
side to compare, since the two territories share almost no files). Verdict
`APPROVE`/`NEEDS_FIXES` first.

## What to check, specifically

1. **The incident date is consistent.** O2's sentence names "2026-09-26" as the date the
   3.5-hour lane loss happened. Confirm O1's SKILL.md paragraph and any log/report prose
   it writes describing the same incident (if it names a date at all) does not contradict
   this, and that neither territory invents a second, different date for what is meant to
   be the same event the spec's Why section describes.
2. **"Silent" means the same thing in both places.** O1's whole mechanism exists because
   a stalled peer was silent past its by-time; O2's sentence exists because a builder sat
   silently on a permission prompt. Confirm neither territory's prose conflates these two
   distinct failure modes into one (e.g., O1's SKILL.md paragraph should not imply the
   overdue-nudge mechanism also covers a builder stuck on a permission prompt — it does
   not and cannot, since that is a local, unattended process, not a peer-note exchange).
3. **No cross-territory file touch.** Confirm O1's diff touches only
   `skills/multi/scripts/note-flush.mjs`, its test, and `skills/multi/SKILL.md`; confirm
   O2's diff touches only `agents/builder.md` and
   `skills/team-build/references/build-loop-workflow.js` (and, only if truly required,
   `build-loop-workflow.test.mjs`). Any overlap or stray edit outside either list is a
   blocker regardless of correctness.
4. **Dogfood self-consistency.** This build's own acceptance runs under
   `skills/team-build`'s existing rules, which O2 is editing. Confirm the sentence O2 adds
   does not conflict with anything this very build's own builders were told to do in
   their briefs (both O1.md and O2.md already tell their builders never to delete a
   directory including scratch) — the new rule should describe practice this build
   already followed, not contradict it.
5. **The BLOCKED-kind choice (O1 item 3) doesn't collide with any Stop-block change
   elsewhere.** Confirm O1's new BLOCKED note, sent `from note-flush`, is handled by the
   existing multi-skill Stop-block rules the same way any other BLOCKED is (SKILL.md
   already states a Stop with a louder waiting note blocks once) — i.e., O1's SKILL.md
   addition should not introduce a SECOND, different rule for this specific BLOCKED that
   diverges from the existing one paragraph away.

Report: `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/reports/seam.md`. Line 1 is the
verdict, first word: `APPROVE` or `NEEDS_FIXES` (or `SKIPPED` if you were not spawned
because both territories collapsed to one, which should not happen here — two territories
are given).

A result of zero seam findings is a good answer if you genuinely checked all five points
above; name what you checked and how.

Autonomy: you decide APPROVE/NEEDS_FIXES for the seam only; you never decide ship.

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
