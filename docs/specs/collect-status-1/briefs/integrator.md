Task: once every territory (C1, C2, C3) has an `APPROVE` review, merge their three branches into
the integration branch, run the full suite ONCE, triage any failure to its owning territory, and
drive the live-proof/second-host steps the spec's Acceptance section names. Never decide the ship
call yourself — report pass/fail plus the failure file; the orchestrator owns adjudication.

Goal: prove the whole build is green together, not just each territory alone (docs/specs/
collect-status-1/spec.md's Acceptance section; docs/GOALS.md's "Rework after acceptance" and
"One package... tested everywhere at once" measures).

Work: wr-2026-09-27-collect-status (docs/work/wr-2026-09-27-collect-status.record.md) — you never
write to this file; report to the path below instead.

Inputs (by path):
- docs/specs/collect-status-1/spec.md — the Acceptance section in full (record shape, review
  requirements, sealed suite on a second host, the Netcup live proof, the Closed-entry and
  decisions-title steps)
- docs/specs/collect-status-1/contracts.md — K1/K2/K3 (what "byte-identical" and "name-owned"
  mean across the three territories' outputs)
- each territory's brief and report (docs/specs/collect-status-1/briefs/C1.md/C2.md/C3.md,
  docs/specs/collect-status-1/reports/C1.md/C2.md/C3.md) and its reviewer's verdict
- docs/specs/collect-status-1/briefs/seam.md — the seam reviewer's own attack brief; read its
  findings (once filed) before you merge, not after

Integration worktree: /home/ben/Code/wt-cs (already checked out at `build/collect-status-1`,
base sha 31a23e2 — this is NOT one of the three territory worktrees; it is where the three
territory branches land together).
Integration branch: build/collect-status-1.

PROJECT FACTS: repo root has no package.json/npm; pure Node ESM + `node:test`, Node v24.18.1; no
typecheck step (no TypeScript in this repo). Never `rm -rf`/`git clean`; never push; never set or
switch a git identity.

Full-suite gate: node scripts/run-tests.mjs — must show ZERO failures on Linux before anything is
considered integrated. Run it fresh after every merge, not just once at the start.

NOT (out of scope, stated explicitly):
- writing or editing any territory's source files yourself — a failing test is triaged BACK to its
  owning territory's builder, never silently patched here
- the ship/accept decision itself, and the merge into `main` — those are the orchestrator's, per
  docs/mandate-template's Ship guidance (this brief covers integration onto `build/collect-status-1`
  and the gates that decision reads, not main itself)
- installing anything on Ben's machines beyond the one authorized Netcup live-proof step the spec
  names, and only once every territory and the seam review are `APPROVE`

Evidence format: exact `node --test` summary counts (pass/fail/total) for every gate run, quoting
the tail of the log, never "all green"; for the second-host sealed-suite step, quote the actual
command run over ssh and its tail; for the Netcup live proof, quote the four numbers the spec asks
for verbatim (`systemctl --user list-timers` output, the first status.md, the ledger line of the
first RESULT it sent). Verdict word first in your report.

Report: docs/specs/collect-status-1/reports/integrator.md. Line 1 is the verdict, first word.

Gate: node scripts/run-tests.mjs > docs/specs/collect-status-1/reports/integrator-gate.log 2>&1.
Read only the tail and the failing names. No wrapper script.

State file: docs/specs/collect-status-1/reports/integrator-state.md. Keep it current after every
gate run.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do
not guess.

Autonomy: merge each territory branch into `build/collect-status-1` yourself once its review is
`APPROVE`, in any order; re-run the full gate after each merge. Check in with the orchestrator
before running the Netcup live-proof step (it installs a real scheduled timer on Ben's machine)
and before any step that would touch `main` or push anywhere.

Un-agent-able steps: the Netcup live proof needs Netcup access — if you cannot reach that host,
say so plainly and report the rest; do not fabricate the four numbers.

ETA: 45-90 minutes once all three territories are `APPROVE` (scales with how many merge-triage
rounds are needed). Report or park by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done"
means read the file; nothing is trusted from a final message alone.
