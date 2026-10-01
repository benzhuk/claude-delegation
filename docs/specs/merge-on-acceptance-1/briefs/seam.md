# Mandate — seam reviewer, merge-on-acceptance-1

Task: One pass, after both M1 and M2 have independently reached `APPROVE`, scoped to
where these two territories' claims about the SAME underlying mechanism (registered
decisions-page pickup) must agree with each other and with the actual code — not a
re-review of either territory's own correctness, which its own reviewer already covered.

Goal: this build's own two territories both talk about registered pickup (M1 in prose,
M2 in the status line that reports it) without either one activating or changing it
(contracts.md is explicit: no build deliverable activates registered pickup — that's
Ben's own by-hand step on Windows). Your job is to catch a seam where M1's prose and M2's
actual code/output would tell a reader two different things about the same mechanism.

Work: wr-2026-09-26-merge-on-acceptance (docs/work/wr-2026-09-26-merge-on-acceptance.record.md).

Inputs (by path):
- `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/contracts.md` — R1 (M2) and R5
  (M1's Done-window rules, in decisions SKILL.md) are the two halves of the seam.
- `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/reports/redteam.md` — section 2
  ("Smallest M2") is where the "pickup host" rule and the Windows-registration by-hand
  step originate; both territories must be consistent with this reasoning.
- M1's and M2's own approved diffs (in their worktrees,
  `/home/ben/Code/wt-merge-on-acceptance-1-M1` and `-M2`) plus their reviewer reports
  (`reports/M1-review-*.md`, `reports/M2-review-*.md`).
- The integration worktree after both merge in: `/home/ben/Code/wt-moa`, branch
  `build/merge-on-acceptance-1`.

PROJECT FACTS:
- Never set or switch a git identity; never push; no trailers; never send peer notes.
- You are read-only against the integrated tree — you may run tests to confirm a claim,
  but you never edit a file.

NOT (out of scope):
- You do not re-litigate either territory's own gate or its own reviewer's verdict — if
  you disagree with a settled call inside one territory that has NO cross-territory
  angle, name it as a note, not a blocker, and defer to the orchestrator.
- You do not activate, configure, or write `~/.agents/ws/decisions-pickup/registrations.json`
  on any host — that step is explicitly Ben's, by hand, not part of this build at all.
- You do not run the full local sealed suite (that's the integrator's job) or the
  second-host suite (that's the lead's).

Evidence format: every finding carries file:line in BOTH territories' files where the
mismatch sits, and, where checkable, the exact command you ran to confirm which side is
right (e.g., re-reading the actual kill-switch check order in note-flush.mjs against what
decisions/SKILL.md's prose claims). Verdict `APPROVE`/`NEEDS_FIXES` first.

## What to check, specifically

1. **Kill-switch naming agreement.** M1's decisions/SKILL.md (existing text, unedited by
   this build, plus any new R5 prose) names `AGENTS_HOME/ws-off` and `ws-off-decisions` as
   the switches that disable registered pickup. M2's `note-flush.mjs`/`multi/SKILL.md`
   change reports pickup as `disabled (<switch>)`, naming one of those same two files.
   Confirm the two literal switch names used in M1's prose and M2's code/docs are
   identical strings — a typo in either (`ws-off-decision` singular, wrong path segment)
   would be invisible to either territory's own reviewer, since neither one reads the
   other's files.
2. **"Not registered on this host" agreement.** M2's status line reports this exact
   phrase (or your approved variant) when `~/.agents/ws/decisions-pickup/registrations.json`
   is absent. Confirm M1's decisions/SKILL.md — wherever it discusses registered pickup's
   preconditions (the existing "Version 1 contains 1-16 exact entries…" paragraph and
   surrounding text) — doesn't contradict this (e.g., doesn't imply registration is
   automatic, or that an unregistered host is itself an error state rather than the
   normal default).
3. **The pickup-host sentence lands correctly.** R5's "the pickup host is the host where
   the owner lead's inbox lives (note-send delivers only on the recipient's own host)" —
   confirm this sentence, wherever M1 places it in decisions/SKILL.md, is consistent with
   what redteam.md's section 2 concluded (Windows, where skills-fable runs, is the correct
   pickup host on THIS project) — not a generic restatement that loses the "this is why
   Windows and not Netcup" reasoning entirely, since that reasoning is what stops someone
   re-registering on the wrong host later.
4. **The Done-window write rules don't collide with M2's status line becoming a new
   habit.** R5 rule 2 says a lane lead whose fresh read shows Done checked does NOT write
   the page — it puts the Closed entry in its RESULT instead. Confirm nothing in M1's
   prose implies a lane lead should check M2's new `pickup` status field as a SUBSTITUTE
   for actually reading the decisions page fresh (the status line reports pickup's last
   recorded state, which is not the same as a fresh page read) — that would be a
   meaningful, dangerous conflation for a future reader to make, even if neither
   territory's own text literally says it.
5. **Dogfood self-consistency.** This build's own acceptance will exercise M1's new merge
   rule to merge `build/merge-on-acceptance-1` into main. Confirm the Closed-entry text
   M1 specifies is something the lead can actually produce for ITS OWN merge (i.e., no
   circular dependency where the rule requires evidence that doesn't exist until after the
   rule itself is applied) — read this as a plausibility check on the final prose, not a
   simulation.

Report: `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/reports/seam.md`. Line 1
is the verdict, first word: `APPROVE` or `NEEDS_FIXES` (or `SKIPPED` if you were not
spawned because both territories collapsed to one, which should not happen here — two
territories are given).

A result of zero seam findings is a good answer if you genuinely checked all five points
above; name what you checked and how.

Autonomy: you decide APPROVE/NEEDS_FIXES for the seam only; you never decide ship.

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
