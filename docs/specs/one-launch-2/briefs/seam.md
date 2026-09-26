Task: One seam-scoped review, after F1 is reviewed APPROVE and merged into the
integration branch — check the boundary between the loop script's rendered prompts and
the new accept-prep.mjs helper's actual CLI contract, not F1's internals again (its own
reviewer already covered those). This build has one territory, so the seam here is
between two SURFACES of the same territory (the .js caller and the .mjs helper it
shells out to) rather than between two builders — still worth a fresh, independent pass,
since F1's own reviewer verified each side in isolation but nobody yet checked that the
rendered prompt text and the helper's real flags agree byte-for-byte.

Goal: lane seven (one-launch fix round) — a loop script that renders a prompt telling
the accept-prep runner to invoke a command with flags the actual helper doesn't accept
(or in an order the helper doesn't enforce) reintroduces exactly the "check that passes
because it isn't looking" failure the spec exists to close, just moved one layer up.

Work: wr-2026-09-26-one-launch-fix (docs/work/wr-2026-09-26-one-launch-fix.record.md)

Inputs (by path):
- /home/ben/Code/wt-olfix/docs/specs/one-launch-2/spec.md (Why, Territory, Acceptance)
- /home/ben/Code/wt-olfix/docs/specs/one-launch-2/contracts.md (R1-R6, all of them — R2
  is the pinned CLI shape both sides of this seam must agree on)
- reports/F1-report.md, reports/F1-review.md
- The merged tree itself, at /home/ben/Code/wt-olfix (integration worktree), after the
  integrator's merge

PROJECT FACTS (read-only pass over the merged integration worktree /home/ben/Code/
wt-olfix. No new code — findings only.):

NOT (out of scope, stated explicitly):
- Re-reviewing accept-prep.mjs's own internal correctness in isolation (header
  preservation, order, given-mode seamBriefPath, baseSha validation) — that was F1's own
  reviewer's job; you look ONLY at the joint between build-loop-workflow.js's rendered
  accept-prep prompt and accept-prep.mjs's actual, real flags and behavior.
- Fixing anything — findings, with a concrete fix, relayed to F1 (there is only one
  territory to relay to in this build).

Evidence format: verdict word first (APPROVE or NEEDS_FIXES), then each seam finding
with file:line on both sides of the joint (the prompt-rendering code in
build-loop-workflow.js AND the flag/behavior it names in accept-prep.mjs).

Seam-specific checks (the actual boundary this build's own territory doesn't cover
alone):
1. Read `acceptPrepPrompt` in `skills/team-build/references/build-loop-workflow.js`
   after F1's fix — confirm it now renders exactly the ONE helper command from R2's
   flag list (`--record --repo --plugin-root --delivery-ref --artifact-sha --worktree
   --owner --log-note --evidence --lead (--from|--marker) --census-out --now --json`),
   states plainly that the record must not be edited any other way, and never restates
   the old four-step inline instructions it replaces.
2. Confirm every flag name the rendered prompt uses is one `accept-prep.mjs` actually
   parses (read the helper's own arg-parsing code) — a renamed or misspelled flag on
   either side is a seam break neither side's own test would catch, since the loop
   script's tests only check prompt TEXT and the helper's tests only check its own CLI
   in isolation.
3. Confirm the ACCEPT_PREP schema in build-loop-workflow.js (recordChanged, censusPath,
   censusError, checkAcceptance{exitCode,verdict,output}) matches what the helper's own
   `--json` output actually emits field-for-field — a schema drift here would make the
   loop script silently accept a shape the helper never produces.
4. Confirm the given-territory `seamBriefPath` fix (R4) and the setup-mode path both
   still compute the SAME fallback behavior (reviewerBriefPath when seamBriefPath is
   absent) — read both code paths side by side, don't assume symmetry from one alone.
5. Confirm the merged tree's full suite gate (integrator's own run) shows no
   interaction failure that F1's own scoped gate (build-loop-workflow.test.mjs +
   accept-prep.test.mjs) would not have caught alone.

Report: /home/ben/Code/wt-olfix/docs/specs/one-launch-2/reports/seam-review.md. Line 1
is the verdict, first word.

State file: none — a seam review is a one-off lane.

A result of zero, "not found" or "could not determine" is a good answer. Say what you
tried. Do not guess.

Autonomy: full autonomy to run any read-only command over the merged worktree. Check in
before touching any file.

Un-agent-able steps: none.

JUDGMENT: prompt-and-helper-agree-on-every-flag

ETA: 20-30 minutes.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare
"Done" means read the file; nothing is trusted from a final message alone.
