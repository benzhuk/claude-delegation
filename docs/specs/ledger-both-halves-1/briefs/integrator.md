# Mandate — integrator, ledger-both-halves-1

Task: After L1 is merged into the integration branch, run the full sealed suite ONCE on this Linux
host, confirm zero failures, and report pass/fail. You never decide ship.

Goal: the spec's Why — both hosts hold both halves of a cross-host thread, so lane thirteen's
overdue-cross-host rule and the four-number read stop being wrong by half. This build exists to
land that mirror cleanly; the bar is zero failures on the full suite, no exceptions invented for
this lane's own new tests.

Work: wr-2026-09-27-ledger-both-halves (`docs/work/wr-2026-09-27-ledger-both-halves.record.md`).

Inputs (by path):
- `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/contracts.md` — R4 names the exact gates
  and the one known flake to watch for.
- The integration worktree: `/home/ben/Code/wt-lbh`, branch `build/ledger-both-halves-1`.
- L1's report and its own gate log
  (`/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/reports/L1.md`,
  `.../reports/L1-gate.log`).

PROJECT FACTS:
- Full-suite gate: `node scripts/run-tests.mjs` — the sealed runner (every test file runs inside a
  fresh disposable HOME; see the file's own header comment). Run from `/home/ben/Code/wt-lbh`
  after L1's branch is merged into `build/ledger-both-halves-1`.
- Zero-failures bar: the whole suite green, full stop — this is the standard "no new failure vs
  base" bar (contracts R4 names only `note-send.test.mjs` as this lane's own explicit gate; nothing
  here claims a stricter bar than that, unlike some other lanes — treat any pre-existing base
  failure as pre-existing and name it as such rather than blocking on it, but a failure IN
  `note-send.test.mjs` or `hooks.test.mjs`'s N2 pattern is this lane's own and never excused).
- Known flake (contracts R4): a host-load timing flake in `hooks/delegation-reminder.test.mjs`, if
  it appears, is rerun ALONE before any verdict — don't let one flaky rerun block a genuine PASS,
  don't paper over a second, different failure by re-running the whole suite either.
- Never set or switch a git identity; never push; no trailers; never send peer notes.

NOT (out of scope):
- You never fix a failing test — you report it, named exactly, to the orchestrator/lead for triage.
- You never run the second-host (Windows) suite — that's explicitly the lane lead's own step, from
  origin, after this integration head is pushed (contracts R4's last line, spec's Acceptance
  section), nor the one real-ssh smoke from Netcup to ben-desktop (contracts R5) — both are the
  lead's, not yours.
- You never touch `docs/GOALS.md`, `docs/work/`, or any file outside what running the gate itself
  requires.
- You never decide whether a failure blocks acceptance — you report it plainly; the orchestrator
  decides.

Evidence format: exact test names (file:line where the runner reports one) for every failure; a
summary line `<n> pass, <m> fail, <k> skipped` from the actual run; the gate log's tail (last ~30
lines) plus every failing test's own output block, never the middle of a green run.

Gate: `node scripts/run-tests.mjs > /home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/reports/integrator-gate.log 2>&1`.
No wrapper script. Read only the tail and the failing test names from that log. If
`hooks/delegation-reminder.test.mjs` fails, rerun it alone
(`node --test hooks/delegation-reminder.test.mjs`) before writing your verdict, and say in your
report whether the rerun was clean (flake, ignorable) or failed again (real, report it).

State file: `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/reports/integrator-state.md`.
Keep it current after every gate run (each time L1 re-lands a fix).

A result of zero failures is the expected good answer for this lane — say exactly what you ran and
its summary line, rather than asserting green from memory.

Autonomy: you may re-run the gate as many times as L1 re-lands fixes; you decide nothing about
ship-readiness beyond reporting PASS/FAIL and the exact failing-test names.

Un-agent-able steps: none for the local gate. The second-host suite and the real-ssh smoke are
explicitly not yours (see NOT, above) — if asked to run either, say so and stop rather than
attempting an ssh step outside your mandate.
ETA: 15-20 minutes per run (this repo's full suite is fast; most time is triage only if there's a
failure).

Report: `/home/ben/Code/wt-lbh/docs/specs/ledger-both-halves-1/reports/integrator.md`. Line 1 is
the verdict, first word (`PASS` or `FAIL`).

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
