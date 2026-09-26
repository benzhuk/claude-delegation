# Mandate — integrator, merge-on-acceptance-1

Task: After both M1 and M2 are merged into the integration branch, run the full sealed
suite ONCE, triage any failing test to the territory (or to a pre-existing base failure)
that owns it, and report pass/fail. You never decide ship; you report the gate.

Goal: keep "rework after acceptance" from worsening — the one thing the spec's Acceptance
section names as a must-not-worsen measure — by confirming no NEW failing test name
appears versus base, before the lead merges this build into main under its own new M1
rule.

Work: wr-2026-09-26-merge-on-acceptance (docs/work/wr-2026-09-26-merge-on-acceptance.record.md).

Inputs (by path):
- `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/contracts.md` — R8 names the
  exact gates and the two known base failures.
- `/home/ben/Code/wt-moa/docs/specs/collect-from-origin-1/reports/integrator-report.md`
  and `.../seam-review.md` — the prior build's own confirmation of H6/V4 as pre-existing on
  this host (Netcup), at base ac9c842. Confirm they're STILL pre-existing at THIS build's
  base (6d8ba95 / 24e02ea) — don't assume a prior confirmation still holds; re-derive it.
- The integration worktree: `/home/ben/Code/wt-moa`, branch `build/merge-on-acceptance-1`.

PROJECT FACTS:
- Full-suite gate: `node scripts/run-tests.mjs` — the sealed runner (every test file runs
  inside a fresh disposable HOME; see the file's own header comment). Run from
  `/home/ben/Code/wt-moa` after both territories' branches are merged into
  `build/merge-on-acceptance-1`.
- Known base failures on THIS host (confirmed at a prior base, ac9c842; re-confirm at
  6d8ba95/24e02ea before trusting the label): H6 (`skills/multi/scripts/note-send.test.mjs:367`,
  Windows path normalization) and V4 (`skills/multi/scripts/mirror-shim.test.mjs:269`,
  per-command shim naming) — both live in `skills/multi/scripts/`, outside both
  territories' file lists, so neither territory should touch them.
- To re-confirm a failure is base-not-new: check out or diff against base
  `6d8ba95a33019e30adf4ecb4c5367c4b756f3e1e` (or run the suite there directly in a scratch
  worktree) and confirm the same test name fails there too.
- Never set or switch a git identity; never push; no trailers; never send peer notes.

NOT (out of scope):
- You never fix a failing test, base-known or new — you report it, named exactly, to the
  orchestrator/lead for triage.
- You never run the second-host (Windows) suite — that's explicitly the lane lead's own
  step, from origin, after this integration head is pushed, per contracts.md R8's last
  line. You run only the LOCAL sealed suite, once, on this host.
- You never touch `docs/GOALS.md`, `scripts/collect-from-origin.mjs`,
  `skills/decisions/scripts/decisions-pickup.mjs`, or `hooks/` — no territory's changes
  should require you to.
- You never decide whether a new failure blocks acceptance — you report it as new;
  the orchestrator decides.

Evidence format: exact test names (file:line where the runner reports one) for every
failure, tagged `known (base <sha>)` or `NEW`; a summary line `<n> pass, <m> fail, <k>
skipped` from the actual run; the gate log's tail (last ~30 lines) plus every failing
test's own output block, never the middle of a green run.

Gate: `node scripts/run-tests.mjs > /home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/reports/integrator-gate.log 2>&1`. No wrapper script. Read only the tail and the failing test names from that log.

State file: `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/reports/integrator-state.md`. Keep it current after every gate run (each time you re-run after a fix lands).

A result of zero new failures is the expected good answer; say exactly what you compared
against (base sha, prior confirmation source) rather than asserting it from memory.

Autonomy: you may re-run the gate as many times as territories re-land fixes; you decide
nothing about ship-readiness beyond reporting PASS/FAIL and the failing-test triage.

Un-agent-able steps: none for the local gate. The second-host suite is explicitly not
yours (see NOT, above) — if asked to run it, say so and stop rather than attempting an ssh
step outside your mandate.
ETA: 15-20 minutes per run (this repo's full suite is fast; most time is triage if there
are new failures).

Report: `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/reports/integrator.md`.
Line 1 is the verdict, first word (`PASS` or `FAIL`).

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
