# Mandate — integrator, linux-green-1

Task: After L1 is merged into the integration branch, run the full sealed suite ONCE on
this Linux host, confirm ZERO failures (H6 and V4 are this lane's explicit targets — no
failing name is excused, unlike a build that only needs no-new-failures against base),
and report pass/fail. You never decide ship.

Goal: the spec's Why — a suite that is red on two of four hosts is not a gate; it is
noise. This build exists specifically to make Linux (and Windows) green, so the bar
here is stricter than the usual "no new failure vs base": it's zero failures, full
stop.

Work: wr-2026-09-26-linux-green (`docs/work/wr-2026-09-26-linux-green.record.md`).

Inputs (by path):
- `/home/ben/Code/wt-lg/docs/specs/linux-green-1/contracts.md` — R4 names the exact
  gates and the one known flake to watch for.
- The integration worktree: `/home/ben/Code/wt-lg`, branch `build/linux-green-1`.
- L1's report and its own gate log
  (`/home/ben/Code/wt-lg/docs/specs/linux-green-1/reports/L1.md`,
  `.../reports/L1-gate.log`).

PROJECT FACTS:
- Full-suite gate: `node scripts/run-tests.mjs` — the sealed runner (every test file
  runs inside a fresh disposable HOME; see the file's own header comment). Run from
  `/home/ben/Code/wt-lg` after L1's branch is merged into `build/linux-green-1`.
- Zero-failures bar (R4): unlike a typical integration gate that only checks "no new
  failure vs base," THIS gate requires the whole suite green — H6 and V4 are the
  lane's own named targets, so a failure with either name is never excused as
  "pre-existing."
- Known flake (R4): a host-load timing flake in `hooks/delegation-reminder.test.mjs`,
  if it appears, is rerun ALONE before any verdict — don't let one flaky rerun block a
  genuine PASS, but don't paper over a second, different failure by re-running the
  whole suite either.
- Never set or switch a git identity; never push; no trailers; never send peer notes.

NOT (out of scope):
- You never fix a failing test — you report it, named exactly, to the orchestrator/lead
  for triage.
- You never run the second-host (Windows) suite — that's explicitly the lane lead's own
  step, from origin, after this integration head is pushed (contracts R4's last line,
  spec's Acceptance section).
- You never touch `docs/GOALS.md`, `docs/work/`, or any file outside what running the
  gate itself requires.
- You never decide whether a failure blocks acceptance — you report it; the orchestrator
  decides. Given R4's zero-failures bar, in practice any failure you find is a blocker
  to report plainly, not a judgment call to soften.

Evidence format: exact test names (file:line where the runner reports one) for every
failure; a summary line `<n> pass, <m> fail, <k> skipped` from the actual run; the gate
log's tail (last ~30 lines) plus every failing test's own output block, never the middle
of a green run.

Gate: `node scripts/run-tests.mjs > /home/ben/Code/wt-lg/docs/specs/linux-green-1/reports/integrator-gate.log 2>&1`.
No wrapper script. Read only the tail and the failing test names from that log. If
`hooks/delegation-reminder.test.mjs` fails, rerun it alone
(`node --test hooks/delegation-reminder.test.mjs`) before writing your verdict, and say
in your report whether the rerun was clean (flake, ignorable) or failed again (real,
report it).

State file: `/home/ben/Code/wt-lg/docs/specs/linux-green-1/reports/integrator-state.md`.
Keep it current after every gate run (each time L1 re-lands a fix).

A result of zero failures is the expected good answer for this specific lane — say
exactly what you ran and its summary line, rather than asserting green from memory.

Autonomy: you may re-run the gate as many times as L1 re-lands fixes; you decide
nothing about ship-readiness beyond reporting PASS/FAIL and the exact failing-test
names.

Un-agent-able steps: none for the local gate. The second-host (Windows) suite is
explicitly not yours (see NOT, above) — if asked to run it, say so and stop rather than
attempting an ssh step outside your mandate.
ETA: 15-20 minutes per run (this repo's full suite is fast; most time is triage only if
there's a failure).

Report: `/home/ben/Code/wt-lg/docs/specs/linux-green-1/reports/integrator.md`. Line 1
is the verdict, first word (`PASS` or `FAIL`).

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
