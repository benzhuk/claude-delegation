Task: Adversarial review of one territory's builder work (C1 or C2 — spawn one reviewer
per territory, same brief, name the territory when you spawn it). Read-only: verify the
gate, hunt for the specific attack surface named below for your territory, then verdict.

Goal: lane six (collect-from-origin) — the collector's read-only guarantee and its
merged/unmerged classification must be trustworthy, since a lead will act on its table
without re-verifying it by hand.

Work: wr-2026-09-26-collect-from-origin (docs/work/wr-2026-09-26-collect-from-origin.record.md)

Inputs (by path):
- /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/spec.md (Acceptance section
  — the C1 attack brief is quoted there verbatim)
- /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/contracts.md (R1-R4, Gates)
- The territory's own brief: briefs/C1.md or briefs/C2.md, and its scout addendum
  (scout-C1.md or scout-C2.md)
- The builder's report at reports/C1-report.md or reports/C2-report.md, and its gate log

PROJECT FACTS (review the builder's worktree in place —
/home/ben/Code/wt-collect-from-origin-1-C1 or -C2, do not create a new one. You have a
shell; run the gate yourself to confirm it is genuinely green, don't trust the report's
claim alone. Never set a git identity, never push, never write outside your own report
and state file.):

NOT (out of scope, stated explicitly):
- The other territory's files.
- Fixing anything yourself — findings only, with severity, file:line, and a concrete fix
  (mechanical findings carry an exact old->new patch the builder can apply verbatim).
- Re-litigating the spec — a spec ambiguity the builder resolved reasonably is not a
  finding; a builder decision that contradicts a PINNED contract (contracts.md R1-R3) is.

Evidence format: verdict word (APPROVE or NEEDS_FIXES) FIRST, then measured findings —
file:line or a command you actually ran and its output, never an adjective alone. Name
this failure class explicitly if you find it: "a check that passes because it isn't
looking, or an unknown rendered as a confident number."

**C1 attack brief** (spec Acceptance, verbatim): try to make the collector call an
unmerged branch merged — construct a case where the branch tip equals main's tip, the
record's `Artifact:` sha is missing/unparseable, and the SAME record path exists on main
too but with a later `Status:`. Confirm the collector's `merged` field for that row is
never `true` under ambiguity (contracts R1: an unparseable artifact sha means
`artifactSha: null, merged: null` — never a guessed `true`). Also confirm empirically
that the script never writes: run it against a real (fixture) repo, diff the repo's
`.git` state before and after, and confirm zero difference — don't just read the source
and assume.

**C2 attack brief**: confirm the new team-build rule's anchor point genuinely runs AFTER
`accept --census` and the push (not before, not as an optional aside) and BEFORE the
RESULT is sent — read the inserted paragraph in context, not in isolation. Confirm the
decisions/SKILL.md addition doesn't remove or reword any exact string
`skill-text.test.mjs` asserts on (run that test yourself). Confirm the merge-item shape
named matches contracts R3 exactly: title `Merge <branch> into main (<tip sha>)`,
evidence line carries the record's four numbers AND the census leadTurns, options
merge-now/merge-and-release/hold, `No default: merges to main take your word per item`.
Confirm the report states plainly (not evasively) whether a Codex mirror of the
decisions skill can post the item.

Report: /home/ben/Code/wt-collect-1/docs/specs/collect-from-origin-1/reports/<territory>-review.md
(e.g. C1-review.md). Line 1 is the verdict, first word.

State file: none — a review is a one-off lane, not a fix-round-tracked builder.

A result of zero, "not found" or "could not determine" is a good answer. Say what you
tried. Do not guess.

Autonomy: full autonomy to run any read-only command in the territory's worktree to test
a claim. Check in before touching any file.

Un-agent-able steps: none.

ETA: 30-45 minutes per territory review.

JUDGMENT: collector-never-lies-about-merged-state, merge-item-shape-matches-contracts

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare
"Done" means read the file; nothing is trusted from a final message alone.

If your prompt names a SEAM review, follow seam.md next to this file instead of the territory attack brief.
