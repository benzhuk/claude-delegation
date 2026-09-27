Mandate — integrator, overdue-asks-1

Task: After both O1 and O2 are merged into the integration branch, run the full sealed
suite ONCE, triage any failing test to the territory (or to a pre-existing base failure)
that owns it, and report pass/fail. You never decide ship; you report the gate.

Goal: keep this build's own measures from worsening — "top-tier tokens per build" stays
flat and no new failing test appears versus base — before the lead's own merge-on-
acceptance step lands `build/overdue-asks-1` on main.

Work: wr-2026-09-26-overdue-asks (docs/work/wr-2026-09-26-overdue-asks.record.md).

Inputs (by path):
- `/home/ben/Code/wt-oa/docs/specs/overdue-asks-1/contracts.md` — R7 names the exact gate
  and the one known host-load timing flake to watch for.
- The integration worktree: `/home/ben/Code/wt-oa`, branch `build/overdue-asks-1`.
- Both territories' briefs and gate logs, same `reports/` directory, once available, for
  triage context if a failure needs tracing to a specific change.

PROJECT FACTS:
- Full-suite gate: `node scripts/run-tests.mjs` — the sealed runner (every test file runs
  inside a fresh disposable HOME; see the file's own header comment). Run from
  `/home/ben/Code/wt-oa` after both territories' branches are merged into
  `build/overdue-asks-1`.
- Known host-load timing flake: `hooks/delegation-reminder.test.mjs` (contracts.md R7) —
  if it appears, rerun it alone before drawing any conclusion; do not treat a single
  flaky failure there as a build-caused regression without that rerun.
- To confirm any OTHER failure is base-not-new: diff or check out base
  `d5d769f8c5a026a20d06a0e8eee3b4bccd9da9ba` in a scratch worktree and confirm the same
  test name fails there too before calling it pre-existing.
- Never set or switch a git identity; never push; no trailers; never send peer notes.

NOT (out of scope):
- You never fix a failing test, base-known or new — you report it, named exactly, to the
  orchestrator/lead for triage.
- You never run the second-host (Windows) suite — that's explicitly the lead's own step,
  from origin, after this integration head is pushed, per contracts.md R7's last line.
  You run only the LOCAL sealed suite, once, on this host (Linux).
- You never touch `skills/multi/scripts/note-flush.mjs`, its test, `skills/multi/SKILL.md`,
  `agents/builder.md`, or `skills/team-build/references/build-loop-workflow.js` — no
  territory's changes should require you to.
- You never decide whether a new failure blocks acceptance — you report it as new; the
  orchestrator decides.

Evidence format: exact test names (file:line where the runner reports one) for every
failure, tagged `known (base d5d769f8...)` or `NEW`; a summary line `<n> pass, <m> fail,
<k> skipped` from the actual run; the gate log's tail (last ~30 lines) plus every failing
test's own output block, never the middle of a green run.

Gate: node scripts/run-tests.mjs > /home/ben/Code/wt-oa/docs/specs/overdue-asks-1/reports/integrator-gate.log 2>&1. No wrapper script. Read only the tail and the failing test names from that log.

State file: /home/ben/Code/wt-oa/docs/specs/overdue-asks-1/reports/integrator-state.md. Keep it current after every gate run (each time you re-run after a fix lands).

A result of zero new failures is the expected good answer; say exactly what you compared
against (base sha, prior confirmation source) rather than asserting it from memory.

Autonomy: you may re-run the gate as many times as territories re-land fixes; you decide
nothing about ship-readiness beyond reporting PASS/FAIL and the failing-test triage.

Un-agent-able steps: none for the local gate. The second-host suite is explicitly not
yours (see NOT, above) — if asked to run it, say so and stop rather than attempting an
ssh step outside your mandate.
ETA: 15-20 minutes per run (this repo's full suite is fast; most time is triage if there
are new failures).

Report: /home/ben/Code/wt-oa/docs/specs/overdue-asks-1/reports/integrator.md.
Line 1 is the verdict, first word (`PASS` or `FAIL`).

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
