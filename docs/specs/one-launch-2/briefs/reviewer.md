Task: Adversarial review of territory F1's builder work. Read-only: verify the gate,
hunt for the attack surface named below, then verdict.

Goal: lane seven (one-launch fix round) — accept-prep's header-preservation and
step-order guarantees must be trustworthy against a fresh setup-mode build, since lane
six's first real use silently lost header lines and refused a clean accept on
census-stale; this build closes both holes and two smaller ones (given-mode seam brief,
one-sha Base) — a reviewer who takes any of the four fixes on faith reopens exactly the
defect the spec exists to close.

Work: wr-2026-09-26-one-launch-fix (docs/work/wr-2026-09-26-one-launch-fix.record.md)

Inputs (by path):
- /home/ben/Code/wt-olfix/docs/specs/one-launch-2/spec.md (Acceptance section — the
  attack brief is quoted there verbatim: "make accept-prep drop a header line it does
  not own; make the order test pass while the code still runs the census first; feed
  given-territory mode a missing seamBriefPath")
- /home/ben/Code/wt-olfix/docs/specs/one-launch-2/contracts.md (R1-R6 — pinned CLI shape,
  step order, test list, SKILL.md sentence, gates)
- /home/ben/Code/wt-olfix/docs/specs/one-launch-2/briefs/F1.md, and its scout addendum
  scout-F1.md
- The builder's report at reports/F1-report.md and its gate log reports/F1-gate.log

PROJECT FACTS (review the builder's worktree in place — /home/ben/Code/wt-olfix's sibling
F1 worktree, whatever absolute path F1-report.md names; do not create a new one. You
have a shell; run the gate yourself to confirm it is genuinely green, don't trust the
report's claim alone. Never set a git identity, never push, never write outside your own
report and state file.):

NOT (out of scope, stated explicitly):
- Fixing anything yourself — findings only, with severity, file:line, and a concrete fix
  (mechanical findings carry an exact old->new patch the builder can apply verbatim).
- Re-litigating the spec — a spec ambiguity the builder resolved reasonably (see
  scout-F1.md's open questions) is not a finding; a decision that contradicts a PINNED
  contract (contracts.md R1-R6) is.
- The lead's own dogfood step (rewriting lane six's record's Base and running four-read
  on it) — R5 names that as the lead's job, not this territory's, and not yours to
  demand evidence for here.

Evidence format: verdict word (APPROVE or NEEDS_FIXES) FIRST, then measured findings —
file:line or a command you actually ran and its output, never an adjective alone. Name
this failure class explicitly if you find it: "a check that passes because it isn't
looking, or an unknown rendered as a confident number."

**F1 attack brief** (spec Acceptance, verbatim plus the mechanics to test it):
1. Try to make accept-prep.mjs drop a header line it does not own: construct a fixture
   record with Work, Scope, Owner, Authority, Evidence, Lead-session, Base and six Log
   lines (R3a), run accept-prep against it, and byte-diff before/after — confirm the
   diff touches ONLY Status, Artifact, Worktree, Evidence, plus one appended Log line,
   with every other byte (including line endings) untouched. If any other line moved,
   changed, or disappeared, that is a BLOCKER, full stop.
2. Try to make the order test (R3b) pass while the code still runs the census first:
   read the actual stub work-record/build-census scripts the builder wrote, confirm the
   census stub genuinely inspects the record's on-disk content (or mtime) for the
   reviewed Log line rather than trusting a call-order counter that could be gamed by
   reordering unrelated code; then patch a scratch copy of accept-prep.mjs to call
   census before the record edit and confirm that patched copy FAILS the same test (the
   builder's report should already show this per F1.md's evidence-format instruction —
   verify it yourself, don't just read their claim).
3. Feed given-territory mode a missing seamBriefPath: construct a `territories` array
   that is all-given (worktree/branch/briefPath present on every entry) with no
   `seamBriefPath` key at all, confirm the seam stage's prompt correctly falls back to
   `reviewerBriefPath` (R4) rather than crashing, being silently null, or ignoring the
   seam stage entirely; then confirm the same all-given call WITH `seamBriefPath` given
   actually uses it, not the reviewer brief, by name in the rendered prompt text.
4. Confirm `baseSha` validation: `"a+b"` (lane six's actual mistake, spec item 4) and a
   handful of other malformed values (empty string, `"HEAD"`, a 6-char string, a 41-char
   string, uppercase hex — confirm case sensitivity matches R4's "7-40 hex" exactly)
   each return `blockers: [{id:'*', reason:'bad-base-sha'}]` with NOTHING spawned — run
   the test yourself, don't just read it; confirm a genuinely valid short (7-char) and
   full (40-char) sha both pass.
5. Confirm the new `skills/team-build/references/accept-prep.mjs` step order matches R2
   exactly: read the record, THEN run the census, THEN check-acceptance, each gated on
   the previous succeeding; confirm a forced census failure (e.g. bad --plugin-root)
   leaves the record edit in place and reports `censusPath: null` with `censusError` set
   — the record edit must NOT be rolled back.
6. Confirm the one new SKILL.md sentence (R5) is exactly one sentence, states the merge-
   commit-before-launch rule and the `Base:`/`Base-of:` shape, and doesn't restate or
   contradict anything else in the surrounding paragraph.

Report: /home/ben/Code/wt-olfix/docs/specs/one-launch-2/reports/F1-review.md. Line 1 is
the verdict, first word.

State file: none — a review is a one-off lane, not a fix-round-tracked builder.

A result of zero, "not found" or "could not determine" is a good answer. Say what you
tried. Do not guess.

Autonomy: full autonomy to run any read-only command in the territory's worktree to test
a claim, including writing scratch fixture files under the worktree's own test-fixture
conventions. Check in before touching any committed file.

Un-agent-able steps: none.

JUDGMENT: header-lines-never-dropped-order-never-reversed

ETA: 45-60 minutes.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare
"Done" means read the file; nothing is trusted from a final message alone.

If your prompt names a SEAM review, follow seam.md next to this file instead of the
territory attack brief above.
