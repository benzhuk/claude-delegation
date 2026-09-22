# Mandate template

Fill in every bracket below and delete these two lines before sending. Every prompt to
an agent starts here, whether it goes to a builder, a reviewer, or a one-off researcher.

Task: <the exact question or task, one or two sentences, no ambiguity about done>
Goal: <the project goal line this task serves>
Work: <the work id from docs/work/<id>.record.md this mandate serves, or the words "not
tracked" and a reason>

Inputs (by path):
- <path to the spec, contract, or prior finding this agent needs>
- <path to a second input, if any>

PROJECT FACTS (at most 25 lines): <ports, package manager, test command, and any
repo-specific rule the safety block does not cover. The agent's own instruction files
are not loaded for it; this is the only place those facts reach it.>

NOT (out of scope, stated explicitly):
- <a file, territory, or action this agent must not touch>
- <another one, if any>

Evidence format: <the shape you need to act without re-verifying, e.g. "cite file:line
for every claim", "measured numbers, not adjectives", "verdict word first">

Report: <path to the report file, ending in .md>. Line 1 is the verdict, first word.

Gate: <command> > <report-dir>/<territory>-gate.log 2>&1. Read only the tail and the
failing names. No wrapper script. Builder mandates only; delete both this and the
next field for a review or one-off lane.

State file: <report-dir>/<territory>-state.md. Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you
tried. Do not guess.

Autonomy: <what this agent may decide on its own, and what needs a check-in first>

Un-agent-able steps: <verification this agent cannot do (credentials, captchas,
human-only auth), already done or scoped out of "done">
ETA: <how long this should take; report or park by then>

<JUDGMENT: the verdict being bought, ten characters or more. Only for a mandate that
judges quality against a gold, an advisor note, or a baseline; that spawn runs on opus
at minimum. Fill it in without the angle brackets, or delete this line entirely.>

Round: <n> — only on a second or later fix round. Delete both these lines when this is
not a fix round.
Research: <path to a research lane's report, or the words "not needed" then a comma and
a reason of ten or more characters. Required from the third fix round onward.>

(Bug-fix mandates only — delete these four lines otherwise.)
Fix kind: bug
Class: <failure-class slug>
Regression test: <path to the test that must fail before the fix and pass after it>
Base sha: <the sha the regression test was proven failing at, for scripts/prefix-test.mjs>

Review fields (bug-fix reviews only): your findings report must carry four non-empty
lines — Cause:, Discriminating check:, Fix location:, Simplification: — checked by
`scripts/bugfix-fields.mjs <your-report>`. A reviewer mandate for a bug fix states this
requirement explicitly; a reviewer omits these four lines only when the mandate is not
a bug-fix review.

Termination: report to the path above, verdict on line 1, then stop. A bare "Done"
means read the file; nothing is trusted from a final message alone.
