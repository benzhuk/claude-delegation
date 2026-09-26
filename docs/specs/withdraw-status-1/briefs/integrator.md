Task: Integrate territory W1 (the only territory in this build) into
`/home/ben/Code/wt-withdraw` on branch `build/withdraw-status-1`, run the full-suite
gate once, and report pass/fail with the failing test names — you do not decide
anything, you report. Spawn only after W1's own gate is green and the reviewer's
verdict is `APPROVE` (docs/specs/withdraw-status-1/reports/reviewer-report.md).
Goal: the whole repo's suite is green on `build/withdraw-status-1` with no new failing
test name versus base b7ddf11, so the lead can push, run the second-host suite, and
accept.
Work: wr-2026-09-26-withdraw-status (docs/work/wr-2026-09-26-withdraw-status.record.md
— read-only for you; only the lead writes it).

Inputs (by path):
- docs/specs/withdraw-status-1/spec.md
- docs/specs/withdraw-status-1/contracts.md (R6: your exact gate command and the base
  sha to diff against for "no new failing test name")
- docs/specs/withdraw-status-1/reports/W1-report.md and W1-gate.log
- docs/specs/withdraw-status-1/reports/reviewer-report.md

PROJECT FACTS: integration worktree is `/home/ben/Code/wt-withdraw`, already checked out
on `build/withdraw-status-1` at base a8bffb67b47796fbf492ffc0a640ef934d19f8dc. Merge (or
fast-forward) W1's branch `build/withdraw-status-1-W1` into it before running the gate.
Full-suite gate: `node scripts/run-tests.mjs`. Base for the "no new failing test name"
comparison is `b7ddf11` (contracts.md R6 notes two tests, "Netcup H6 and V4," already
fail on that base — those two failing there are not new failures, don't report them as
regressions; any OTHER failing name is). Pure Node, no build step. Never set a git
identity; no trailers; never push — pushing the integration branch is the lead's step,
after your PASS and before accept.

NOT (out of scope, stated explicitly):
- Do not decide ship/accept — report pass/fail plus the failing-test list, nothing more.
- Do not touch `docs/work/`.
- Do not run the second-host (Windows) suite — that is the lead's separate step.
- Do not fix a failing test yourself; triage it to the territory whose files it covers
  and report which territory that is.

Evidence format: verdict `PASS`/`FAIL` as the literal first line of your report. On
`FAIL`, list every new failing test name (never a paraphrase — the exact name `node
--test` printed) plus the one file:line in the tail of the log that names the failure,
and which territory's file list (contracts.md's territory map) that failure falls under.
On `PASS`, still name the total test count and confirm the two known-base failures
(if present) are the only ones, by name.

Report: docs/specs/withdraw-status-1/reports/integrator-report.md. Line 1 is the
verdict, first word.

Gate: node scripts/run-tests.mjs > docs/specs/withdraw-status-1/reports/integrator-gate.log 2>&1

State file: docs/specs/withdraw-status-1/reports/integrator-state.md. Keep it current
after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you
tried. Do not guess.

Autonomy: you may merge W1's branch into the integration branch and resolve a purely
mechanical, non-conflicting merge yourself. Any real conflict (not just a fast-forward)
stops you — report it, do not resolve it by picking a side.

Un-agent-able steps: the second-host (Windows) suite run, the push, and the accept
command are all the lead's, not yours — scoped out of your "done."

ETA: 20-30 minutes (one merge plus one full-suite run). Report or park by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare
"Done" means read the file; nothing is trusted from a final message alone.
